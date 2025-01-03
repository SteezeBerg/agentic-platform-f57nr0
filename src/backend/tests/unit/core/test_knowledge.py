"""
Unit tests for knowledge package components including embeddings generation,
vector store operations, and RAG processing functionality.
Version: 1.0.0
"""

import pytest
import numpy as np
from unittest.mock import Mock, AsyncMock, patch

from src.core.knowledge.embeddings import EmbeddingGenerator
from src.core.knowledge.vectorstore import VectorStore
from src.core.knowledge.rag import RAGProcessor, RAGConfig

@pytest.mark.unit
class TestEmbeddingGenerator:
    """Test suite for the EmbeddingGenerator class."""

    def setup_method(self):
        """Set up test fixtures."""
        self._bedrock_client = Mock()
        self._bedrock_client.invoke_model = AsyncMock()
        
        self._generator = EmbeddingGenerator({
            'dimension': 1536,
            'model_id': 'amazon.titan-embed-text-v1',
            'enable_caching': True,
            'cache_ttl': 3600
        })
        self._generator._client = self._bedrock_client

    @pytest.mark.asyncio
    async def test_generate_embedding(self):
        """Test single text embedding generation."""
        # Prepare test data
        test_text = "Test document content"
        mock_embedding = np.random.rand(1536).astype(np.float32)
        
        # Configure mock response
        self._bedrock_client.invoke_model.return_value = {
            'embedding': mock_embedding.tolist(),
            'metadata': {'model': 'amazon.titan-embed-text-v1'}
        }

        # Execute test
        result = await self._generator.generate_embedding(test_text)

        # Verify results
        assert isinstance(result, np.ndarray)
        assert result.shape == (1536,)
        assert np.allclose(result, mock_embedding)
        
        # Verify API call
        self._bedrock_client.invoke_model.assert_called_once_with({
            'inputText': test_text,
            'model_kwargs': {}
        })

    @pytest.mark.asyncio
    async def test_batch_generate_embeddings(self):
        """Test batch embedding generation."""
        # Prepare test data
        test_texts = ["Document 1", "Document 2", "Document 3"]
        mock_embeddings = [np.random.rand(1536).astype(np.float32) for _ in range(3)]
        
        # Configure mock responses
        self._bedrock_client.invoke_model.side_effect = [
            {'embedding': emb.tolist()} for emb in mock_embeddings
        ]

        # Execute test
        results = await self._generator.batch_generate_embeddings(test_texts)

        # Verify results
        assert len(results) == len(test_texts)
        for result, mock_emb in zip(results, mock_embeddings):
            assert isinstance(result, np.ndarray)
            assert result.shape == (1536,)
            assert np.allclose(result, mock_emb)

        # Verify API calls
        assert self._bedrock_client.invoke_model.call_count == len(test_texts)

@pytest.mark.unit
class TestVectorStore:
    """Test suite for the VectorStore class."""

    def setup_method(self):
        """Set up test fixtures."""
        self._opensearch_manager = Mock()
        self._embedding_generator = Mock()
        self._embedding_generator.generate_embedding = AsyncMock()
        self._embedding_generator.batch_generate_embeddings = AsyncMock()
        
        self._vector_store = VectorStore(
            opensearch_manager=self._opensearch_manager,
            embedding_generator=self._embedding_generator,
            config={
                'index_name': 'test-vectors',
                'dimension': 1536
            },
            metrics_collector=Mock()
        )

    @pytest.mark.asyncio
    async def test_store_vectors(self):
        """Test vector storage functionality."""
        # Prepare test data
        test_texts = ["Doc 1", "Doc 2"]
        test_metadata = [{"source": "test1"}, {"source": "test2"}]
        mock_embeddings = [np.random.rand(1536).astype(np.float32) for _ in range(2)]
        
        # Configure mocks
        self._embedding_generator.batch_generate_embeddings.return_value = mock_embeddings
        self._opensearch_manager.bulk_index.return_value = {"success": True}

        # Execute test
        result = await self._vector_store.store_vectors(test_texts, test_metadata)

        # Verify results
        assert result["status"] == "success"
        assert result["stored_count"] == 2
        
        # Verify bulk indexing call
        self._opensearch_manager.bulk_index.assert_called_once()
        bulk_docs = self._opensearch_manager.bulk_index.call_args[0][1]
        assert len(bulk_docs) == 2
        assert all(isinstance(doc["vector"], list) for doc in bulk_docs)
        assert all(len(doc["vector"]) == 1536 for doc in bulk_docs)

    @pytest.mark.asyncio
    async def test_similarity_search(self):
        """Test similarity search functionality."""
        # Prepare test data
        test_query = "Test query"
        mock_embedding = np.random.rand(1536).astype(np.float32)
        mock_results = [
            {"content": "Doc 1", "score": 0.9},
            {"content": "Doc 2", "score": 0.8}
        ]
        
        # Configure mocks
        self._embedding_generator.generate_embedding.return_value = mock_embedding
        self._opensearch_manager.search.return_value = mock_results

        # Execute test
        results = await self._vector_store.similarity_search(test_query, k=2)

        # Verify results
        assert len(results) == 2
        assert all(isinstance(r, dict) for r in results)
        assert all("content" in r for r in results)
        assert all("score" in r for r in results)

        # Verify search call
        self._opensearch_manager.search.assert_called_once_with(
            index_name='test-vectors',
            query_vector=mock_embedding,
            k=2,
            search_options=None
        )

@pytest.mark.unit
class TestRAGProcessor:
    """Test suite for the RAGProcessor class."""

    def setup_method(self):
        """Set up test fixtures."""
        self._vector_store = Mock()
        self._vector_store.similarity_search = AsyncMock()
        
        self._anthropic_client = Mock()
        self._anthropic_client.generate = AsyncMock()
        
        self._openai_client = Mock()
        self._openai_client.invoke = AsyncMock()
        
        self._metrics_collector = Mock()
        self._security_context = Mock()
        self._cache_manager = Mock()
        self._circuit_breaker = Mock()
        
        self._processor = RAGProcessor(
            vector_store=self._vector_store,
            anthropic_client=self._anthropic_client,
            openai_client=self._openai_client,
            config=RAGConfig(
                provider='anthropic',
                num_chunks=3,
                temperature=0.7,
                fallback_config={'enabled': True}
            )
        )

    @pytest.mark.asyncio
    async def test_process(self):
        """Test end-to-end RAG processing."""
        # Prepare test data
        test_query = "What is the capital of France?"
        mock_chunks = [
            {"content": "Paris is the capital of France.", "score": 0.9},
            {"content": "France is a country in Europe.", "score": 0.8}
        ]
        mock_response = {
            "text": "The capital of France is Paris.",
            "metadata": {"model": "claude-2"}
        }
        
        # Configure mocks
        self._vector_store.similarity_search.return_value = mock_chunks
        self._anthropic_client.generate.return_value = mock_response

        # Execute test
        result = await self._processor.process(test_query)

        # Verify results
        assert "response" in result
        assert "source_documents" in result
        assert len(result["source_documents"]) == 2
        assert result["metadata"]["provider"] == "anthropic"

        # Verify method calls
        self._vector_store.similarity_search.assert_called_once_with(
            query_text=test_query,
            k=3
        )
        self._anthropic_client.generate.assert_called_once()

    @pytest.mark.asyncio
    async def test_model_fallback(self):
        """Test AI model fallback scenarios."""
        # Prepare test data
        test_query = "Test query"
        mock_chunks = [{"content": "Test content", "score": 0.9}]
        primary_error = Exception("Primary model failed")
        fallback_response = {
            "text": "Fallback response",
            "metadata": {"model": "gpt-4"}
        }
        
        # Configure mocks
        self._vector_store.similarity_search.return_value = mock_chunks
        self._anthropic_client.generate.side_effect = primary_error
        self._openai_client.invoke.return_value = fallback_response

        # Execute test
        result = await self._processor.process(test_query)

        # Verify fallback
        assert result["response"] == "Fallback response"
        assert result["metadata"]["provider"] == "openai"
        self._openai_client.invoke.assert_called_once()

    @pytest.mark.asyncio
    async def test_security_validation(self):
        """Test security context validation."""
        # Prepare test data
        test_query = "Test query"
        self._processor._security_context.validate_access = Mock(return_value=False)

        # Execute test and verify
        with pytest.raises(Exception):
            await self._processor.process(test_query)

    @pytest.mark.asyncio
    async def test_performance_monitoring(self):
        """Test performance monitoring and metrics."""
        # Prepare test data
        test_query = "Test query"
        mock_chunks = [{"content": "Test content", "score": 0.9}]
        mock_response = {"text": "Test response", "metadata": {}}
        
        # Configure mocks
        self._vector_store.similarity_search.return_value = mock_chunks
        self._anthropic_client.generate.return_value = mock_response
        
        # Execute test
        await self._processor.process(test_query)

        # Verify metrics collection
        self._metrics_collector.track_performance.assert_called()

    @pytest.mark.asyncio
    async def test_cache_behavior(self):
        """Test caching functionality."""
        # Prepare test data
        test_query = "Test query"
        cache_key = hash(test_query)
        cached_response = {
            "response": "Cached response",
            "source_documents": [],
            "metadata": {}
        }
        
        # Configure cache hit
        self._processor._cache[cache_key] = cached_response

        # Execute test
        result = await self._processor.process(test_query)

        # Verify cache hit
        assert result == cached_response
        self._vector_store.similarity_search.assert_not_called()

    @pytest.mark.asyncio
    async def test_circuit_breaker(self):
        """Test circuit breaker functionality."""
        # Configure circuit breaker
        self._processor._circuit_breaker.is_open = True
        test_query = "Test query"

        # Execute test and verify
        with pytest.raises(Exception):
            await self._processor.process(test_query)

def pytest_configure(config):
    """Configure pytest with custom markers."""
    config.addinivalue_line(
        "markers", "unit: mark test as a unit test"
    )