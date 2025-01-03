"""
FastAPI router implementation for agent orchestration endpoints.
Provides comprehensive REST API routes for managing agent coordination, workflows,
cross-agent communication, and monitoring with enhanced security and reliability features.
Version: 1.0.0
"""

from typing import Dict, List, Optional, Any
from uuid import UUID
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, status, BackgroundTasks
from pydantic import ValidationError
from circuit_breaker_pattern import CircuitBreaker

from core.orchestration.coordinator import AgentCoordinator
from core.orchestration.workflow import WorkflowManager
from api.dependencies import get_current_user, verify_admin_access, verify_agent_access, verify_rate_limit
from utils.logging import StructuredLogger
from utils.metrics import MetricsManager, track_time

# Initialize router with prefix and tags
router = APIRouter(prefix="/orchestration", tags=["orchestration"])

# Initialize logging and metrics
logger = StructuredLogger("api.routes.orchestration")
metrics = MetricsManager(namespace="AgentBuilderHub/Orchestration")

# Initialize circuit breaker
circuit_breaker = CircuitBreaker(
    failure_threshold=5,
    recovery_timeout=60
)

@router.post("/agents/{agent_id}/register")
@track_time("register_agent")
async def register_agent(
    agent_id: UUID,
    agent_config: Dict[str, Any],
    background_tasks: BackgroundTasks,
    current_user: Dict = Depends(get_current_user),
    coordinator: AgentCoordinator = Depends(AgentCoordinator),
    _: Dict = Depends(verify_agent_access),
    __: Dict = Depends(verify_rate_limit)
) -> Dict[str, Any]:
    """
    Register an agent with the orchestration system.
    
    Args:
        agent_id: UUID of the agent to register
        agent_config: Agent configuration parameters
        background_tasks: FastAPI background tasks
        current_user: Current authenticated user
        coordinator: Agent coordinator instance
        
    Returns:
        Dict containing registration status and metadata
    """
    try:
        # Track operation start
        start_time = datetime.utcnow()
        
        # Register agent with coordinator
        registration_result = await coordinator.register_agent(
            agent_id=str(agent_id),
            agent_config=agent_config
        )

        # Schedule health check in background
        background_tasks.add_task(
            coordinator.monitor_workflow,
            agent_id=str(agent_id)
        )

        # Track successful registration
        metrics.track_performance("agent_registration", 1, {
            "status": "success",
            "agent_type": agent_config.get("type")
        })

        logger.log("info", f"Agent {agent_id} registered successfully")

        return {
            "status": "success",
            "agent_id": str(agent_id),
            "registration": registration_result,
            "timestamp": datetime.utcnow().isoformat()
        }

    except ValidationError as e:
        logger.log("error", f"Agent registration validation failed: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=str(e)
        )
    except Exception as e:
        logger.log("error", f"Agent registration failed: {str(e)}")
        metrics.track_performance("agent_registration_error", 1)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to register agent"
        )

@router.post("/workflows")
@track_time("create_workflow")
async def create_workflow(
    workflow_id: str,
    agent_ids: List[UUID],
    workflow_config: Dict[str, Any],
    background_tasks: BackgroundTasks,
    current_user: Dict = Depends(get_current_user),
    coordinator: AgentCoordinator = Depends(AgentCoordinator),
    _: Dict = Depends(verify_admin_access),
    __: Dict = Depends(verify_rate_limit)
) -> Dict[str, Any]:
    """
    Create a new agent workflow with monitoring.
    
    Args:
        workflow_id: Unique workflow identifier
        agent_ids: List of agent UUIDs in workflow
        workflow_config: Workflow configuration parameters
        background_tasks: FastAPI background tasks
        current_user: Current authenticated user
        coordinator: Agent coordinator instance
        
    Returns:
        Dict containing created workflow details
    """
    try:
        # Track operation start
        start_time = datetime.utcnow()

        # Create workflow
        workflow = await coordinator.create_workflow(
            workflow_id=workflow_id,
            agent_ids=[str(agent_id) for agent_id in agent_ids],
            workflow_config=workflow_config
        )

        # Schedule workflow monitoring
        background_tasks.add_task(
            coordinator.monitor_workflow,
            workflow_id=workflow_id
        )

        # Track successful creation
        metrics.track_performance("workflow_creation", 1, {
            "agent_count": len(agent_ids)
        })

        logger.log("info", f"Workflow {workflow_id} created successfully")

        return {
            "status": "success",
            "workflow_id": workflow_id,
            "workflow": workflow,
            "timestamp": datetime.utcnow().isoformat()
        }

    except ValidationError as e:
        logger.log("error", f"Workflow creation validation failed: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=str(e)
        )
    except Exception as e:
        logger.log("error", f"Workflow creation failed: {str(e)}")
        metrics.track_performance("workflow_creation_error", 1)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to create workflow"
        )

@router.get("/workflows/{workflow_id}/metrics")
@track_time("get_workflow_metrics")
async def get_workflow_metrics(
    workflow_id: str,
    current_user: Dict = Depends(get_current_user),
    coordinator: AgentCoordinator = Depends(AgentCoordinator),
    _: Dict = Depends(verify_agent_access)
) -> Dict[str, Any]:
    """
    Get workflow performance metrics.
    
    Args:
        workflow_id: Workflow identifier
        current_user: Current authenticated user
        coordinator: Agent coordinator instance
        
    Returns:
        Dict containing workflow metrics
    """
    try:
        # Get workflow metrics
        metrics_data = await coordinator.get_workflow_metrics(workflow_id)

        logger.log("info", f"Retrieved metrics for workflow {workflow_id}")

        return {
            "status": "success",
            "workflow_id": workflow_id,
            "metrics": metrics_data,
            "timestamp": datetime.utcnow().isoformat()
        }

    except Exception as e:
        logger.log("error", f"Failed to get workflow metrics: {str(e)}")
        metrics.track_performance("metrics_retrieval_error", 1)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to retrieve workflow metrics"
        )