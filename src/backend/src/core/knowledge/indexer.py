"""
Core knowledge indexing module for Agent Builder Hub.
Provides enterprise-grade content indexing capabilities with comprehensive monitoring,
error handling, and performance optimization.
Version: 1.0.0
"""

import asyncio
from typing import Dict, List, Optional, Any
import numpy as np
from pydantic import BaseModel, Field, validator
from tenacity import retry, stop_after_attempt, wait_exponential
from datetime import datetime

from .embeddings import EmbeddingGenerator
from .vectorstore import VectorStore
from ...utils.logging import StructuredLogger
from ...utils.metrics import track_time, MetricsManager

# Global constants
MAX_RETRIES = 3
BATCH_SIZE = 50
DEFAULT_CHUNK_SIZE = 1000
DEFAULT_CHUNK_OVERLAP = 200

class IndexerConfig(BaseModel):
    """Configuration settings for knowledge indexing operations."""
    
    chunk_size: int = Field(default=DEFAULT_CHUNK_SIZE, gt=0)
    chunk_overlap: int = Field(default=DEFAULT_CHUNK_OVERLAP, ge=0)
    metadata_fields: Dict[str, Any] = Field(default_factory=dict)
    processing_options: Dict[str, Any] = Field(default_factory=lambda: {
        'remove_whitespace': True,
        'normalize_text': True,
        'min_chunk_length': 100
    })
    security_controls: Dict[str, Any] = Field(default_factory=lambda: {
        'content_filtering': True,
        'pii_detection': True,
        'max_content_size': 10_000_000  # 10MB
    })
    performance_settings: Dict[str, Any] = Field(default_factory=lambda: {
        'batch_size': BATCH_SIZE,
        'max_concurrent_tasks': 5,
        'timeout': 300
    })
    monitoring_config: Dict[str, Any] = Field(default_factory=lambda: {
        'track_metrics': True,
        'log_level': 'INFO',
        'alert_on_errors': True
    })

    @validator('chunk_overlap')
    def validate_overlap(cls, v, values):
        """Validate chunk overlap is less than chunk size."""
        if 'chunk_size' in values and v >= values['chunk_size']:
            raise ValueError('Chunk overlap must be less than chunk size')
        return v

class KnowledgeIndexer:
    """Enterprise-grade knowledge content indexer with comprehensive monitoring."""

    def __init__(
        self,
        embedding_generator: EmbeddingGenerator,
        vector_store: VectorStore,
        config: IndexerConfig
    ):
        """Initialize knowledge indexer with monitoring and validation."""
        self._embedding_generator = embedding_generator
        self._vector_store = vector_store
        self._config = config
        self._logger = StructuredLogger('knowledge_indexer', {
            'component': 'indexer',
            'chunk_size': config.chunk_size
        })
        self._metrics = MetricsManager(
            namespace='AgentBuilderHub/Indexer',
            dimensions={'service': 'knowledge_indexer'}
        )
        
        # Initialize performance tracking
        self._metrics_data = {
            'total_indexed': 0,
            'failed_items': 0,
            'processing_times': [],
            'batch_sizes': []
        }
        
        # Initialize health monitoring
        self._health_status = {
            'last_check': None,
            'status': 'healthy',
            'error_count': 0,
            'last_error': None
        }
        
        # Initialize circuit breaker
        self._circuit_breaker = {
            'failures': 0,
            'threshold': 5,
            'reset_interval': 300,  # 5 minutes
            'last_reset': datetime.now()
        }

    def _check_circuit_breaker(self):
        """Check circuit breaker status and reset if needed."""
        now = datetime.now()
        if (now - self._circuit_breaker['last_reset']).total_seconds() >= self._circuit_breaker['reset_interval']:
            self._circuit_breaker['failures'] = 0
            self._circuit_breaker['last_reset'] = now
        
        if self._circuit_breaker['failures'] >= self._circuit_breaker['threshold']:
            raise RuntimeError("Circuit breaker triggered - too many failures")

    def _preprocess_content(self, content: str) -> str:
        """Preprocess content with configured options."""
        if not content:
            raise ValueError("Empty content provided")
            
        if len(content) > self._config.security_controls['max_content_size']:
            raise ValueError("Content exceeds maximum size limit")
            
        processed = content
        
        if self._config.processing_options['remove_whitespace']:
            processed = " ".join(processed.split())
            
        if self._config.processing_options['normalize_text']:
            processed = processed.lower()
            
        return processed

    def _chunk_content(self, content: str) -> List[str]:
        """Split content into chunks with overlap."""
        if len(content) < self._config.processing_options['min_chunk_length']:
            return [content]
            
        chunks = []
        start = 0
        
        while start < len(content):
            end = start + self._config.chunk_size
            chunk = content[start:end]
            
            if len(chunk) >= self._config.processing_options['min_chunk_length']:
                chunks.append(chunk)
                
            start = end - self._config.chunk_overlap
            
        return chunks

    @track_time('index_content')
    @retry(
        stop=stop_after_attempt(MAX_RETRIES),
        wait=wait_exponential(multiplier=1, min=4, max=10)
    )
    async def index_content(self, content: str, metadata: Optional[Dict] = None) -> Dict[str, Any]:
        """Index a single piece of content with comprehensive monitoring."""
        try:
            self._check_circuit_breaker()
            
            start_time = datetime.now()
            trace_id = self._logger.get_trace_id()
            
            # Preprocess content
            processed_content = self._preprocess_content(content)
            chunks = self._chunk_content(processed_content)
            
            # Prepare metadata
            enhanced_metadata = {
                'timestamp': datetime.now().isoformat(),
                'chunk_count': len(chunks),
                'original_size': len(content),
                'trace_id': trace_id,
                **(metadata or {})
            }
            
            # Store vectors
            store_result = await self._vector_store.store_vectors(
                chunks,
                [enhanced_metadata] * len(chunks)
            )
            
            # Track metrics
            processing_time = (datetime.now() - start_time).total_seconds()
            self._metrics.track_performance('content_indexed', 1)
            self._metrics.track_performance('chunks_created', len(chunks))
            self._metrics.track_performance('processing_time', processing_time)
            
            self._metrics_data['total_indexed'] += 1
            self._metrics_data['processing_times'].append(processing_time)
            
            return {
                'status': 'success',
                'chunks_indexed': len(chunks),
                'processing_time': processing_time,
                'trace_id': trace_id,
                'store_result': store_result
            }
            
        except Exception as e:
            self._circuit_breaker['failures'] += 1
            self._metrics_data['failed_items'] += 1
            self._health_status.update({
                'status': 'error',
                'last_error': str(e),
                'error_count': self._health_status['error_count'] + 1
            })
            
            self._logger.log('error', f"Indexing failed: {str(e)}")
            self._metrics.track_performance('indexing_error', 1)
            raise

    @track_time('batch_index_content')
    async def batch_index_content(
        self,
        content_items: List[str],
        metadata_items: Optional[List[Dict]] = None
    ) -> Dict[str, Any]:
        """Index multiple content items with optimized batch processing."""
        if not content_items:
            raise ValueError("Empty content list provided")
            
        batch_size = self._config.performance_settings['batch_size']
        max_concurrent = self._config.performance_settings['max_concurrent_tasks']
        
        results = []
        failed_items = []
        
        try:
            # Process in batches
            for i in range(0, len(content_items), batch_size):
                batch = content_items[i:i + batch_size]
                batch_metadata = metadata_items[i:i + batch_size] if metadata_items else None
                
                # Process batch items concurrently
                tasks = []
                for j, content in enumerate(batch):
                    metadata = batch_metadata[j] if batch_metadata else None
                    task = self.index_content(content, metadata)
                    tasks.append(task)
                
                # Execute batch with concurrency control
                batch_results = await asyncio.gather(*tasks, return_exceptions=True)
                
                # Process results
                for j, result in enumerate(batch_results):
                    if isinstance(result, Exception):
                        failed_items.append({
                            'index': i + j,
                            'error': str(result)
                        })
                    else:
                        results.append(result)
                
            # Track batch metrics
            self._metrics_data['batch_sizes'].append(len(content_items))
            self._metrics.track_performance('batch_processed', len(content_items))
            
            return {
                'status': 'completed',
                'total_processed': len(content_items),
                'successful': len(results),
                'failed': len(failed_items),
                'results': results,
                'failures': failed_items
            }
            
        except Exception as e:
            self._logger.log('error', f"Batch indexing failed: {str(e)}")
            self._metrics.track_performance('batch_error', 1)
            raise

    async def get_health_status(self) -> Dict[str, Any]:
        """Get comprehensive health status of the indexer."""
        try:
            now = datetime.now()
            
            # Calculate performance metrics
            avg_processing_time = (
                sum(self._metrics_data['processing_times']) / 
                len(self._metrics_data['processing_times'])
            ) if self._metrics_data['processing_times'] else 0
            
            health_status = {
                'status': self._health_status['status'],
                'last_check': now.isoformat(),
                'metrics': {
                    'total_indexed': self._metrics_data['total_indexed'],
                    'failed_items': self._metrics_data['failed_items'],
                    'average_processing_time': avg_processing_time,
                    'error_rate': (
                        self._metrics_data['failed_items'] / 
                        max(self._metrics_data['total_indexed'], 1)
                    ) * 100
                },
                'circuit_breaker': {
                    'failures': self._circuit_breaker['failures'],
                    'threshold': self._circuit_breaker['threshold']
                }
            }
            
            self._health_status['last_check'] = now
            return health_status
            
        except Exception as e:
            self._logger.log('error', f"Health check failed: {str(e)}")
            return {
                'status': 'error',
                'error': str(e),
                'timestamp': datetime.now().isoformat()
            }