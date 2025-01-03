"""
Pydantic schemas for knowledge base management with comprehensive validation.
Supports enterprise knowledge integration, RAG processing, and vector operations.
Version: 1.0.0
"""

from datetime import datetime
from typing import Dict, List, Optional, Union, Literal
from uuid import UUID
import numpy as np

from pydantic import BaseModel, Field, validator, root_validator

from core.knowledge.vectorstore import VectorStore
from db.models.knowledge import KnowledgeSource, Index

# Constants for validation
SUPPORTED_SOURCE_TYPES = Literal['confluence', 'docebo', 'internal_repo', 'custom']
MIN_CONFIDENCE_SCORE = 0.7
MAX_RESULTS_LIMIT = 100
VECTOR_DIMENSIONS = [768, 1024, 1536]  # Common embedding dimensions

class KnowledgeSourceBase(BaseModel):
    """Base schema for knowledge source configuration with enhanced validation."""
    
    source_type: SUPPORTED_SOURCE_TYPES
    name: str = Field(..., min_length=1, max_length=255)
    connection_config: Dict[str, Union[str, Dict]] = Field(...)
    description: Optional[str] = Field(None, max_length=1000)
    indexing_config: Optional[Dict[str, any]] = Field(default_factory=lambda: {
        "chunk_size": 1000,
        "chunk_overlap": 200,
        "embedding_model": "amazon.titan-embed-text-v1",
        "update_frequency": "daily"
    })
    security_config: Optional[Dict[str, any]] = Field(default_factory=lambda: {
        "encryption_enabled": True,
        "access_control": "role_based",
        "audit_logging": True
    })
    monitoring_config: Optional[Dict[str, any]] = Field(default_factory=lambda: {
        "metrics_enabled": True,
        "performance_tracking": True,
        "alert_thresholds": {
            "error_rate": 0.05,
            "latency_ms": 1000
        }
    })

    @validator('connection_config')
    def validate_connection_config(cls, config: Dict[str, any], values) -> Dict[str, any]:
        """Validate source-specific connection configuration."""
        source_type = values.get('source_type')
        
        required_fields = {
            'confluence': ['base_url', 'username', 'api_token', 'space_keys'],
            'docebo': ['api_url', 'client_id', 'client_secret'],
            'internal_repo': ['repo_url', 'branch', 'access_token'],
            'custom': ['connection_string']
        }

        if source_type not in required_fields:
            raise ValueError(f"Invalid source type: {source_type}")

        missing_fields = [
            field for field in required_fields[source_type]
            if field not in config
        ]

        if missing_fields:
            raise ValueError(f"Missing required fields for {source_type}: {missing_fields}")

        # Validate URLs
        for key in ['base_url', 'api_url', 'repo_url']:
            if url := config.get(key):
                if not url.startswith(('http://', 'https://')):
                    raise ValueError(f"Invalid URL format for {key}: {url}")

        return config

    @validator('security_config')
    def validate_security_config(cls, config: Dict[str, any]) -> Dict[str, any]:
        """Validate security configuration requirements."""
        required_settings = ['encryption_enabled', 'access_control', 'audit_logging']
        
        missing_settings = [
            setting for setting in required_settings
            if setting not in config
        ]

        if missing_settings:
            raise ValueError(f"Missing required security settings: {missing_settings}")

        if not config['encryption_enabled']:
            raise ValueError("Encryption must be enabled for security compliance")

        return config

    @root_validator(pre=True)
    def validate_all(cls, values):
        """Comprehensive validation of all fields."""
        if not values.get('name'):
            raise ValueError("Name is required")

        # Validate indexing configuration
        if indexing_config := values.get('indexing_config'):
            if chunk_size := indexing_config.get('chunk_size'):
                if not 100 <= chunk_size <= 2000:
                    raise ValueError("Chunk size must be between 100 and 2000")

        return values

class KnowledgeSourceCreate(KnowledgeSourceBase):
    """Schema for creating new knowledge sources."""
    pass

class KnowledgeSourceResponse(KnowledgeSourceBase):
    """Enhanced schema for knowledge source responses with monitoring data."""
    
    id: UUID
    status: str
    created_at: datetime
    last_sync: Optional[datetime]
    indexing_stats: Dict[str, any] = Field(default_factory=lambda: {
        "total_documents": 0,
        "total_chunks": 0,
        "last_update_duration": None,
        "error_count": 0,
        "success_rate": 100.0
    })
    performance_metrics: Dict[str, any] = Field(default_factory=lambda: {
        "average_latency_ms": 0,
        "error_rate": 0,
        "throughput": 0
    })
    security_status: Dict[str, any] = Field(default_factory=lambda: {
        "encryption_status": "enabled",
        "last_audit": None,
        "compliance_status": "compliant"
    })
    monitoring_data: Dict[str, any] = Field(default_factory=lambda: {
        "health_status": "healthy",
        "last_check": None,
        "alerts": []
    })

class KnowledgeQueryRequest(BaseModel):
    """Enhanced schema for RAG query requests with batch processing."""
    
    query_text: Union[str, List[str]] = Field(..., min_length=1)
    source_ids: Optional[List[UUID]] = None
    max_results: Optional[int] = Field(default=10, le=MAX_RESULTS_LIMIT)
    similarity_threshold: Optional[float] = Field(
        default=MIN_CONFIDENCE_SCORE,
        ge=0.0,
        le=1.0
    )
    batch_config: Optional[Dict[str, any]] = Field(default_factory=lambda: {
        "parallel_processing": True,
        "batch_size": 10
    })
    performance_config: Optional[Dict[str, any]] = Field(default_factory=lambda: {
        "timeout_ms": 5000,
        "cache_results": True
    })

    @validator('query_text')
    def validate_query(cls, v):
        """Validate query text format."""
        if isinstance(v, str):
            if len(v.strip()) == 0:
                raise ValueError("Query text cannot be empty")
        elif isinstance(v, list):
            if not v or any(not q or not isinstance(q, str) for q in v):
                raise ValueError("All queries must be non-empty strings")
        return v

class KnowledgeQueryResponse(BaseModel):
    """Enhanced schema for RAG query responses with detailed metrics."""
    
    results: List[Dict[str, any]] = Field(..., description="Query results with content and metadata")
    metadata: Dict[str, any] = Field(..., description="Response metadata including source information")
    confidence_score: float = Field(..., ge=0.0, le=1.0)
    performance_metrics: Dict[str, any] = Field(default_factory=lambda: {
        "query_time_ms": 0,
        "processing_time_ms": 0,
        "total_time_ms": 0
    })
    source_attribution: Dict[str, any] = Field(..., description="Source attribution details")
    debug_info: Optional[Dict[str, any]] = Field(default_factory=lambda: {
        "vector_operations": None,
        "cache_status": None,
        "optimization_details": None
    })

    @validator('results')
    def validate_results(cls, v):
        """Validate result structure and content."""
        if not isinstance(v, list):
            raise ValueError("Results must be a list")
        
        for result in v:
            required_fields = {'content', 'score', 'metadata'}
            if not all(field in result for field in required_fields):
                raise ValueError(f"Result missing required fields: {required_fields}")
            
            if not 0 <= result['score'] <= 1:
                raise ValueError("Score must be between 0 and 1")
                
        return v