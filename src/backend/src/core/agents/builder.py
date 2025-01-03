"""
Core module for building and configuring AI agents with enterprise-grade security, monitoring, and validation.
Implements the builder pattern with comprehensive error handling, metrics collection, and security controls.
Version: 1.0.0
"""

from typing import Dict, List, Optional, Any, Union
from uuid import UUID
from datetime import datetime

from pydantic import ValidationError  # ^2.0.0
from circuitbreaker import circuit  # ^1.4.0
from tenacity import retry, stop_after_attempt, wait_exponential  # ^8.0.1
from prometheus_client import Counter, Histogram  # ^0.17.0

from core.agents.factory import AgentFactory
from core.agents.config_validator import ConfigValidator
from core.knowledge.rag import RAGProcessor
from utils.logging import StructuredLogger
from utils.metrics import MetricsManager, track_time

# Global constants
SUPPORTED_CAPABILITIES = ["rag", "chat", "task_automation", "data_processing", "secure_communication"]
DEFAULT_DEPLOYMENT_TYPE = "standalone"
SECURITY_LEVELS = {"low": 1, "medium": 2, "high": 3, "critical": 4}
MAX_RETRY_ATTEMPTS = 3
CIRCUIT_BREAKER_THRESHOLD = 5

class AgentBuilder:
    """Enterprise-grade builder class for constructing and configuring AI agents with comprehensive security, monitoring, and validation."""

    def __init__(
        self,
        agent_factory: AgentFactory,
        config_validator: ConfigValidator,
        rag_processor: RAGProcessor
    ):
        """Initialize agent builder with required dependencies and security context."""
        self._agent_factory = agent_factory
        self._config_validator = config_validator
        self._rag_processor = rag_processor
        self._current_config: Dict[str, Any] = {}
        self._knowledge_config: Dict[str, Any] = {}
        self._security_context: Dict[str, Any] = {}
        
        # Initialize logging and metrics
        self._logger = StructuredLogger("agent_builder", {
            "service": "agent_builder",
            "component": "builder"
        })
        self._metrics = MetricsManager(
            namespace="AgentBuilderHub/AgentBuilder",
            dimensions={"service": "agent_builder"}
        )

    @circuit(failure_threshold=CIRCUIT_BREAKER_THRESHOLD, recovery_timeout=60)
    @retry(stop=stop_after_attempt(MAX_RETRY_ATTEMPTS), wait=wait_exponential(multiplier=1, min=4, max=10))
    @track_time("create_from_template")
    async def create_from_template(
        self,
        template_id: UUID,
        security_context: Dict[str, Any]
    ) -> 'AgentBuilder':
        """Start building agent from template with security validation."""
        try:
            # Validate security context
            if not self._agent_factory.validate_security_context(security_context):
                raise ValidationError("Invalid security context")

            # Get template configuration
            template_config = await self._agent_factory.create_from_template(
                template_id,
                security_context=security_context
            )

            # Validate template configuration
            is_valid, error_msg = await self._config_validator.validate_template_config(
                template_config,
                template_config.get("schema", {})
            )
            if not is_valid:
                raise ValidationError(f"Template validation failed: {error_msg}")

            # Store validated configuration
            self._current_config = template_config
            self._security_context = security_context

            self._logger.log("info", "Created agent from template", {
                "template_id": str(template_id),
                "agent_type": template_config.get("type")
            })

            return self

        except Exception as e:
            self._logger.log("error", f"Template creation failed: {str(e)}")
            self._metrics.track_performance("template_creation_error", 1)
            raise

    @circuit(failure_threshold=CIRCUIT_BREAKER_THRESHOLD, recovery_timeout=60)
    @retry(stop=stop_after_attempt(MAX_RETRY_ATTEMPTS), wait=wait_exponential(multiplier=1, min=4, max=10))
    @track_time("create_custom")
    async def create_custom(
        self,
        base_config: Dict[str, Any],
        security_context: Dict[str, Any]
    ) -> 'AgentBuilder':
        """Start building custom agent with security validation."""
        try:
            # Validate security context
            if not self._agent_factory.validate_security_context(security_context):
                raise ValidationError("Invalid security context")

            # Validate base configuration
            is_valid, error_msg = await self._config_validator.validate_agent_config(
                base_config,
                base_config.get("type", DEFAULT_DEPLOYMENT_TYPE)
            )
            if not is_valid:
                raise ValidationError(f"Configuration validation failed: {error_msg}")

            # Create agent configuration
            agent_config = await self._agent_factory.create_agent(
                base_config,
                security_context=security_context
            )

            # Store validated configuration
            self._current_config = agent_config
            self._security_context = security_context

            self._logger.log("info", "Created custom agent", {
                "agent_type": agent_config.get("type")
            })

            return self

        except Exception as e:
            self._logger.log("error", f"Custom agent creation failed: {str(e)}")
            self._metrics.track_performance("custom_creation_error", 1)
            raise

    @track_time("with_knowledge_source")
    async def with_knowledge_source(
        self,
        knowledge_config: Dict[str, Any],
        security_context: Dict[str, Any]
    ) -> 'AgentBuilder':
        """Add secure knowledge source to agent configuration."""
        try:
            # Validate knowledge source security
            if not self._rag_processor.validate_source_security(knowledge_config):
                raise ValidationError("Knowledge source failed security validation")

            # Validate access permissions
            if not self._agent_factory.validate_security_context(security_context):
                raise ValidationError("Invalid security context for knowledge access")

            # Update knowledge configuration
            self._knowledge_config.update(knowledge_config)
            self._current_config["knowledge_sources"] = self._knowledge_config

            self._logger.log("info", "Added knowledge source", {
                "source_type": knowledge_config.get("source_type")
            })

            return self

        except Exception as e:
            self._logger.log("error", f"Knowledge source addition failed: {str(e)}")
            self._metrics.track_performance("knowledge_source_error", 1)
            raise

    @track_time("with_capabilities")
    async def with_capabilities(
        self,
        capabilities: List[str],
        security_context: Dict[str, Any]
    ) -> 'AgentBuilder':
        """Add capabilities with security validation."""
        try:
            # Validate capabilities
            invalid_capabilities = set(capabilities) - set(SUPPORTED_CAPABILITIES)
            if invalid_capabilities:
                raise ValidationError(f"Unsupported capabilities: {invalid_capabilities}")

            # Validate security context for capabilities
            if not self._agent_factory.validate_security_context(security_context):
                raise ValidationError("Invalid security context for capabilities")

            # Update agent capabilities
            self._current_config["capabilities"] = capabilities

            self._logger.log("info", "Added agent capabilities", {
                "capabilities": capabilities
            })

            return self

        except Exception as e:
            self._logger.log("error", f"Capability addition failed: {str(e)}")
            self._metrics.track_performance("capability_error", 1)
            raise

    @track_time("with_deployment_config")
    async def with_deployment_config(
        self,
        deployment_config: Dict[str, Any],
        security_context: Dict[str, Any]
    ) -> 'AgentBuilder':
        """Add secure deployment configuration."""
        try:
            # Validate deployment configuration
            is_valid, error_msg = await self._config_validator.validate_deployment_config(
                deployment_config,
                self._current_config.get("type", DEFAULT_DEPLOYMENT_TYPE)
            )
            if not is_valid:
                raise ValidationError(f"Deployment validation failed: {error_msg}")

            # Validate security context for deployment
            if not self._agent_factory.validate_security_context(security_context):
                raise ValidationError("Invalid security context for deployment")

            # Update deployment configuration
            self._current_config["deployment"] = deployment_config

            self._logger.log("info", "Added deployment configuration", {
                "deployment_type": deployment_config.get("type")
            })

            return self

        except Exception as e:
            self._logger.log("error", f"Deployment configuration failed: {str(e)}")
            self._metrics.track_performance("deployment_error", 1)
            raise

    @track_time("build")
    async def build(self) -> Dict[str, Any]:
        """Build final secure agent configuration."""
        try:
            # Validate configuration completeness
            if not self._current_config:
                raise ValidationError("No agent configuration provided")

            # Perform final security validation
            is_valid, error_msg = await self._config_validator.validate_agent_config(
                self._current_config,
                self._current_config.get("type", DEFAULT_DEPLOYMENT_TYPE)
            )
            if not is_valid:
                raise ValidationError(f"Final validation failed: {error_msg}")

            # Add build metadata
            self._current_config["build_info"] = {
                "timestamp": datetime.utcnow().isoformat(),
                "builder_version": "1.0.0",
                "security_level": self._security_context.get("security_level", "medium")
            }

            self._logger.log("info", "Built agent configuration", {
                "agent_type": self._current_config.get("type"),
                "capabilities": self._current_config.get("capabilities", [])
            })

            return self._current_config

        except Exception as e:
            self._logger.log("error", f"Agent build failed: {str(e)}")
            self._metrics.track_performance("build_error", 1)
            raise