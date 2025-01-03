"""
Main API initialization module for Agent Builder Hub.
Provides comprehensive FastAPI application configuration with enhanced security,
monitoring, error handling and middleware integration.
Version: 1.0.0
"""

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.exceptions import RequestValidationError
from fastapi import HTTPException
from fastapi_circuit_breaker import CircuitBreaker
from prometheus_fastapi_instrumentator import Instrumentator
import structlog

from api.routes import api_router
from api.middleware import setup_middleware
from api.security import setup_security
from api.error_handlers import (
    handle_validation_error,
    handle_api_error,
    handle_http_error,
    handle_internal_error
)

# Initialize structured logger
logger = structlog.get_logger(__name__)

# Initialize FastAPI application with OpenAPI configuration
app = FastAPI(
    title="Agent Builder Hub API",
    version="1.0.0",
    docs_url="/api/docs",
    redoc_url="/api/redoc",
    openapi_url="/api/openapi.json"
)

def create_application(config: dict) -> FastAPI:
    """
    Creates and configures the FastAPI application with comprehensive security,
    monitoring, and error handling capabilities.

    Args:
        config: Application configuration dictionary

    Returns:
        Configured FastAPI application instance
    """
    try:
        # Configure CORS middleware
        app.add_middleware(
            CORSMiddleware,
            allow_origins=config.get("allowed_origins", ["*"]),
            allow_credentials=True,
            allow_methods=["*"],
            allow_headers=["*"],
            expose_headers=["X-Request-ID", "X-Correlation-ID"]
        )

        # Configure compression middleware
        app.add_middleware(
            GZipMiddleware,
            minimum_size=1000
        )

        # Set up enhanced middleware stack
        setup_middleware(app, {
            'sensitive_fields': {
                'headers': ['authorization', 'x-api-key'],
                'body': ['password', 'token', 'secret']
            },
            'exclude_paths': ['/health', '/metrics']
        })

        # Configure security middleware and policies
        setup_security(app, config.get("security_config", {}))

        # Set up error handlers
        app.add_exception_handler(RequestValidationError, handle_validation_error)
        app.add_exception_handler(HTTPException, handle_http_error)
        app.add_exception_handler(Exception, handle_internal_error)

        # Configure Prometheus metrics
        Instrumentator().instrument(app).expose(app)

        # Include API router with all routes
        app.include_router(api_router, prefix="/api/v1")

        # Configure startup event
        @app.on_event("startup")
        async def startup_event():
            logger.info("Starting Agent Builder Hub API")
            # Initialize required services
            pass

        # Configure shutdown event
        @app.on_event("shutdown")
        async def shutdown_event():
            logger.info("Shutting down Agent Builder Hub API")
            # Cleanup resources
            pass

        # Add request ID middleware
        @app.middleware("http")
        async def add_request_id(request: Request, call_next):
            request_id = request.headers.get("X-Request-ID", str(uuid.uuid4()))
            response = await call_next(request)
            response.headers["X-Request-ID"] = request_id
            return response

        # Add security headers middleware
        @app.middleware("http")
        async def add_security_headers(request: Request, call_next):
            response = await call_next(request)
            response.headers["X-Content-Type-Options"] = "nosniff"
            response.headers["X-Frame-Options"] = "DENY"
            response.headers["X-XSS-Protection"] = "1; mode=block"
            response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
            response.headers["Content-Security-Policy"] = "default-src 'self'"
            return response

        # Add circuit breaker for external services
        circuit_breaker = CircuitBreaker(
            failure_threshold=5,
            recovery_timeout=30,
            name="external_services"
        )
        app.state.circuit_breaker = circuit_breaker

        # Add health check endpoint
        @app.get("/health")
        async def health_check():
            return {
                "status": "healthy",
                "timestamp": datetime.utcnow().isoformat(),
                "version": "1.0.0"
            }

        logger.info("Successfully configured FastAPI application")
        return app

    except Exception as e:
        logger.error(f"Failed to create application: {str(e)}")
        raise

# Export configured application
app = create_application({})