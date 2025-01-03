"""
Enhanced authentication service for Agent Builder Hub.
Implements secure user authentication, token management, and permission verification
with comprehensive monitoring and security features.
Version: 1.0.0
"""

from typing import Dict, Optional
import logging
from datetime import datetime, timedelta
import uuid

# Third-party imports with versions
from fastapi import HTTPException  # ^0.104.0
from jose import jwt  # ^3.3.0
from redis import Redis  # ^4.5.0
from prometheus_client import Counter, Histogram  # ^0.17.0

# Internal imports
from core.auth.cognito import CognitoAuth
from core.auth.permissions import PermissionChecker
from core.auth.tokens import create_access_token, create_refresh_token, verify_token
from schemas.auth import TokenPayload, LoginRequest, TokenResponse
from utils.logging import StructuredLogger
from utils.metrics import MetricsManager

# Initialize logging and metrics
logger = StructuredLogger('auth_service')
metrics = MetricsManager(namespace='AgentBuilderHub/Auth')

# Global constants
TOKEN_BLACKLIST_PREFIX = "blacklist:token:"
RATE_LIMIT_PREFIX = "rate_limit:"
MAX_LOGIN_ATTEMPTS = 5
RATE_LIMIT_WINDOW = 300  # 5 minutes
TOKEN_EXPIRY_BUFFER = 300  # 5 minutes buffer for token expiration

class AuthService:
    """Enhanced authentication service with comprehensive security features."""

    def __init__(self):
        """Initialize authentication service with security and monitoring."""
        self._cognito_auth = CognitoAuth()
        self._permission_checker = PermissionChecker()
        self._redis_client = Redis(
            host="localhost",  # Configure from settings
            port=6379,
            db=0,
            decode_responses=True
        )
        
        # Initialize metrics
        self._metrics = {
            'auth_attempts': Counter(
                'auth_attempts_total',
                'Total authentication attempts',
                ['status']
            ),
            'token_operations': Counter(
                'token_operations_total',
                'Total token operations',
                ['operation', 'status']
            ),
            'auth_latency': Histogram(
                'auth_operation_duration_seconds',
                'Authentication operation duration'
            )
        }

        logger.log('info', 'Authentication service initialized')

    async def authenticate_user(
        self,
        login_data: LoginRequest,
        device_info: Optional[Dict] = None
    ) -> TokenResponse:
        """
        Authenticate user with enhanced security measures and monitoring.
        
        Args:
            login_data: Login credentials and metadata
            device_info: Optional device information
            
        Returns:
            TokenResponse containing authentication tokens and metadata
        """
        try:
            # Check rate limiting
            rate_limit_key = f"{RATE_LIMIT_PREFIX}:{login_data.email}"
            attempt_count = self._redis_client.incr(rate_limit_key)
            self._redis_client.expire(rate_limit_key, RATE_LIMIT_WINDOW)

            if attempt_count > MAX_LOGIN_ATTEMPTS:
                logger.log('warning', 'Rate limit exceeded', {
                    'email': login_data.email,
                    'attempts': attempt_count
                })
                self._metrics['auth_attempts'].labels(status='rate_limited').inc()
                raise HTTPException(
                    status_code=429,
                    detail="Too many login attempts. Please try again later."
                )

            # Authenticate with Cognito
            auth_result = await self._cognito_auth.authenticate(
                login_data.email,
                login_data.password,
                device_info.get('ip_address') if device_info else None
            )

            # Generate enhanced tokens
            access_token = create_access_token(
                subject=login_data.email,
                scopes=auth_result.get('scopes', []),
                device_id=device_info.get('device_id') if device_info else None,
                metadata={
                    'cognito_token': auth_result['access_token'],
                    'device_info': device_info
                }
            )

            refresh_token = create_refresh_token(
                subject=login_data.email,
                device_id=device_info.get('device_id') if device_info else None
            )

            # Clear rate limiting on successful auth
            self._redis_client.delete(rate_limit_key)

            # Track successful authentication
            self._metrics['auth_attempts'].labels(status='success').inc()
            
            # Prepare response
            token_response = TokenResponse(
                access_token=access_token,
                refresh_token=refresh_token,
                token_type="bearer",
                expires_in=auth_result['expires_in'],
                metadata={
                    'last_login': datetime.utcnow().isoformat(),
                    'device_id': device_info.get('device_id') if device_info else None
                },
                scopes=auth_result.get('scopes', [])
            )

            logger.log('info', 'Authentication successful', {
                'email': login_data.email,
                'device_info': device_info
            })

            return token_response

        except Exception as e:
            # Track failed authentication
            self._metrics['auth_attempts'].labels(status='error').inc()
            logger.log('error', f'Authentication failed: {str(e)}', {
                'email': login_data.email,
                'error': str(e)
            })
            raise

    async def verify_token(
        self,
        token: str,
        required_role: Optional[str] = None,
        context: Optional[Dict] = None
    ) -> TokenPayload:
        """
        Enhanced token verification with security checks.
        
        Args:
            token: JWT token to verify
            required_role: Optional required role for authorization
            context: Additional context for verification
            
        Returns:
            TokenPayload containing validated token data
        """
        try:
            # Check token blacklist
            if self._redis_client.get(f"{TOKEN_BLACKLIST_PREFIX}{token}"):
                logger.log('warning', 'Blacklisted token used', {
                    'context': context
                })
                raise HTTPException(
                    status_code=401,
                    detail="Token has been revoked"
                )

            # Verify token
            token_data = verify_token(token)

            # Check role if required
            if required_role:
                if not self._permission_checker.verify_operation_permission(
                    required_role,
                    token_data.scopes[0] if token_data.scopes else None
                ):
                    logger.log('warning', 'Insufficient permissions', {
                        'required_role': required_role,
                        'token_scopes': token_data.scopes
                    })
                    raise HTTPException(
                        status_code=403,
                        detail="Insufficient permissions"
                    )

            # Track successful verification
            self._metrics['token_operations'].labels(
                operation='verify',
                status='success'
            ).inc()

            return token_data

        except Exception as e:
            # Track verification failure
            self._metrics['token_operations'].labels(
                operation='verify',
                status='error'
            ).inc()
            logger.log('error', f'Token verification failed: {str(e)}')
            raise

    async def refresh_auth_tokens(
        self,
        refresh_token: str,
        context: Optional[Dict] = None
    ) -> TokenResponse:
        """
        Refresh authentication tokens with security controls.
        
        Args:
            refresh_token: Current refresh token
            context: Additional context for refresh operation
            
        Returns:
            TokenResponse containing new tokens
        """
        try:
            # Verify refresh token
            token_data = verify_token(refresh_token)

            # Generate new tokens
            new_access_token = create_access_token(
                subject=token_data.sub,
                scopes=token_data.scopes,
                device_id=token_data.metadata.get('device_id'),
                metadata=token_data.metadata
            )

            new_refresh_token = create_refresh_token(
                subject=token_data.sub,
                device_id=token_data.metadata.get('device_id'),
                previous_token_id=token_data.jti
            )

            # Blacklist old refresh token
            self._redis_client.setex(
                f"{TOKEN_BLACKLIST_PREFIX}{refresh_token}",
                TOKEN_EXPIRY_BUFFER,
                "1"
            )

            # Track successful refresh
            self._metrics['token_operations'].labels(
                operation='refresh',
                status='success'
            ).inc()

            return TokenResponse(
                access_token=new_access_token,
                refresh_token=new_refresh_token,
                token_type="bearer",
                expires_in=3600,  # 1 hour
                metadata={
                    'refreshed_at': datetime.utcnow().isoformat(),
                    'previous_token_id': token_data.jti
                },
                scopes=token_data.scopes
            )

        except Exception as e:
            # Track refresh failure
            self._metrics['token_operations'].labels(
                operation='refresh',
                status='error'
            ).inc()
            logger.log('error', f'Token refresh failed: {str(e)}')
            raise

    async def check_permission(
        self,
        operation: str,
        user_role: str,
        context: Optional[Dict] = None
    ) -> bool:
        """
        Check operation permission with caching.
        
        Args:
            operation: Operation to check
            user_role: User's role
            context: Additional context for permission check
            
        Returns:
            bool indicating if operation is permitted
        """
        try:
            return self._permission_checker.verify_operation_permission(
                operation,
                user_role
            )
        except Exception as e:
            logger.log('error', f'Permission check failed: {str(e)}')
            raise