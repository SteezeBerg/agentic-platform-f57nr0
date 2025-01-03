"""
Core middleware module for Agent Builder Hub API providing comprehensive request/response processing,
authentication validation, logging, metrics tracking, and error handling capabilities.
Version: 1.0.0
"""

import time
import uuid
from typing import Dict, List, Optional, Callable
import json
import os

# Third-party imports with versions
from fastapi import FastAPI, Request, Response  # ^0.104.0
from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint  # ^0.27.0
from starlette.types import ASGIApp  # ^0.27.0
from starlette.middleware.cors import CORSMiddleware  # ^0.27.0
from starlette.middleware.gzip import GZipMiddleware  # ^0.27.0

# Internal imports
from utils.logging import StructuredLogger
from utils.metrics import MetricsManager
from config.settings import get_settings

# Initialize logger and metrics
logger = StructuredLogger('middleware', service='agent_builder_hub', env=os.getenv('ENVIRONMENT'))
metrics = MetricsManager(
    namespace='API',
    dimensions={'service': 'agent_builder_hub', 'environment': os.getenv('ENVIRONMENT')}
)

class RequestLoggingMiddleware(BaseHTTPMiddleware):
    """Enhanced middleware for comprehensive request/response logging with distributed tracing."""

    def __init__(
        self,
        app: ASGIApp,
        sensitive_fields: Optional[Dict[str, List[str]]] = None,
        exclude_paths: Optional[List[str]] = None
    ):
        """Initialize middleware with configuration."""
        super().__init__(app)
        self._logger = logger
        self._metrics = metrics
        self._sensitive_fields = sensitive_fields or {
            'headers': ['authorization', 'x-api-key'],
            'body': ['password', 'token', 'secret']
        }
        self._exclude_paths = exclude_paths or ['/health', '/metrics']
        self._performance_thresholds = {
            'warning': 1000,  # 1 second
            'critical': 3000  # 3 seconds
        }

    async def dispatch(
        self, request: Request, call_next: RequestResponseEndpoint
    ) -> Response:
        """Process request/response with comprehensive logging and metrics."""
        # Skip excluded paths
        if request.url.path in self._exclude_paths:
            return await call_next(request)

        # Generate trace context
        trace_id = str(uuid.uuid4())
        self._logger.set_trace_id(trace_id)

        start_time = time.time()
        response = None
        error = None

        try:
            # Log sanitized request
            await self._log_request(request, trace_id)

            # Process request
            response = await call_next(request)

            # Calculate timing
            duration = (time.time() - start_time) * 1000
            self._track_performance(request, response, duration)

            # Log response
            await self._log_response(response, duration, trace_id)

            return response

        except Exception as e:
            error = e
            # Log and track error
            self._logger.log_error(
                'Request processing error',
                extra={
                    'error': str(e),
                    'trace_id': trace_id,
                    'path': request.url.path
                }
            )
            self._metrics.track_error(
                'request_error',
                {
                    'path': request.url.path,
                    'method': request.method,
                    'error_type': type(e).__name__
                }
            )
            raise
        finally:
            # Track request completion
            self._track_request_completion(request, error)

    async def _log_request(self, request: Request, trace_id: str) -> None:
        """Log sanitized request details."""
        try:
            # Get request body while preserving stream
            body = await self._get_request_body(request)
            
            # Sanitize sensitive data
            headers = dict(request.headers)
            for field in self._sensitive_fields['headers']:
                if field in headers:
                    headers[field] = '[REDACTED]'

            if body:
                body = self._sanitize_body(body)

            self._logger.log(
                'info',
                'Incoming request',
                extra={
                    'trace_id': trace_id,
                    'method': request.method,
                    'path': request.url.path,
                    'query_params': dict(request.query_params),
                    'headers': headers,
                    'body': body,
                    'client_host': request.client.host if request.client else None
                }
            )
        except Exception as e:
            self._logger.log_error('Error logging request', extra={'error': str(e)})

    async def _log_response(self, response: Response, duration: float, trace_id: str) -> None:
        """Log response details with performance metrics."""
        try:
            self._logger.log(
                'info',
                'Outgoing response',
                extra={
                    'trace_id': trace_id,
                    'status_code': response.status_code,
                    'duration_ms': duration,
                    'headers': dict(response.headers)
                }
            )
        except Exception as e:
            self._logger.log_error('Error logging response', extra={'error': str(e)})

    def _track_performance(self, request: Request, response: Response, duration: float) -> None:
        """Track detailed performance metrics."""
        try:
            self._metrics.track_performance(
                'request_duration',
                duration,
                {
                    'path': request.url.path,
                    'method': request.method,
                    'status_code': response.status_code
                }
            )

            # Track latency thresholds
            if duration > self._performance_thresholds['critical']:
                self._metrics.track_performance('critical_latency_exceeded', 1)
            elif duration > self._performance_thresholds['warning']:
                self._metrics.track_performance('warning_latency_exceeded', 1)

        except Exception as e:
            self._logger.log_error('Error tracking performance', extra={'error': str(e)})

    def _track_request_completion(self, request: Request, error: Optional[Exception]) -> None:
        """Track request completion metrics."""
        try:
            self._metrics.track_performance(
                'requests_completed',
                1,
                {
                    'path': request.url.path,
                    'method': request.method,
                    'status': 'error' if error else 'success'
                }
            )
        except Exception as e:
            self._logger.log_error('Error tracking request completion', extra={'error': str(e)})

    async def _get_request_body(self, request: Request) -> Optional[Dict]:
        """Safely get request body while preserving stream."""
        try:
            body = await request.body()
            await request.body()  # Reset stream position
            return json.loads(body) if body else None
        except Exception:
            return None

    def _sanitize_body(self, body: Dict) -> Dict:
        """Recursively sanitize sensitive fields in request body."""
        if not isinstance(body, dict):
            return body

        sanitized = body.copy()
        for field in self._sensitive_fields['body']:
            if field in sanitized:
                sanitized[field] = '[REDACTED]'

        for key, value in sanitized.items():
            if isinstance(value, dict):
                sanitized[key] = self._sanitize_body(value)
            elif isinstance(value, list):
                sanitized[key] = [
                    self._sanitize_body(item) if isinstance(item, dict) else item
                    for item in value
                ]

        return sanitized

def setup_middleware(app: FastAPI, config: Optional[Dict] = None) -> None:
    """Configure all middleware for the FastAPI application."""
    settings = get_settings()
    
    # Security middleware
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.security_config.allowed_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
        expose_headers=["X-Request-ID"]
    )

    # Compression middleware
    app.add_middleware(GZipMiddleware, minimum_size=1000)

    # Request logging middleware
    app.add_middleware(
        RequestLoggingMiddleware,
        sensitive_fields=config.get('sensitive_fields'),
        exclude_paths=config.get('exclude_paths')
    )

    # Add security headers middleware
    @app.middleware("http")
    async def add_security_headers(request: Request, call_next: Callable):
        response = await call_next(request)
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["X-XSS-Protection"] = "1; mode=block"
        response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
        return response

__all__ = ['RequestLoggingMiddleware', 'setup_middleware']