"""
Integration tests for KnowledgeService class validating end-to-end knowledge management operations.
Tests cover content indexing, RAG processing, vector storage, performance metrics, security controls,
and monitoring integration.
Version: 1.0.0
"""

import pytest
import asyncio
from datetime import datetime
from typing import Dict, List, Optional

from src.services.knowledge_service import KnowledgeService
from src.core.knowledge.indexer import KnowledgeIndexer
from src.core.knowledge.rag import RAGProcessor
from src.core.knowledge.vectorstore import VectorStore
from prometheus_client import REGISTRY

# Test constants
TEST_CONTENT = "Test knowledge content for indexing and retrieval"
TEST_METADATA = {
    'source': 'test',
    'type': 'document',
    'author': 'test_user',
    'security_level': 'confidential'
}
TEST_QUERY = "What is the test content about?"
PERFORMANCE_THRESHOLDS = {
    'indexing_ms': 100,
    'query_ms': 200,
    'batch_size': 1000
}

@pytest.mark.integration
class TestKnowledgeService:
    """Comprehensive test suite for KnowledgeService integration tests."""

    def setup_method(self, method):
        """Initialize test environment with required components."""
        # Initialize core components
        self.indexer = KnowledgeIndexer()
        self.rag_processor = RAGProcessor()
        self.vector_store = VectorStore()
        
        # Initialize service under test
        self.service = KnowledgeService(
            indexer=self.indexer,
            rag_processor=self.rag_processor,
            vector_store=self.vector_store
        )
        
        # Initialize test data
        self.test_data = {
            'content': TEST_CONTENT,
            'metadata': TEST_METADATA.copy(),
            'query': TEST_QUERY
        }
        
        # Clear metrics before each test
        for metric in REGISTRY.collect():
            if metric.name.startswith('knowledge_'):
                REGISTRY.unregister(metric)

    def teardown_method(self, method):
        """Cleanup test environment."""
        # Clear test data
        asyncio.run(self.service.delete_knowledge(['test_doc']))
        
        # Reset service state
        self.service._cache.clear()
        
        # Clear metrics
        for metric in REGISTRY.collect():
            if metric.name.startswith('knowledge_'):
                REGISTRY.unregister(metric)

    @pytest.mark.asyncio
    @pytest.mark.benchmark
    async def test_index_knowledge(self, benchmark):
        """Test single content indexing with performance validation."""
        # Prepare test data
        content = self.test_data['content']
        metadata = self.test_data['metadata']
        
        # Execute indexing with benchmark
        result = await benchmark(self.service.index_knowledge, content, metadata)
        
        # Validate response structure
        assert result['status'] == 'success'
        assert 'operation_id' in result
        assert 'processing_time' in result
        assert result['processing_time'] < PERFORMANCE_THRESHOLDS['indexing_ms']
        
        # Verify vector storage
        vector_result = await self.vector_store.similarity_search(content, k=1)
        assert len(vector_result) == 1
        assert vector_result[0]['content'] == content
        
        # Validate metadata
        stored_metadata = vector_result[0].get('metadata', {})
        assert stored_metadata['source'] == metadata['source']
        assert stored_metadata['security_level'] == metadata['security_level']
        
        # Check metrics
        metrics = list(REGISTRY.collect())
        assert any(m.name == 'knowledge_operations_total' for m in metrics)

    @pytest.mark.asyncio
    async def test_batch_index_knowledge(self):
        """Test batch indexing functionality with monitoring."""
        # Prepare batch data
        contents = [f"{TEST_CONTENT}_{i}" for i in range(5)]
        metadata_items = [
            {**TEST_METADATA, 'index': i} for i in range(5)
        ]
        
        # Execute batch indexing
        result = await self.service.batch_index_knowledge(contents, metadata_items)
        
        # Validate response
        assert result['status'] == 'success'
        assert result['total_processed'] == 5
        assert result['successful'] == 5
        assert result['failed'] == 0
        
        # Verify all items stored
        for content in contents:
            vector_result = await self.vector_store.similarity_search(content, k=1)
            assert len(vector_result) == 1
            assert vector_result[0]['content'] == content
        
        # Check performance metrics
        assert result['processing_time'] < PERFORMANCE_THRESHOLDS['batch_size']

    @pytest.mark.asyncio
    async def test_query_knowledge(self):
        """Test knowledge querying with RAG processing."""
        # Index test content first
        await self.service.index_knowledge(
            self.test_data['content'],
            self.test_data['metadata']
        )
        
        # Execute query
        result = await self.service.query_knowledge(self.test_data['query'])
        
        # Validate response
        assert 'response' in result
        assert len(result['response']) > 0
        assert 'source_documents' in result
        assert len(result['source_documents']) > 0
        
        # Verify context relevance
        assert any(
            self.test_data['content'] in doc['content']
            for doc in result['source_documents']
        )
        
        # Check performance
        assert result['processing_time'] < PERFORMANCE_THRESHOLDS['query_ms']

    @pytest.mark.asyncio
    @pytest.mark.security
    async def test_security_controls(self):
        """Test security controls and access permissions."""
        # Test with invalid security level
        with pytest.raises(ValueError):
            await self.service.index_knowledge(
                TEST_CONTENT,
                {**TEST_METADATA, 'security_level': 'invalid'}
            )
        
        # Test with unauthorized access
        with pytest.raises(PermissionError):
            await self.service.query_knowledge(
                TEST_QUERY,
                {'security_context': {'level': 'public'}}
            )
        
        # Verify secure deletion
        await self.service.index_knowledge(TEST_CONTENT, TEST_METADATA)
        delete_result = await self.service.delete_knowledge(['test_doc'])
        assert delete_result['status'] == 'success'
        assert delete_result['force_delete'] is False

    @pytest.mark.asyncio
    async def test_caching_behavior(self):
        """Test response caching functionality."""
        # Index test content
        await self.service.index_knowledge(
            self.test_data['content'],
            self.test_data['metadata']
        )
        
        # First query - should hit backend
        result1 = await self.service.query_knowledge(self.test_data['query'])
        
        # Second query - should hit cache
        result2 = await self.service.query_knowledge(self.test_data['query'])
        
        # Verify cache hit
        assert result1['response'] == result2['response']
        assert result2.get('cache_hit', False) is True

    @pytest.mark.asyncio
    async def test_monitoring_integration(self):
        """Test monitoring and metrics collection."""
        # Execute operations to generate metrics
        await self.service.index_knowledge(
            self.test_data['content'],
            self.test_data['metadata']
        )
        await self.service.query_knowledge(self.test_data['query'])
        
        # Collect metrics
        metrics = list(REGISTRY.collect())
        
        # Verify metric presence
        metric_names = [m.name for m in metrics]
        assert 'knowledge_operations_total' in metric_names
        assert 'knowledge_operation_latency_seconds' in metric_names
        assert 'knowledge_batch_size' in metric_names
        
        # Verify metric values
        for metric in metrics:
            if metric.name == 'knowledge_operations_total':
                assert sum(s.value for s in metric.samples) > 0

    @pytest.mark.asyncio
    async def test_error_handling(self):
        """Test error handling and recovery mechanisms."""
        # Test with invalid input
        with pytest.raises(ValueError):
            await self.service.index_knowledge("", TEST_METADATA)
        
        # Test with invalid metadata
        with pytest.raises(ValueError):
            await self.service.index_knowledge(
                TEST_CONTENT,
                {'invalid_field': 'value'}
            )
        
        # Verify service remains operational
        result = await self.service.index_knowledge(
            self.test_data['content'],
            self.test_data['metadata']
        )
        assert result['status'] == 'success'

    @pytest.mark.asyncio
    async def test_health_status(self):
        """Test health check functionality."""
        # Get health status
        health = await self.service.get_health_status()
        
        # Validate health response
        assert health['status'] in ['healthy', 'unhealthy']
        assert 'components' in health
        assert 'cache_size' in health
        assert 'error_count' in health
        assert 'last_check' in health
        
        # Verify component health
        assert 'indexer' in health['components']
        assert 'vector_store' in health['components']