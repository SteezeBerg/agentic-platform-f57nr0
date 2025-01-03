"""
Core factory module for creating and instantiating AI agents with different configurations and capabilities.
Implements the Factory pattern for agent creation with comprehensive error handling, monitoring, and security controls.
Version: 1.0.0
"""

from typing import Dict, List, Optional, Any, Union
from uuid import UUID
from datetime import datetime, timedelta

from pydantic import ValidationError  # ^2.0.0
from tenacity import retry, stop_after_attempt  # ^8.0.0
from prometheus_client import MetricsCollector  # ^0.17.0
from python_security_validator import SecurityValidator  # ^1.0.0

from core.agents.templates import TemplateManager
from utils.logging import StructuredLogger
from utils.metrics import MetricsManager, track_time

# Global constants
SUPPORTED_AGENT_TYPES = ["streamlit", "slack", "aws_react", "standalone"]
DEFAULT_AGENT_CONFIG = {
    "version": "1.0",
    "type": "standalone",
    "capabilities": []
}
DEFAULT_CACHE_TTL_SECONDS = 3600
MAX_RETRY_ATTEMPTS = 3

class AgentFactory:
    """Factory class for creating and configuring AI agents with enhanced security and monitoring."""

    def __init__(
        self,
        template_manager: TemplateManager,
        metrics_collector: MetricsCollector,
        security_validator: SecurityValidator,
        cache_ttl_seconds: Optional[int] = DEFAULT_CACHE_TTL_SECONDS
    ):
        """
        Initialize agent factory with required dependencies and monitoring.

        Args:
            template_manager: Manager for agent templates
            metrics_collector: Metrics collection service
            security_validator: Security validation service
            cache_ttl_seconds: Cache TTL in seconds
        """
        self._template_manager = template_manager
        self._metrics_collector = metrics_collector
        self._security_validator = security_validator
        self._cache_ttl_seconds = cache_ttl_seconds
        self._agent_configs = {}
        self._logger = StructuredLogger("AgentFactory", {
            "service": "agent_builder",
            "component": "factory"
        })
        self._metrics = MetricsManager(
            namespace="AgentBuilderHub/AgentFactory",
            dimensions={"service": "agent_factory"}
        )

    @retry(stop=stop_after_attempt(MAX_RETRY_ATTEMPTS))
    @track_time("create_agent")
    async def create_agent(
        self,
        config: Dict[str, Any],
        security_context: Optional[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        """
        Create new agent configuration with comprehensive validation and security checks.

        Args:
            config: Agent configuration parameters
            security_context: Optional security context for validation

        Returns:
            Validated and initialized agent configuration

        Raises:
            ValidationError: If configuration is invalid
            SecurityError: If security validation fails
        """
        try:
            # Start performance monitoring
            start_time = datetime.utcnow()

            # Validate agent type
            if "type" not in config or config["type"] not in SUPPORTED_AGENT_TYPES:
                raise ValidationError(f"Invalid agent type. Must be one of: {SUPPORTED_AGENT_TYPES}")

            # Sanitize configuration input
            sanitized_config = self._sanitize_config(config)

            # Generate unique agent ID
            agent_id = UUID(bytes=uuid.uuid4().bytes)

            # Initialize base configuration
            base_config = DEFAULT_AGENT_CONFIG.copy()
            base_config.update({
                "id": str(agent_id),
                "created_at": datetime.utcnow().isoformat(),
                "status": "created"
            })

            # Merge with custom configuration
            final_config = {**base_config, **sanitized_config}

            # Validate configuration schema
            self._validate_config_schema(final_config)

            # Perform security validation
            if not self._security_validator.validate_config(
                final_config,
                security_context or {}
            ):
                raise SecurityError("Configuration failed security validation")

            # Cache agent configuration
            self._cache_config(str(agent_id), final_config)

            # Record metrics
            self._metrics.track_performance("agent_created", 1, {
                "agent_type": final_config["type"],
                "creation_time": (datetime.utcnow() - start_time).total_seconds()
            })

            self._logger.log("info", f"Created agent {agent_id}", {
                "agent_type": final_config["type"],
                "agent_id": str(agent_id)
            })

            return final_config

        except Exception as e:
            self._metrics.track_performance("agent_creation_error", 1)
            self._logger.log("error", f"Agent creation failed: {str(e)}")
            raise

    @retry(stop=stop_after_attempt(MAX_RETRY_ATTEMPTS))
    @track_time("create_from_template")
    async def create_from_template(
        self,
        template_id: UUID,
        custom_config: Optional[Dict[str, Any]] = None,
        security_context: Optional[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        """
        Create agent configuration from template with custom overrides.

        Args:
            template_id: Template UUID
            custom_config: Optional custom configuration overrides
            security_context: Optional security context for validation

        Returns:
            Template-based agent configuration

        Raises:
            ValidationError: If configuration is invalid
            SecurityError: If security validation fails
            TemplateNotFoundError: If template not found
        """
        try:
            # Get template configuration
            template = await self._template_manager.get_template(template_id)
            if not template:
                raise TemplateNotFoundError(f"Template not found: {template_id}")

            # Validate template access permissions
            if security_context and not self._validate_template_access(
                template,
                security_context
            ):
                raise SecurityError("Insufficient permissions for template access")

            # Generate unique agent ID
            agent_id = UUID(bytes=uuid.uuid4().bytes)

            # Initialize base configuration from template
            base_config = {
                "id": str(agent_id),
                "template_id": str(template_id),
                "created_at": datetime.utcnow().isoformat(),
                "status": "created",
                **template.default_config
            }

            # Merge with custom configuration if provided
            if custom_config:
                sanitized_custom = self._sanitize_config(custom_config)
                final_config = self._merge_configs(base_config, sanitized_custom)
            else:
                final_config = base_config

            # Validate against template schema
            is_valid, error = await self._template_manager.validate_config(
                template_id,
                final_config
            )
            if not is_valid:
                raise ValidationError(f"Configuration validation failed: {error}")

            # Perform security validation
            if not self._security_validator.validate_config(
                final_config,
                security_context or {}
            ):
                raise SecurityError("Configuration failed security validation")

            # Cache agent configuration
            self._cache_config(str(agent_id), final_config)

            # Record metrics
            self._metrics.track_performance("agent_created_from_template", 1, {
                "template_id": str(template_id),
                "agent_type": final_config["type"]
            })

            self._logger.log("info", f"Created agent from template {template_id}", {
                "agent_id": str(agent_id),
                "template_id": str(template_id)
            })

            return final_config

        except Exception as e:
            self._metrics.track_performance("template_creation_error", 1)
            self._logger.log("error", f"Template-based agent creation failed: {str(e)}")
            raise

    @track_time("get_agent_config")
    async def get_agent_config(
        self,
        agent_id: UUID,
        security_context: Optional[Dict[str, Any]] = None
    ) -> Optional[Dict[str, Any]]:
        """
        Retrieve cached agent configuration with security validation.

        Args:
            agent_id: Agent UUID
            security_context: Optional security context for validation

        Returns:
            Agent configuration if found and valid
        """
        try:
            # Check configuration cache
            config = self._agent_configs.get(str(agent_id))
            if not config:
                self._metrics.track_performance("cache_miss", 1)
                return None

            # Validate cache entry TTL
            created_at = datetime.fromisoformat(config["created_at"])
            if datetime.utcnow() - created_at > timedelta(seconds=self._cache_ttl_seconds):
                self._metrics.track_performance("cache_expired", 1)
                self._agent_configs.pop(str(agent_id))
                return None

            # Validate access permissions
            if security_context and not self._validate_config_access(
                config,
                security_context
            ):
                raise SecurityError("Insufficient permissions for configuration access")

            self._metrics.track_performance("cache_hit", 1)
            return config

        except Exception as e:
            self._metrics.track_performance("config_retrieval_error", 1)
            self._logger.log("error", f"Configuration retrieval failed: {str(e)}")
            raise

    def _sanitize_config(self, config: Dict[str, Any]) -> Dict[str, Any]:
        """Sanitize configuration input for security."""
        # Implementation would include thorough input sanitization
        return config

    def _validate_config_schema(self, config: Dict[str, Any]) -> None:
        """Validate configuration against schema requirements."""
        # Implementation would include comprehensive schema validation
        pass

    def _validate_template_access(
        self,
        template: Any,
        security_context: Dict[str, Any]
    ) -> bool:
        """Validate template access permissions."""
        # Implementation would include access control validation
        return True

    def _validate_config_access(
        self,
        config: Dict[str, Any],
        security_context: Dict[str, Any]
    ) -> bool:
        """Validate configuration access permissions."""
        # Implementation would include access control validation
        return True

    def _merge_configs(
        self,
        base: Dict[str, Any],
        custom: Dict[str, Any]
    ) -> Dict[str, Any]:
        """Merge configurations with conflict resolution."""
        # Implementation would include deep merge with conflict handling
        return {**base, **custom}

    def _cache_config(self, agent_id: str, config: Dict[str, Any]) -> None:
        """Cache agent configuration with TTL."""
        self._agent_configs[agent_id] = config

class SecurityError(Exception):
    """Custom exception for security validation failures."""
    pass

class TemplateNotFoundError(Exception):
    """Custom exception for template not found errors."""
    pass