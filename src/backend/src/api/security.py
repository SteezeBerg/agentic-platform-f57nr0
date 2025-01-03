"""
API security middleware module for Agent Builder Hub.
Implements comprehensive security controls including authentication, authorization,
rate limiting, and security event monitoring.
Version: 1.0.0
"""

from typing import Dict, List, Optional, Any
from datetime import datetime
import logging
from functools import wraps

from fastapi import HTTPException, Depends, Security, Request
from fastapi.security import OAuth2PasswordBearer
from prometheus_client import Counter, Histogram
import redis

from core.auth.cognito import CognitoAuth
from core.auth.permissions import PermissionChecker
from schemas.auth import TokenPayload
from utils.logging import StructuredLogger
from utils.metrics import MetricsManager

# Initialize OAuth2 scheme
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/v1/auth/token", auto_error=True)

# Initialize core components
cognito_auth = CognitoAuth()
permission_checker = PermissionChecker()
logger = StructuredLogger('api.security')
metrics = MetricsManager(namespace='AgentBuilderHub/Security')

# Security metrics
METRICS = {
    'auth_requests': Counter(
        'auth_requests_total',
        'Total number of authentication requests',
        ['status']
    ),
    'auth_latency': Histogram(
        'auth_latency_seconds',
        'Authentication request latency'
    )
}

# Constants
MAX_FAILED_ATTEMPTS = 5
RATE_LIMIT_WINDOW = 300  # 5 minutes
TOKEN_CACHE_TTL = 300  # 5 minutes

class APISecurityMiddleware:
    """Enhanced API security middleware with comprehensive protection features."""

    def __init__(self, config: Dict[str, Any]):
        """Initialize security middleware with monitoring and caching."""
        self._auth_client = cognito_auth
        self._permission_checker = permission_checker
        self._logger = logger
        self._metrics = metrics
        self._config = config
        
        # Initialize Redis for rate limiting and token caching
        self._redis = redis.Redis(
            host=config['redis_host'],
            port=config['redis_port'],
            password=config['redis_password'],
            ssl=True,
            decode_responses=True
        )

    async def verify_request(
        self,
        token: str,
        operation: str,
        request: Request
    ) -> Dict[str, Any]:
        """
        Comprehensive request verification with security checks.
        
        Args:
            token: JWT token
            operation: Requested operation
            request: FastAPI request object
            
        Returns:
            Dict containing verified user information
        """
        try:
            # Check rate limits
            client_ip = request.client.host
            rate_key = f"rate_limit:{client_ip}"
            
            if self._redis.get(rate_key) and \
               int(self._redis.get(rate_key)) >= MAX_FAILED_ATTEMPTS:
                self._logger.log('warning', 'Rate limit exceeded', {
                    'ip_address': client_ip
                })
                raise HTTPException(
                    status_code=429,
                    detail="Too many requests. Please try again later."
                )

            # Verify token with enhanced validation
            token_payload = await self._auth_client.verify_token(token)
            
            # Check token cache
            cache_key = f"token:{token}"
            cached_data = self._redis.get(cache_key)
            
            if not cached_data:
                # Get user information with roles
                user_info = await self._auth_client.get_user(token)
                
                # Cache user data
                self._redis.setex(
                    cache_key,
                    TOKEN_CACHE_TTL,
                    str(user_info)
                )
            else:
                user_info = eval(cached_data)

            # Verify operation permissions
            if not self._permission_checker.verify_operation_permission(
                operation,
                user_info['role']
            ):
                raise HTTPException(
                    status_code=403,
                    detail="Insufficient permissions"
                )

            # Add security context
            security_context = {
                'ip_address': client_ip,
                'user_agent': request.headers.get('user-agent'),
                'timestamp': datetime.utcnow().isoformat()
            }

            # Track metrics
            self._metrics.track_performance('request_verified', 1, {
                'operation': operation,
                'status': 'success'
            })

            return {
                'user': user_info,
                'token_payload': token_payload,
                'security_context': security_context
            }

        except HTTPException:
            raise
        except Exception as e:
            self._logger.log('error', f'Request verification failed: {str(e)}')
            self._metrics.track_performance('verification_error', 1)
            raise HTTPException(
                status_code=500,
                detail="Security verification failed"
            )

    async def handle_security_error(
        self,
        error: Exception,
        request: Request
    ) -> None:
        """
        Handle security errors with comprehensive logging and metrics.
        
        Args:
            error: Exception that occurred
            request: FastAPI request object
        """
        client_ip = request.client.host
        
        # Update rate limiting
        rate_key = f"rate_limit:{client_ip}"
        self._redis.incr(rate_key)
        self._redis.expire(rate_key, RATE_LIMIT_WINDOW)
        
        # Log security event
        self._logger.log('error', 'Security error occurred', {
            'error_type': type(error).__name__,
            'error_message': str(error),
            'ip_address': client_ip,
            'path': request.url.path
        })
        
        # Track error metrics
        self._metrics.track_performance('security_error', 1, {
            'error_type': type(error).__name__
        })

async def get_current_user(
    token: str = Depends(oauth2_scheme),
    request: Request = None
) -> Dict[str, Any]:
    """
    Enhanced dependency for user authentication with caching.
    
    Args:
        token: JWT token from request
        request: FastAPI request object
        
    Returns:
        Dict containing user information
    """
    try:
        # Initialize metrics tracking
        start_time = datetime.utcnow()
        
        # Verify token and get user info
        security = APISecurityMiddleware({
            'redis_host': 'localhost',
            'redis_port': 6379,
            'redis_password': None
        })
        
        user_info = await security.verify_request(
            token,
            request.url.path,
            request
        )
        
        # Track authentication latency
        latency = (datetime.utcnow() - start_time).total_seconds()
        METRICS['auth_latency'].observe(latency)
        METRICS['auth_requests'].labels(status='success').inc()
        
        return user_info

    except Exception as e:
        METRICS['auth_requests'].labels(status='error').inc()
        await security.handle_security_error(e, request)
        raise HTTPException(
            status_code=401,
            detail="Authentication failed"
        )