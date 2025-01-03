"""
Centralized error handling module for Agent Builder Hub API.
Provides comprehensive error handling with enhanced security, monitoring, and observability features.
Version: 1.0.0
"""

from typing import Dict, Optional, Any
import uuid
import traceback
from datetime import datetime

# Third-party imports with versions
from fastapi import Request, status  # ^0.104.0
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException  # ^0.27.0
from pydantic import ValidationError  # ^2.0.0

# Internal imports
from utils.logging import StructuredLogger
from utils.metrics import MetricsManager

# Initialize logger and metrics
logger = StructuredLogger('error_handlers')
metrics = MetricsManager()

# Standardized error message templates
ERROR_TEMPLATES = {
    'validation_error': 'Request validation failed: {detail}',
    'not_found': 'Resource not found: {detail}',
    'unauthorized': 'Authentication required: {detail}',
    'forbidden': 'Access denied: {detail}',
    'internal_error': 'An internal error occurred',
    'service_unavailable': 'Service temporarily unavailable: {detail}'
}

class APIError(Exception):
    """Enhanced base exception class for API-specific errors with security and tracking features."""
    
    def __init__(
        self,
        message: str,
        status_code: int = status.HTTP_500_INTERNAL_SERVER_ERROR,
        details: Optional[Dict[str, Any]] = None,
        correlation_id: Optional[str] = None,
        error_category: str = 'internal_error',
        context: Optional[Dict[str, Any]] = None,
        is_public: bool = False
    ):
        """Initialize API error with enhanced tracking and security features."""
        super().__init__(message)
        self.message = message
        self.status_code = status_code
        self.details = self._sanitize_details(details or {})
        self.correlation_id = correlation_id or str(uuid.uuid4())
        self.error_category = error_category
        self.context = context or {}
        self.is_public = is_public
        self.timestamp = datetime.utcnow().isoformat()

    def _sanitize_details(self, details: Dict[str, Any]) -> Dict[str, Any]:
        """Sanitize error details to prevent sensitive data exposure."""
        sensitive_fields = {'password', 'token', 'key', 'secret', 'credential'}
        return {
            k: '***' if any(field in k.lower() for field in sensitive_fields) else v
            for k, v in details.items()
        }

async def handle_validation_error(request: Request, exc: ValidationError) -> JSONResponse:
    """Enhanced handler for Pydantic validation errors with detailed formatting."""
    correlation_id = str(uuid.uuid4())
    
    # Format validation errors
    error_details = []
    for error in exc.errors():
        error_details.append({
            'field': ' -> '.join(str(x) for x in error['loc']),
            'message': error['msg'],
            'type': error['type']
        })

    # Log error with context
    logger.log(
        'error',
        ERROR_TEMPLATES['validation_error'].format(detail='Multiple validation errors'),
        extra={
            'correlation_id': correlation_id,
            'path': str(request.url),
            'method': request.method,
            'validation_errors': error_details
        }
    )

    # Track validation error metrics
    metrics.track_performance(
        'validation_error',
        1,
        {
            'path': str(request.url),
            'method': request.method,
            'error_count': len(error_details)
        }
    )

    return JSONResponse(
        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
        content={
            'error': 'Validation Error',
            'detail': error_details,
            'correlation_id': correlation_id,
            'timestamp': datetime.utcnow().isoformat()
        }
    )

async def handle_api_error(request: Request, exc: APIError) -> JSONResponse:
    """Enhanced handler for custom API errors with security features."""
    # Log error with full context
    logger.log(
        'error',
        exc.message,
        extra={
            'correlation_id': exc.correlation_id,
            'error_category': exc.error_category,
            'status_code': exc.status_code,
            'path': str(request.url),
            'method': request.method,
            'context': exc.context
        }
    )

    # Track error metrics by category
    metrics.track_performance(
        f'api_error_{exc.error_category}',
        1,
        {
            'path': str(request.url),
            'method': request.method,
            'status_code': exc.status_code
        }
    )

    # Prepare response content
    response_content = {
        'error': exc.error_category,
        'message': exc.message if exc.is_public else ERROR_TEMPLATES[exc.error_category],
        'correlation_id': exc.correlation_id,
        'timestamp': exc.timestamp
    }

    # Include sanitized details for public errors
    if exc.is_public and exc.details:
        response_content['details'] = exc.details

    return JSONResponse(
        status_code=exc.status_code,
        content=response_content,
        headers={'X-Correlation-ID': exc.correlation_id}
    )

async def handle_http_error(request: Request, exc: HTTPException) -> JSONResponse:
    """Enhanced handler for HTTP exceptions with monitoring."""
    correlation_id = str(uuid.uuid4())

    # Map status code to error category
    error_category = {
        404: 'not_found',
        401: 'unauthorized',
        403: 'forbidden',
        503: 'service_unavailable'
    }.get(exc.status_code, 'internal_error')

    # Log HTTP error with request context
    logger.log(
        'error',
        ERROR_TEMPLATES[error_category].format(detail=str(exc.detail)),
        extra={
            'correlation_id': correlation_id,
            'status_code': exc.status_code,
            'path': str(request.url),
            'method': request.method
        }
    )

    # Track HTTP error metrics
    metrics.track_performance(
        'http_error',
        1,
        {
            'status_code': exc.status_code,
            'path': str(request.url),
            'method': request.method
        }
    )

    return JSONResponse(
        status_code=exc.status_code,
        content={
            'error': error_category,
            'message': ERROR_TEMPLATES[error_category].format(detail=str(exc.detail)),
            'correlation_id': correlation_id,
            'timestamp': datetime.utcnow().isoformat()
        },
        headers={'X-Correlation-ID': correlation_id}
    )

async def handle_internal_error(request: Request, exc: Exception) -> JSONResponse:
    """Enhanced handler for internal server errors with security."""
    correlation_id = str(uuid.uuid4())

    # Log internal error with full traceback
    logger.log(
        'error',
        'Internal server error occurred',
        extra={
            'correlation_id': correlation_id,
            'error_type': exc.__class__.__name__,
            'error_message': str(exc),
            'traceback': traceback.format_exc(),
            'path': str(request.url),
            'method': request.method
        }
    )

    # Track internal error metrics
    metrics.track_performance(
        'internal_error',
        1,
        {
            'error_type': exc.__class__.__name__,
            'path': str(request.url),
            'method': request.method
        }
    )

    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content={
            'error': 'internal_error',
            'message': ERROR_TEMPLATES['internal_error'],
            'correlation_id': correlation_id,
            'timestamp': datetime.utcnow().isoformat()
        },
        headers={
            'X-Correlation-ID': correlation_id,
            'Cache-Control': 'no-store'
        }
    )