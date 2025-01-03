"""
OpenAI API integration module for Agent Builder Hub.
Provides enterprise-grade access to GPT models with comprehensive error handling,
retry logic, monitoring, and security features.
Version: 1.0.0
"""

import json
import time
from typing import Dict, Optional, Any, Generator, Union
from datetime import datetime

# Third-party imports with versions
import openai  # ^1.0.0
from tenacity import (  # ^8.2.0
    retry,
    stop_after_attempt,
    wait_exponential,
    retry_if_exception_type
)
from pydantic import BaseModel, Field  # ^2.0.0
from prometheus_client import Counter, Gauge, Histogram  # ^0.17.0

# Internal imports
from ...config.settings import Settings, get_settings
from ...utils.logging import StructuredLogger
from ...utils.metrics import MetricsManager, track_time

# Constants
MAX_RETRIES = 3
DEFAULT_TEMPERATURE = 0.7
DEFAULT_MODEL = 'gpt-4'
MAX_TOKENS = 8192
RATE_LIMIT_TOKENS = 150000
TIMEOUT_SECONDS = 30

# Metrics
METRICS = {
    'api_calls': Counter('openai_api_calls_total', 'Total OpenAI API calls', ['model', 'status']),
    'token_usage': Counter('openai_token_usage_total', 'Total tokens used', ['type']),
    'latency': Histogram('openai_api_latency_seconds', 'API call latency'),
    'rate_limit': Gauge('openai_rate_limit_remaining', 'Remaining rate limit'),
    'errors': Counter('openai_api_errors_total', 'API errors', ['type'])
}

class OpenAIConfig(BaseModel):
    """Enhanced configuration for OpenAI API integration."""
    api_key: str = Field(..., description="OpenAI API key")
    model_id: str = Field(DEFAULT_MODEL, description="Model identifier")
    temperature: float = Field(DEFAULT_TEMPERATURE, ge=0.0, le=2.0)
    max_tokens: int = Field(MAX_TOKENS, gt=0)
    timeout: int = Field(TIMEOUT_SECONDS, gt=0)
    retry_config: Dict[str, Any] = Field(default_factory=lambda: {
        "max_attempts": MAX_RETRIES,
        "min_wait_secs": 1,
        "max_wait_secs": 10
    })
    rate_limits: Dict[str, int] = Field(default_factory=lambda: {
        "tokens_per_minute": RATE_LIMIT_TOKENS,
        "requests_per_minute": 500
    })

    class Config:
        validate_assignment = True
        extra = "forbid"

class OpenAIClient:
    """Enterprise-grade OpenAI API client with comprehensive features."""

    def __init__(self, config: Optional[OpenAIConfig] = None):
        """Initialize OpenAI client with enterprise features."""
        self.settings = get_settings()
        self.config = config or OpenAIConfig(
            api_key=self.settings.ai_config.openai_api_key
        )
        self.client = openai.OpenAI(api_key=self.config.api_key)
        self.logger = StructuredLogger("openai_client", {
            "service": "openai",
            "environment": self.settings.environment
        })
        self.metrics = MetricsManager()
        self._validate_configuration()

    def _validate_configuration(self) -> None:
        """Validate API configuration and connectivity."""
        try:
            models = self.client.models.list()
            if not any(m.id == self.config.model_id for m in models.data):
                raise ValueError(f"Model {self.config.model_id} not available")
            self.logger.log("info", f"Successfully validated OpenAI configuration")
        except Exception as e:
            self.logger.log("error", f"OpenAI configuration validation failed: {str(e)}")
            raise

    @retry(
        stop=stop_after_attempt(MAX_RETRIES),
        wait=wait_exponential(multiplier=1, min=4, max=10),
        retry=retry_if_exception_type(
            (openai.APIError, openai.APIConnectionError, openai.RateLimitError)
        )
    )
    @track_time("openai_api_call")
    async def invoke(
        self,
        prompt: str,
        additional_params: Optional[Dict[str, Any]] = None,
        stream: bool = False
    ) -> Union[Dict[str, Any], Generator[Dict[str, Any], None, None]]:
        """
        Invoke OpenAI API with enterprise-grade features.
        
        Args:
            prompt: Input prompt text
            additional_params: Additional API parameters
            stream: Enable streaming response
            
        Returns:
            API response with enhanced metadata
        """
        start_time = time.time()
        try:
            # Prepare request parameters
            params = {
                "model": self.config.model_id,
                "temperature": self.config.temperature,
                "max_tokens": self.config.max_tokens,
                **(additional_params or {})
            }

            # Track API call
            METRICS['api_calls'].labels(
                model=self.config.model_id,
                status="started"
            ).inc()

            # Make API call
            response = await self.client.chat.completions.create(
                messages=[{"role": "user", "content": prompt}],
                stream=stream,
                **params
            )

            # Process response
            if stream:
                return self._handle_streaming_response(response)
            else:
                return self._process_response(response)

        except Exception as e:
            self._handle_error(e)
            raise
        finally:
            # Track latency
            duration = time.time() - start_time
            METRICS['latency'].observe(duration)

    def _process_response(self, response: Any) -> Dict[str, Any]:
        """Process and enhance API response with metadata."""
        try:
            # Extract response content
            content = response.choices[0].message.content

            # Track token usage
            usage = response.usage
            METRICS['token_usage'].labels(type="prompt").inc(usage.prompt_tokens)
            METRICS['token_usage'].labels(type="completion").inc(usage.completion_tokens)

            # Prepare enhanced response
            return {
                "content": content,
                "model": self.config.model_id,
                "usage": {
                    "prompt_tokens": usage.prompt_tokens,
                    "completion_tokens": usage.completion_tokens,
                    "total_tokens": usage.total_tokens
                },
                "metadata": {
                    "timestamp": datetime.utcnow().isoformat(),
                    "model_version": response.model,
                    "finish_reason": response.choices[0].finish_reason
                }
            }
        except Exception as e:
            self.logger.log("error", f"Error processing response: {str(e)}")
            raise

    def _handle_streaming_response(
        self,
        response: Generator
    ) -> Generator[Dict[str, Any], None, None]:
        """Handle streaming API response with monitoring."""
        try:
            for chunk in response:
                if chunk and chunk.choices:
                    content = chunk.choices[0].delta.content
                    if content:
                        yield {
                            "content": content,
                            "model": self.config.model_id,
                            "metadata": {
                                "timestamp": datetime.utcnow().isoformat(),
                                "chunk_id": chunk.id
                            }
                        }
        except Exception as e:
            self.logger.log("error", f"Error in streaming response: {str(e)}")
            raise

    def _handle_error(self, error: Exception) -> None:
        """Handle API errors with comprehensive logging and metrics."""
        error_type = type(error).__name__
        METRICS['errors'].labels(type=error_type).inc()
        
        self.logger.log("error", f"OpenAI API error: {str(error)}", extra={
            "error_type": error_type,
            "model": self.config.model_id,
            "timestamp": datetime.utcnow().isoformat()
        })

    @retry(
        stop=stop_after_attempt(MAX_RETRIES),
        wait=wait_exponential(multiplier=1, min=4, max=10)
    )
    @track_time("openai_embedding")
    async def generate_embedding(
        self,
        text: str,
        model: str = "text-embedding-ada-002"
    ) -> Dict[str, Any]:
        """
        Generate embeddings with enterprise features.
        
        Args:
            text: Input text for embedding
            model: Embedding model identifier
            
        Returns:
            Embedding vector with metadata
        """
        start_time = time.time()
        try:
            # Track API call
            METRICS['api_calls'].labels(
                model=model,
                status="started"
            ).inc()

            # Generate embedding
            response = await self.client.embeddings.create(
                model=model,
                input=text
            )

            # Process response
            embedding = response.data[0].embedding
            
            return {
                "embedding": embedding,
                "model": model,
                "metadata": {
                    "timestamp": datetime.utcnow().isoformat(),
                    "dimensions": len(embedding),
                    "model_version": response.model
                }
            }

        except Exception as e:
            self._handle_error(e)
            raise
        finally:
            duration = time.time() - start_time
            METRICS['latency'].observe(duration)

__all__ = ['OpenAIConfig', 'OpenAIClient']