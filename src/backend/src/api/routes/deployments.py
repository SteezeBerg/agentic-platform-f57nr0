"""
FastAPI router implementation for deployment management endpoints in Agent Builder Hub.
Provides comprehensive deployment lifecycle management with Blue/Green deployment strategy,
health monitoring, and secure multi-environment support.
Version: 1.0.0
"""

from typing import Dict, List, Optional, Any
from uuid import UUID
from datetime import datetime
import asyncio

from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks, status
from apscheduler.schedulers.asyncio import AsyncIOScheduler
import prometheus_client as prom
from pybreaker import CircuitBreaker

from services.deployment_service import DeploymentService
from schemas.deployment import DeploymentCreate, DeploymentResponse, DeploymentStatus
from schemas.metrics import SystemMetricsSchema
from utils.logging import StructuredLogger
from utils.metrics import MetricsManager, track_time

# Initialize router with prefix and tags
router = APIRouter(prefix='/deployments', tags=['deployments'])

# Initialize services and utilities
deployment_service = DeploymentService()
scheduler = AsyncIOScheduler()
logger = StructuredLogger("deployment_router", {"service": "deployment"})
metrics = MetricsManager()

# Initialize circuit breaker
circuit_breaker = CircuitBreaker(
    failure_threshold=5,
    recovery_timeout=30
)

# Prometheus metrics
deployment_counter = prom.Counter(
    'deployments_total',
    'Total number of deployments',
    ['environment', 'status']
)
deployment_duration = prom.Histogram(
    'deployment_duration_seconds',
    'Time spent in deployment',
    ['environment', 'type']
)
active_deployments = prom.Gauge(
    'active_deployments',
    'Number of active deployments',
    ['environment']
)

@router.post('/', response_model=DeploymentResponse, status_code=status.HTTP_201_CREATED)
@track_time('create_deployment')
async def create_deployment(
    deployment_data: DeploymentCreate,
    background_tasks: BackgroundTasks,
    current_user: Dict = Depends(verify_agent_access)
) -> DeploymentResponse:
    """
    Create a new deployment with Blue/Green strategy and comprehensive validation.
    """
    try:
        # Validate environment access
        if not has_environment_access(current_user, deployment_data.environment):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Insufficient permissions for target environment"
            )

        # Create deployment with monitoring
        deployment = await deployment_service.create_deployment(
            deployment_data=deployment_data,
            security_context={"user_id": current_user["id"]}
        )

        # Schedule health checks
        background_tasks.add_task(
            schedule_health_checks,
            deployment_id=deployment.id,
            environment=deployment_data.environment
        )

        # Track metrics
        deployment_counter.labels(
            environment=deployment_data.environment,
            status="created"
        ).inc()

        active_deployments.labels(
            environment=deployment_data.environment
        ).inc()

        return deployment

    except Exception as e:
        logger.log("error", f"Deployment creation failed: {str(e)}")
        metrics.track_performance('deployment_creation_error', 1)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e)
        )

@router.post('/{deployment_id}/execute')
@track_time('execute_deployment')
async def execute_deployment(
    deployment_id: UUID,
    current_user: Dict = Depends(verify_admin_access)
) -> Dict[str, Any]:
    """
    Execute deployment with health validation and traffic management.
    """
    try:
        # Get deployment details
        deployment = await deployment_service.get_deployment(deployment_id)
        if not deployment:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Deployment not found"
            )

        # Validate deployment status
        if deployment.status not in ['pending', 'ready']:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Invalid deployment status: {deployment.status}"
            )

        # Execute deployment with monitoring
        with deployment_duration.labels(
            environment=deployment.environment,
            type=deployment.deployment_type
        ).time():
            result = await deployment_service.execute_deployment(
                deployment_id=deployment_id,
                security_context={"user_id": current_user["id"]}
            )

        return result

    except Exception as e:
        logger.log("error", f"Deployment execution failed: {str(e)}")
        metrics.track_performance('deployment_execution_error', 1)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e)
        )

@router.get('/{deployment_id}', response_model=DeploymentResponse)
@track_time('get_deployment')
async def get_deployment(
    deployment_id: UUID,
    current_user: Dict = Depends(verify_agent_access)
) -> DeploymentResponse:
    """
    Retrieve deployment details with health status.
    """
    try:
        deployment = await deployment_service.get_deployment(deployment_id)
        if not deployment:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Deployment not found"
            )

        # Validate access
        if not has_deployment_access(current_user, deployment):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Insufficient permissions"
            )

        return deployment

    except Exception as e:
        logger.log("error", f"Error retrieving deployment: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e)
        )

@router.get('/', response_model=List[DeploymentResponse])
@track_time('list_deployments')
async def list_deployments(
    environment: Optional[str] = None,
    status: Optional[str] = None,
    current_user: Dict = Depends(verify_agent_access)
) -> List[DeploymentResponse]:
    """
    List deployments with optional filtering.
    """
    try:
        # Validate environment access if specified
        if environment and not has_environment_access(current_user, environment):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Insufficient permissions for environment"
            )

        deployments = await deployment_service.list_deployments(
            environment=environment,
            status=status,
            user_id=current_user["id"]
        )

        return deployments

    except Exception as e:
        logger.log("error", f"Error listing deployments: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e)
        )

@router.post('/{deployment_id}/rollback')
@track_time('rollback_deployment')
async def rollback_deployment(
    deployment_id: UUID,
    current_user: Dict = Depends(verify_admin_access)
) -> Dict[str, Any]:
    """
    Rollback deployment to previous stable version.
    """
    try:
        result = await deployment_service.rollback_deployment(
            deployment_id=deployment_id,
            security_context={"user_id": current_user["id"]}
        )

        # Track rollback metrics
        deployment_counter.labels(
            environment=result["environment"],
            status="rolled_back"
        ).inc()

        return result

    except Exception as e:
        logger.log("error", f"Deployment rollback failed: {str(e)}")
        metrics.track_performance('deployment_rollback_error', 1)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e)
        )

@router.get('/{deployment_id}/health', response_model=Dict[str, Any])
@track_time('check_deployment_health')
async def check_deployment_health(
    deployment_id: UUID,
    current_user: Dict = Depends(verify_agent_access)
) -> Dict[str, Any]:
    """
    Check deployment health status with detailed metrics.
    """
    try:
        health_status = await deployment_service.validate_health(
            deployment_id=deployment_id
        )
        return health_status

    except Exception as e:
        logger.log("error", f"Health check failed: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e)
        )

async def schedule_health_checks(deployment_id: UUID, environment: str) -> None:
    """Schedule periodic health checks for deployment."""
    try:
        scheduler.add_job(
            deployment_service.validate_health,
            'interval',
            seconds=30,
            args=[deployment_id],
            id=f'health_check_{deployment_id}',
            replace_existing=True
        )
        logger.log("info", f"Scheduled health checks for deployment {deployment_id}")

    except Exception as e:
        logger.log("error", f"Failed to schedule health checks: {str(e)}")
        metrics.track_performance('health_check_scheduling_error', 1)

def has_environment_access(user: Dict, environment: str) -> bool:
    """Validate user access to deployment environment."""
    if user.get("role") == "admin":
        return True
    
    allowed_environments = user.get("allowed_environments", [])
    return environment in allowed_environments

def has_deployment_access(user: Dict, deployment: DeploymentResponse) -> bool:
    """Validate user access to deployment."""
    if user.get("role") == "admin":
        return True
        
    return (
        deployment.owner_id == user["id"] or
        has_environment_access(user, deployment.environment)
    )

# Start scheduler on module import
scheduler.start()