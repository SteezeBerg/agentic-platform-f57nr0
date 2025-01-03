"""
Core executor module for Agent Builder Hub.
Provides enterprise-grade agent execution management with comprehensive monitoring,
security controls, and reliability features.
Version: 1.0.0
"""

import asyncio
from datetime import datetime
from typing import Dict, Optional, Any
from uuid import UUID

from pydantic import BaseModel, Field, validator
from tenacity import retry, stop_after_attempt, wait_exponential
from circuitbreaker import circuit
from prometheus_client import Counter, Histogram

from .factory import AgentFactory
from ..knowledge.rag import RAGProcessor
from ..orchestration.coordinator import AgentCoordinator
from ...utils.logging import StructuredLogger
from ...utils.metrics import MetricsManager, track_time

# Global constants
AGENT_STATES = {
    "INITIALIZING": "initializing",
    "RUNNING": "running",
    "PAUSED": "paused",
    "STOPPED": "stopped",
    "ERROR": "error",
    "DEGRADED": "degraded"
}

MAX_RETRIES = 3
DEFAULT_TIMEOUT = 300
CIRCUIT_BREAKER_THRESHOLD = 5
HEALTH_CHECK_INTERVAL = 30
METRIC_COLLECTION_INTERVAL = 60

class AgentExecutionConfig(BaseModel):
    """Enhanced configuration for agent execution with security and monitoring."""
    
    agent_id: str = Field(..., description="Unique agent identifier")
    runtime_config: Dict[str, Any] = Field(default_factory=dict)
    timeout: int = Field(default=DEFAULT_TIMEOUT)
    use_rag: bool = Field(default=True)
    coordination_config: Dict[str, Any] = Field(default_factory=dict)
    security_config: Dict[str, Any] = Field(default_factory=lambda: {
        "encryption_enabled": True,
        "audit_logging": True,
        "access_control": "role_based",
        "security_level": "high"
    })
    monitoring_config: Dict[str, Any] = Field(default_factory=lambda: {
        "metrics_enabled": True,
        "performance_tracking": True,
        "health_checks": True,
        "alert_thresholds": {
            "error_rate": 0.05,
            "latency_ms": 1000,
            "memory_usage": 80
        }
    })
    resource_limits: Dict[str, Any] = Field(default_factory=lambda: {
        "max_memory_mb": 2048,
        "max_cpu_cores": 2,
        "max_execution_time": 3600
    })

    @validator("security_config")
    def validate_security(cls, v):
        """Validate security configuration."""
        if not v.get("encryption_enabled", True):
            raise ValueError("Encryption must be enabled for security compliance")
        return v

class AgentExecutor:
    """Enhanced executor for managing agent lifecycle with enterprise features."""

    def __init__(
        self,
        factory: AgentFactory,
        rag_processor: RAGProcessor,
        coordinator: AgentCoordinator
    ):
        """Initialize executor with required components."""
        self._factory = factory
        self._rag_processor = rag_processor
        self._coordinator = coordinator
        self._active_executions: Dict[str, Dict[str, Any]] = {}
        self._health_status: Dict[str, Dict[str, Any]] = {}
        self._resource_usage: Dict[str, Dict[str, float]] = {}
        
        # Initialize monitoring
        self._logger = StructuredLogger("agent_executor", {
            "service": "agent_builder",
            "component": "executor"
        })
        self._metrics = MetricsManager()
        
        # Start background monitoring tasks
        asyncio.create_task(self._monitor_health())
        asyncio.create_task(self._collect_metrics())

    @retry(
        stop=stop_after_attempt(MAX_RETRIES),
        wait=wait_exponential(multiplier=1, min=4, max=10)
    )
    @circuit(failure_threshold=CIRCUIT_BREAKER_THRESHOLD)
    @track_time("execute_agent")
    async def execute_agent(self, config: AgentExecutionConfig) -> Dict[str, Any]:
        """
        Execute agent with comprehensive monitoring and security controls.
        
        Args:
            config: Agent execution configuration
            
        Returns:
            Execution results with metrics
        """
        start_time = datetime.utcnow()
        agent_id = config.agent_id
        
        try:
            # Get agent configuration
            agent_config = await self._factory.get_agent_config(UUID(agent_id))
            if not agent_config:
                raise ValueError(f"Agent {agent_id} not found")

            # Register with coordinator
            await self._coordinator.register_agent(
                agent_id,
                {
                    **agent_config,
                    **config.runtime_config
                }
            )

            # Initialize execution environment
            execution_context = await self._initialize_execution(config)
            
            # Start resource monitoring
            self._resource_usage[agent_id] = {
                "cpu": 0.0,
                "memory": 0.0,
                "start_time": start_time.timestamp()
            }

            # Execute agent with RAG if enabled
            if config.use_rag:
                context = await self._rag_processor.process(
                    agent_config.get("prompt", ""),
                    additional_context=config.runtime_config.get("context")
                )
                execution_context["knowledge_context"] = context

            # Monitor execution
            self._active_executions[agent_id] = {
                "status": AGENT_STATES["RUNNING"],
                "start_time": start_time,
                "config": config.dict(),
                "context": execution_context
            }

            # Track execution metrics
            await self._coordinator.track_metrics(agent_id, {
                "execution_start": start_time.timestamp(),
                "status": AGENT_STATES["RUNNING"]
            })

            # Monitor health during execution
            health_status = await self._coordinator.monitor_agent_health(agent_id)
            if health_status.get("status") != "healthy":
                raise RuntimeError(f"Agent health check failed: {health_status}")

            # Execute workflow
            result = await self._coordinator.coordinate_workflow(
                agent_id,
                execution_context
            )

            # Update execution status
            execution_time = (datetime.utcnow() - start_time).total_seconds()
            self._active_executions[agent_id]["status"] = AGENT_STATES["STOPPED"]
            self._active_executions[agent_id]["end_time"] = datetime.utcnow()

            # Track completion metrics
            await self._coordinator.track_metrics(agent_id, {
                "execution_time": execution_time,
                "status": "completed",
                "error_count": 0
            })

            return {
                "status": "success",
                "execution_time": execution_time,
                "result": result,
                "metrics": {
                    "start_time": start_time.isoformat(),
                    "end_time": datetime.utcnow().isoformat(),
                    "duration_seconds": execution_time,
                    "resource_usage": self._resource_usage[agent_id]
                }
            }

        except Exception as e:
            self._logger.log("error", f"Agent execution failed: {str(e)}")
            
            # Update error metrics
            await self._coordinator.track_metrics(agent_id, {
                "status": "error",
                "error_type": type(e).__name__,
                "error_message": str(e)
            })
            
            # Update execution status
            if agent_id in self._active_executions:
                self._active_executions[agent_id]["status"] = AGENT_STATES["ERROR"]
                self._active_executions[agent_id]["error"] = str(e)
            
            raise

        finally:
            # Cleanup resources
            if agent_id in self._resource_usage:
                del self._resource_usage[agent_id]
            if agent_id in self._active_executions:
                del self._active_executions[agent_id]

    async def _initialize_execution(self, config: AgentExecutionConfig) -> Dict[str, Any]:
        """Initialize secure execution environment."""
        return {
            "agent_id": config.agent_id,
            "security_context": config.security_config,
            "resource_limits": config.resource_limits,
            "start_time": datetime.utcnow().isoformat()
        }

    async def _monitor_health(self):
        """Background task for monitoring agent health."""
        while True:
            try:
                for agent_id, execution in self._active_executions.items():
                    health_status = await self._coordinator.monitor_agent_health(agent_id)
                    self._health_status[agent_id] = health_status
                    
                    if health_status.get("status") != "healthy":
                        self._logger.log("warning", f"Unhealthy agent detected: {agent_id}")
                        
                await asyncio.sleep(HEALTH_CHECK_INTERVAL)
                
            except Exception as e:
                self._logger.log("error", f"Health monitoring error: {str(e)}")
                await asyncio.sleep(HEALTH_CHECK_INTERVAL)

    async def _collect_metrics(self):
        """Background task for collecting execution metrics."""
        while True:
            try:
                for agent_id in self._active_executions:
                    metrics = await self._coordinator.track_metrics(agent_id, {
                        "timestamp": datetime.utcnow().timestamp()
                    })
                    self._metrics.track_performance(
                        "agent_metrics",
                        metrics,
                        {"agent_id": agent_id}
                    )
                    
                await asyncio.sleep(METRIC_COLLECTION_INTERVAL)
                
            except Exception as e:
                self._logger.log("error", f"Metrics collection error: {str(e)}")
                await asyncio.sleep(METRIC_COLLECTION_INTERVAL)