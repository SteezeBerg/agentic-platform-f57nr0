"""
AWS EventBridge integration module providing enterprise-grade event bus functionality.
Implements comprehensive event management with monitoring, error handling, and retry mechanisms.
Version: 1.0.0
"""

import json
import asyncio
from typing import Dict, Optional, List, Any, Union
from datetime import datetime

# Third-party imports with versions
import boto3  # ^1.28.0
import botocore  # ^1.31.0
import backoff  # ^2.2.1
from botocore.exceptions import ClientError, BotoCoreError

# Internal imports
from ...config.aws import get_client
from ...utils.logging import StructuredLogger
from ...utils.metrics import MetricsManager, track_time

# Initialize structured logger
logger = StructuredLogger('eventbridge')

# Constants
DEFAULT_EVENT_BUS = 'agent-builder-hub'
DEFAULT_RETRY_ATTEMPTS = 3
MAX_BATCH_SIZE = 10
RETRY_BASE_DELAY = 1.0
MAX_RETRY_DELAY = 30.0

class EventBridgeClient:
    """Enterprise-grade AWS EventBridge client with comprehensive monitoring and reliability features."""

    def __init__(self, 
                 bus_name: str = DEFAULT_EVENT_BUS,
                 config: Optional[Dict[str, Any]] = None,
                 retry_config: Optional[Dict[str, Any]] = None):
        """
        Initialize EventBridge client with advanced configuration.

        Args:
            bus_name: Name of the event bus
            config: AWS client configuration
            retry_config: Retry mechanism configuration
        """
        self._client = get_client('events', config)
        self._bus_name = self._validate_bus_name(bus_name)
        self._metrics = MetricsManager(namespace='AgentBuilderHub/EventBridge')
        
        # Configure retry mechanism
        self._retry_config = {
            'max_attempts': retry_config.get('max_attempts', DEFAULT_RETRY_ATTEMPTS),
            'base_delay': retry_config.get('base_delay', RETRY_BASE_DELAY),
            'max_delay': retry_config.get('max_delay', MAX_RETRY_DELAY)
        }

        # Validate client setup
        self._validate_client_setup()

    def _validate_bus_name(self, bus_name: str) -> str:
        """Validate event bus name and permissions."""
        if not bus_name:
            raise ValueError("Event bus name cannot be empty")
        
        try:
            self._client.describe_event_bus(Name=bus_name)
            logger.log('info', f"Successfully validated event bus: {bus_name}")
            return bus_name
        except ClientError as e:
            logger.error(f"Failed to validate event bus {bus_name}: {str(e)}")
            raise

    def _validate_client_setup(self) -> None:
        """Validate AWS client configuration and permissions."""
        try:
            self._client.list_event_buses()
            logger.log('info', "EventBridge client setup validated successfully")
        except (ClientError, BotoCoreError) as e:
            logger.error(f"EventBridge client validation failed: {str(e)}")
            raise

    @backoff.on_exception(
        backoff.expo,
        (ClientError, BotoCoreError),
        max_tries=DEFAULT_RETRY_ATTEMPTS,
        max_time=30
    )
    @track_time('eventbridge_send_event')
    async def send_event(self,
                        source: str,
                        detail_type: str,
                        detail: Dict[str, Any],
                        track_performance: bool = True) -> Dict[str, Any]:
        """
        Send event to EventBridge with retry and monitoring.

        Args:
            source: Event source identifier
            detail_type: Type of the event detail
            detail: Event payload
            track_performance: Enable performance tracking

        Returns:
            Dict containing event publishing response and metrics
        """
        if not source or not detail_type:
            raise ValueError("Source and detail_type are required")

        start_time = datetime.now()
        
        try:
            event_entry = {
                'Source': source,
                'DetailType': detail_type,
                'Detail': json.dumps(detail),
                'EventBusName': self._bus_name
            }

            response = await asyncio.to_thread(
                self._client.put_events,
                Entries=[event_entry]
            )

            # Process response
            event_id = response['Entries'][0].get('EventId')
            if not event_id:
                raise Exception("Failed to get event ID from response")

            # Track metrics
            if track_performance:
                self._metrics.track_performance(
                    'event_publish',
                    (datetime.now() - start_time).total_seconds() * 1000,
                    {
                        'source': source,
                        'detail_type': detail_type,
                        'status': 'success'
                    }
                )

            logger.log('info', f"Successfully published event {event_id}")
            return {
                'event_id': event_id,
                'status': 'success',
                'latency_ms': (datetime.now() - start_time).total_seconds() * 1000
            }

        except Exception as e:
            self._metrics.track_performance(
                'event_publish_error',
                1,
                {
                    'source': source,
                    'detail_type': detail_type,
                    'error_type': type(e).__name__
                }
            )
            logger.error(f"Failed to publish event: {str(e)}")
            raise

    @backoff.on_exception(
        backoff.expo,
        (ClientError, BotoCoreError),
        max_tries=DEFAULT_RETRY_ATTEMPTS
    )
    @track_time('eventbridge_create_rule')
    async def create_rule(self,
                         rule_name: str,
                         event_pattern: Dict[str, Any],
                         targets: List[Dict[str, Any]],
                         tags: Optional[Dict[str, str]] = None) -> Dict[str, Any]:
        """
        Create EventBridge rule with comprehensive validation.

        Args:
            rule_name: Name of the rule
            event_pattern: Event pattern for rule matching
            targets: List of rule targets
            tags: Optional resource tags

        Returns:
            Dict containing rule creation response and validation details
        """
        if not rule_name or not event_pattern or not targets:
            raise ValueError("Rule name, event pattern, and targets are required")

        try:
            # Create rule
            rule_params = {
                'Name': rule_name,
                'EventPattern': json.dumps(event_pattern),
                'EventBusName': self._bus_name,
                'State': 'ENABLED'
            }
            
            if tags:
                rule_params['Tags'] = [{'Key': k, 'Value': v} for k, v in tags.items()]

            rule_response = await asyncio.to_thread(
                self._client.put_rule,
                **rule_params
            )

            # Add targets
            targets_response = await asyncio.to_thread(
                self._client.put_targets,
                Rule=rule_name,
                EventBusName=self._bus_name,
                Targets=targets
            )

            # Validate target configuration
            failed_targets = targets_response.get('FailedEntries', [])
            if failed_targets:
                logger.warn(f"Some targets failed configuration: {failed_targets}")

            logger.log('info', f"Successfully created rule {rule_name}")
            return {
                'rule_arn': rule_response['RuleArn'],
                'status': 'success',
                'failed_targets': failed_targets
            }

        except Exception as e:
            self._metrics.track_performance(
                'rule_creation_error',
                1,
                {'rule_name': rule_name, 'error_type': type(e).__name__}
            )
            logger.error(f"Failed to create rule {rule_name}: {str(e)}")
            raise

    @backoff.on_exception(
        backoff.expo,
        (ClientError, BotoCoreError),
        max_tries=DEFAULT_RETRY_ATTEMPTS
    )
    @track_time('eventbridge_delete_rule')
    async def delete_rule(self,
                         rule_name: str,
                         force: bool = False) -> Dict[str, Any]:
        """
        Safely delete EventBridge rule with cleanup.

        Args:
            rule_name: Name of the rule to delete
            force: Force deletion even with active targets

        Returns:
            Dict containing deletion status and cleanup details
        """
        if not rule_name:
            raise ValueError("Rule name is required")

        try:
            # List targets
            targets_response = await asyncio.to_thread(
                self._client.list_targets_by_rule,
                Rule=rule_name,
                EventBusName=self._bus_name
            )

            targets = targets_response.get('Targets', [])
            
            # Remove targets if present
            if targets:
                if not force:
                    raise ValueError(f"Rule {rule_name} has active targets. Use force=True to delete")
                
                target_ids = [target['Id'] for target in targets]
                await asyncio.to_thread(
                    self._client.remove_targets,
                    Rule=rule_name,
                    EventBusName=self._bus_name,
                    Ids=target_ids
                )

            # Delete rule
            await asyncio.to_thread(
                self._client.delete_rule,
                Name=rule_name,
                EventBusName=self._bus_name,
                Force=force
            )

            logger.log('info', f"Successfully deleted rule {rule_name}")
            return {
                'status': 'success',
                'targets_removed': len(targets)
            }

        except Exception as e:
            self._metrics.track_performance(
                'rule_deletion_error',
                1,
                {'rule_name': rule_name, 'error_type': type(e).__name__}
            )
            logger.error(f"Failed to delete rule {rule_name}: {str(e)}")
            raise