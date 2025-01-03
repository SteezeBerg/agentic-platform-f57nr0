"""
Enterprise-grade task scheduler for agent orchestration with comprehensive error handling,
monitoring, and cross-region support.
Version: 1.0.0
"""

import asyncio
from typing import Dict, List, Optional, Any, Union
from datetime import datetime, timedelta
import json

# Third-party imports with versions
from pydantic import BaseModel, Field, validator  # ^2.0.0

# Internal imports
from ...integrations.aws.eventbridge import EventBridgeClient
from ...utils.logging import StructuredLogger
from ...utils.metrics import track_time, MetricsManager

# Initialize structured logger
logger = StructuredLogger('scheduler')

# Constants
SCHEDULE_TYPES = {
    "CRON": "cron",
    "RATE": "rate", 
    "ONE_TIME": "one_time"
}

MAX_RETRY_ATTEMPTS = 3
BATCH_SIZE = 100

class ScheduleConfig(BaseModel):
    """Enhanced configuration class for task scheduling parameters with validation."""
    
    schedule_type: str = Field(..., description="Type of schedule (cron, rate, one_time)")
    expression: str = Field(..., description="Schedule expression")
    task_config: Dict[str, Any] = Field(..., description="Task configuration details")
    enabled: bool = Field(default=True, description="Schedule enabled status")
    region: str = Field(..., description="AWS region for schedule")
    retry_config: Dict[str, Any] = Field(
        default_factory=lambda: {
            "max_attempts": MAX_RETRY_ATTEMPTS,
            "backoff_rate": 2,
            "initial_interval": 1
        }
    )
    monitoring_config: Dict[str, Any] = Field(
        default_factory=lambda: {
            "alert_on_failure": True,
            "metrics_enabled": True,
            "log_level": "INFO"
        }
    )

    @validator('schedule_type')
    def validate_schedule_type(cls, v):
        if v not in SCHEDULE_TYPES.values():
            raise ValueError(f"Invalid schedule type. Must be one of {list(SCHEDULE_TYPES.values())}")
        return v

    @validator('expression')
    def validate_expression(cls, v, values):
        schedule_type = values.get('schedule_type')
        if schedule_type == SCHEDULE_TYPES['CRON']:
            # Validate cron expression
            if not cls._is_valid_cron(v):
                raise ValueError("Invalid cron expression")
        elif schedule_type == SCHEDULE_TYPES['RATE']:
            # Validate rate expression
            if not v.startswith(('rate(', 'Rate(')):
                raise ValueError("Invalid rate expression")
        elif schedule_type == SCHEDULE_TYPES['ONE_TIME']:
            # Validate ISO datetime
            try:
                datetime.fromisoformat(v)
            except ValueError:
                raise ValueError("Invalid ISO datetime format for one_time schedule")
        return v

    @staticmethod
    def _is_valid_cron(expression: str) -> bool:
        """Validate cron expression format."""
        try:
            parts = expression.split()
            if len(parts) not in (5, 6):
                return False
            # Additional cron validation logic could be added here
            return True
        except Exception:
            return False

class AgentScheduler:
    """Enhanced scheduler class for managing agent and workflow task scheduling."""

    def __init__(self, bus_name: str, config: Dict[str, Any]):
        """Initialize the agent scheduler with enhanced features."""
        self._event_bridge = EventBridgeClient(bus_name=bus_name)
        self._schedules: Dict[str, ScheduleConfig] = {}
        self._handlers: Dict[str, Any] = {}
        self._metrics = MetricsManager(namespace="AgentScheduler")
        self._cache: Dict[str, Any] = {}
        
        # Initialize security context
        self._security_context = self._init_security_context(config)
        
        logger.log('info', f"Initialized AgentScheduler with bus: {bus_name}")

    def _init_security_context(self, config: Dict[str, Any]) -> Dict[str, Any]:
        """Initialize security context for scheduler operations."""
        return {
            "roles": config.get("roles", []),
            "permissions": config.get("permissions", {}),
            "encryption_key": config.get("encryption_key")
        }

    @track_time("create_schedule")
    async def create_schedule(self, schedule_id: str, config: ScheduleConfig) -> Dict[str, Any]:
        """Create a new schedule with enhanced validation and monitoring."""
        try:
            # Validate security permissions
            if not self._validate_permissions("create_schedule"):
                raise PermissionError("Insufficient permissions to create schedule")

            # Create EventBridge rule
            rule_name = f"agent-schedule-{schedule_id}"
            event_pattern = self._build_event_pattern(config)
            
            rule_response = await self._event_bridge.create_rule(
                rule_name=rule_name,
                event_pattern=event_pattern,
                targets=[{
                    "Id": f"target-{schedule_id}",
                    "Arn": self._get_target_arn(config),
                    "RetryPolicy": config.retry_config
                }],
                tags={"ScheduleId": schedule_id}
            )

            # Register schedule
            self._schedules[schedule_id] = config
            self._update_cache(schedule_id, config)

            # Set up monitoring
            self._setup_monitoring(schedule_id, config)

            # Audit logging
            logger.log('info', f"Created schedule: {schedule_id}", 
                      extra={"rule_arn": rule_response["rule_arn"]})

            return {
                "schedule_id": schedule_id,
                "rule_arn": rule_response["rule_arn"],
                "status": "active",
                "monitoring": config.monitoring_config
            }

        except Exception as e:
            logger.log('error', f"Failed to create schedule: {str(e)}")
            self._metrics.track_performance("schedule_creation_error", 1)
            raise

    @track_time("batch_create_schedules")
    async def batch_create_schedules(self, schedule_configs: List[Dict[str, Any]]) -> Dict[str, Any]:
        """Efficiently create multiple schedules in batch."""
        if not schedule_configs:
            raise ValueError("Schedule configs list cannot be empty")

        results = {
            "successful": [],
            "failed": []
        }

        # Process in batches
        for i in range(0, len(schedule_configs), BATCH_SIZE):
            batch = schedule_configs[i:i + BATCH_SIZE]
            
            # Create rules in parallel
            tasks = []
            for config in batch:
                schedule_id = config.pop("schedule_id", None)
                if not schedule_id:
                    continue
                
                tasks.append(
                    self.create_schedule(
                        schedule_id=schedule_id,
                        config=ScheduleConfig(**config)
                    )
                )

            # Wait for batch completion
            batch_results = await asyncio.gather(*tasks, return_exceptions=True)
            
            # Process results
            for schedule_id, result in zip(batch, batch_results):
                if isinstance(result, Exception):
                    results["failed"].append({
                        "schedule_id": schedule_id,
                        "error": str(result)
                    })
                else:
                    results["successful"].append(result)

        # Update metrics
        self._metrics.track_performance(
            "batch_schedule_creation",
            len(results["successful"]),
            {"total": len(schedule_configs), "failed": len(results["failed"])}
        )

        return results

    @track_time("handle_scheduled_task")
    async def handle_scheduled_task(self, event: Dict[str, Any]) -> Dict[str, Any]:
        """Enhanced task execution handler with retry and monitoring."""
        start_time = datetime.now()
        schedule_id = event.get("schedule_id")
        
        try:
            # Validate event and security context
            if not self._validate_event(event):
                raise ValueError("Invalid event format")

            # Initialize monitoring context
            monitoring_context = self._init_monitoring_context(schedule_id)

            # Execute handler with retry logic
            handler = self._handlers.get(event.get("handler_type"))
            if not handler:
                raise ValueError(f"No handler found for type: {event.get('handler_type')}")

            result = await self._execute_with_retry(
                handler=handler,
                event=event,
                retry_config=self._schedules[schedule_id].retry_config
            )

            # Track metrics
            execution_time = (datetime.now() - start_time).total_seconds() * 1000
            self._metrics.track_performance(
                "task_execution_time",
                execution_time,
                {"schedule_id": schedule_id, "status": "success"}
            )

            return {
                "status": "success",
                "execution_time_ms": execution_time,
                "result": result,
                "monitoring": monitoring_context
            }

        except Exception as e:
            logger.log('error', f"Task execution failed: {str(e)}")
            self._metrics.track_performance(
                "task_execution_error",
                1,
                {"schedule_id": schedule_id, "error_type": type(e).__name__}
            )
            raise

    def _validate_permissions(self, operation: str) -> bool:
        """Validate operation permissions against security context."""
        required_permissions = self._security_context["permissions"].get(operation, [])
        user_roles = self._security_context["roles"]
        return any(role in user_roles for role in required_permissions)

    def _build_event_pattern(self, config: ScheduleConfig) -> Dict[str, Any]:
        """Build EventBridge event pattern from schedule configuration."""
        if config.schedule_type == SCHEDULE_TYPES['CRON']:
            return {"schedule": config.expression}
        elif config.schedule_type == SCHEDULE_TYPES['RATE']:
            return {"rate": config.expression}
        else:
            return {"time": config.expression}

    def _get_target_arn(self, config: ScheduleConfig) -> str:
        """Get target ARN based on configuration."""
        # Implementation would depend on deployment architecture
        return f"arn:aws:lambda:{config.region}:function:agent-executor"

    def _update_cache(self, schedule_id: str, config: ScheduleConfig) -> None:
        """Update schedule cache with TTL."""
        self._cache[schedule_id] = {
            "config": config,
            "expires_at": datetime.now() + timedelta(hours=1)
        }

    def _setup_monitoring(self, schedule_id: str, config: ScheduleConfig) -> None:
        """Set up monitoring and alerts for schedule."""
        if config.monitoring_config["metrics_enabled"]:
            self._metrics.track_performance(
                "schedule_creation",
                1,
                {"schedule_id": schedule_id, "type": config.schedule_type}
            )

    async def _execute_with_retry(self, handler: Any, event: Dict[str, Any], 
                                retry_config: Dict[str, Any]) -> Any:
        """Execute handler with exponential backoff retry."""
        attempts = 0
        last_error = None

        while attempts < retry_config["max_attempts"]:
            try:
                return await handler(event)
            except Exception as e:
                attempts += 1
                last_error = e
                if attempts < retry_config["max_attempts"]:
                    await asyncio.sleep(
                        retry_config["initial_interval"] * 
                        (retry_config["backoff_rate"] ** attempts)
                    )

        raise last_error

    def _validate_event(self, event: Dict[str, Any]) -> bool:
        """Validate event format and required fields."""
        required_fields = {"schedule_id", "handler_type", "task_config"}
        return all(field in event for field in required_fields)

    def _init_monitoring_context(self, schedule_id: str) -> Dict[str, Any]:
        """Initialize monitoring context for task execution."""
        return {
            "schedule_id": schedule_id,
            "start_time": datetime.now().isoformat(),
            "metrics_enabled": self._schedules[schedule_id].monitoring_config["metrics_enabled"]
        }