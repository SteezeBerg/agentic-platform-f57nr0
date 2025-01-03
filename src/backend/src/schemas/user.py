"""
Enterprise-grade Pydantic schema definitions for secure user data validation and serialization.
Implements comprehensive schemas for user management with role-based access control,
audit logging, and PII protection.
Version: 1.0.0
"""

from datetime import datetime, timezone
from typing import Dict, List, Optional, Any
from uuid import UUID

from pydantic import BaseModel, Field, validator, root_validator, EmailStr

from db.models.user import ROLES
from utils.validation import ValidationError

# Global constants for validation
PASSWORD_MIN_LENGTH = 12
PASSWORD_HISTORY_SIZE = 24
EMAIL_DOMAIN_WHITELIST = ['hakkoda.io']
ROLE_HIERARCHY = {
    "Admin": 100,
    "Power User": 80,
    "Developer": 60,
    "Business User": 40,
    "Viewer": 20
}

class UserBase(BaseModel):
    """Base schema for secure user data validation with PII protection."""

    email: EmailStr = Field(..., description="User's email address")
    first_name: str = Field(..., min_length=2, max_length=50, description="User's first name")
    last_name: str = Field(..., min_length=2, max_length=50, description="User's last name")
    role: str = Field(..., description="User's role in the system")
    is_active: bool = Field(default=True, description="User account status")
    preferences: Dict[str, Any] = Field(
        default_factory=dict,
        description="User preferences and settings"
    )
    security_context: Dict[str, Any] = Field(
        default_factory=lambda: {
            "mfa_enabled": True,
            "last_password_change": None,
            "password_expires_at": None,
            "security_questions_configured": False
        },
        description="Security-related user context"
    )
    permissions: List[str] = Field(
        default_factory=list,
        description="User's explicit permissions"
    )

    @validator('email')
    def validate_email(cls, value: str) -> str:
        """Validates email format with enterprise domain rules."""
        domain = value.split('@')[1].lower()
        if domain not in EMAIL_DOMAIN_WHITELIST:
            raise ValidationError(
                message=f"Email domain not allowed: {domain}",
                field="email",
                code="INVALID_DOMAIN",
                severity="error",
                context={"allowed_domains": EMAIL_DOMAIN_WHITELIST}
            )
        return value.lower()

    @validator('role')
    def validate_role(cls, value: str) -> str:
        """Validates user role against enterprise hierarchy."""
        if value not in ROLES:
            raise ValidationError(
                message=f"Invalid role: {value}",
                field="role",
                code="INVALID_ROLE",
                severity="error",
                context={"allowed_roles": ROLES}
            )
        return value

class UserCreate(UserBase):
    """Schema for secure user creation with password policy enforcement."""

    password: str = Field(..., min_length=PASSWORD_MIN_LENGTH, description="User password")
    security_metadata: Dict[str, Any] = Field(
        default_factory=lambda: {
            "password_history": [],
            "security_questions": {},
            "last_security_audit": None
        },
        description="Security metadata for user account"
    )

    @validator('password')
    def validate_password(cls, value: str) -> str:
        """Validates password against enterprise security policy."""
        if len(value) < PASSWORD_MIN_LENGTH:
            raise ValidationError(
                message=f"Password must be at least {PASSWORD_MIN_LENGTH} characters",
                field="password",
                code="PASSWORD_TOO_SHORT",
                severity="error"
            )

        # Check password complexity
        has_upper = any(c.isupper() for c in value)
        has_lower = any(c.islower() for c in value)
        has_digit = any(c.isdigit() for c in value)
        has_special = any(not c.isalnum() for c in value)

        if not all([has_upper, has_lower, has_digit, has_special]):
            raise ValidationError(
                message="Password must contain uppercase, lowercase, numbers, and special characters",
                field="password",
                code="PASSWORD_COMPLEXITY",
                severity="error"
            )

        return value

class UserUpdate(BaseModel):
    """Schema for secure user updates with audit logging."""

    first_name: Optional[str] = Field(None, min_length=2, max_length=50)
    last_name: Optional[str] = Field(None, min_length=2, max_length=50)
    role: Optional[str] = None
    preferences: Optional[Dict[str, Any]] = None
    audit_context: Dict[str, Any] = Field(
        default_factory=lambda: {
            "modified_by": None,
            "modification_timestamp": datetime.now(timezone.utc),
            "previous_values": {},
            "change_reason": None
        },
        description="Audit context for user updates"
    )

class UserResponse(BaseModel):
    """Schema for secure user data serialization."""

    id: UUID = Field(..., description="User's unique identifier")
    email: str = Field(..., description="User's email address")
    first_name: str = Field(..., description="User's first name")
    last_name: str = Field(..., description="User's last name")
    role: str = Field(..., description="User's role")
    is_active: bool = Field(..., description="Account status")
    preferences: Dict[str, Any] = Field(..., description="User preferences")
    created_at: datetime = Field(..., description="Account creation timestamp")
    updated_at: datetime = Field(..., description="Last update timestamp")
    last_login: Optional[datetime] = Field(None, description="Last login timestamp")
    security_metadata: Dict[str, Any] = Field(
        ...,
        description="Security-related metadata",
        exclude={"password_history"}
    )
    permissions: List[str] = Field(..., description="User permissions")

    class Config:
        """Pydantic model configuration."""
        json_encoders = {
            datetime: lambda v: v.isoformat(),
            UUID: lambda v: str(v)
        }