import pytest
import asyncio
from datetime import datetime
from uuid import UUID
from unittest.mock import Mock, AsyncMock, patch

from src.core.orchestration.event_bus import AgentEventBus
from src.core.orchestration.workflow import WorkflowManager
from src.core.orchestration.coordinator import AgentCoordinator

# Constants for testing
TEST_CIRCUIT_BREAKER_THRESHOLD = 0.75
TEST_MAX_RETRY_ATTEMPTS = 3
TEST_RESOURCE_LIMIT_MB = 1024
TEST_SECURITY_TOKEN_TIMEOUT = 300

class MockMetricsCollector:
    """Mock metrics collector for testing monitoring functionality"""
    
    def __init__(self):
        self.collected_metrics = {}
        self.performance_data = []
        self.resource_usage = {}

    def collect_metrics(self, metric_data: dict):
        """Collects system metrics"""
        self.collected_metrics.update(metric_data)

@pytest.mark.asyncio
async def test_event_bus_reliability(event_loop):
    """Tests event bus reliability features including circuit breaker and monitoring"""
    
    # Initialize components
    metrics_collector = MockMetricsCollector()
    event_bus = AgentEventBus(
        bus_name="test-bus",
        metrics_collector=metrics_collector
    )
    
    # Enable circuit breaker and monitoring
    event_bus.enable_circuit_breaker(threshold=TEST_CIRCUIT_BREAKER_THRESHOLD)
    
    # Test event publishing with monitoring
    test_event = {
        "event_type": "test.event",
        "data": {"test": "data"},
        "correlation_id": "test-123"
    }
    
    # Test successful event publishing
    publish_result = await event_bus.publish_event(
        event_type=test_event["event_type"],
        event_data=test_event["data"]
    )
    assert publish_result["status"] == "success"
    
    # Verify metrics collection
    metrics = event_bus.get_metrics()
    assert "event_publish_latency" in metrics
    assert metrics["success_count"] > 0
    
    # Test circuit breaker activation
    for _ in range(TEST_MAX_RETRY_ATTEMPTS + 1):
        try:
            await event_bus.publish_event(
                event_type="error.event",
                event_data={"error": "test"}
            )
        except Exception:
            continue
            
    assert event_bus._circuit_breaker.is_open()
    
    # Test subscription handling
    received_events = []
    
    async def test_handler(event):
        received_events.append(event)
        
    await event_bus.subscribe("test.event", test_handler)
    await event_bus.publish_event(
        event_type="test.event",
        event_data={"test": "subscription"}
    )
    
    assert len(received_events) == 1
    assert received_events[0]["data"]["test"] == "subscription"

@pytest.mark.asyncio
async def test_workflow_resource_management(event_loop):
    """Tests workflow resource allocation and monitoring"""
    
    # Initialize components
    metrics_collector = MockMetricsCollector()
    workflow_manager = WorkflowManager(
        event_bus=Mock(),
        agent_service=Mock(),
        metrics_collector=metrics_collector
    )
    
    # Create test workflow
    workflow_config = {
        "id": "test-workflow",
        "stages": [
            {
                "stage_id": "stage1",
                "agent_id": str(UUID(int=1)),
                "resource_requirements": {
                    "memory_mb": 512,
                    "cpu_units": 1.0
                }
            }
        ]
    }
    
    # Test resource allocation
    workflow = await workflow_manager.create_workflow(
        workflow_id=workflow_config["id"],
        stages=workflow_config["stages"],
        workflow_config={"max_memory_mb": TEST_RESOURCE_LIMIT_MB}
    )
    
    assert workflow["id"] == workflow_config["id"]
    
    # Verify resource validation
    resource_valid = await workflow_manager.validate_resource_allocation(
        workflow["id"],
        {"memory_mb": TEST_RESOURCE_LIMIT_MB + 1}
    )
    assert not resource_valid
    
    # Test workflow execution with resource monitoring
    execution_result = await workflow_manager.execute_workflow(workflow["id"])
    assert execution_result["status"] == "completed"
    
    # Verify metrics
    metrics = workflow_manager.get_workflow_metrics(workflow["id"])
    assert "resource_usage" in metrics
    assert metrics["memory_usage_mb"] <= TEST_RESOURCE_LIMIT_MB

@pytest.mark.asyncio
async def test_coordinator_security(event_loop):
    """Tests coordinator security features and monitoring"""
    
    # Initialize components with mocks
    event_bus = Mock(spec=AgentEventBus)
    workflow_manager = Mock(spec=WorkflowManager)
    agent_service = AsyncMock()
    
    coordinator = AgentCoordinator(
        event_bus=event_bus,
        workflow_manager=workflow_manager,
        agent_service=agent_service
    )
    
    # Test agent registration with security validation
    test_agent = {
        "id": str(UUID(int=1)),
        "type": "streamlit",
        "security_config": {
            "access_token": "test-token",
            "permissions": ["execute_workflow"]
        }
    }
    
    # Verify security validation
    security_result = await coordinator.validate_security(test_agent)
    assert security_result["valid"]
    
    # Test unauthorized access
    invalid_agent = {
        "id": str(UUID(int=2)),
        "security_config": {
            "access_token": "invalid-token"
        }
    }
    
    with pytest.raises(ValueError):
        await coordinator.register_agent(
            agent_id=invalid_agent["id"],
            agent_config=invalid_agent
        )
    
    # Test security event handling
    await coordinator.start()
    
    security_event = {
        "event_type": "security.violation",
        "agent_id": test_agent["id"],
        "violation_type": "unauthorized_access"
    }
    
    # Verify security metrics
    health_status = await coordinator.check_health()
    assert "security_status" in health_status
    assert health_status["security_violations"] == 0