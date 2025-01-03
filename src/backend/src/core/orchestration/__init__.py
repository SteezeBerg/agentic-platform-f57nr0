"""
Main entry point for the Agent Builder Hub's orchestration module.
Provides centralized access to event bus, workflow management, and agent coordination capabilities.
Version: 1.0.0
"""

from typing import Dict, Optional, Any
import structlog
import tenacity
from prometheus_client import Counter, Gauge, Histogram

from .event_bus import AgentEventBus, publish_event, subscribe
from .workflow import WorkflowManager
from .coordinator import AgentCoordinator

# Global metrics
METRICS = {
    'orchestration_init': Counter(
        'orchestration_initialization_total',
        'Total orchestration initialization attempts',
        ['status']
    ),
    'component_health': Gauge(
        'orchestration_component_health',
        'Health status of orchestration components',
        ['component']
    ),
    'initialization_time': Histogram(
        'orchestration_initialization_seconds',
        'Time taken to initialize orchestration components'
    )
}

# Default retry configuration
RETRY_CONFIG = {
    "max_attempts": 3,
    "delay": 1
}

# Default event bus name
DEFAULT_EVENT_BUS = 'agent-builder-hub'

# Metrics namespace
METRICS_NAMESPACE = 'orchestration'

@tenacity.retry(
    stop=tenacity.stop_after_attempt(RETRY_CONFIG["max_attempts"]),
    wait=tenacity.wait_exponential(multiplier=RETRY_CONFIG["delay"])
)
def initialize_orchestration(config: Dict[str, Any]) -> bool:
    """
    Initialize and validate all orchestration components with security and monitoring.
    
    Args:
        config: Configuration dictionary for orchestration components
        
    Returns:
        bool: Success status of initialization
        
    Raises:
        ValueError: If configuration is invalid
        RuntimeError: If component initialization fails
    """
    logger = structlog.get_logger()
    
    try:
        # Track initialization attempt
        METRICS['orchestration_init'].labels(status='started').inc()
        
        # Initialize event bus
        event_bus = AgentEventBus(
            bus_name=config.get('event_bus_name', DEFAULT_EVENT_BUS),
            batch_size=config.get('batch_size', 100),
            batch_timeout=config.get('batch_timeout', 5.0)
        )
        METRICS['component_health'].labels(component='event_bus').set(1)
        
        # Initialize workflow manager
        workflow_manager = WorkflowManager(
            event_bus=event_bus,
            agent_service=config['agent_service'],
            circuit_breaker=config.get('circuit_breaker')
        )
        METRICS['component_health'].labels(component='workflow_manager').set(1)
        
        # Initialize agent coordinator
        coordinator = AgentCoordinator(
            event_bus=event_bus,
            workflow_manager=workflow_manager,
            agent_service=config['agent_service']
        )
        METRICS['component_health'].labels(component='coordinator').set(1)
        
        # Start coordinator
        if not coordinator.start():
            raise RuntimeError("Failed to start coordinator")
            
        logger.info(
            "Orchestration initialized successfully",
            event_bus=event_bus.bus_name,
            components=["event_bus", "workflow_manager", "coordinator"]
        )
        
        # Track successful initialization
        METRICS['orchestration_init'].labels(status='success').inc()
        
        return True
        
    except Exception as e:
        # Track failed initialization
        METRICS['orchestration_init'].labels(status='error').inc()
        METRICS['component_health'].labels(component='orchestration').set(0)
        
        logger.error(
            "Failed to initialize orchestration",
            error=str(e),
            config=config
        )
        raise RuntimeError(f"Orchestration initialization failed: {str(e)}")

# Export public interfaces
__all__ = [
    'AgentEventBus',
    'WorkflowManager', 
    'AgentCoordinator',
    'initialize_orchestration',
    'publish_event',
    'subscribe'
]