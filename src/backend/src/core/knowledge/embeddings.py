"""
Vector embedding generation module for Agent Builder Hub.
Provides enterprise-grade text to vector embedding conversion using AWS Bedrock foundation models.
Version: 1.0.0
"""

import numpy as np  # ^1.24.0
from tenacity import retry, stop_after_attempt, wait_exponential  # ^8.2.0
from pydantic import BaseModel, Field, validator  # ^2.0.0
from cachetools import TTLCache  # ^5.3.0
from circuit_breaker_pattern import CircuitBreaker  # ^1.0.0
from typing import List, Optional, Dict, Any

from ...integrations.aws.bedrock import BedrockClient
from ...utils.logging import StructuredLogger
from ...utils.metrics import MetricsManager, track_time

# Global constants
DEFAULT_DIMENSION = 1536
MAX_RETRIES = 3
BATCH_SIZE = 100
EMBEDDING_MODEL_ID = 'amazon.titan-embed-text-v1'
CACHE_SIZE = 1000
CACHE_TTL = 3600  # 1 hour
CIRCUIT_BREAKER_THRESHOLD = 5
CIRCUIT_BREAKER_TIMEOUT = 60

class EmbeddingConfig(BaseModel):
    """Configuration settings for embedding generation with validation."""
    
    dimension: int = Field(default=DEFAULT_DIMENSION, gt=0)
    model_id: str = Field(default=EMBEDDING_MODEL_ID)
    model_kwargs: Dict[str, Any] = Field(default_factory=dict)
    batch_size: int = Field(default=BATCH_SIZE, gt=0)
    enable_caching: bool = Field(default=True)
    cache_ttl: int = Field(default=CACHE_TTL, gt=0)
    fallback_models: List[str] = Field(default_factory=list)

    @validator('model_id')
    def validate_model_id(cls, v):
        """Validate model ID is supported."""
        supported_models = ['amazon.titan-embed-text-v1', 'amazon.titan-embed-text-v2']
        if v not in supported_models:
            raise ValueError(f"Model ID must be one of: {supported_models}")
        return v

class EmbeddingGenerator:
    """Enterprise-grade text to vector embedding generator with enhanced resilience."""

    def __init__(self, config: EmbeddingConfig):
        """Initialize embedding generator with monitoring and caching."""
        self._config = config
        self._logger = StructuredLogger('embedding_generator', {
            'model_id': config.model_id,
            'dimension': config.dimension
        })
        self._metrics = MetricsManager(
            namespace='AgentBuilderHub/Embeddings',
            dimensions={'model_id': config.model_id}
        )
        self._client = BedrockClient({
            'model_id': config.model_id,
            'timeout': 30,
            'retry_config': {'max_attempts': MAX_RETRIES}
        })
        
        # Initialize circuit breaker
        self._circuit_breaker = CircuitBreaker(
            failure_threshold=CIRCUIT_BREAKER_THRESHOLD,
            recovery_timeout=CIRCUIT_BREAKER_TIMEOUT
        )
        
        # Initialize cache if enabled
        self._cache = TTLCache(
            maxsize=CACHE_SIZE,
            ttl=config.cache_ttl
        ) if config.enable_caching else None

    @track_time('generate_embedding')
    @retry(
        stop=stop_after_attempt(MAX_RETRIES),
        wait=wait_exponential(multiplier=1, min=4, max=10)
    )
    async def generate_embedding(self, text: str) -> np.ndarray:
        """Generate vector embedding for a single text input with monitoring."""
        if not text or not isinstance(text, str):
            raise ValueError("Invalid input text")

        try:
            # Check cache first
            if self._cache is not None:
                cache_key = hash(text)
                if cache_key in self._cache:
                    self._metrics.track_performance('cache_hit', 1)
                    return self._cache[cache_key]

            # Generate embedding with circuit breaker protection
            async with self._circuit_breaker:
                response = await self._client.invoke_model({
                    'inputText': text,
                    **self._config.model_kwargs
                })

                embedding = np.array(response['embedding'], dtype=np.float32)

                # Validate embedding
                if not self._validate_embedding(embedding):
                    raise ValueError("Generated embedding failed validation")

                # Cache successful result
                if self._cache is not None:
                    self._cache[cache_key] = embedding
                    self._metrics.track_performance('cache_store', 1)

                # Track success metrics
                self._metrics.track_performance('embedding_generated', 1)
                
                return embedding

        except Exception as e:
            self._logger.log('error', f"Embedding generation failed: {str(e)}")
            self._metrics.track_performance('embedding_error', 1)
            raise

    @track_time('batch_generate_embeddings')
    async def batch_generate_embeddings(self, texts: List[str]) -> List[np.ndarray]:
        """Generate embeddings for multiple texts with optimized batching."""
        if not texts:
            raise ValueError("Empty text list provided")

        results = []
        batch_size = self._config.batch_size

        try:
            # Process texts in batches
            for i in range(0, len(texts), batch_size):
                batch = texts[i:i + batch_size]
                batch_results = await asyncio.gather(
                    *[self.generate_embedding(text) for text in batch],
                    return_exceptions=True
                )

                # Handle any failed generations in batch
                for result in batch_results:
                    if isinstance(result, Exception):
                        self._logger.log('error', f"Batch embedding failed: {str(result)}")
                        # Use fallback model if available
                        if self._config.fallback_models:
                            result = await self._generate_with_fallback(text)
                    results.append(result)

            # Track batch metrics
            self._metrics.track_performance('batch_processed', len(texts))
            
            return results

        except Exception as e:
            self._logger.log('error', f"Batch embedding generation failed: {str(e)}")
            self._metrics.track_performance('batch_error', 1)
            raise

    async def _generate_with_fallback(self, text: str) -> np.ndarray:
        """Attempt embedding generation with fallback models."""
        for fallback_model in self._config.fallback_models:
            try:
                temp_config = self._config.copy()
                temp_config.model_id = fallback_model
                temp_generator = EmbeddingGenerator(temp_config)
                return await temp_generator.generate_embedding(text)
            except Exception as e:
                self._logger.log('error', f"Fallback to {fallback_model} failed: {str(e)}")
                continue
        raise RuntimeError("All fallback models failed")

    def _validate_embedding(self, embedding: np.ndarray) -> bool:
        """Validate embedding vector quality and dimensions."""
        try:
            # Check dimension
            if embedding.shape != (self._config.dimension,):
                return False

            # Check for NaN or infinite values
            if not np.all(np.isfinite(embedding)):
                return False

            # Check vector normalization
            norm = np.linalg.norm(embedding)
            if not 0.99 <= norm <= 1.01:  # Allow small deviation from unit norm
                return False

            return True

        except Exception as e:
            self._logger.log('error', f"Embedding validation failed: {str(e)}")
            return False

__all__ = ['EmbeddingConfig', 'EmbeddingGenerator']