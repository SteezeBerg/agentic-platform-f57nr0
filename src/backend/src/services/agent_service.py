"""
Service layer for managing AI agent lifecycle including creation, configuration,
knowledge integration, and deployment orchestration.
Version: 1.0.0
"""

from typing import Dict, List, Optional, Any
from uuid import UUID
from datetime import datetime

from pydantic import ValidationError  # ^2.0.0
from circuitbreaker import circuit  # ^1.3.0
from ratelimit import limits  # ^2.2.1

from core.agents.builder import AgentBuilder
from db.repositories.agent_repository import AgentRepository
from utils.logging import StructuredLogger
from utils.metrics import MetricsManager, track_time
from security_utils import SecurityContext
from audit_logging import AuditLogger

# Global constants
DEFAULT_PAGE_SIZE = 50
MAX_PAGE_SIZE = 100
CACHE_TTL = 300
MAX_RETRY_ATTEMPTS = 3
RATE_LIMIT_WINDOW = 60
RATE_LIMIT_REQUESTS = 100

class AgentService:
    """
    Service class implementing comprehensive business logic for agent management 
    with enhanced security, monitoring, and validation.
    """

    def __init__(
        self,
        repository: AgentRepository,
        builder: AgentBuilder,
        security_context: SecurityContext,
        metrics: MetricsManager,
        audit_logger: AuditLogger
    ):
        """Initialize service with required dependencies and configurations."""
        self._repository = repository
        self._builder = builder
        self._security_context = security_context
        self._metrics = metrics
        self._audit_logger = audit_logger
        self._logger = StructuredLogger("agent_service", {
            "service": "agent_builder",
            "component": "service"
        })
        self._cache: Dict[str, Any] = {}

    @circuit(failure_threshold=5, recovery_timeout=60)
    @limits(calls=RATE_LIMIT_REQUESTS, period=RATE_LIMIT_WINDOW)
    @track_time("create_agent")
    async def create_agent(
        self,
        agent_data: Dict[str, Any],
        owner_id: UUID,
        security_context: Optional[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        """
        Creates a new agent with comprehensive validation and security checks.

        Args:
            agent_data: Agent configuration data
            owner_id: UUID of the agent owner
            security_context: Optional security context

        Returns:
            Created agent details with validation status

        Raises:
            ValidationError: If agent configuration is invalid
            PermissionError: If security validation fails
        """
        try:
            start_time = datetime.utcnow()

            # Validate security context and permissions
            if not self._security_context.validate_context(security_context):
                raise PermissionError("Invalid security context")

            if not self._security_context.validate_permissions(owner_id, "agent:create"):
                raise PermissionError("Insufficient permissions to create agent")

            # Track metrics
            self._metrics.track_performance("agent_creation_started", 1, {
                "agent_type": agent_data.get("type"),
                "owner_id": str(owner_id)
            })

            # Initialize agent builder with template if specified
            if template_id := agent_data.get("template_id"):
                builder = await self._builder.create_from_template(
                    template_id=UUID(template_id),
                    security_context=security_context
                )
            else:
                builder = await self._builder.create_custom(
                    base_config=agent_data.get("config", {}),
                    security_context=security_context
                )

            # Add knowledge sources if specified
            if knowledge_sources := agent_data.get("knowledge_source_ids"):
                for source_id in knowledge_sources:
                    await builder.with_knowledge_source(
                        {"source_id": source_id},
                        security_context
                    )

            # Add capabilities
            if capabilities := agent_data.get("capabilities"):
                await builder.with_capabilities(capabilities, security_context)

            # Add deployment configuration
            if deployment_config := agent_data.get("deployment_config"):
                await builder.with_deployment_config(
                    deployment_config,
                    security_context
                )

            # Build final configuration
            final_config = await builder.build()

            # Create agent in repository
            agent = await self._repository.create(
                name=agent_data["name"],
                type=agent_data["type"],
                owner_id=owner_id,
                template_id=UUID(template_id) if template_id else None,
                config=final_config,
                knowledge_source_ids=[UUID(id) for id in knowledge_sources] if knowledge_sources else None
            )

            # Create audit log entry
            self._audit_logger.log_event(
                "agent_created",
                {
                    "agent_id": str(agent.id),
                    "owner_id": str(owner_id),
                    "agent_type": agent_data["type"],
                    "template_id": template_id,
                    "knowledge_sources": knowledge_sources
                }
            )

            # Track success metrics
            duration = (datetime.utcnow() - start_time).total_seconds()
            self._metrics.track_performance("agent_creation_success", 1, {
                "agent_type": agent_data["type"],
                "duration": duration,
                "template_used": bool(template_id)
            })

            return {
                "id": str(agent.id),
                "name": agent.name,
                "type": agent.type,
                "status": agent.status,
                "created_at": agent.created_at.isoformat(),
                "config": agent.config,
                "capabilities": agent.capabilities,
                "knowledge_source_ids": [str(id) for id in agent.knowledge_source_ids] if agent.knowledge_source_ids else []
            }

        except ValidationError as e:
            self._logger.log("error", f"Agent validation failed: {str(e)}")
            self._metrics.track_performance("agent_creation_validation_error", 1)
            raise

        except Exception as e:
            self._logger.log("error", f"Agent creation failed: {str(e)}")
            self._metrics.track_performance("agent_creation_error", 1)
            raise

    @circuit(failure_threshold=5, recovery_timeout=60)
    @limits(calls=RATE_LIMIT_REQUESTS, period=RATE_LIMIT_WINDOW)
    @track_time("update_agent")
    async def update_agent(
        self,
        agent_id: UUID,
        updates: Dict[str, Any],
        owner_id: UUID,
        security_context: Optional[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        """
        Update an existing agent with validation and security checks.

        Args:
            agent_id: UUID of agent to update
            updates: Dictionary of updates to apply
            owner_id: UUID of user making the update
            security_context: Optional security context

        Returns:
            Updated agent details

        Raises:
            ValidationError: If update data is invalid
            PermissionError: If security validation fails
        """
        try:
            # Validate security context and permissions
            if not self._security_context.validate_context(security_context):
                raise PermissionError("Invalid security context")

            if not self._security_context.validate_permissions(owner_id, "agent:update"):
                raise PermissionError("Insufficient permissions to update agent")

            # Update agent in repository
            updated_agent = await self._repository.update(
                agent_id=agent_id,
                owner_id=owner_id,
                updates=updates
            )

            if not updated_agent:
                raise ValueError(f"Agent {agent_id} not found")

            # Create audit log entry
            self._audit_logger.log_event(
                "agent_updated",
                {
                    "agent_id": str(agent_id),
                    "owner_id": str(owner_id),
                    "updates": updates
                }
            )

            # Track metrics
            self._metrics.track_performance("agent_update_success", 1, {
                "agent_type": updated_agent.type,
                "update_type": list(updates.keys())
            })

            return {
                "id": str(updated_agent.id),
                "name": updated_agent.name,
                "type": updated_agent.type,
                "status": updated_agent.status,
                "updated_at": updated_agent.updated_at.isoformat(),
                "config": updated_agent.config,
                "capabilities": updated_agent.capabilities
            }

        except Exception as e:
            self._logger.log("error", f"Agent update failed: {str(e)}")
            self._metrics.track_performance("agent_update_error", 1)
            raise

    @circuit(failure_threshold=5, recovery_timeout=60)
    @track_time("get_agent")
    async def get_agent(
        self,
        agent_id: UUID,
        security_context: Optional[Dict[str, Any]] = None
    ) -> Optional[Dict[str, Any]]:
        """
        Retrieve agent details with security validation.

        Args:
            agent_id: UUID of agent to retrieve
            security_context: Optional security context

        Returns:
            Agent details if found and accessible
        """
        try:
            # Validate security context
            if not self._security_context.validate_context(security_context):
                raise PermissionError("Invalid security context")

            # Get agent from repository
            agent = await self._repository.get(agent_id)

            if not agent:
                return None

            # Validate access permissions
            if not self._security_context.validate_access(agent, security_context):
                raise PermissionError("Insufficient permissions to access agent")

            return {
                "id": str(agent.id),
                "name": agent.name,
                "type": agent.type,
                "status": agent.status,
                "created_at": agent.created_at.isoformat(),
                "updated_at": agent.updated_at.isoformat(),
                "config": agent.config,
                "capabilities": agent.capabilities,
                "knowledge_source_ids": [str(id) for id in agent.knowledge_source_ids] if agent.knowledge_source_ids else [],
                "performance_metrics": agent.performance_metrics
            }

        except Exception as e:
            self._logger.log("error", f"Agent retrieval failed: {str(e)}")
            self._metrics.track_performance("agent_retrieval_error", 1)
            raise