"""
Centralized schema module for Agent Builder Hub providing enhanced data validation with security controls.
Exports all Pydantic schema models with comprehensive validation rules for authentication, agents,
deployments, and knowledge base components.

Version: 1.0.0
"""

from typing import Dict, Callable, Any
from pydantic import BaseModel, Field, validator
from pydantic.errors import SecurityError

# Import authentication schemas
from .auth import (
    TokenPayload, LoginRequest, TokenResponse, RefreshTokenRequest,
    UserPermissions
)

# Import agent schemas
from .agent import (
    AgentBase, AgentCreate, AgentUpdate, AgentResponse
)

# Import deployment schemas
from .deployment import (
    DeploymentBase, DeploymentCreate, DeploymentStatus,
    DeploymentResponse
)

# Import knowledge schemas
from .knowledge import (
    KnowledgeSourceBase, KnowledgeSourceCreate, KnowledgeSourceResponse,
    KnowledgeQueryRequest, KnowledgeQueryResponse
)

# Import metrics schemas
from .metrics import (
    MetricBase, AgentMetricsSchema, SystemMetricsSchema,
    MetricResponse
)

# Version tracking
VERSION = '1.0.0'

# Global schema validators registry
SCHEMA_VALIDATORS: Dict[str, Callable] = {}

def validate_schema_security(schema_type: str, data: Dict[str, Any]) -> bool:
    """
    Global schema security validation function with enhanced checks.
    
    Args:
        schema_type: Type of schema being validated
        data: Data to validate
        
    Returns:
        bool: Validation result
        
    Raises:
        SecurityError: If validation fails security checks
    """
    try:
        # Get schema-specific validator
        validator = SCHEMA_VALIDATORS.get(schema_type)
        if not validator:
            raise SecurityError(f"No validator found for schema type: {schema_type}")
            
        # Apply validation
        return validator(data)
        
    except Exception as e:
        raise SecurityError(f"Schema validation failed: {str(e)}")

# Register schema validators
SCHEMA_VALIDATORS.update({
    'agent': AgentBase.validate_config,
    'deployment': DeploymentBase.validate_security,
    'knowledge': KnowledgeSourceBase.validate_connection_config,
    'token': TokenPayload.validate_token
})

__all__ = [
    # Version
    'VERSION',
    
    # Auth schemas
    'TokenPayload',
    'LoginRequest', 
    'TokenResponse',
    'RefreshTokenRequest',
    'UserPermissions',
    
    # Agent schemas
    'AgentBase',
    'AgentCreate',
    'AgentUpdate',
    'AgentResponse',
    
    # Deployment schemas
    'DeploymentBase',
    'DeploymentCreate',
    'DeploymentStatus',
    'DeploymentResponse',
    
    # Knowledge schemas
    'KnowledgeSourceBase',
    'KnowledgeSourceCreate', 
    'KnowledgeSourceResponse',
    'KnowledgeQueryRequest',
    'KnowledgeQueryResponse',
    
    # Metrics schemas
    'MetricBase',
    'AgentMetricsSchema',
    'SystemMetricsSchema',
    'MetricResponse',
    
    # Validation utilities
    'validate_schema_security'
]