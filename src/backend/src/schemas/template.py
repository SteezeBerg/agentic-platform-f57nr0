"""
Pydantic schema definitions for agent templates with comprehensive validation.
Provides enterprise-grade schema validation for template-based agent development
with enhanced security controls and monitoring capabilities.
Version: 1.0.0
"""

from datetime import datetime
from typing import Dict, List, Optional, Any, Literal
from uuid import UUID
import re

from pydantic import BaseModel, Field, validator

from .agent import AGENT_TYPES

# Global constants for validation
TEMPLATE_CATEGORIES: Literal['streamlit', 'slack', 'aws_react', 'standalone', 'custom'] = Literal[
    'streamlit', 'slack', 'aws_react', 'standalone', 'custom'
]
NAME_PATTERN = r'^[a-zA-Z0-9_-]{3,64}$'
MAX_DESCRIPTION_LENGTH = 500

class TemplateBase(BaseModel):
    """Enhanced base Pydantic model for agent templates with comprehensive validation."""

    name: str = Field(
        ...,
        regex=NAME_PATTERN,
        description="Template name (3-64 chars, alphanumeric with _ and -)"
    )
    description: str = Field(
        ...,
        max_length=MAX_DESCRIPTION_LENGTH,
        description="Detailed template description"
    )
    category: TEMPLATE_CATEGORIES = Field(
        ...,
        description="Template deployment category"
    )
    default_config: Dict[str, Any] = Field(
        ...,
        description="Default configuration parameters"
    )
    supported_capabilities: List[str] = Field(
        default_factory=list,
        description="List of supported agent capabilities"
    )
    schema: Dict[str, Any] = Field(
        ...,
        description="JSON schema for template configuration"
    )
    is_active: bool = Field(
        default=True,
        description="Template activation status"
    )
    owner_id: UUID = Field(
        ...,
        description="Template owner's unique identifier"
    )
    security_config: Dict[str, Any] = Field(
        default_factory=lambda: {
            "access_level": "restricted",
            "encryption_required": True,
            "audit_logging": True,
            "allowed_roles": ["admin", "developer"],
            "data_classification": "internal"
        },
        description="Security configuration settings"
    )
    performance_metrics: Dict[str, float] = Field(
        default_factory=lambda: {
            "avg_creation_time": 0.0,
            "success_rate": 100.0,
            "error_rate": 0.0,
            "usage_count": 0
        },
        description="Template performance metrics"
    )
    usage_statistics: Dict[str, int] = Field(
        default_factory=lambda: {
            "total_deployments": 0,
            "active_instances": 0,
            "failed_deployments": 0
        },
        description="Template usage statistics"
    )

    @validator('schema')
    def validate_schema(cls, v: Dict) -> Dict:
        """Comprehensive schema validation with security checks."""
        required_fields = {'properties', 'required', 'type'}
        if not all(field in v for field in required_fields):
            raise ValueError(f"Schema must contain all required fields: {required_fields}")

        if v.get('type') != 'object':
            raise ValueError("Schema root type must be 'object'")

        # Validate properties structure
        properties = v.get('properties', {})
        if not isinstance(properties, dict):
            raise ValueError("Properties must be a dictionary")

        # Validate security-related fields
        security_fields = {'authentication', 'authorization', 'encryption'}
        if not any(field in properties for field in security_fields):
            raise ValueError("Schema must include security-related fields")

        return v

    @validator('security_config')
    def validate_security(cls, v: Dict) -> Dict:
        """Validates template security configuration."""
        required_settings = {
            'access_level', 'encryption_required', 'audit_logging',
            'allowed_roles', 'data_classification'
        }
        
        if missing := required_settings - v.keys():
            raise ValueError(f"Missing required security settings: {missing}")

        if not v['encryption_required']:
            raise ValueError("Encryption must be enabled for security compliance")

        valid_access_levels = {'public', 'internal', 'restricted', 'confidential'}
        if v['access_level'] not in valid_access_levels:
            raise ValueError(f"Invalid access level. Must be one of: {valid_access_levels}")

        if not isinstance(v['allowed_roles'], list):
            raise ValueError("Allowed roles must be a list")

        return v

class TemplateCreate(BaseModel):
    """Enhanced schema for template creation requests with security controls."""

    name: str = Field(..., regex=NAME_PATTERN)
    description: str = Field(..., max_length=MAX_DESCRIPTION_LENGTH)
    category: TEMPLATE_CATEGORIES
    default_config: Dict[str, Any]
    supported_capabilities: List[str]
    schema: Dict[str, Any]
    owner_id: UUID
    security_config: Dict[str, Any]

class TemplateUpdate(BaseModel):
    """Enhanced schema for template update requests with audit support."""

    name: Optional[str] = Field(None, regex=NAME_PATTERN)
    description: Optional[str] = Field(None, max_length=MAX_DESCRIPTION_LENGTH)
    category: Optional[TEMPLATE_CATEGORIES]
    default_config: Optional[Dict[str, Any]]
    supported_capabilities: Optional[List[str]]
    schema: Optional[Dict[str, Any]]
    is_active: Optional[bool]
    security_config: Optional[Dict[str, Any]]
    modified_by: UUID = Field(..., description="User ID performing the update")
    modification_reason: str = Field(..., description="Reason for update")

class TemplateResponse(BaseModel):
    """Enhanced schema for template response data with metrics."""

    id: UUID
    name: str
    description: str
    category: TEMPLATE_CATEGORIES
    default_config: Dict[str, Any]
    supported_capabilities: List[str]
    schema: Dict[str, Any]
    is_active: bool
    owner_id: UUID
    security_config: Dict[str, Any]
    performance_metrics: Dict[str, float]
    usage_statistics: Dict[str, int]
    created_at: datetime
    updated_at: datetime
    last_modified_by: UUID
    version: str

class TemplateList(BaseModel):
    """Enhanced schema for paginated template list response with filtering."""

    items: List[TemplateResponse]
    total: int
    page: int
    size: int
    filters: Dict[str, Any]
    sort_options: Dict[str, str]