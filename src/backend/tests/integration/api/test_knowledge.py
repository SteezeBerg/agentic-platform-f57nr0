"""
Integration tests for knowledge management API endpoints.
Tests enterprise knowledge source integration, RAG processing, vector storage operations,
security controls, and monitoring capabilities.
Version: 1.0.0
"""

import pytest
import uuid
from datetime import datetime
from typing import Dict, Any
from faker import Faker

from src.schemas.knowledge import (
    KnowledgeSourceCreate,
    KnowledgeSourceUpdate,
    KnowledgeSourceResponse,
    KnowledgeQueryRequest,
    KnowledgeQueryResponse,
    KnowledgeSyncResponse
)
from src.services.knowledge_service import KnowledgeService
from src.services.metrics_service import MetricsService

class TestKnowledgeAPI:
    """Comprehensive test suite for knowledge management API endpoints."""

    def setup_method(self):
        """Initialize test environment with required fixtures."""
        self.base_url = "/api/v1/knowledge"
        self.faker = Faker()
        
        # Initialize mock services
        self.mock_knowledge_service = KnowledgeService()
        self.mock_metrics_service = MetricsService()
        
        # Set up test data generators
        self.test_source_id = str(uuid.uuid4())
        self.test_source_name = self.faker.company()
        
        # Performance thresholds
        self.max_response_time = 1000  # ms
        self.min_relevance_score = 0.7

    @pytest.mark.asyncio
    async def test_create_knowledge_source(self, client, admin_token):
        """Test creation of new knowledge source with proper permissions and monitoring."""
        # Prepare test data
        source_data = {
            "source_type": "confluence",
            "name": self.test_source_name,
            "connection_config": {
                "base_url": "https://example.atlassian.net",
                "username": "test_user",
                "api_token": "test_token",
                "space_keys": ["TEST", "DOCS"]
            },
            "description": "Test knowledge source",
            "indexing_config": {
                "chunk_size": 1000,
                "chunk_overlap": 200,
                "embedding_model": "amazon.titan-embed-text-v1"
            }
        }

        # Send request
        response = await client.post(
            f"{self.base_url}/sources",
            json=source_data,
            headers={"Authorization": f"Bearer {admin_token}"}
        )

        # Validate response
        assert response.status_code == 201
        data = response.json()
        
        # Verify response schema
        source_response = KnowledgeSourceResponse(**data)
        assert source_response.name == source_data["name"]
        assert source_response.source_type == source_data["source_type"]
        assert source_response.status == "active"
        
        # Verify metrics were recorded
        metrics_data = await self.mock_metrics_service.get_metric("knowledge_source_created")
        assert metrics_data["value"] == 1
        assert metrics_data["dimensions"]["source_type"] == source_data["source_type"]

    @pytest.mark.asyncio
    async def test_update_knowledge_source(self, client, admin_token):
        """Test updating existing knowledge source with security validation."""
        # Prepare update data
        update_data = {
            "name": f"Updated {self.test_source_name}",
            "indexing_config": {
                "chunk_size": 1500,
                "update_frequency": "hourly"
            }
        }

        # Send request
        response = await client.put(
            f"{self.base_url}/sources/{self.test_source_id}",
            json=update_data,
            headers={"Authorization": f"Bearer {admin_token}"}
        )

        # Validate response
        assert response.status_code == 200
        data = response.json()
        
        # Verify updated fields
        source_response = KnowledgeSourceResponse(**data)
        assert source_response.name == update_data["name"]
        assert source_response.indexing_config["chunk_size"] == update_data["indexing_config"]["chunk_size"]
        
        # Verify audit trail
        audit_log = await self.mock_knowledge_service.get_audit_log(self.test_source_id)
        assert len(audit_log) > 0
        assert audit_log[-1]["action"] == "update"

    @pytest.mark.asyncio
    async def test_query_knowledge(self, client, user_token):
        """Test RAG query functionality with performance monitoring."""
        # Create test query
        query_data = {
            "query_text": "What are the best practices for data migration?",
            "max_results": 5,
            "similarity_threshold": 0.8
        }

        # Send request
        start_time = datetime.now()
        response = await client.post(
            f"{self.base_url}/query",
            json=query_data,
            headers={"Authorization": f"Bearer {user_token}"}
        )

        # Validate response time
        response_time = (datetime.now() - start_time).total_seconds() * 1000
        assert response_time < self.max_response_time

        # Validate response
        assert response.status_code == 200
        data = response.json()
        
        # Verify response schema
        query_response = KnowledgeQueryResponse(**data)
        assert len(query_response.results) <= query_data["max_results"]
        assert query_response.confidence_score >= self.min_relevance_score
        
        # Verify vector similarity scores
        for result in query_response.results:
            assert result["score"] >= query_data["similarity_threshold"]

        # Verify performance metrics
        metrics_data = await self.mock_metrics_service.get_metric("knowledge_query_latency")
        assert metrics_data["value"] == response_time

    @pytest.mark.asyncio
    async def test_sync_knowledge_source(self, client, admin_token):
        """Test knowledge source synchronization with progress tracking."""
        # Send sync request
        response = await client.post(
            f"{self.base_url}/sources/{self.test_source_id}/sync",
            headers={"Authorization": f"Bearer {admin_token}"}
        )

        # Validate response
        assert response.status_code == 202
        data = response.json()
        
        # Verify sync started
        sync_response = KnowledgeSyncResponse(**data)
        assert sync_response.status == "syncing"
        assert sync_response.sync_id is not None
        
        # Verify sync progress tracking
        progress = await self.mock_knowledge_service.get_sync_progress(sync_response.sync_id)
        assert progress["status"] in ["syncing", "completed", "error"]
        assert "progress_percentage" in progress

    @pytest.mark.asyncio
    async def test_delete_knowledge_source(self, client, admin_token):
        """Test knowledge source deletion with cleanup verification."""
        # Send delete request
        response = await client.delete(
            f"{self.base_url}/sources/{self.test_source_id}",
            headers={"Authorization": f"Bearer {admin_token}"}
        )

        # Validate response
        assert response.status_code == 204
        
        # Verify source deletion
        source = await self.mock_knowledge_service.get_source(self.test_source_id)
        assert source is None
        
        # Verify vector cleanup
        vectors = await self.mock_knowledge_service.get_source_vectors(self.test_source_id)
        assert len(vectors) == 0
        
        # Verify metrics
        metrics_data = await self.mock_metrics_service.get_metric("knowledge_source_deleted")
        assert metrics_data["value"] == 1

    @pytest.mark.asyncio
    async def test_list_knowledge_sources(self, client, user_token):
        """Test knowledge source listing with pagination and filtering."""
        # Send request with filters
        response = await client.get(
            f"{self.base_url}/sources",
            params={"source_type": "confluence", "status": "active", "page": 1, "limit": 10},
            headers={"Authorization": f"Bearer {user_token}"}
        )

        # Validate response
        assert response.status_code == 200
        data = response.json()
        
        # Verify pagination
        assert "total" in data
        assert "items" in data
        assert len(data["items"]) <= 10
        
        # Verify source schema
        for source in data["items"]:
            source_response = KnowledgeSourceResponse(**source)
            assert source_response.source_type == "confluence"
            assert source_response.status == "active"

    @pytest.mark.asyncio
    async def test_get_knowledge_source_metrics(self, client, user_token):
        """Test retrieval of knowledge source metrics."""
        # Send request
        response = await client.get(
            f"{self.base_url}/sources/{self.test_source_id}/metrics",
            headers={"Authorization": f"Bearer {user_token}"}
        )

        # Validate response
        assert response.status_code == 200
        data = response.json()
        
        # Verify metrics data
        assert "indexing_stats" in data
        assert "performance_metrics" in data
        assert "last_sync" in data
        
        # Verify metric values
        assert isinstance(data["indexing_stats"]["total_documents"], int)
        assert isinstance(data["performance_metrics"]["average_latency_ms"], (int, float))
        assert isinstance(data["indexing_stats"]["success_rate"], float)

    def teardown_method(self):
        """Clean up test resources and reset mocks."""
        # Reset mock services
        self.mock_knowledge_service.reset_mock()
        self.mock_metrics_service.reset_mock()
        
        # Clear test data
        self.test_source_id = None
        self.test_source_name = None