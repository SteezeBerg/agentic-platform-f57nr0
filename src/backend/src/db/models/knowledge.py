"""
SQLAlchemy models for knowledge sources and vector indices.
Supports enterprise knowledge integration and RAG processing capabilities with enhanced monitoring and validation.
Version: 1.0.0
"""

from datetime import datetime
from enum import Enum
from typing import List, Optional, Dict
import uuid
import logging

import numpy as np  # ^1.24.0
from sqlalchemy import Column, String, JSON, DateTime, ForeignKey, Index, Enum as SQLEnum
from sqlalchemy.orm import Mapped, relationship
from sqlalchemy.exc import ValidationError

from ...config.database import Base

# Configure logging
logger = logging.getLogger(__name__)

class SourceType(str, Enum):
    """Enumeration of supported knowledge source types"""
    CONFLUENCE = "confluence"
    DOCEBO = "docebo"
    INTERNAL_REPO = "internal_repo"
    PROCESS_DOCS = "process_docs"
    TRAINING_MATERIALS = "training_materials"
    CUSTOM = "custom"

class SourceStatus(str, Enum):
    """Enumeration of knowledge source statuses"""
    ACTIVE = "active"
    SYNCING = "syncing"
    ERROR = "error"
    DISABLED = "disabled"

class KnowledgeSource(Base):
    """SQLAlchemy model for enterprise knowledge sources with enhanced monitoring"""
    __tablename__ = "knowledge_sources"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    source_type = Column(SQLEnum(SourceType), nullable=False)
    name = Column(String, nullable=False)
    description = Column(String)
    connection_config = Column(JSON, nullable=False)
    indexing_config = Column(JSON, nullable=False)
    indexing_stats = Column(JSON, nullable=False)
    status = Column(SQLEnum(SourceStatus), nullable=False, default=SourceStatus.ACTIVE)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    last_sync = Column(DateTime)

    # Relationships
    indices: Mapped[List["Index"]] = relationship("Index", back_populates="source", cascade="all, delete-orphan")

    def __init__(self, source_type: str, name: str, connection_config: dict, description: str = None):
        """Initialize a new knowledge source with default configurations"""
        self.id = str(uuid.uuid4())
        self.source_type = source_type
        self.name = name
        self.description = description
        self.connection_config = self.validate_connection_config(connection_config)
        self.status = SourceStatus.ACTIVE
        self.created_at = datetime.utcnow()
        
        # Initialize default indexing configuration
        self.indexing_config = {
            "chunk_size": 1000,
            "chunk_overlap": 200,
            "embedding_model": "text-embedding-ada-002",
            "update_frequency": "daily"
        }
        
        # Initialize indexing statistics
        self.indexing_stats = {
            "total_documents": 0,
            "total_chunks": 0,
            "last_update_duration": None,
            "error_count": 0,
            "success_rate": 100.0
        }

    def validate_connection_config(self, config: dict) -> dict:
        """Validates connection configuration based on source type"""
        required_fields = {
            SourceType.CONFLUENCE: ["base_url", "username", "api_token", "space_keys"],
            SourceType.DOCEBO: ["api_url", "client_id", "client_secret"],
            SourceType.INTERNAL_REPO: ["repo_url", "branch", "access_token"],
            SourceType.PROCESS_DOCS: ["file_path", "file_types"],
            SourceType.TRAINING_MATERIALS: ["api_endpoint", "api_key"],
            SourceType.CUSTOM: ["connection_string"]
        }

        if self.source_type not in required_fields:
            raise ValidationError(f"Invalid source type: {self.source_type}")

        missing_fields = [field for field in required_fields[self.source_type] 
                         if field not in config]
        
        if missing_fields:
            raise ValidationError(f"Missing required fields for {self.source_type}: {missing_fields}")

        # Validate URLs if present
        for key in ["base_url", "api_url", "repo_url", "api_endpoint"]:
            if url := config.get(key):
                if not url.startswith(("http://", "https://")):
                    raise ValidationError(f"Invalid URL format for {key}: {url}")

        logger.info(f"Validated connection config for source: {self.name}")
        return config

    def update_sync_status(self, status: SourceStatus, stats_update: Optional[Dict] = None) -> None:
        """Updates the sync status and timestamp with enhanced monitoring"""
        if not isinstance(status, SourceStatus):
            raise ValidationError(f"Invalid status: {status}")

        previous_status = self.status
        self.status = status
        self.last_sync = datetime.utcnow()

        if stats_update:
            self.indexing_stats.update(stats_update)
            # Calculate success rate
            total_attempts = self.indexing_stats.get("total_attempts", 0) + 1
            error_count = self.indexing_stats.get("error_count", 0)
            self.indexing_stats["success_rate"] = ((total_attempts - error_count) / total_attempts) * 100

        logger.info(f"Source {self.name} status updated: {previous_status} -> {status}")

class Index(Base):
    """SQLAlchemy model for vector indices with enhanced validation and metadata"""
    __tablename__ = "indices"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    source_id = Column(String, ForeignKey("knowledge_sources.id"), nullable=False)
    embedding = Column(JSON, nullable=False)  # Store as JSON for database compatibility
    content = Column(String, nullable=False)
    metadata = Column(JSON, nullable=False)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at = Column(DateTime, nullable=False, default=datetime.utcnow)

    # Relationships
    source: Mapped["KnowledgeSource"] = relationship("KnowledgeSource", back_populates="indices")

    # Indices for performance
    __table_args__ = (
        Index("idx_source_id", "source_id"),
        Index("idx_created_at", "created_at"),
    )

    def __init__(self, source_id: str, embedding: np.ndarray, content: str, metadata: dict):
        """Initialize a new index entry with vector validation"""
        self.id = str(uuid.uuid4())
        self.source_id = source_id
        self.content = content
        self.metadata = metadata or {}
        self.created_at = datetime.utcnow()
        self.updated_at = self.created_at
        
        # Validate and store embedding
        self.validate_embedding(embedding)
        self.embedding = embedding.tolist()  # Convert to list for JSON storage

    def validate_embedding(self, embedding: np.ndarray) -> bool:
        """Validates embedding vector dimensions and format"""
        if not isinstance(embedding, np.ndarray):
            raise ValidationError("Embedding must be a numpy array")

        if embedding.ndim != 1:
            raise ValidationError(f"Invalid embedding dimensions: {embedding.ndim}")

        if np.any(np.isnan(embedding)) or np.any(np.isinf(embedding)):
            raise ValidationError("Embedding contains invalid values (NaN or Inf)")

        if not embedding.size in [768, 1024, 1536]:  # Common embedding dimensions
            logger.warning(f"Unusual embedding dimension: {embedding.size}")

        return True

    def update_embedding(self, new_embedding: np.ndarray, new_metadata: Optional[dict] = None) -> None:
        """Updates the vector embedding and metadata with validation"""
        self.validate_embedding(new_embedding)
        self.embedding = new_embedding.tolist()
        
        if new_metadata:
            self.metadata.update(new_metadata)
        
        self.updated_at = datetime.utcnow()
        logger.info(f"Updated embedding for index {self.id}")