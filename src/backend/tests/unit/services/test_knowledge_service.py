import pytest
from unittest.mock import Mock, patch, AsyncMock
import time
from datetime import datetime

from src.services.knowledge_service import KnowledgeService
from src.core.knowledge.indexer import KnowledgeIndexer
from src.core.knowledge.rag import RAGProcessor
from src.core.knowledge.vectorstore import VectorStore

@pytest.fixture
def mock_indexer():
    indexer = Mock(spec=KnowledgeIndexer)
    indexer.index_content = AsyncMock()
    indexer.batch_index_content = AsyncMock()
    indexer.optimize = AsyncMock()
    return indexer

@pytest.fixture
def mock_rag_processor():
    processor = Mock(spec=RAGProcessor)
    processor.process = AsyncMock()
    processor.validate_context = AsyncMock()
    return processor

@pytest.fixture
def mock_vector_store():
    store = Mock(spec=VectorStore)
    store.store_vectors = AsyncMock()
    store.delete_vectors = AsyncMock()
    store.health_check = AsyncMock()
    return store

@pytest.fixture
def knowledge_service(mock_indexer, mock_rag_processor, mock_vector_store):
    return KnowledgeService(
        indexer=mock_indexer,
        rag_processor=mock_rag_processor,
        vector_store=mock_vector_store,
        metrics_collector=Mock()
    )

class TestKnowledgeService:
    """Comprehensive test suite for KnowledgeService class."""

    def setup_method(self):
        """Setup test data and mocks for each test."""
        self.test_content = "Test knowledge content"
        self.test_metadata = {
            "source": "test",
            "timestamp": datetime.now().isoformat()
        }
        self.mock_indexer = Mock(spec=KnowledgeIndexer)
        self.mock_rag_processor = Mock(spec=RAGProcessor)
        self.mock_vector_store = Mock(spec=VectorStore)
        
        # Configure default mock responses
        self.mock_indexer.index_content = AsyncMock(return_value={
            "status": "success",
            "trace_id": "test-trace-123"
        })
        self.mock_indexer.batch_index_content = AsyncMock(return_value={
            "status": "completed",
            "successful": 2,
            "failed": 0
        })
        self.mock_rag_processor.process = AsyncMock(return_value={
            "response": "Test response",
            "source_documents": []
        })
        self.mock_vector_store.delete_vectors = AsyncMock(return_value={
            "status": "success",
            "deleted_count": 1
        })

    @pytest.mark.asyncio
    async def test_index_knowledge_success(self, knowledge_service):
        """Test successful single document indexing operation."""
        # Prepare test data
        content = self.test_content
        metadata = self.test_metadata
        
        # Configure mock response
        knowledge_service._indexer.index_content.return_value = {
            "status": "success",
            "trace_id": "test-trace-123",
            "processing_time": 0.5
        }

        # Execute test
        start_time = time.time()
        result = await knowledge_service.index_knowledge(content, metadata)
        duration = time.time() - start_time

        # Verify indexer called correctly
        knowledge_service._indexer.index_content.assert_called_once_with(
            content=content,
            metadata=metadata
        )

        # Validate response format
        assert result["status"] == "success"
        assert "trace_id" in result
        assert "processing_time" in result
        assert "timestamp" in result

        # Verify performance
        assert duration < 2.0  # 2 second SLA

    @pytest.mark.asyncio
    async def test_batch_index_knowledge_success(self, knowledge_service):
        """Test successful batch indexing operation."""
        # Prepare test data
        content_items = [self.test_content] * 3
        metadata_items = [self.test_metadata] * 3

        # Configure mock response
        knowledge_service._indexer.batch_index_content.return_value = {
            "status": "completed",
            "total_processed": 3,
            "successful": 3,
            "failed": 0
        }

        # Execute test
        start_time = time.time()
        result = await knowledge_service.batch_index_knowledge(
            content_items,
            metadata_items
        )
        duration = time.time() - start_time

        # Verify batch processing
        knowledge_service._indexer.batch_index_content.assert_called_once_with(
            content_items=content_items,
            metadata_items=metadata_items
        )

        # Validate response
        assert result["status"] == "success"
        assert result["total_processed"] == 3
        assert result["successful"] == 3
        assert result["failed"] == 0
        assert "processing_time" in result
        assert "timestamp" in result

        # Verify performance
        assert duration < 5.0  # 5 second SLA for batch

    @pytest.mark.asyncio
    async def test_query_knowledge_success(self, knowledge_service):
        """Test successful knowledge query operation."""
        # Prepare test data
        query = "Test query"
        context = {"domain": "test"}

        # Configure mock response
        knowledge_service._rag_processor.process.return_value = {
            "response": "Test response",
            "source_documents": [
                {"content": "Source 1", "metadata": {}}
            ]
        }

        # Execute test
        start_time = time.time()
        result = await knowledge_service.query_knowledge(query, context)
        duration = time.time() - start_time

        # Verify RAG processing
        knowledge_service._rag_processor.process.assert_called_once_with(
            query=query,
            additional_context=context
        )

        # Validate response
        assert "response" in result
        assert "source_documents" in result
        assert result["response"] == "Test response"

        # Verify performance
        assert duration < 2.0  # 2 second SLA

    @pytest.mark.asyncio
    async def test_delete_knowledge_success(self, knowledge_service):
        """Test successful knowledge deletion operation."""
        # Prepare test data
        document_ids = ["doc1", "doc2"]

        # Configure mock response
        knowledge_service._vector_store.delete_vectors.return_value = {
            "status": "success",
            "deleted_count": 2
        }

        # Execute test
        result = await knowledge_service.delete_knowledge(document_ids)

        # Verify deletion
        knowledge_service._vector_store.delete_vectors.assert_called_once_with(
            document_ids=document_ids
        )

        # Validate response
        assert result["status"] == "success"
        assert result["deleted_count"] == 2
        assert "processing_time" in result
        assert "timestamp" in result

    @pytest.mark.asyncio
    async def test_index_knowledge_error_handling(self, knowledge_service):
        """Test error handling during knowledge indexing."""
        # Configure mock to raise exception
        knowledge_service._indexer.index_content.side_effect = Exception("Test error")

        # Execute test with error expectation
        with pytest.raises(Exception) as exc_info:
            await knowledge_service.index_knowledge(self.test_content)

        assert str(exc_info.value) == "Test error"

    @pytest.mark.asyncio
    async def test_query_knowledge_with_empty_query(self, knowledge_service):
        """Test query validation for empty input."""
        with pytest.raises(ValueError) as exc_info:
            await knowledge_service.query_knowledge("")

        assert "Empty query provided" in str(exc_info.value)

    @pytest.mark.asyncio
    async def test_delete_knowledge_with_empty_ids(self, knowledge_service):
        """Test deletion validation for empty document IDs."""
        with pytest.raises(ValueError) as exc_info:
            await knowledge_service.delete_knowledge([])

        assert "No document IDs provided" in str(exc_info.value)

    @pytest.mark.asyncio
    async def test_health_check(self, knowledge_service):
        """Test health check functionality."""
        # Configure mock responses
        knowledge_service._indexer.get_health_status.return_value = {"status": "healthy"}
        knowledge_service._vector_store.health_check.return_value = {"status": "healthy"}

        # Execute test
        result = await knowledge_service.get_health_status()

        # Validate response
        assert result["status"] == "healthy"
        assert "components" in result
        assert "cache_size" in result
        assert "last_check" in result

    @pytest.mark.asyncio
    async def test_circuit_breaker_activation(self, knowledge_service):
        """Test circuit breaker activation after multiple failures."""
        # Configure mock to fail repeatedly
        knowledge_service._indexer.index_content.side_effect = Exception("Service error")

        # Attempt multiple operations to trigger circuit breaker
        for _ in range(6):  # Circuit breaker threshold is 5
            try:
                await knowledge_service.index_knowledge(self.test_content)
            except:
                continue

        # Verify circuit breaker activation
        with pytest.raises(Exception) as exc_info:
            await knowledge_service.index_knowledge(self.test_content)
        
        assert "Circuit breaker triggered" in str(exc_info.value)

def pytest_configure(config):
    """Configure pytest markers for knowledge service tests."""
    config.addinivalue_line(
        "markers", "integration: mark test as integration test"
    )