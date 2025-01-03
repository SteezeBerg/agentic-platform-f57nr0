"""
Enterprise-grade event bus implementation for agent orchestration.
Provides robust event-driven communication between agents, workflows, and system components
using AWS EventBridge with enhanced reliability, monitoring, and security features.
Version: 1.0.0
"""

import asyncio
from datetime import datetime
from typing import Dict, Optional, List, Any
from functools import wraps

# Third-party imports with versions
import backoff  # ^2.2.1
from pydantic import BaseModel, Field  # ^2.0.0

# Internal imports
from ...integrations.aws.eventbridge import EventBridgeClient
from ...utils.logging import StructuredLogger
from ...utils.metrics import MetricsManager, track_time

# Initialize logging and metrics
logger = StructuredLogger('event_bus')
metrics = MetricsManager('event_bus')

# Event type constants
EVENT_TYPES = {
    "AGENT_REGISTERED": "agent.registered",
    "AGENT_STARTED": "agent.started",
    "AGENT_COMPLETED": "agent.completed",
    "AGENT_FAILED": "agent.failed",
    "WORKFLOW_EVENT": "workflow.event",
    "KNOWLEDGE_UPDATED": "knowledge.updated"
}

# Configuration constants
MAX_RETRY_ATTEMPTS = 3
BATCH_SIZE = 10
EVENT_TIMEOUT = 5.0

class EventPayload(BaseModel):
    """Pydantic model for validating event payloads."""
    event_type: str = Field(..., description="Type of the event")
    data: Dict[str, Any] = Field(..., description="Event payload data")
    correlation_id: str = Field(..., description="Unique correlation identifier")
    timestamp: float = Field(default_factory=lambda: datetime.now().timestamp())

    class Config:
        frozen = True
        json_schema_extra = {
            "example": {
                "event_type": "agent.started",
                "data": {"agent_id": "123", "config": {}},
                "correlation_id": "corr-123",
                "timestamp": 1677721600.0
            }
        }

class AgentEventBus:
    """Enhanced event bus class with enterprise-grade reliability and monitoring."""

    def __init__(self, bus_name: str, batch_size: int = BATCH_SIZE, batch_timeout: float = EVENT_TIMEOUT):
        """Initialize the event bus with monitoring and batching capabilities."""
        self._event_bridge = EventBridgeClient(bus_name=bus_name)
        self._subscribers: Dict[str, List[callable]] = {}
        self._event_rules: Dict[str, str] = {}
        self._event_batches: Dict[str, List[EventPayload]] = {}
        self._batch_lock = asyncio.Lock()
        
        # Configure batch processing
        self.batch_size = batch_size
        self.batch_timeout = batch_timeout
        
        # Start background batch processor
        asyncio.create_task(self._process_batch_queue())

    @track_time('event_bus_publish')
    @backoff.on_exception(
        backoff.expo,
        Exception,
        max_tries=MAX_RETRY_ATTEMPTS
    )
    async def publish_event(self, event_type: str, event_data: Dict[str, Any], 
                          batch: bool = False) -> Dict[str, Any]:
        """
        Publish an event with retry and monitoring capabilities.
        
        Args:
            event_type: Type of event to publish
            event_data: Event payload data
            batch: Whether to batch the event
            
        Returns:
            Dict containing event publishing status and ID
        """
        try:
            # Validate event type
            if event_type not in EVENT_TYPES.values():
                raise ValueError(f"Invalid event type: {event_type}")

            # Create and validate event payload
            event = EventPayload(
                event_type=event_type,
                data=event_data,
                correlation_id=event_data.get('correlation_id', f"corr-{datetime.now().timestamp()}")
            )

            # Track start time for latency monitoring
            start_time = datetime.now()

            if batch:
                async with self._batch_lock:
                    if event_type not in self._event_batches:
                        self._event_batches[event_type] = []
                    self._event_batches[event_type].append(event)
                    
                    if len(self._event_batches[event_type]) >= self.batch_size:
                        await self._flush_batch(event_type)
                
                result = {'status': 'batched', 'batch_size': len(self._event_batches[event_type])}
            else:
                # Send event through EventBridge
                result = await self._event_bridge.send_event(
                    source="agent-builder-hub",
                    detail_type=event_type,
                    detail=event.dict()
                )

            # Record metrics
            metrics.track_performance(
                'event_publish_latency',
                (datetime.now() - start_time).total_seconds() * 1000,
                {'event_type': event_type}
            )

            logger.log('info', f"Successfully published event: {event_type}", 
                      {'correlation_id': event.correlation_id})
            
            return result

        except Exception as e:
            logger.log('error', f"Failed to publish event: {str(e)}")
            metrics.track_performance('event_publish_error', 1, 
                                   {'event_type': event_type, 'error': str(e)})
            raise

    async def subscribe(self, event_type: str, handler: callable) -> None:
        """
        Subscribe to events with handler registration.
        
        Args:
            event_type: Type of event to subscribe to
            handler: Callback handler for events
        """
        if event_type not in EVENT_TYPES.values():
            raise ValueError(f"Invalid event type: {event_type}")

        if event_type not in self._subscribers:
            self._subscribers[event_type] = []
            
            # Create EventBridge rule for the subscription
            rule_name = f"agent-event-{event_type.replace('.', '-')}"
            await self._event_bridge.create_rule(
                rule_name=rule_name,
                event_pattern={"detail-type": [event_type]},
                targets=[{
                    "Id": f"agent-target-{event_type}",
                    "Arn": "LAMBDA_FUNCTION_ARN",  # Replace with actual Lambda ARN
                }]
            )
            self._event_rules[event_type] = rule_name

        self._subscribers[event_type].append(handler)
        logger.log('info', f"Subscribed handler to event type: {event_type}")

    async def unsubscribe(self, event_type: str, handler: callable) -> None:
        """
        Unsubscribe from events with cleanup.
        
        Args:
            event_type: Type of event to unsubscribe from
            handler: Handler to remove
        """
        if event_type in self._subscribers:
            self._subscribers[event_type].remove(handler)
            
            if not self._subscribers[event_type]:
                # Remove EventBridge rule if no subscribers left
                rule_name = self._event_rules.pop(event_type)
                await self._event_bridge.delete_rule(rule_name, force=True)
                
            logger.log('info', f"Unsubscribed handler from event type: {event_type}")

    async def _process_batch_queue(self) -> None:
        """Background task for processing event batches."""
        while True:
            try:
                async with self._batch_lock:
                    for event_type, events in self._event_batches.items():
                        if events and (
                            len(events) >= self.batch_size or 
                            (datetime.now().timestamp() - events[0].timestamp) >= self.batch_timeout
                        ):
                            await self._flush_batch(event_type)
                
                await asyncio.sleep(1)  # Prevent tight loop
                
            except Exception as e:
                logger.log('error', f"Error in batch processing: {str(e)}")
                metrics.track_performance('batch_processing_error', 1)

    async def _flush_batch(self, event_type: str) -> None:
        """Flush a batch of events to EventBridge."""
        if not self._event_batches.get(event_type):
            return

        try:
            events = self._event_batches[event_type]
            self._event_batches[event_type] = []

            # Send batch through EventBridge
            await self._event_bridge.batch_send_events(
                source="agent-builder-hub",
                entries=[{
                    'detail-type': event_type,
                    'detail': event.dict()
                } for event in events]
            )

            metrics.track_performance('batch_flush_size', len(events), 
                                   {'event_type': event_type})
            logger.log('info', f"Flushed batch of {len(events)} events for {event_type}")

        except Exception as e:
            logger.log('error', f"Failed to flush batch: {str(e)}")
            metrics.track_performance('batch_flush_error', 1, 
                                   {'event_type': event_type})
            raise

# Export constants and classes
__all__ = ['AgentEventBus', 'EVENT_TYPES', 'EventPayload']