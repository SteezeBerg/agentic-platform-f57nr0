"""
Enterprise-grade deployment service implementation for Agent Builder Hub.
Provides comprehensive deployment management with enhanced monitoring, security, and recovery capabilities.
Version: 1.0.0
"""

from typing import Dict, Any, Optional, List
from uuid import UUID
from datetime import datetime
import logging
from circuitbreaker import circuit_breaker
from prometheus_client import Counter, Histogram, Gauge

from db.repositories.deployment_repository import DeploymentRepository
from core.deployment.ecs import ECSDeploymentStrategy
from schemas.deployment import DeploymentCreate, DeploymentResponse, DeploymentStatus
from utils.logging import StructuredLogger
from utils.metrics import MetricsManager, track_time

# Metrics collectors
deployment_counter = Counter(
    'deployments_total',
    'Total number of deployments',
    ['environment', 'status']
)
deployment_duration = Histogram(
    'deployment_duration_seconds',
    'Time spent in deployment',
    ['environment', 'type']
)
active_deployments = Gauge(
    'active_deployments',
    'Number of active deployments',
    ['environment']
)

class DeploymentService:
    """Enterprise service for managing agent deployments with comprehensive monitoring."""

    def __init__(self, repository: DeploymentRepository, config: Optional[Dict[str, Any]] = None):
        """Initialize deployment service with enhanced monitoring and security."""
        self._repository = repository
        self._logger = StructuredLogger("deployment_service", {
            "service": "deployment",
            "version": "1.0.0"
        })
        self._metrics = MetricsManager()
        
        # Initialize deployment strategies
        self._deployment_strategies = {
            "ecs": ECSDeploymentStrategy,
            # Add other strategies as needed
        }
        
        # Service configuration
        self._config = config or {}
        self._validate_config()

    def _validate_config(self) -> None:
        """Validate service configuration with security checks."""
        required_settings = [
            "environment",
            "monitoring_enabled",
            "security_enabled"
        ]
        
        for setting in required_settings:
            if setting not in self._config:
                raise ValueError(f"Missing required configuration: {setting}")

    @circuit_breaker(failure_threshold=3, recovery_timeout=60)
    @track_time("create_deployment")
    async def create_deployment(
        self,
        deployment_data: DeploymentCreate,
        security_context: Optional[Dict[str, Any]] = None
    ) -> DeploymentResponse:
        """Create new deployment with comprehensive validation and monitoring."""
        try:
            # Validate security context
            if not self._validate_security_context(security_context):
                raise PermissionError("Invalid security context")

            # Validate environment-specific configuration
            self._validate_environment_config(deployment_data)

            # Select deployment strategy
            strategy_class = self._deployment_strategies.get(
                deployment_data.deployment_type
            )
            if not strategy_class:
                raise ValueError(f"Unsupported deployment type: {deployment_data.deployment_type}")

            # Initialize strategy with configuration
            strategy = strategy_class(deployment_data)

            # Validate deployment configuration
            if not await strategy.validate_config():
                raise ValueError("Invalid deployment configuration")

            # Create deployment record
            deployment = self._repository.create(
                agent_id=deployment_data.agent_id,
                environment=deployment_data.environment,
                deployment_type=deployment_data.deployment_type,
                config=deployment_data.config
            )

            # Track metrics
            deployment_counter.labels(
                environment=deployment_data.environment,
                status="created"
            ).inc()

            # Initialize monitoring
            self._setup_deployment_monitoring(deployment.id)

            return DeploymentResponse(
                id=deployment.id,
                status="pending",
                agent_id=deployment_data.agent_id,
                environment=deployment_data.environment,
                config=deployment_data.config,
                created_at=datetime.utcnow()
            )

        except Exception as e:
            self._logger.log("error", f"Deployment creation failed: {str(e)}")
            deployment_counter.labels(
                environment=deployment_data.environment,
                status="failed"
            ).inc()
            raise

    @circuit_breaker(failure_threshold=3, recovery_timeout=60)
    @track_time("execute_deployment")
    async def execute_deployment(
        self,
        deployment_id: UUID,
        rollout_config: Optional[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        """Execute deployment with progressive rollout and comprehensive monitoring."""
        try:
            # Get deployment details
            deployment = self._repository.get_by_id(deployment_id)
            if not deployment:
                raise ValueError(f"Deployment not found: {deployment_id}")

            # Initialize metrics tracking
            with deployment_duration.labels(
                environment=deployment.environment,
                type=deployment.deployment_type
            ).time():
                # Update deployment status
                self._repository.update_status(deployment_id, "in_progress")
                
                # Get deployment strategy
                strategy_class = self._deployment_strategies.get(deployment.deployment_type)
                strategy = strategy_class(deployment)

                # Execute deployment
                deployment_result = await strategy.deploy()

                if deployment_result.get("status") == "success":
                    # Update deployment status and metrics
                    self._repository.update_status(deployment_id, "completed")
                    self._repository.update_metrics(
                        deployment_id,
                        deployment_result.get("metrics", {})
                    )

                    # Track successful deployment
                    deployment_counter.labels(
                        environment=deployment.environment,
                        status="completed"
                    ).inc()

                    return {
                        "status": "success",
                        "deployment_id": str(deployment_id),
                        "details": deployment_result
                    }
                else:
                    # Handle deployment failure
                    await self._handle_deployment_failure(deployment_id, deployment_result)
                    raise RuntimeError("Deployment execution failed")

        except Exception as e:
            self._logger.log("error", f"Deployment execution failed: {str(e)}")
            await self._handle_deployment_failure(deployment_id, {"error": str(e)})
            raise

    async def _handle_deployment_failure(
        self,
        deployment_id: UUID,
        failure_details: Dict[str, Any]
    ) -> None:
        """Handle deployment failures with automated recovery."""
        try:
            # Update deployment status
            self._repository.update_status(
                deployment_id,
                "failed",
                error_message=str(failure_details.get("error"))
            )

            # Track failure metrics
            deployment_counter.labels(
                environment=self._config["environment"],
                status="failed"
            ).inc()

            # Initiate rollback if configured
            deployment = self._repository.get_by_id(deployment_id)
            if deployment and deployment.config.get("auto_rollback", True):
                await self.rollback_deployment(deployment_id)

        except Exception as e:
            self._logger.log("error", f"Error handling deployment failure: {str(e)}")
            raise

    @track_time("rollback_deployment")
    async def rollback_deployment(self, deployment_id: UUID) -> Dict[str, Any]:
        """Execute deployment rollback with state preservation."""
        try:
            # Get deployment details
            deployment = self._repository.get_by_id(deployment_id)
            if not deployment:
                raise ValueError(f"Deployment not found: {deployment_id}")

            # Update deployment status
            self._repository.update_status(deployment_id, "rolling_back")

            # Get deployment strategy
            strategy_class = self._deployment_strategies.get(deployment.deployment_type)
            strategy = strategy_class(deployment)

            # Execute rollback
            rollback_result = await strategy.rollback()

            if rollback_result:
                self._repository.update_status(deployment_id, "rolled_back")
                return {
                    "status": "success",
                    "message": "Rollback completed successfully"
                }
            else:
                raise RuntimeError("Rollback failed")

        except Exception as e:
            self._logger.log("error", f"Rollback failed: {str(e)}")
            self._repository.update_status(
                deployment_id,
                "failed",
                error_message=f"Rollback failed: {str(e)}"
            )
            raise

    def _validate_security_context(self, security_context: Optional[Dict[str, Any]]) -> bool:
        """Validate security context for deployment operations."""
        if not security_context:
            return False
        
        required_fields = ["user_id", "roles", "permissions"]
        if not all(field in security_context for field in required_fields):
            return False
            
        # Validate deployment permissions
        required_permissions = ["deployment:create", "deployment:execute"]
        user_permissions = security_context.get("permissions", [])
        
        return all(perm in user_permissions for perm in required_permissions)

    def _validate_environment_config(self, deployment_data: DeploymentCreate) -> None:
        """Validate environment-specific deployment configuration."""
        environment = deployment_data.environment
        
        # Validate resource limits
        if environment == "production":
            min_replicas = deployment_data.config.get("min_replicas", 1)
            if min_replicas < 2:
                raise ValueError("Production deployments require minimum 2 replicas")

        # Validate monitoring configuration
        if not deployment_data.monitoring_config.get("metrics_enabled"):
            raise ValueError("Metrics collection must be enabled")

        # Validate security configuration
        if not deployment_data.security_config.get("encryption_enabled"):
            raise ValueError("Encryption must be enabled")

    def _setup_deployment_monitoring(self, deployment_id: UUID) -> None:
        """Initialize deployment monitoring and metrics collection."""
        # Update active deployments gauge
        active_deployments.labels(
            environment=self._config["environment"]
        ).inc()

        # Initialize deployment-specific metrics
        self._metrics.track_performance(
            "deployment_initialized",
            1,
            {"deployment_id": str(deployment_id)}
        )

    async def get_deployment_metrics(
        self,
        deployment_id: UUID
    ) -> Dict[str, Any]:
        """Retrieve comprehensive deployment metrics."""
        deployment = self._repository.get_by_id(deployment_id)
        if not deployment:
            raise ValueError(f"Deployment not found: {deployment_id}")

        # Get deployment history
        history = self._repository.get_deployment_history(deployment_id)

        return {
            "deployment_id": str(deployment_id),
            "status": deployment.status,
            "metrics": deployment.metrics,
            "history": history,
            "health_status": await self._get_deployment_health(deployment)
        }

    async def _get_deployment_health(self, deployment: Any) -> Dict[str, Any]:
        """Get detailed deployment health status."""
        strategy_class = self._deployment_strategies.get(deployment.deployment_type)
        if not strategy_class:
            return {"status": "unknown"}

        strategy = strategy_class(deployment)
        return await strategy.health_check()