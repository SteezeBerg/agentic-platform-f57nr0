"""
Comprehensive validation utility module for Agent Builder Hub.
Provides enterprise-grade validation functions and decorators for data validation,
schema validation, input sanitization, and security controls.

Version: 1.0.0
"""

import re
import html
from typing import Dict, List, Optional, Any, Union
from uuid import UUID
from functools import wraps
from datetime import datetime

from pydantic import ValidationError, validator
from pydantic.error_wrappers import ErrorWrapper

from schemas.agent import AgentBase
from schemas.deployment import DeploymentBase
from schemas.knowledge import KnowledgeSourceBase

# Global constants for validation
ALLOWED_ENVIRONMENTS = {'development', 'staging', 'production'}
MAX_STRING_LENGTH = 1000
MIN_STRING_LENGTH = 3
DANGEROUS_PATTERNS = [
    r'<script.*?>.*?</script>',  # XSS prevention
    r'(?i)(?:union|select|insert|update|delete|drop)\s+',  # SQL injection prevention
    r'[;\'"\\]',  # Command injection prevention
]

class ValidationError(Exception):
    """Enhanced validation error class with detailed error tracking."""

    def __init__(
        self,
        message: str,
        field: str,
        code: str,
        severity: str = "error",
        context: Optional[Dict[str, Any]] = None
    ):
        """Initialize validation error with enhanced details."""
        self.message = message
        self.field = field
        self.code = code
        self.severity = severity
        self.context = context or {}
        self.timestamp = datetime.utcnow()
        super().__init__(self.message)

def validate_agent_config(config: Dict[str, Any]) -> bool:
    """
    Validates agent configuration with enhanced security checks and monitoring validation.
    
    Args:
        config: Agent configuration dictionary
        
    Returns:
        bool: True if configuration is valid and secure
        
    Raises:
        ValidationError: If configuration is invalid or insecure
    """
    try:
        # Validate basic structure
        if not isinstance(config, dict):
            raise ValidationError(
                "Configuration must be a dictionary",
                "config",
                "INVALID_TYPE",
                "error"
            )

        # Validate required fields
        required_fields = {'name', 'type', 'capabilities', 'security_config', 'monitoring_config'}
        missing_fields = required_fields - set(config.keys())
        if missing_fields:
            raise ValidationError(
                f"Missing required fields: {missing_fields}",
                "config",
                "MISSING_FIELDS",
                "error"
            )

        # Validate security configuration
        security_config = config.get('security_config', {})
        if not security_config.get('encryption_enabled', False):
            raise ValidationError(
                "Encryption must be enabled for security compliance",
                "security_config",
                "SECURITY_VIOLATION",
                "critical"
            )

        # Validate monitoring configuration
        monitoring_config = config.get('monitoring_config', {})
        if not monitoring_config.get('metrics_enabled', False):
            raise ValidationError(
                "Metrics collection must be enabled",
                "monitoring_config",
                "MONITORING_DISABLED",
                "warning"
            )

        # Validate performance settings
        performance_config = config.get('performance_metrics', {})
        if performance_config.get('error_rate', 0) > 5:
            raise ValidationError(
                "Error rate exceeds acceptable threshold",
                "performance_metrics",
                "PERFORMANCE_VIOLATION",
                "warning"
            )

        return True

    except Exception as e:
        raise ValidationError(
            str(e),
            "config",
            "VALIDATION_ERROR",
            "error",
            {"original_error": str(e)}
        )

def validate_deployment_environment(environment: str, config: Dict[str, Any]) -> bool:
    """
    Validates deployment environment with enhanced resource and security validation.
    
    Args:
        environment: Target deployment environment
        config: Deployment configuration
        
    Returns:
        bool: True if environment and config are valid and secure
        
    Raises:
        ValidationError: If environment or configuration is invalid
    """
    try:
        # Validate environment value
        if environment not in ALLOWED_ENVIRONMENTS:
            raise ValidationError(
                f"Invalid environment. Must be one of: {ALLOWED_ENVIRONMENTS}",
                "environment",
                "INVALID_ENVIRONMENT",
                "error"
            )

        # Validate environment-specific security policies
        security_config = config.get('security_config', {})
        if environment == 'production':
            required_security = {
                'encryption_enabled': True,
                'audit_logging': True,
                'access_control': 'role_based'
            }
            for key, value in required_security.items():
                if security_config.get(key) != value:
                    raise ValidationError(
                        f"Production environment requires {key}={value}",
                        "security_config",
                        "SECURITY_POLICY_VIOLATION",
                        "critical"
                    )

        # Validate resource limits
        resource_limits = config.get('resource_limits', {})
        env_limits = {
            'development': {'cpu': 1, 'memory': 2048},
            'staging': {'cpu': 2, 'memory': 4096},
            'production': {'cpu': 4, 'memory': 8192}
        }
        
        for resource, limit in env_limits[environment].items():
            if resource_limits.get(resource, 0) > limit:
                raise ValidationError(
                    f"Resource {resource} exceeds {environment} limit of {limit}",
                    "resource_limits",
                    "RESOURCE_LIMIT_EXCEEDED",
                    "error"
                )

        return True

    except Exception as e:
        raise ValidationError(
            str(e),
            "deployment",
            "VALIDATION_ERROR",
            "error",
            {"original_error": str(e)}
        )

def sanitize_input(input_string: str) -> str:
    """
    Enhanced input sanitization with comprehensive security checks.
    
    Args:
        input_string: Input string to sanitize
        
    Returns:
        str: Sanitized and secure input string
        
    Raises:
        ValidationError: If input contains dangerous patterns
    """
    try:
        if not isinstance(input_string, str):
            raise ValidationError(
                "Input must be a string",
                "input",
                "INVALID_TYPE",
                "error"
            )

        # Check input length
        if len(input_string) > MAX_STRING_LENGTH:
            raise ValidationError(
                f"Input exceeds maximum length of {MAX_STRING_LENGTH}",
                "input",
                "LENGTH_EXCEEDED",
                "error"
            )

        # Check for dangerous patterns
        for pattern in DANGEROUS_PATTERNS:
            if re.search(pattern, input_string):
                raise ValidationError(
                    "Input contains potentially dangerous patterns",
                    "input",
                    "SECURITY_VIOLATION",
                    "critical"
                )

        # Sanitize HTML characters
        sanitized = html.escape(input_string)

        # Remove control characters
        sanitized = "".join(char for char in sanitized if ord(char) >= 32)

        # Normalize whitespace
        sanitized = " ".join(sanitized.split())

        return sanitized

    except Exception as e:
        raise ValidationError(
            str(e),
            "input",
            "SANITIZATION_ERROR",
            "error",
            {"original_error": str(e)}
        )

def validate_schema(schema_type: str):
    """
    Decorator for schema validation with enhanced error handling.
    
    Args:
        schema_type: Type of schema to validate ('agent', 'deployment', 'knowledge')
    """
    def decorator(func):
        @wraps(func)
        def wrapper(*args, **kwargs):
            try:
                # Get schema class based on type
                schema_map = {
                    'agent': AgentBase,
                    'deployment': DeploymentBase,
                    'knowledge': KnowledgeSourceBase
                }
                
                schema_class = schema_map.get(schema_type)
                if not schema_class:
                    raise ValidationError(
                        f"Invalid schema type: {schema_type}",
                        "schema",
                        "INVALID_SCHEMA_TYPE",
                        "error"
                    )

                # Validate first argument as data
                if not args:
                    raise ValidationError(
                        "No data provided for validation",
                        "data",
                        "MISSING_DATA",
                        "error"
                    )

                data = args[0]
                validated_data = schema_class(**data)
                
                # Replace original data with validated data
                args = (validated_data.dict(),) + args[1:]
                
                return func(*args, **kwargs)

            except Exception as e:
                raise ValidationError(
                    str(e),
                    "schema_validation",
                    "VALIDATION_ERROR",
                    "error",
                    {"original_error": str(e)}
                )
                
        return wrapper
    return decorator

__all__ = [
    'ValidationError',
    'validate_agent_config',
    'validate_deployment_environment',
    'sanitize_input',
    'validate_schema'
]