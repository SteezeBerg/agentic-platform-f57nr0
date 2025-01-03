"""
Core module for validating agent configurations against predefined schemas and templates.
Provides comprehensive validation with security compliance and performance monitoring.
Version: 1.0.0
"""

import logging
from typing import Dict, List, Optional, Any, Union, Tuple
import jsonschema  # ^4.0.0
from security_validator import SecurityValidator  # ^1.0.0

from schemas.agent import AgentBase
from schemas.template import TemplateBase
from utils.logging import StructuredLogger
from utils.metrics import MetricsManager

# Global constants
SUPPORTED_DEPLOYMENT_TYPES = ["streamlit", "slack", "aws_react", "standalone"]
DEFAULT_SCHEMA_VERSION = "1.0"
VALIDATION_TIMEOUT_SECONDS = 30
MAX_SCHEMA_CACHE_SIZE = 100

class ConfigValidator:
    """Enhanced core class for validating agent configurations with security, performance, and compatibility checks."""

    def __init__(self):
        """Initialize config validator with schema cache and monitoring."""
        self._schema_cache: Dict[str, Any] = {}
        self._logger = StructuredLogger("config_validator", {
            "component": "agent_builder",
            "version": DEFAULT_SCHEMA_VERSION
        })
        self._metrics = MetricsManager(
            namespace="AgentBuilderHub/ConfigValidation",
            dimensions={"version": DEFAULT_SCHEMA_VERSION}
        )
        self._security_validator = SecurityValidator()

    def validate_agent_config(
        self, 
        config: Dict[str, Any], 
        agent_type: str
    ) -> Tuple[bool, Optional[str], Dict[str, Any]]:
        """
        Validates agent configuration with security and performance monitoring.
        
        Args:
            config: Agent configuration dictionary
            agent_type: Type of agent being validated
            
        Returns:
            Tuple containing (is_valid, error_message, validation_metrics)
        """
        try:
            # Track validation metrics
            validation_start = self._metrics.start_operation("config_validation")

            # Validate agent type
            if agent_type not in SUPPORTED_DEPLOYMENT_TYPES:
                return False, f"Unsupported agent type: {agent_type}", {}

            # Get schema for agent type
            agent_schema = AgentBase.schema()

            # Validate basic structure
            if not isinstance(config, dict):
                return False, "Configuration must be a dictionary", {}

            # Validate required fields
            required_fields = {
                "name", "description", "type", "config", 
                "security_config", "monitoring_config"
            }
            missing_fields = required_fields - set(config.keys())
            if missing_fields:
                return False, f"Missing required fields: {missing_fields}", {}

            # Validate against JSON schema
            try:
                jsonschema.validate(instance=config, schema=agent_schema)
            except jsonschema.exceptions.ValidationError as e:
                return False, f"Schema validation failed: {str(e)}", {}

            # Perform security validation
            security_result = self._validate_security_config(config, agent_type)
            if not security_result[0]:
                return security_result

            # Validate type-specific requirements
            type_validation = self._validate_type_specific(config, agent_type)
            if not type_validation[0]:
                return type_validation

            # Calculate validation metrics
            metrics = self._metrics.end_operation(
                validation_start,
                {
                    "agent_type": agent_type,
                    "validation_success": True
                }
            )

            return True, None, metrics

        except Exception as e:
            self._logger.log("error", f"Configuration validation failed: {str(e)}")
            self._metrics.track_error("validation_error", str(e))
            return False, f"Validation error: {str(e)}", {}

    def validate_template_config(
        self, 
        config: Dict[str, Any], 
        template_schema: Dict[str, Any]
    ) -> Tuple[bool, Optional[str], Dict[str, Any]]:
        """
        Validates configuration against template schema with compatibility checks.
        
        Args:
            config: Configuration to validate
            template_schema: Template schema to validate against
            
        Returns:
            Tuple containing (is_valid, error_message, validation_metrics)
        """
        try:
            validation_start = self._metrics.start_operation("template_validation")

            # Validate template schema structure
            template_validation = TemplateBase.validate_schema(template_schema)
            if not template_validation:
                return False, "Invalid template schema", {}

            # Validate configuration against template schema
            try:
                jsonschema.validate(instance=config, schema=template_schema)
            except jsonschema.exceptions.ValidationError as e:
                return False, f"Template validation failed: {str(e)}", {}

            # Validate security requirements
            security_result = self._validate_template_security(config, template_schema)
            if not security_result[0]:
                return security_result

            # Validate required capabilities
            capabilities_result = self._validate_capabilities(
                config.get("capabilities", []),
                template_schema.get("supported_capabilities", [])
            )
            if not capabilities_result[0]:
                return capabilities_result

            # Calculate validation metrics
            metrics = self._metrics.end_operation(
                validation_start,
                {
                    "template_validation_success": True
                }
            )

            return True, None, metrics

        except Exception as e:
            self._logger.log("error", f"Template validation failed: {str(e)}")
            self._metrics.track_error("template_validation_error", str(e))
            return False, f"Template validation error: {str(e)}", {}

    def validate_deployment_config(
        self, 
        config: Dict[str, Any], 
        deployment_type: str
    ) -> Tuple[bool, Optional[str], Dict[str, Any]]:
        """
        Validates deployment configuration with environment-specific security checks.
        
        Args:
            config: Deployment configuration
            deployment_type: Type of deployment
            
        Returns:
            Tuple containing (is_valid, error_message, validation_metrics)
        """
        try:
            validation_start = self._metrics.start_operation("deployment_validation")

            # Validate deployment type
            if deployment_type not in SUPPORTED_DEPLOYMENT_TYPES:
                return False, f"Unsupported deployment type: {deployment_type}", {}

            # Validate deployment settings
            if not self._validate_deployment_settings(config, deployment_type):
                return False, "Invalid deployment settings", {}

            # Perform environment-specific security checks
            security_result = self._validate_deployment_security(config, deployment_type)
            if not security_result[0]:
                return security_result

            # Validate resource requirements
            resource_result = self._validate_resource_requirements(config, deployment_type)
            if not resource_result[0]:
                return resource_result

            # Calculate validation metrics
            metrics = self._metrics.end_operation(
                validation_start,
                {
                    "deployment_type": deployment_type,
                    "validation_success": True
                }
            )

            return True, None, metrics

        except Exception as e:
            self._logger.log("error", f"Deployment validation failed: {str(e)}")
            self._metrics.track_error("deployment_validation_error", str(e))
            return False, f"Deployment validation error: {str(e)}", {}

    def _validate_security_config(
        self, 
        config: Dict[str, Any], 
        agent_type: str
    ) -> Tuple[bool, Optional[str], Dict[str, Any]]:
        """Validates security configuration for agent type."""
        security_config = config.get("security_config", {})
        
        # Validate required security settings
        required_settings = {
            "encryption_enabled", "audit_logging", 
            "access_control", "security_level"
        }
        if missing := required_settings - set(security_config.keys()):
            return False, f"Missing security settings: {missing}", {}

        # Validate encryption is enabled
        if not security_config.get("encryption_enabled", False):
            return False, "Encryption must be enabled", {}

        return True, None, {}

    def _validate_type_specific(
        self, 
        config: Dict[str, Any], 
        agent_type: str
    ) -> Tuple[bool, Optional[str], Dict[str, Any]]:
        """Validates type-specific configuration requirements."""
        type_config = config.get("config", {})
        
        type_requirements = {
            "streamlit": {"page_title", "layout", "theme"},
            "slack": {"bot_token", "signing_secret", "app_token"},
            "aws_react": {"aws_region", "cognito_pool_id", "api_endpoint"},
            "standalone": {"runtime", "environment", "dependencies"}
        }

        required = type_requirements.get(agent_type, set())
        if missing := required - set(type_config.keys()):
            return False, f"Missing {agent_type} configuration: {missing}", {}

        return True, None, {}

    def _validate_template_security(
        self, 
        config: Dict[str, Any], 
        template_schema: Dict[str, Any]
    ) -> Tuple[bool, Optional[str], Dict[str, Any]]:
        """Validates security requirements against template schema."""
        security_requirements = template_schema.get("security_requirements", {})
        
        if not self._security_validator.validate_requirements(
            config, 
            security_requirements
        ):
            return False, "Security requirements not met", {}

        return True, None, {}

    def _validate_capabilities(
        self, 
        config_capabilities: List[str], 
        required_capabilities: List[str]
    ) -> Tuple[bool, Optional[str], Dict[str, Any]]:
        """Validates that configuration supports required capabilities."""
        if not all(cap in config_capabilities for cap in required_capabilities):
            missing = set(required_capabilities) - set(config_capabilities)
            return False, f"Missing required capabilities: {missing}", {}

        return True, None, {}

    def _validate_deployment_settings(
        self, 
        config: Dict[str, Any], 
        deployment_type: str
    ) -> bool:
        """Validates deployment-specific settings."""
        required_settings = {
            "streamlit": {"port", "host", "ssl_config"},
            "slack": {"workspace_id", "channel_ids"},
            "aws_react": {"vpc_config", "subnet_ids", "security_groups"},
            "standalone": {"runtime_config", "scaling_config"}
        }

        return all(
            setting in config 
            for setting in required_settings.get(deployment_type, set())
        )

    def _validate_deployment_security(
        self, 
        config: Dict[str, Any], 
        deployment_type: str
    ) -> Tuple[bool, Optional[str], Dict[str, Any]]:
        """Validates deployment security configuration."""
        security_config = config.get("security_config", {})
        
        # Validate environment-specific security
        if not self._security_validator.validate_deployment_security(
            security_config,
            deployment_type
        ):
            return False, "Deployment security requirements not met", {}

        return True, None, {}

    def _validate_resource_requirements(
        self, 
        config: Dict[str, Any], 
        deployment_type: str
    ) -> Tuple[bool, Optional[str], Dict[str, Any]]:
        """Validates deployment resource requirements."""
        resources = config.get("resource_requirements", {})
        
        # Validate minimum resource requirements
        min_requirements = {
            "streamlit": {"cpu": 0.5, "memory": 1024},
            "slack": {"cpu": 0.25, "memory": 512},
            "aws_react": {"cpu": 1.0, "memory": 2048},
            "standalone": {"cpu": 0.5, "memory": 1024}
        }

        type_mins = min_requirements.get(deployment_type, {})
        for resource, minimum in type_mins.items():
            if resources.get(resource, 0) < minimum:
                return False, f"Insufficient {resource} allocation", {}

        return True, None, {}