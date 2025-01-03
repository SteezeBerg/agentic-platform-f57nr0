"""
Core knowledge module for Agent Builder Hub providing enterprise-grade RAG capabilities.
Initializes and exports core components for vector embeddings, storage, and RAG processing.
Version: 1.0.0
"""

from typing import Dict, Any

# Internal imports with enhanced components
from .embeddings import EmbeddingGenerator
from .vectorstore import VectorStore
from .rag import RAGConfig, RAGProcessor

# Version and configuration
VERSION = '1.0.0'
DEFAULT_CONFIG = {
    'embedding_model': 'bedrock',  # Default to AWS Bedrock for enterprise stability
    'vector_store': 'opensearch',  # OpenSearch for enterprise-grade vector storage
    'metrics_enabled': True,       # Enable comprehensive monitoring
    'rag_settings': {
        'num_chunks': 5,
        'temperature': 0.7,
        'cache_enabled': True,
        'monitoring_enabled': True
    }
}

# Export core components with enterprise features
__all__ = [
    'EmbeddingGenerator',
    'VectorStore',
    'RAGConfig',
    'RAGProcessor',
    'VERSION',
    'DEFAULT_CONFIG'
]

def validate_config(config: Dict[str, Any]) -> bool:
    """
    Validate knowledge module configuration settings.
    
    Args:
        config: Configuration dictionary to validate
        
    Returns:
        bool: True if configuration is valid
    """
    required_keys = {'embedding_model', 'vector_store', 'metrics_enabled'}
    if not all(key in config for key in required_keys):
        return False
        
    if config['embedding_model'] not in {'bedrock', 'openai'}:
        return False
        
    if config['vector_store'] not in {'opensearch'}:
        return False
        
    return True

def get_version() -> str:
    """Return the current version of the knowledge module."""
    return VERSION

def get_default_config() -> Dict[str, Any]:
    """Return the default configuration for the knowledge module."""
    return DEFAULT_CONFIG.copy()