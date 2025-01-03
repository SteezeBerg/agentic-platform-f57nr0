import pytest
import asyncio
from datetime import datetime
from uuid import UUID, uuid4

from src.core.orchestration.coordinator import AgentCoordinator, COORDINATION_EVENTS
from src.core.orchestration.event_bus import AgentEventBus
from src.core.orchestration.workflow import WorkflowManager, WorkflowStage, WORKFLOW_STATES
from src.services.agent_service import AgentService

class TestOrchestrationFixtures:
    """Enhanced pytest fixture class for orchestration testing."""

    @pytest.fixture
    async def event_bus(self):
        """Initialize event bus with monitoring."""
        bus = AgentEventBus(bus_name="test-event-bus")
        await bus.start()
        yield bus
        await bus.stop()

    @pytest.fixture
    async def workflow_manager(self, event_bus):
        """Initialize workflow manager with test configuration."""
        manager = WorkflowManager(
            event_bus=event_bus,
            agent_service=AgentService(),
            circuit_breaker=None  # Use default circuit breaker config
        )
        yield manager

    @pytest.fixture
    async def coordinator(self, event_bus, workflow_manager):
        """Initialize agent coordinator with test configuration."""
        coordinator = AgentCoordinator(
            event_bus=event_bus,
            workflow_manager=workflow_manager,
            agent_service=AgentService()
        )
        await coordinator.start()
        yield coordinator
        await coordinator.stop()

    @pytest.fixture
    def performance_metrics(self):
        """Initialize performance monitoring metrics."""
        return {
            "latency_threshold_ms": 1000,
            "error_rate_threshold": 0.05,
            "success_rate_threshold": 0.95
        }

    @pytest.fixture
    def security_context(self):
        """Initialize security context for testing."""
        return {
            "user_id": str(uuid4()),
            "permissions": ["agent:create", "agent:execute", "workflow:manage"],
            "access_level": "admin",
            "security_token": "test-token"
        }

@pytest.mark.asyncio
@pytest.mark.timeout(30)
async def test_coordinator_initialization(event_bus, workflow_manager, security_context):
    """Test coordinator initialization with security validation."""
    try:
        # Initialize coordinator
        coordinator = AgentCoordinator(
            event_bus=event_bus,
            workflow_manager=workflow_manager,
            agent_service=AgentService()
        )

        # Validate security context
        assert await coordinator.validate_security_context(security_context)

        # Start coordinator
        start_time = datetime.now()
        await coordinator.start()
        initialization_time = (datetime.now() - start_time).total_seconds() * 1000

        # Verify coordinator state
        assert coordinator._state == "running"
        assert initialization_time < 1000  # 1 second max initialization time

        # Verify event subscriptions
        assert COORDINATION_EVENTS["AGENT_REGISTERED"] in coordinator._event_bus._subscribers
        assert COORDINATION_EVENTS["WORKFLOW_COMPLETED"] in coordinator._event_bus._subscribers

        # Verify metrics collection
        assert coordinator._metrics is not None
        assert "coordinator_started" in coordinator._metrics._performance_metrics

    finally:
        await coordinator.stop()

@pytest.mark.asyncio
@pytest.mark.timeout(60)
async def test_workflow_execution_with_recovery(coordinator, security_context):
    """Test workflow execution with failure scenarios and recovery."""
    try:
        # Register test agents
        agent_configs = [
            {
                "id": str(uuid4()),
                "type": "test_agent",
                "config": {"test_param": "value1"}
            },
            {
                "id": str(uuid4()),
                "type": "test_agent",
                "config": {"test_param": "value2"}
            }
        ]

        for config in agent_configs:
            await coordinator.register_agent(
                config["id"],
                config,
                security_context=security_context
            )

        # Create workflow stages
        stages = [
            WorkflowStage(
                stage_id=str(uuid4()),
                agent_id=agent_configs[0]["id"],
                stage_config={"operation": "process"},
                dependencies=[]
            ),
            WorkflowStage(
                stage_id=str(uuid4()),
                agent_id=agent_configs[1]["id"],
                stage_config={"operation": "validate"},
                dependencies=[stages[0].stage_id]
            )
        ]

        # Create workflow
        workflow_id = str(uuid4())
        workflow = await coordinator._workflow_manager.create_workflow(
            workflow_id=workflow_id,
            stages=stages,
            workflow_config={
                "timeout": 30,
                "retry_attempts": 3,
                "error_threshold": 0.2
            },
            security_context=security_context
        )

        # Inject test failure
        def simulate_failure(*args, **kwargs):
            raise Exception("Simulated stage failure")

        coordinator._workflow_manager._execute_stage = simulate_failure

        # Execute workflow with failure handling
        start_time = datetime.now()
        try:
            await coordinator._workflow_manager.execute_workflow(workflow_id)
        except Exception:
            # Verify recovery mechanism
            assert workflow["state"] == WORKFLOW_STATES["RECOVERING"]
            await coordinator._workflow_manager.handle_stage_failure(
                workflow_id,
                stages[0].stage_id,
                error="Simulated failure"
            )

        # Verify execution time
        execution_time = (datetime.now() - start_time).total_seconds() * 1000
        assert execution_time < 5000  # 5 second max execution time

        # Verify metrics
        metrics = coordinator._metrics._performance_metrics
        assert "workflow_latency" in metrics
        assert "error_count" in metrics
        assert metrics["error_count"] > 0

        # Verify workflow state
        workflow = await coordinator._workflow_manager.get_workflow(workflow_id)
        assert workflow["metrics"]["failed_stages"] > 0
        assert "error_context" in workflow["stages"][stages[0].stage_id]

    finally:
        # Cleanup
        for config in agent_configs:
            await coordinator.deregister_agent(config["id"])