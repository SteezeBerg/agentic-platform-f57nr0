"""
FastAPI dependencies module for Agent Builder Hub API.
Implements secure dependency injection with comprehensive monitoring and error handling.
Version: 1.0.0
"""

from typing import Dict, Optional, Any
from datetime import datetime
from functools import cache
from uuid import UUID

from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from prometheus_client import Counter, Histogram

from api.security import get_current_user
from services.auth_service import AuthService
from services.agent_service import AgentService
from utils.logging import StructuredLogger
from utils.metrics import MetricsManager

# Initialize logging and metrics
logger = StructuredLogger("api.dependencies", {
    "service": "agent_builder",
    "component": "dependencies"
})
metrics = MetricsManager(namespace="AgentBuilderHub/Dependencies")

# Initialize OAuth2 scheme
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/v1/auth/token")

# Global service instances
auth_service: Optional[AuthService] = None
agent_service: Optional[AgentService] = None

# Performance metrics
METRICS = {
    'dependency_calls': Counter(
        'dependency_calls_total',
        'Total number of dependency injections',
        ['dependency', 'status']
    ),
    'dependency_latency': Histogram(
        'dependency_latency_seconds',
        'Dependency injection latency'
    )
}

@cache(maxsize=1)
def get_auth_service() -> AuthService:
    """
    FastAPI dependency that provides AuthService instance with caching.
    
    Returns:
        AuthService: Cached singleton instance
    """
    try:
        start_time = datetime.utcnow()
        METRICS['dependency_calls'].labels(
            dependency='auth_service',
            status='started'
        ).inc()

        global auth_service
        if not auth_service:
            auth_service = AuthService()
            logger.log("info", "Initialized AuthService instance")

        duration = (datetime.utcnow() - start_time).total_seconds()
        METRICS['dependency_latency'].observe(duration)
        METRICS['dependency_calls'].labels(
            dependency='auth_service',
            status='success'
        ).inc()

        return auth_service

    except Exception as e:
        METRICS['dependency_calls'].labels(
            dependency='auth_service',
            status='error'
        ).inc()
        logger.log("error", f"Failed to initialize AuthService: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to initialize authentication service"
        )

@cache(maxsize=1)
def get_agent_service() -> AgentService:
    """
    FastAPI dependency that provides AgentService instance with caching.
    
    Returns:
        AgentService: Cached singleton instance
    """
    try:
        start_time = datetime.utcnow()
        METRICS['dependency_calls'].labels(
            dependency='agent_service',
            status='started'
        ).inc()

        global agent_service
        if not agent_service:
            agent_service = AgentService()
            logger.log("info", "Initialized AgentService instance")

        duration = (datetime.utcnow() - start_time).total_seconds()
        METRICS['dependency_latency'].observe(duration)
        METRICS['dependency_calls'].labels(
            dependency='agent_service',
            status='success'
        ).inc()

        return agent_service

    except Exception as e:
        METRICS['dependency_calls'].labels(
            dependency='agent_service',
            status='error'
        ).inc()
        logger.log("error", f"Failed to initialize AgentService: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to initialize agent service"
        )

async def verify_admin_access(
    current_user: Dict = Depends(get_current_user),
    auth_service: AuthService = Depends(get_auth_service)
) -> Dict:
    """
    Enhanced dependency that verifies admin role access with audit logging.
    
    Args:
        current_user: Current authenticated user
        auth_service: Authentication service instance
        
    Returns:
        Dict: Current user if admin access verified
        
    Raises:
        HTTPException: If admin access verification fails
    """
    try:
        start_time = datetime.utcnow()
        user_id = current_user.get("sub")
        user_role = current_user.get("role")

        logger.log("info", "Verifying admin access", {
            "user_id": user_id,
            "role": user_role
        })

        if not await auth_service.check_permission("admin", user_role):
            logger.log("warning", "Admin access denied", {
                "user_id": user_id,
                "role": user_role
            })
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Admin access required"
            )

        duration = (datetime.utcnow() - start_time).total_seconds()
        METRICS['dependency_latency'].observe(duration)
        
        logger.log("info", "Admin access verified", {
            "user_id": user_id,
            "duration": duration
        })

        return current_user

    except HTTPException:
        raise
    except Exception as e:
        logger.log("error", f"Admin access verification failed: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to verify admin access"
        )

async def verify_agent_access(
    agent_id: UUID,
    current_user: Dict = Depends(get_current_user),
    agent_service: AgentService = Depends(get_agent_service)
) -> Dict:
    """
    Enhanced dependency that verifies access to specific agent.
    
    Args:
        agent_id: UUID of agent to access
        current_user: Current authenticated user
        agent_service: Agent service instance
        
    Returns:
        Dict: Agent details if access permitted
        
    Raises:
        HTTPException: If agent access verification fails
    """
    try:
        start_time = datetime.utcnow()
        user_id = current_user.get("sub")

        logger.log("info", "Verifying agent access", {
            "user_id": user_id,
            "agent_id": str(agent_id)
        })

        # Get agent details
        agent = await agent_service.get_agent(agent_id)
        if not agent:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Agent not found"
            )

        # Verify ownership or admin access
        if agent.get("owner_id") != user_id and current_user.get("role") != "admin":
            logger.log("warning", "Agent access denied", {
                "user_id": user_id,
                "agent_id": str(agent_id)
            })
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Insufficient permissions to access agent"
            )

        duration = (datetime.utcnow() - start_time).total_seconds()
        METRICS['dependency_latency'].observe(duration)

        logger.log("info", "Agent access verified", {
            "user_id": user_id,
            "agent_id": str(agent_id),
            "duration": duration
        })

        return agent

    except HTTPException:
        raise
    except Exception as e:
        logger.log("error", f"Agent access verification failed: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to verify agent access"
        )