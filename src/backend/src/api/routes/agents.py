"""
FastAPI router implementation for agent management endpoints with comprehensive security,
validation, monitoring, and error handling capabilities.
Version: 1.0.0
"""

from typing import Dict, List, Optional
from uuid import UUID
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, status, Request
from fastapi.security import OAuth2PasswordBearer
from fastapi_limiter.depends import RateLimiter

from services.agent_service import AgentService
from schemas.agent import AgentCreate, AgentUpdate, AgentResponse, AgentList
from api.dependencies import get_agent_service, verify_agent_access
from utils.metrics import MetricsManager
from utils.logging import StructuredLogger

# Initialize router with prefix and tags
router = APIRouter(prefix="/agents", tags=["agents"])

# Initialize logging and metrics
logger = StructuredLogger("api.routes.agents")
metrics = MetricsManager(namespace="AgentBuilderHub/AgentAPI")

# Rate limiting configuration
RATE_LIMIT = "100/minute"

@router.post(
    "/",
    response_model=AgentResponse,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(RateLimiter(times=100, seconds=60))]
)
async def create_agent(
    agent_data: AgentCreate,
    request: Request,
    agent_service: AgentService = Depends(get_agent_service),
    current_user: Dict = Depends(verify_agent_access)
) -> AgentResponse:
    """
    Create a new agent with comprehensive validation and security checks.
    
    Args:
        agent_data: Agent creation parameters
        request: FastAPI request object
        agent_service: Agent service instance
        current_user: Current authenticated user
        
    Returns:
        Created agent details
    """
    try:
        # Track operation start
        start_time = datetime.utcnow()
        metrics.track_performance("agent_creation_started", 1)

        # Log operation start
        logger.log("info", "Starting agent creation", {
            "user_id": str(current_user["id"]),
            "agent_type": agent_data.type
        })

        # Create agent
        agent = await agent_service.create_agent(
            agent_data.dict(),
            current_user["id"],
            {
                "ip_address": request.client.host,
                "user_agent": request.headers.get("user-agent")
            }
        )

        # Track successful creation
        duration = (datetime.utcnow() - start_time).total_seconds()
        metrics.track_performance("agent_creation_success", 1, {
            "duration": duration,
            "agent_type": agent_data.type
        })

        return agent

    except Exception as e:
        # Track failure
        metrics.track_performance("agent_creation_error", 1)
        logger.log("error", f"Agent creation failed: {str(e)}", {
            "user_id": str(current_user["id"]),
            "error": str(e)
        })
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to create agent"
        )

@router.get(
    "/{agent_id}",
    response_model=AgentResponse,
    dependencies=[Depends(RateLimiter(times=100, seconds=60))]
)
async def get_agent(
    agent_id: UUID,
    agent_service: AgentService = Depends(get_agent_service),
    current_user: Dict = Depends(verify_agent_access)
) -> AgentResponse:
    """
    Retrieve agent details with security validation.
    
    Args:
        agent_id: UUID of agent to retrieve
        agent_service: Agent service instance
        current_user: Current authenticated user
        
    Returns:
        Agent details if found and accessible
    """
    try:
        # Track operation start
        metrics.track_performance("agent_retrieval_started", 1)

        # Get agent with access verification
        agent = await agent_service.get_agent(agent_id)
        if not agent:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Agent not found"
            )

        # Track successful retrieval
        metrics.track_performance("agent_retrieval_success", 1)

        return agent

    except HTTPException:
        raise
    except Exception as e:
        metrics.track_performance("agent_retrieval_error", 1)
        logger.log("error", f"Agent retrieval failed: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to retrieve agent"
        )

@router.put(
    "/{agent_id}",
    response_model=AgentResponse,
    dependencies=[Depends(RateLimiter(times=100, seconds=60))]
)
async def update_agent(
    agent_id: UUID,
    updates: AgentUpdate,
    agent_service: AgentService = Depends(get_agent_service),
    current_user: Dict = Depends(verify_agent_access)
) -> AgentResponse:
    """
    Update agent configuration with validation and security checks.
    
    Args:
        agent_id: UUID of agent to update
        updates: Update parameters
        agent_service: Agent service instance
        current_user: Current authenticated user
        
    Returns:
        Updated agent details
    """
    try:
        # Track operation start
        start_time = datetime.utcnow()
        metrics.track_performance("agent_update_started", 1)

        # Update agent
        updated_agent = await agent_service.update_agent(
            agent_id,
            current_user["id"],
            updates.dict(exclude_unset=True)
        )

        if not updated_agent:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Agent not found"
            )

        # Track successful update
        duration = (datetime.utcnow() - start_time).total_seconds()
        metrics.track_performance("agent_update_success", 1, {
            "duration": duration
        })

        return updated_agent

    except HTTPException:
        raise
    except Exception as e:
        metrics.track_performance("agent_update_error", 1)
        logger.log("error", f"Agent update failed: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to update agent"
        )

@router.delete(
    "/{agent_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(RateLimiter(times=100, seconds=60))]
)
async def delete_agent(
    agent_id: UUID,
    agent_service: AgentService = Depends(get_agent_service),
    current_user: Dict = Depends(verify_agent_access)
) -> None:
    """
    Delete agent with security validation.
    
    Args:
        agent_id: UUID of agent to delete
        agent_service: Agent service instance
        current_user: Current authenticated user
    """
    try:
        # Track operation start
        metrics.track_performance("agent_deletion_started", 1)

        # Delete agent
        success = await agent_service.delete_agent(agent_id, current_user["id"])
        if not success:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Agent not found"
            )

        # Track successful deletion
        metrics.track_performance("agent_deletion_success", 1)

    except HTTPException:
        raise
    except Exception as e:
        metrics.track_performance("agent_deletion_error", 1)
        logger.log("error", f"Agent deletion failed: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to delete agent"
        )

@router.get(
    "/",
    response_model=AgentList,
    dependencies=[Depends(RateLimiter(times=100, seconds=60))]
)
async def list_agents(
    page: int = 1,
    size: int = 50,
    agent_service: AgentService = Depends(get_agent_service),
    current_user: Dict = Depends(verify_agent_access)
) -> AgentList:
    """
    List agents with pagination and security validation.
    
    Args:
        page: Page number (1-based)
        size: Page size
        agent_service: Agent service instance
        current_user: Current authenticated user
        
    Returns:
        Paginated list of agents
    """
    try:
        # Track operation start
        metrics.track_performance("agent_list_started", 1)

        # Get agents list
        agents = await agent_service.list_agents(
            page=page,
            size=size,
            owner_id=current_user["id"]
        )

        # Track successful listing
        metrics.track_performance("agent_list_success", 1)

        return agents

    except Exception as e:
        metrics.track_performance("agent_list_error", 1)
        logger.log("error", f"Agent listing failed: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to list agents"
        )