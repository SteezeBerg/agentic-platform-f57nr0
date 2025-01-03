"""
Pydantic schema definitions for authentication and authorization in Agent Builder Hub.
Implements secure JWT-based authentication with AWS Cognito integration and role-based access control.
Version: 1.0.0
"""

from datetime import datetime, timedelta, timezone
from typing import Dict, List, Optional
from uuid import UUID
import re

from pydantic import BaseModel, Field, validator, root_validator

from db.models.user import ROLES
from utils.validation import ValidationError

# Global constants
TOKEN_TYPE_BEARER = "bearer"
PASSWORD_MIN_LENGTH = 12
TOKEN_EXPIRY_BUFFER = 300  # 5 minutes buffer for token expiration

class TokenPayload(BaseModel):
    """Enhanced schema for JWT token payload validation with comprehensive security checks."""
    
    sub: str = Field(..., description="Subject identifier (user ID)")
    exp: int = Field(..., description="Token expiration timestamp")
    scopes: List[str] = Field(..., description="Authorization scopes/roles")
    token_type: str = Field(TOKEN_TYPE_BEARER, description="Token type")
    device_id: Optional[str] = Field(None, description="Device identifier for multi-device support")
    metadata: Optional[Dict] = Field(
        default_factory=dict,
        description="Additional token metadata"
    )

    @validator('exp')
    def validate_expiration(cls, exp: int) -> int:
        """Validates token expiration with timezone awareness and buffer time."""
        exp_datetime = datetime.fromtimestamp(exp, tz=timezone.utc)
        current_time = datetime.now(timezone.utc)
        
        # Add buffer time for clock skew
        buffer_time = timedelta(seconds=TOKEN_EXPIRY_BUFFER)
        
        if exp_datetime + buffer_time <= current_time:
            raise ValidationError(
                "Token has expired",
                "exp",
                "TOKEN_EXPIRED",
                "error",
                {"expiration": exp_datetime.isoformat()}
            )
        return exp

    @validator('scopes')
    def validate_scopes(cls, scopes: List[str]) -> List[str]:
        """Validates token scopes against allowed roles with deduplication."""
        if not scopes:
            raise ValidationError(
                "Token must have at least one scope",
                "scopes",
                "MISSING_SCOPES",
                "error"
            )

        # Validate each scope against allowed roles
        invalid_scopes = [scope for scope in scopes if scope not in ROLES]
        if invalid_scopes:
            raise ValidationError(
                f"Invalid scopes detected: {invalid_scopes}",
                "scopes",
                "INVALID_SCOPES",
                "error"
            )

        # Remove duplicates and sort for consistency
        return sorted(set(scopes))

class LoginRequest(BaseModel):
    """Enhanced schema for user login request validation with security features."""
    
    email: str = Field(..., description="User email address")
    password: str = Field(..., description="User password")
    device_id: Optional[str] = Field(None, description="Device identifier")
    remember_me: Optional[bool] = Field(False, description="Extended session flag")
    metadata: Optional[Dict] = Field(
        default_factory=dict,
        description="Additional login metadata"
    )

    @validator('email')
    def validate_email(cls, email: str) -> str:
        """Validates email format with comprehensive checks."""
        if not email:
            raise ValidationError(
                "Email is required",
                "email",
                "MISSING_EMAIL",
                "error"
            )

        # Enhanced email validation pattern
        email_pattern = r'^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$'
        if not re.match(email_pattern, email):
            raise ValidationError(
                "Invalid email format",
                "email",
                "INVALID_EMAIL",
                "error"
            )

        return email.lower().strip()

    @validator('password')
    def validate_password(cls, password: str) -> str:
        """Validates password complexity requirements."""
        if not password:
            raise ValidationError(
                "Password is required",
                "password",
                "MISSING_PASSWORD",
                "error"
            )

        if len(password) < PASSWORD_MIN_LENGTH:
            raise ValidationError(
                f"Password must be at least {PASSWORD_MIN_LENGTH} characters",
                "password",
                "PASSWORD_TOO_SHORT",
                "error"
            )

        # Check password complexity
        if not all([
            re.search(r'[A-Z]', password),  # uppercase
            re.search(r'[a-z]', password),  # lowercase
            re.search(r'[0-9]', password),  # digit
            re.search(r'[^A-Za-z0-9]', password)  # special character
        ]):
            raise ValidationError(
                "Password must contain uppercase, lowercase, digit, and special character",
                "password",
                "PASSWORD_COMPLEXITY",
                "error"
            )

        return password

class TokenResponse(BaseModel):
    """Enhanced schema for authentication token response with metadata."""
    
    access_token: str = Field(..., description="JWT access token")
    refresh_token: str = Field(..., description="JWT refresh token")
    token_type: str = Field(TOKEN_TYPE_BEARER, description="Token type")
    expires_in: int = Field(..., description="Token expiration in seconds")
    metadata: Dict = Field(
        default_factory=dict,
        description="Additional token metadata"
    )
    scopes: List[str] = Field(
        default_factory=list,
        description="Granted authorization scopes"
    )

    @root_validator
    def validate_tokens(cls, values: Dict) -> Dict:
        """Validates token format and relationship."""
        access_token = values.get('access_token')
        refresh_token = values.get('refresh_token')

        if not access_token or not refresh_token:
            raise ValidationError(
                "Both access and refresh tokens are required",
                "tokens",
                "MISSING_TOKENS",
                "error"
            )

        # Validate token format (simplified check)
        token_pattern = r'^[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+$'
        if not all([
            re.match(token_pattern, access_token),
            re.match(token_pattern, refresh_token)
        ]):
            raise ValidationError(
                "Invalid token format",
                "tokens",
                "INVALID_TOKEN_FORMAT",
                "error"
            )

        return values