"""
Authentication module initialization for Agent Builder Hub.
Provides enterprise-grade authentication and authorization using AWS Cognito with JWT tokens,
comprehensive audit logging, and performance monitoring.
Version: 1.0.0
"""

import logging
from typing import Dict, Optional, Any
from datetime import datetime, timedelta

# Third-party imports with versions
import boto3  # ^1.28.0
import structlog  # ^23.1.0
from circuitbreaker import circuit  # ^1.4.0

# Internal imports
from core.auth.tokens import create_access_token, create_refresh_token, TokenManager
from config.settings import get_settings
from utils.logging import StructuredLogger
from utils.metrics import MetricsManager

# Initialize logging and metrics
logger = StructuredLogger('auth')
metrics = MetricsManager(namespace='AgentBuilderHub/Auth')

# Role-based access control configuration
ROLES = {
    'ADMIN': 'admin',
    'POWER_USER': 'power_user',
    'DEVELOPER': 'developer',
    'BUSINESS_USER': 'business_user',
    'VIEWER': 'viewer'
}

# Permission definitions
PERMISSIONS = {
    'AGENT_CREATE': 'agent:create',
    'AGENT_READ': 'agent:read',
    'AGENT_UPDATE': 'agent:update',
    'AGENT_DELETE': 'agent:delete',
    'KNOWLEDGE_READ': 'knowledge:read',
    'KNOWLEDGE_WRITE': 'knowledge:write',
    'DEPLOYMENT_CREATE': 'deployment:create',
    'DEPLOYMENT_READ': 'deployment:read',
    'DEPLOYMENT_MANAGE': 'deployment:manage'
}

# Authentication configuration
AUTH_CONFIG = {
    'TOKEN_EXPIRY': 3600,  # 1 hour
    'REFRESH_EXPIRY': 86400,  # 24 hours
    'MAX_RETRY_ATTEMPTS': 3,
    'RATE_LIMIT': '100/minute',
    'CIRCUIT_BREAKER_THRESHOLD': 5
}

class AuthenticationError(Exception):
    """Custom exception for authentication failures with enhanced logging."""
    def __init__(self, message: str, error_code: str, context: Optional[Dict] = None):
        self.message = message
        self.error_code = error_code
        self.context = context or {}
        self.timestamp = datetime.utcnow()
        super().__init__(self.message)

        # Log authentication error
        logger.log('error', 'Authentication error occurred', {
            'error_code': error_code,
            'context': self.context,
            'timestamp': self.timestamp
        })

@circuit(failure_threshold=AUTH_CONFIG['CIRCUIT_BREAKER_THRESHOLD'])
async def authenticate_user(
    username: str,
    password: str,
    device_id: Optional[str] = None
) -> Dict[str, Any]:
    """
    Authenticate user with AWS Cognito and generate secure tokens.
    
    Args:
        username: User's email or username
        password: User's password
        device_id: Optional device identifier for multi-device support
        
    Returns:
        Dict containing authentication tokens and user information
        
    Raises:
        AuthenticationError: If authentication fails
    """
    try:
        settings = get_settings()
        cognito_client = boto3.client('cognito-idp', region_name=settings.aws_config.region)

        # Track authentication attempt
        metrics.track_performance('auth_attempt', 1)

        # Authenticate with Cognito
        auth_response = cognito_client.initiate_auth(
            AuthFlow='USER_PASSWORD_AUTH',
            AuthParameters={
                'USERNAME': username,
                'PASSWORD': password
            },
            ClientId=settings.aws_config.cognito_client_id
        )

        # Generate tokens
        access_token = create_access_token(
            subject=username,
            device_id=device_id,
            metadata={'auth_time': datetime.utcnow().isoformat()}
        )

        refresh_token = create_refresh_token(
            subject=username,
            device_id=device_id
        )

        # Get user attributes
        user_info = cognito_client.get_user(
            AccessToken=auth_response['AuthenticationResult']['AccessToken']
        )

        # Extract user roles and permissions
        user_attributes = {attr['Name']: attr['Value'] for attr in user_info['UserAttributes']}
        roles = user_attributes.get('custom:roles', '').split(',')
        
        # Track successful authentication
        metrics.track_performance('auth_success', 1)

        return {
            'access_token': access_token,
            'refresh_token': refresh_token,
            'token_type': 'bearer',
            'expires_in': AUTH_CONFIG['TOKEN_EXPIRY'],
            'user_info': {
                'username': username,
                'roles': roles,
                'attributes': user_attributes
            }
        }

    except cognito_client.exceptions.NotAuthorizedException:
        metrics.track_performance('auth_failure', 1, {'reason': 'invalid_credentials'})
        raise AuthenticationError(
            "Invalid username or password",
            "INVALID_CREDENTIALS",
            {'username': username}
        )
    except cognito_client.exceptions.UserNotFoundException:
        metrics.track_performance('auth_failure', 1, {'reason': 'user_not_found'})
        raise AuthenticationError(
            "User not found",
            "USER_NOT_FOUND",
            {'username': username}
        )
    except Exception as e:
        metrics.track_performance('auth_error', 1, {'error_type': type(e).__name__})
        logger.log('error', f"Authentication failed: {str(e)}")
        raise AuthenticationError(
            "Authentication failed",
            "AUTH_ERROR",
            {'error': str(e)}
        )

def validate_token(token: str, required_permissions: Optional[List[str]] = None) -> bool:
    """
    Validate JWT token and check required permissions.
    
    Args:
        token: JWT token to validate
        required_permissions: Optional list of required permissions
        
    Returns:
        bool: True if token is valid and has required permissions
    """
    try:
        token_manager = TokenManager()
        decoded_token = token_manager.decode_token(token)

        if required_permissions:
            token_permissions = set(decoded_token.get('permissions', []))
            if not all(perm in token_permissions for perm in required_permissions):
                logger.log('warning', 'Insufficient permissions', {
                    'required': required_permissions,
                    'provided': list(token_permissions)
                })
                return False

        metrics.track_performance('token_validation', 1, {'status': 'success'})
        return True

    except Exception as e:
        metrics.track_performance('token_validation', 1, {'status': 'failure'})
        logger.log('error', f"Token validation failed: {str(e)}")
        return False

# Export public interface
__all__ = [
    'authenticate_user',
    'validate_token',
    'create_access_token',
    'create_refresh_token',
    'ROLES',
    'PERMISSIONS',
    'AuthenticationError'
]