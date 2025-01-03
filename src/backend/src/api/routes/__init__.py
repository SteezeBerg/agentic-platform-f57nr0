"""
API routes initialization module for Agent Builder Hub.
Implements comprehensive route registration, security context propagation, and monitoring capabilities.
Version: 1.0.0
"""

from fastapi import APIRouter, Depends, Request
from fastapi.security import OAuth2PasswordBearer

# Import route modules
from api.routes.health import router as health_router
from api.routes.metrics import router as metrics_router
from api.routes.auth import router as auth_router
from api.routes.agents import router as agents_router
from api.routes.deployments import router as deployments_router
from api.routes.knowledge import router as knowledge_router
from api.routes.orchestration import router as orchestration_router
from api.routes.templates import router as templates_router

# Import security and monitoring utilities
from api.security import validate_security_context
from utils.logging import StructuredLogger
from utils.metrics import MetricsManager

# Initialize logging and metrics
logger = StructuredLogger("api.routes", {
    "service": "agent_builder",
    "component": "routes"
})
metrics = MetricsManager(namespace="AgentBuilderHub/API")

# Initialize main API router with security context validation
api_router = APIRouter(prefix="/api/v1", dependencies=[Depends(validate_security_context)])

async def include_routers() -> None:
    """
    Include all route modules in the main API router with validation and monitoring.
    """
    try:
        # Health and metrics endpoints (no auth required)
        api_router.include_router(
            health_router,
            prefix="/health",
            tags=["health"]
        )
        api_router.include_router(
            metrics_router,
            prefix="/metrics",
            tags=["metrics"]
        )

        # Auth endpoints
        api_router.include_router(
            auth_router,
            prefix="/auth",
            tags=["auth"]
        )

        # Secured endpoints
        api_router.include_router(
            agents_router,
            prefix="/agents",
            tags=["agents"]
        )
        api_router.include_router(
            deployments_router,
            prefix="/deployments",
            tags=["deployments"]
        )
        api_router.include_router(
            knowledge_router,
            prefix="/knowledge",
            tags=["knowledge"]
        )
        api_router.include_router(
            orchestration_router,
            prefix="/orchestration",
            tags=["orchestration"]
        )
        api_router.include_router(
            templates_router,
            prefix="/templates",
            tags=["templates"]
        )

        logger.log("info", "Successfully registered all API routes")
        metrics.track_performance("route_registration_success", 1)

    except Exception as e:
        logger.log("error", f"Failed to register routes: {str(e)}")
        metrics.track_performance("route_registration_error", 1)
        raise

# Export the configured router
__all__ = ["api_router"]