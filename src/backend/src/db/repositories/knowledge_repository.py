"""
Knowledge repository implementation for Agent Builder Hub.
Provides enterprise-grade management of knowledge sources and vector indices with enhanced reliability,
monitoring, and security features.
Version: 1.0.0
"""

from typing import Dict, List, Optional, Union
from uuid import UUID
import logging
from datetime import datetime
import numpy as np
from sqlalchemy import select, and_, desc
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session
from tenacity import retry, stop_after_attempt, wait_exponential

from ..models.knowledge import KnowledgeSource, Index, SourceType, SourceStatus
from ...config.database import DatabaseManager
from ...utils.logging import StructuredLogger
from ...utils.metrics import MetricsManager, track_time, track_resource_usage

class KnowledgeRepository:
    """Repository class for managing knowledge sources and vector indices with enhanced monitoring."""

    def __init__(self, db_manager: DatabaseManager):
        """Initialize repository with database connections and monitoring."""
        self._db_manager = db_manager
        self._session = Session(self._db_manager.get_postgres_engine())
        self._opensearch = self._db_manager.get_opensearch_client()
        self._logger = StructuredLogger("knowledge_repository", {"service": "knowledge_base"})
        self._metrics = MetricsManager(namespace="AgentBuilderHub/KnowledgeBase")
        
        # Initialize connection pools and monitoring
        self._connection_pools = {
            "postgres": {"active": 0, "max": 20},
            "opensearch": {"active": 0, "max": 10}
        }

    @track_time("create_knowledge_source")
    async def create_knowledge_source(self, source_data: Dict) -> KnowledgeSource:
        """Create a new knowledge source with validation and monitoring."""
        try:
            # Generate trace context
            self._logger.set_trace_id(str(UUID.uuid4()))
            
            # Validate source data
            if not source_data.get("source_type") or not source_data.get("name"):
                raise ValueError("Invalid source data: missing required fields")

            # Create knowledge source instance
            source = KnowledgeSource(
                source_type=source_data["source_type"],
                name=source_data["name"],
                connection_config=source_data.get("connection_config", {}),
                description=source_data.get("description")
            )

            # Track resource usage
            track_resource_usage("database", 1, {"operation": "create", "type": "knowledge_source"})

            # Persist to database with retry logic
            try:
                self._session.add(source)
                self._session.commit()
                self._logger.log("info", f"Created knowledge source: {source.id}")
                
                # Track successful creation
                self._metrics.track_performance(
                    "knowledge_source_creation",
                    1,
                    {"source_type": source.source_type}
                )
                
                return source

            except SQLAlchemyError as e:
                self._session.rollback()
                self._logger.log("error", f"Database error: {str(e)}")
                raise

        except Exception as e:
            self._logger.log("error", f"Failed to create knowledge source: {str(e)}")
            self._metrics.track_performance("knowledge_source_creation_error", 1)
            raise

    @track_time("update_knowledge_source")
    async def update_knowledge_source(self, source_id: str, update_data: Dict) -> KnowledgeSource:
        """Update existing knowledge source with validation."""
        try:
            source = await self.get_knowledge_source(source_id)
            if not source:
                raise ValueError(f"Knowledge source not found: {source_id}")

            # Update fields
            for key, value in update_data.items():
                if hasattr(source, key):
                    setattr(source, key, value)

            # Update sync status if needed
            if "status" in update_data:
                source.update_sync_status(update_data["status"])

            self._session.commit()
            self._logger.log("info", f"Updated knowledge source: {source_id}")
            return source

        except Exception as e:
            self._session.rollback()
            self._logger.log("error", f"Failed to update knowledge source: {str(e)}")
            self._metrics.track_performance("knowledge_source_update_error", 1)
            raise

    @retry(stop=stop_after_attempt(3), wait=wait_exponential(multiplier=1, min=4, max=10))
    async def get_knowledge_source(self, source_id: str) -> Optional[KnowledgeSource]:
        """Retrieve knowledge source by ID with retry logic."""
        try:
            query = select(KnowledgeSource).where(KnowledgeSource.id == source_id)
            result = self._session.execute(query).scalar_one_or_none()
            
            if result:
                self._metrics.track_performance("knowledge_source_retrieval", 1)
            
            return result

        except Exception as e:
            self._logger.log("error", f"Failed to retrieve knowledge source: {str(e)}")
            self._metrics.track_performance("knowledge_source_retrieval_error", 1)
            raise

    @track_time("search_vectors")
    async def search_vectors(
        self,
        query_vector: np.ndarray,
        source_ids: Optional[List[UUID]] = None,
        max_results: Optional[int] = 10,
        similarity_threshold: Optional[float] = 0.7
    ) -> List[Dict]:
        """Perform optimized vector similarity search."""
        try:
            # Validate input vector
            if not isinstance(query_vector, np.ndarray):
                raise ValueError("Query vector must be a numpy array")

            # Prepare search query
            search_query = {
                "size": max_results,
                "query": {
                    "script_score": {
                        "query": {"match_all": {}},
                        "script": {
                            "source": "cosineSimilarity(params.query_vector, 'embedding') + 1.0",
                            "params": {"query_vector": query_vector.tolist()}
                        }
                    }
                }
            }

            # Add source filtering if specified
            if source_ids:
                search_query["query"]["bool"] = {
                    "filter": {"terms": {"source_id": [str(id) for id in source_ids]}}
                }

            # Execute search with monitoring
            start_time = datetime.now()
            response = self._opensearch.search(
                index="knowledge_vectors",
                body=search_query
            )
            search_duration = (datetime.now() - start_time).total_seconds() * 1000

            # Track search performance
            self._metrics.track_performance(
                "vector_search_duration",
                search_duration,
                {"results_count": len(response["hits"]["hits"])}
            )

            # Process and filter results
            results = []
            for hit in response["hits"]["hits"]:
                similarity_score = hit["_score"] - 1.0  # Adjust for the +1.0 in query
                if similarity_score >= similarity_threshold:
                    results.append({
                        "index_id": hit["_id"],
                        "content": hit["_source"]["content"],
                        "metadata": hit["_source"]["metadata"],
                        "similarity_score": similarity_score
                    })

            return results

        except Exception as e:
            self._logger.log("error", f"Vector search failed: {str(e)}")
            self._metrics.track_performance("vector_search_error", 1)
            raise

    async def create_index(self, source_id: str, embedding: np.ndarray, content: str, metadata: Dict) -> Index:
        """Create new vector index entry with validation."""
        try:
            # Create index instance
            index = Index(
                source_id=source_id,
                embedding=embedding,
                content=content,
                metadata=metadata
            )

            # Store in database
            self._session.add(index)
            self._session.commit()

            # Index in OpenSearch
            vector_doc = {
                "source_id": source_id,
                "embedding": embedding.tolist(),
                "content": content,
                "metadata": metadata
            }
            self._opensearch.index(
                index="knowledge_vectors",
                id=index.id,
                body=vector_doc
            )

            self._metrics.track_performance("index_creation", 1)
            return index

        except Exception as e:
            self._session.rollback()
            self._logger.log("error", f"Failed to create index: {str(e)}")
            self._metrics.track_performance("index_creation_error", 1)
            raise

    async def __aenter__(self):
        """Async context manager entry."""
        return self

    async def __aexit__(self, exc_type, exc_val, exc_tb):
        """Async context manager exit with cleanup."""
        self._session.close()