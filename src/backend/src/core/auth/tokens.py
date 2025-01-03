"""
Enterprise-grade JWT token management module for Agent Builder Hub.
Implements secure token generation, validation, and management with AWS Cognito integration.
Version: 1.0.0
"""

from datetime import datetime, timezone, timedelta
from typing import Dict, List, Optional
import uuid
import logging
from functools import wraps

from jose import jwt, JWTError, ExpiredSignatureError
from limits import RateLimitItem
from limits.storage import MemoryStorage
from limits.strategies import MovingWindowRateLimiter

from config.settings import get_settings
from schemas.auth import TokenPayload
from utils.logging import StructuredLogger
from utils.metrics import MetricsManager

# Initialize logging and metrics
logger = StructuredLogger('auth.tokens')
metrics = MetricsManager(namespace='AgentBuilderHub/Auth')

# Global constants
ALGORITHM = "RS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 30
REFRESH_TOKEN_EXPIRE_DAYS = 30
MAX_TOKENS_PER_USER = 5
RATE_LIMIT_TOKENS = "100/hour"

# Token purpose types
TOKEN_PURPOSE_TYPES = {
    "access": "API_ACCESS",
    "refresh": "TOKEN_REFRESH",
    "reset": "PASSWORD_RESET"
}

# Initialize rate limiter
rate_limiter = MovingWindowRateLimiter(MemoryStorage())
rate_limit = RateLimitItem(RATE_LIMIT_TOKENS)

def rate_limit_check(func):
    """Decorator for rate limiting token operations"""
    @wraps(func)
    def wrapper(*args, **kwargs):
        if not rate_limiter.hit(rate_limit):
            logger.log('error', 'Rate limit exceeded for token operation')
            metrics.track_performance('rate_limit_exceeded', 1)
            raise ValueError("Token operation rate limit exceeded")
        return func(*args, **kwargs)
    return wrapper

@rate_limit_check
def create_access_token(
    subject: str,
    scopes: Optional[List[str]] = None,
    device_id: Optional[str] = None,
    metadata: Optional[Dict] = None
) -> str:
    """
    Creates a new JWT access token with enhanced security features.
    
    Args:
        subject: Token subject (user ID)
        scopes: Authorization scopes
        device_id: Optional device identifier
        metadata: Additional token metadata
        
    Returns:
        str: Encoded JWT access token
    """
    try:
        settings = get_settings()
        
        # Calculate token expiration with timezone awareness
        now = datetime.now(timezone.utc)
        expires_delta = timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
        exp = now + expires_delta

        # Generate token fingerprint
        token_fingerprint = str(uuid.uuid4())

        # Create comprehensive token payload
        token_data = {
            "sub": subject,
            "exp": int(exp.timestamp()),
            "iat": int(now.timestamp()),
            "nbf": int(now.timestamp()),
            "jti": str(uuid.uuid4()),
            "type": TOKEN_PURPOSE_TYPES["access"],
            "scopes": scopes or [],
            "fingerprint": token_fingerprint
        }

        if device_id:
            token_data["device_id"] = device_id

        if metadata:
            token_data["metadata"] = metadata

        # Add security headers
        token_data.update({
            "iss": "agent-builder-hub",
            "aud": ["api"],
            "version": "1.0"
        })

        # Encode token with RS256 algorithm
        encoded_token = jwt.encode(
            token_data,
            settings.auth_config.jwt_secret_key,
            algorithm=ALGORITHM
        )

        # Log token creation
        logger.log('info', 'Access token created', {
            'subject': subject,
            'expires': exp.isoformat(),
            'fingerprint': token_fingerprint
        })

        # Track metrics
        metrics.track_performance('token_created', 1, {'type': 'access'})

        return encoded_token

    except Exception as e:
        logger.log('error', f'Token creation failed: {str(e)}')
        metrics.track_performance('token_error', 1)
        raise

@rate_limit_check
def create_refresh_token(
    subject: str,
    device_id: Optional[str] = None,
    previous_token_id: Optional[str] = None
) -> str:
    """
    Creates a new JWT refresh token with rotation support.
    
    Args:
        subject: Token subject (user ID)
        device_id: Optional device identifier
        previous_token_id: ID of previous refresh token for rotation
        
    Returns:
        str: Encoded JWT refresh token
    """
    try:
        settings = get_settings()
        
        # Calculate refresh token expiration
        now = datetime.now(timezone.utc)
        expires_delta = timedelta(days=REFRESH_TOKEN_EXPIRE_DAYS)
        exp = now + expires_delta

        # Generate token fingerprint
        token_fingerprint = str(uuid.uuid4())

        # Create refresh token payload
        token_data = {
            "sub": subject,
            "exp": int(exp.timestamp()),
            "iat": int(now.timestamp()),
            "nbf": int(now.timestamp()),
            "jti": str(uuid.uuid4()),
            "type": TOKEN_PURPOSE_TYPES["refresh"],
            "fingerprint": token_fingerprint
        }

        if device_id:
            token_data["device_id"] = device_id

        if previous_token_id:
            token_data["previous_token"] = previous_token_id

        # Add security headers
        token_data.update({
            "iss": "agent-builder-hub",
            "aud": ["refresh"],
            "version": "1.0"
        })

        # Encode refresh token
        encoded_token = jwt.encode(
            token_data,
            settings.auth_config.jwt_secret_key,
            algorithm=ALGORITHM
        )

        # Log refresh token creation
        logger.log('info', 'Refresh token created', {
            'subject': subject,
            'expires': exp.isoformat(),
            'fingerprint': token_fingerprint
        })

        # Track metrics
        metrics.track_performance('token_created', 1, {'type': 'refresh'})

        return encoded_token

    except Exception as e:
        logger.log('error', f'Refresh token creation failed: {str(e)}')
        metrics.track_performance('token_error', 1)
        raise

def decode_token(token: str) -> TokenPayload:
    """
    Decodes and validates a JWT token with comprehensive security checks.
    
    Args:
        token: JWT token string
        
    Returns:
        TokenPayload: Decoded and validated token payload
    """
    try:
        settings = get_settings()

        # Decode token with RS256 algorithm
        payload = jwt.decode(
            token,
            settings.auth_config.jwt_secret_key,
            algorithms=[ALGORITHM],
            audience=["api", "refresh"]
        )

        # Validate token structure
        token_data = TokenPayload(**payload)

        # Verify token expiration
        now = datetime.now(timezone.utc)
        if datetime.fromtimestamp(token_data.exp, tz=timezone.utc) <= now:
            logger.log('warning', 'Token expired', {'exp': token_data.exp})
            raise ExpiredSignatureError("Token has expired")

        # Log token validation
        logger.log('info', 'Token decoded successfully', {
            'subject': token_data.sub,
            'type': payload.get('type')
        })

        return token_data

    except ExpiredSignatureError as e:
        logger.log('warning', 'Token expired', {'error': str(e)})
        metrics.track_performance('token_expired', 1)
        raise
    except JWTError as e:
        logger.log('error', 'Token validation failed', {'error': str(e)})
        metrics.track_performance('token_invalid', 1)
        raise
    except Exception as e:
        logger.log('error', f'Token decoding failed: {str(e)}')
        metrics.track_performance('token_error', 1)
        raise

def verify_token(
    token: str,
    required_scopes: Optional[List[str]] = None,
    device_id: Optional[str] = None
) -> bool:
    """
    Performs comprehensive token verification including scope and security checks.
    
    Args:
        token: JWT token string
        required_scopes: Required authorization scopes
        device_id: Optional device identifier for validation
        
    Returns:
        bool: Token validity status
    """
    try:
        # Decode and validate token
        token_data = decode_token(token)

        # Verify required scopes
        if required_scopes:
            token_scopes = set(token_data.scopes)
            if not all(scope in token_scopes for scope in required_scopes):
                logger.log('warning', 'Insufficient token scopes', {
                    'required': required_scopes,
                    'provided': list(token_scopes)
                })
                return False

        # Verify device ID if provided
        if device_id and token_data.device_id != device_id:
            logger.log('warning', 'Device ID mismatch', {
                'expected': device_id,
                'provided': token_data.device_id
            })
            return False

        # Log successful verification
        logger.log('info', 'Token verified successfully', {
            'subject': token_data.sub,
            'scopes': token_data.scopes
        })

        return True

    except Exception as e:
        logger.log('error', f'Token verification failed: {str(e)}')
        metrics.track_performance('verification_error', 1)
        return False