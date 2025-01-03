"""
Authentication routes module for Agent Builder Hub.
Implements secure authentication and authorization endpoints with AWS Cognito integration.
Version: 1.0.0
"""

from datetime import datetime
from typing import Dict, Optional

from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.security import OAuth2PasswordRequestForm
from prometheus_client import Counter, Histogram

from services.auth_service import AuthService
from schemas.auth import LoginRequest, TokenResponse, LogoutRequest
from api.dependencies import get_auth_service
from api.security import get_current_user
from utils.logging import StructuredLogger
from utils.metrics import MetricsManager

# Initialize router
router = APIRouter(prefix="/api/v1/auth", tags=["auth"])

# Initialize logging and metrics
logger = StructuredLogger("api.routes.auth", {
    "service": "agent_builder",
    "component": "auth_routes"
})
metrics = MetricsManager(namespace="AgentBuilderHub/Auth")

# Metrics
AUTH_METRICS = {
    'auth_requests': Counter(
        'auth_requests_total',
        'Total authentication requests',
        ['endpoint', 'status']
    ),
    'auth_latency': Histogram(
        'auth_latency_seconds',
        'Authentication request latency',
        ['endpoint']
    )
}

@router.post("/login", response_model=TokenResponse)
async def login(
    request: Request,
    login_data: LoginRequest,
    auth_service: AuthService = Depends(get_auth_service)
) -> TokenResponse:
    """
    Authenticate user and return access tokens.
    
    Args:
        request: FastAPI request object
        login_data: Login credentials
        auth_service: Authentication service instance
        
    Returns:
        TokenResponse containing authentication tokens
        
    Raises:
        HTTPException: For authentication failures
    """
    try:
        start_time = datetime.utcnow()
        AUTH_METRICS['auth_requests'].labels(endpoint="login", status="started").inc()

        # Get client info for security context
        client_ip = request.client.host
        user_agent = request.headers.get("user-agent", "unknown")

        # Authenticate user
        token_response = await auth_service.authenticate_user(
            login_data,
            {
                "ip_address": client_ip,
                "user_agent": user_agent,
                "device_id": login_data.device_id
            }
        )

        # Track metrics
        duration = (datetime.utcnow() - start_time).total_seconds()
        AUTH_METRICS['auth_latency'].labels(endpoint="login").observe(duration)
        AUTH_METRICS['auth_requests'].labels(endpoint="login", status="success").inc()

        return token_response

    except Exception as e:
        AUTH_METRICS['auth_requests'].labels(endpoint="login", status="error").inc()
        logger.log("error", f"Login failed: {str(e)}", {
            "email": login_data.email,
            "ip_address": client_ip
        })
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication failed"
        )

@router.post("/refresh", response_model=TokenResponse)
async def refresh_token(
    request: Request,
    refresh_token: str,
    auth_service: AuthService = Depends(get_auth_service)
) -> TokenResponse:
    """
    Refresh expired access token using refresh token.
    
    Args:
        request: FastAPI request object
        refresh_token: Current refresh token
        auth_service: Authentication service instance
        
    Returns:
        TokenResponse containing new tokens
        
    Raises:
        HTTPException: For token refresh failures
    """
    try:
        start_time = datetime.utcnow()
        AUTH_METRICS['auth_requests'].labels(endpoint="refresh", status="started").inc()

        # Get client info
        client_ip = request.client.host
        user_agent = request.headers.get("user-agent", "unknown")

        # Refresh tokens
        token_response = await auth_service.refresh_auth_tokens(
            refresh_token,
            {
                "ip_address": client_ip,
                "user_agent": user_agent
            }
        )

        # Track metrics
        duration = (datetime.utcnow() - start_time).total_seconds()
        AUTH_METRICS['auth_latency'].labels(endpoint="refresh").observe(duration)
        AUTH_METRICS['auth_requests'].labels(endpoint="refresh", status="success").inc()

        return token_response

    except Exception as e:
        AUTH_METRICS['auth_requests'].labels(endpoint="refresh", status="error").inc()
        logger.log("error", f"Token refresh failed: {str(e)}", {
            "ip_address": client_ip
        })
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token refresh failed"
        )

@router.get("/verify")
async def verify_token(
    current_user: Dict = Depends(get_current_user)
) -> Dict:
    """
    Verify current token validity and return user info.
    
    Args:
        current_user: Current authenticated user info
        
    Returns:
        Dict containing user information and roles
    """
    try:
        start_time = datetime.utcnow()
        AUTH_METRICS['auth_requests'].labels(endpoint="verify", status="started").inc()

        # Track metrics
        duration = (datetime.utcnow() - start_time).total_seconds()
        AUTH_METRICS['auth_latency'].labels(endpoint="verify").observe(duration)
        AUTH_METRICS['auth_requests'].labels(endpoint="verify", status="success").inc()

        return current_user

    except Exception as e:
        AUTH_METRICS['auth_requests'].labels(endpoint="verify", status="error").inc()
        logger.log("error", f"Token verification failed: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token verification failed"
        )

@router.post("/logout")
async def logout(
    request: Request,
    current_user: Dict = Depends(get_current_user),
    auth_service: AuthService = Depends(get_auth_service)
) -> Dict:
    """
    Invalidate current user session and tokens.
    
    Args:
        request: FastAPI request object
        current_user: Current authenticated user
        auth_service: Authentication service instance
        
    Returns:
        Dict containing logout confirmation
    """
    try:
        start_time = datetime.utcnow()
        AUTH_METRICS['auth_requests'].labels(endpoint="logout", status="started").inc()

        # Get client info
        client_ip = request.client.host
        user_agent = request.headers.get("user-agent", "unknown")

        # Invalidate tokens
        await auth_service.invalidate_token(
            current_user["token"],
            {
                "ip_address": client_ip,
                "user_agent": user_agent
            }
        )

        # Track metrics
        duration = (datetime.utcnow() - start_time).total_seconds()
        AUTH_METRICS['auth_latency'].labels(endpoint="logout").observe(duration)
        AUTH_METRICS['auth_requests'].labels(endpoint="logout", status="success").inc()

        return {
            "message": "Successfully logged out",
            "timestamp": datetime.utcnow().isoformat()
        }

    except Exception as e:
        AUTH_METRICS['auth_requests'].labels(endpoint="logout", status="error").inc()
        logger.log("error", f"Logout failed: {str(e)}", {
            "user_id": current_user.get("sub"),
            "ip_address": client_ip
        })
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Logout failed"
        )