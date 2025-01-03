"""
Core workflow management module for Agent Builder Hub.
Provides enterprise-grade workflow orchestration with enhanced reliability, monitoring, and security.
Version: 1.0.0
"""

import asyncio
from typing import Dict, List, Optional, Any
from uuid import UUID
from datetime import datetime

from pydantic import BaseModel, Field, validator
import networkx as nx
from cachetools import TTLCache
from circuit_breaker_pattern import CircuitBreaker
from prometheus_client import Counter, Histogram

from .event_bus import AgentEventBus, publish_event, subscribe
from ...services.agent_service import AgentService
from ...utils.logging import StructuredLogger
from ...utils.metrics import MetricsManager, track_time

# Global constants
WORKFLOW_STATES = {
    "PENDING": "pending",
    "RUNNING": "running", 
    "COMPLETED": "completed",
    "FAILED": "failed",
    "PAUSED": "paused",
    "RECOVERING": "recovering"
}

WORKFLOW_EVENTS = {
    "STAGE_COMPLETED": "workflow.stage.completed",
    "STAGE_FAILED": "workflow.stage.failed",
    "WORKFLOW_COMPLETED": "workflow.completed",
    "WORKFLOW_FAILED": "workflow.failed",
    "WORKFLOW_RECOVERING": "workflow.recovering"
}

CIRCUIT_BREAKER_CONFIG = {
    "failure_threshold": 5,
    "recovery_timeout": 30,
    "half_open_timeout": 15
}

class WorkflowStage(BaseModel):
    """Enhanced workflow stage with validation and monitoring."""
    
    stage_id: str = Field(..., description="Unique stage identifier")
    agent_id: str = Field(..., description="Agent ID for this stage")
    stage_config: Dict[str, Any] = Field(default_factory=dict)
    dependencies: List[str] = Field(default_factory=list)
    state: str = Field(default=WORKFLOW_STATES["PENDING"])
    security_context: Dict[str, Any] = Field(default_factory=dict)
    performance_metrics: Dict[str, Any] = Field(default_factory=dict)
    error_context: Dict[str, Any] = Field(default_factory=dict)

    @validator('state')
    def validate_state(cls, v):
        if v not in WORKFLOW_STATES.values():
            raise ValueError(f"Invalid state: {v}")
        return v

class WorkflowManager:
    """Enhanced workflow manager with enterprise features."""

    def __init__(
        self,
        event_bus: AgentEventBus,
        agent_service: AgentService,
        circuit_breaker: Optional[CircuitBreaker] = None
    ):
        """Initialize workflow manager with enterprise components."""
        self._event_bus = event_bus
        self._agent_service = agent_service
        self._dependency_graph = nx.DiGraph()
        self._active_workflows = {}
        self._workflow_cache = TTLCache(maxsize=1000, ttl=3600)
        
        # Initialize monitoring
        self._logger = StructuredLogger("workflow_manager")
        self._metrics = MetricsManager()
        
        # Initialize circuit breaker
        self._circuit_breaker = circuit_breaker or CircuitBreaker(**CIRCUIT_BREAKER_CONFIG)
        
        # Set up event subscriptions
        self._setup_event_handlers()

    def _setup_event_handlers(self):
        """Set up workflow event handlers."""
        self._event_bus.subscribe(WORKFLOW_EVENTS["STAGE_COMPLETED"], self._handle_stage_completion)
        self._event_bus.subscribe(WORKFLOW_EVENTS["STAGE_FAILED"], self._handle_stage_failure)

    @track_time("create_workflow")
    async def create_workflow(
        self,
        workflow_id: str,
        stages: List[WorkflowStage],
        workflow_config: Dict[str, Any],
        security_context: Dict[str, Any]
    ) -> Dict[str, Any]:
        """Create workflow with enhanced validation and security."""
        try:
            # Validate security context
            if not self._validate_security_context(security_context):
                raise ValueError("Invalid security context")

            # Build dependency graph
            self._build_dependency_graph(stages)
            
            # Validate graph for cycles
            if not nx.is_directed_acyclic_graph(self._dependency_graph):
                raise ValueError("Workflow contains circular dependencies")

            # Initialize workflow state
            workflow_state = {
                "id": workflow_id,
                "stages": {stage.stage_id: stage.dict() for stage in stages},
                "config": workflow_config,
                "security_context": security_context,
                "state": WORKFLOW_STATES["PENDING"],
                "created_at": datetime.utcnow().isoformat(),
                "metrics": {
                    "start_time": None,
                    "end_time": None,
                    "duration": None,
                    "failed_stages": 0
                }
            }

            # Store workflow state
            self._active_workflows[workflow_id] = workflow_state
            self._workflow_cache[workflow_id] = workflow_state

            self._logger.log("info", f"Created workflow {workflow_id}")
            return workflow_state

        except Exception as e:
            self._logger.log("error", f"Workflow creation failed: {str(e)}")
            self._metrics.track_performance("workflow_creation_error", 1)
            raise

    @track_time("execute_workflow")
    async def execute_workflow(self, workflow_id: str) -> Dict[str, Any]:
        """Execute workflow with enhanced reliability and monitoring."""
        try:
            workflow = self._active_workflows.get(workflow_id)
            if not workflow:
                raise ValueError(f"Workflow {workflow_id} not found")

            # Update workflow state
            workflow["state"] = WORKFLOW_STATES["RUNNING"]
            workflow["metrics"]["start_time"] = datetime.utcnow().isoformat()

            # Get execution order
            execution_order = list(nx.topological_sort(self._dependency_graph))

            # Execute stages in order
            for stage_id in execution_order:
                stage = workflow["stages"][stage_id]
                
                try:
                    # Execute stage with circuit breaker
                    async with self._circuit_breaker:
                        await self._execute_stage(stage, workflow["security_context"])
                        
                    # Update stage state
                    stage["state"] = WORKFLOW_STATES["COMPLETED"]
                    
                except Exception as e:
                    stage["state"] = WORKFLOW_STATES["FAILED"]
                    stage["error_context"] = {"error": str(e), "timestamp": datetime.utcnow().isoformat()}
                    workflow["metrics"]["failed_stages"] += 1
                    
                    # Publish failure event
                    await self._event_bus.publish_event(
                        WORKFLOW_EVENTS["STAGE_FAILED"],
                        {"workflow_id": workflow_id, "stage_id": stage_id, "error": str(e)}
                    )
                    
                    raise

            # Update workflow completion
            workflow["state"] = WORKFLOW_STATES["COMPLETED"]
            workflow["metrics"]["end_time"] = datetime.utcnow().isoformat()
            workflow["metrics"]["duration"] = (
                datetime.fromisoformat(workflow["metrics"]["end_time"]) -
                datetime.fromisoformat(workflow["metrics"]["start_time"])
            ).total_seconds()

            # Publish completion event
            await self._event_bus.publish_event(
                WORKFLOW_EVENTS["WORKFLOW_COMPLETED"],
                {"workflow_id": workflow_id, "metrics": workflow["metrics"]}
            )

            return workflow

        except Exception as e:
            self._logger.log("error", f"Workflow execution failed: {str(e)}")
            self._metrics.track_performance("workflow_execution_error", 1)
            
            # Update workflow state
            workflow["state"] = WORKFLOW_STATES["FAILED"]
            workflow["error_context"] = {"error": str(e), "timestamp": datetime.utcnow().isoformat()}
            
            # Publish failure event
            await self._event_bus.publish_event(
                WORKFLOW_EVENTS["WORKFLOW_FAILED"],
                {"workflow_id": workflow_id, "error": str(e)}
            )
            
            raise

    async def _execute_stage(self, stage: Dict[str, Any], security_context: Dict[str, Any]):
        """Execute individual workflow stage with monitoring."""
        try:
            # Get agent for stage
            agent = await self._agent_service.get_agent(
                UUID(stage["agent_id"]),
                security_context
            )
            if not agent:
                raise ValueError(f"Agent {stage['agent_id']} not found")

            # Execute agent with stage configuration
            start_time = datetime.utcnow()
            await self._agent_service.execute_agent(
                agent["id"],
                stage["stage_config"],
                security_context
            )

            # Update stage metrics
            stage["performance_metrics"].update({
                "execution_time": (datetime.utcnow() - start_time).total_seconds(),
                "status": "success"
            })

        except Exception as e:
            stage["performance_metrics"].update({
                "status": "failed",
                "error": str(e)
            })
            raise

    def _build_dependency_graph(self, stages: List[WorkflowStage]):
        """Build workflow dependency graph with validation."""
        self._dependency_graph.clear()
        
        # Add all stages
        for stage in stages:
            self._dependency_graph.add_node(stage.stage_id)
            
        # Add dependencies
        for stage in stages:
            for dep in stage.dependencies:
                if dep not in self._dependency_graph:
                    raise ValueError(f"Invalid dependency {dep} for stage {stage.stage_id}")
                self._dependency_graph.add_edge(dep, stage.stage_id)

    def _validate_security_context(self, security_context: Dict[str, Any]) -> bool:
        """Validate workflow security context."""
        required_fields = {"user_id", "permissions", "access_level"}
        return all(field in security_context for field in required_fields)

    async def _handle_stage_completion(self, event: Dict[str, Any]):
        """Handle stage completion events."""
        workflow_id = event["workflow_id"]
        stage_id = event["stage_id"]
        
        workflow = self._active_workflows.get(workflow_id)
        if workflow:
            workflow["stages"][stage_id]["state"] = WORKFLOW_STATES["COMPLETED"]

    async def _handle_stage_failure(self, event: Dict[str, Any]):
        """Handle stage failure events."""
        workflow_id = event["workflow_id"]
        stage_id = event["stage_id"]
        error = event["error"]
        
        workflow = self._active_workflows.get(workflow_id)
        if workflow:
            workflow["stages"][stage_id]["state"] = WORKFLOW_STATES["FAILED"]
            workflow["stages"][stage_id]["error_context"] = {
                "error": error,
                "timestamp": datetime.utcnow().isoformat()
            }