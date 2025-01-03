"""
AWS CloudWatch integration module providing comprehensive observability, security monitoring,
and performance tracking capabilities with enhanced security context and structured logging.
Version: 1.0.0
"""

from dataclasses import dataclass, field
from datetime import datetime, timedelta
from typing import Dict, List, Optional, Union
import json

# Third-party imports with versions
import boto3  # ^1.28.0

# Internal imports
from ..config.aws import get_client
from ..utils.logging import StructuredLogger

# Global constants
DEFAULT_NAMESPACE = 'AgentBuilderHub'
METRIC_DIMENSIONS = [
    {'Name': 'Service', 'Value': 'AgentBuilder'},
    {'Name': 'Environment', 'Value': 'Production'}
]
MAX_METRICS_PER_REQUEST = 20
DEFAULT_RETENTION_DAYS = 90
SECURITY_METRICS_NAMESPACE = 'AgentBuilderHub/Security'

@dataclass
class CloudWatchMetrics:
    """Enhanced CloudWatch metrics manager with security context and optimized batching."""
    
    namespace: str
    dimensions: List[Dict[str, str]]
    security_context: Dict = field(default_factory=dict)
    _client: boto3.client = field(init=False)
    _logger: StructuredLogger = field(init=False)
    _metric_cache: Dict = field(default_factory=dict)

    def __post_init__(self):
        """Initialize CloudWatch client and logger with security context."""
        self._client = get_client('cloudwatch')
        self._logger = StructuredLogger('cloudwatch', {
            'log_level': 'INFO',
            'service': 'CloudWatch',
            'security_context': self.security_context
        })
        self._logger.set_trace_id(
            self.security_context.get('trace_id', 'system-generated'),
            self.security_context.get('correlation_id')
        )

    def put_metric(self, metric_name: str, value: float, unit: str,
                  security_context: Optional[Dict] = None) -> Dict:
        """
        Publishes a single metric with enhanced security context and validation.
        
        Args:
            metric_name: Name of the metric
            value: Metric value
            unit: Metric unit
            security_context: Optional security context override
        
        Returns:
            Dict containing API response with audit details
        """
        try:
            # Validate inputs
            if not metric_name or not isinstance(value, (int, float)):
                raise ValueError("Invalid metric parameters")

            # Merge security contexts
            current_context = {**self.security_context, **(security_context or {})}
            
            # Create metric data with security context
            metric_data = {
                'MetricName': metric_name,
                'Value': value,
                'Unit': unit,
                'Timestamp': datetime.utcnow(),
                'Dimensions': self.dimensions + [
                    {'Name': 'SecurityContext', 'Value': json.dumps(current_context)}
                ]
            }

            # Put metric with retry logic
            response = self._client.put_metric_data(
                Namespace=self.namespace,
                MetricData=[metric_data]
            )

            # Log successful metric submission
            self._logger.log(
                'info',
                f"Successfully published metric: {metric_name}",
                extra={
                    'metric_name': metric_name,
                    'value': value,
                    'unit': unit,
                    'security_context': current_context
                }
            )

            return {
                'status': 'success',
                'metric': metric_data,
                'response': response,
                'timestamp': datetime.utcnow().isoformat()
            }

        except Exception as e:
            self._logger.log(
                'error',
                f"Error publishing metric: {str(e)}",
                extra={
                    'metric_name': metric_name,
                    'error': str(e)
                }
            )
            raise

    def put_metrics_batch(self, metrics: List[Dict], security_context: Optional[Dict] = None) -> Dict:
        """
        Publishes multiple metrics with optimized batching and security validation.
        
        Args:
            metrics: List of metric dictionaries
            security_context: Optional security context override
        
        Returns:
            Dict containing batch operation results
        """
        try:
            # Validate batch inputs
            if not metrics:
                raise ValueError("Empty metrics batch")

            # Merge security contexts
            current_context = {**self.security_context, **(security_context or {})}

            # Process metrics in optimized batches
            results = []
            for i in range(0, len(metrics), MAX_METRICS_PER_REQUEST):
                batch = metrics[i:i + MAX_METRICS_PER_REQUEST]
                
                # Enhance metrics with security context
                metric_data = [{
                    **metric,
                    'Timestamp': datetime.utcnow(),
                    'Dimensions': self.dimensions + [
                        {'Name': 'SecurityContext', 'Value': json.dumps(current_context)}
                    ]
                } for metric in batch]

                # Put batch with retry logic
                response = self._client.put_metric_data(
                    Namespace=self.namespace,
                    MetricData=metric_data
                )
                results.append(response)

            # Log successful batch operation
            self._logger.log(
                'info',
                f"Successfully published metrics batch of {len(metrics)} items",
                extra={
                    'batch_size': len(metrics),
                    'security_context': current_context
                }
            )

            return {
                'status': 'success',
                'metrics_processed': len(metrics),
                'batch_results': results,
                'timestamp': datetime.utcnow().isoformat()
            }

        except Exception as e:
            self._logger.log(
                'error',
                f"Error publishing metrics batch: {str(e)}",
                extra={
                    'batch_size': len(metrics),
                    'error': str(e)
                }
            )
            raise

    def get_metric_statistics(self, metric_name: str, start_time: datetime,
                            end_time: datetime, period: int,
                            security_context: Optional[Dict] = None) -> Dict:
        """
        Retrieves metric statistics with enhanced security context and caching.
        
        Args:
            metric_name: Name of the metric
            start_time: Start time for statistics
            end_time: End time for statistics
            period: Statistics period in seconds
            security_context: Optional security context override
        
        Returns:
            Dict containing metric statistics with security metadata
        """
        try:
            # Validate time range
            if start_time >= end_time:
                raise ValueError("Invalid time range")

            # Merge security contexts
            current_context = {**self.security_context, **(security_context or {})}

            # Check cache for recent data
            cache_key = f"{metric_name}_{start_time.isoformat()}_{end_time.isoformat()}_{period}"
            if cache_key in self._metric_cache:
                return self._metric_cache[cache_key]

            # Get statistics with security context
            response = self._client.get_metric_statistics(
                Namespace=self.namespace,
                MetricName=metric_name,
                Dimensions=self.dimensions + [
                    {'Name': 'SecurityContext', 'Value': json.dumps(current_context)}
                ],
                StartTime=start_time,
                EndTime=end_time,
                Period=period,
                Statistics=['Average', 'Maximum', 'Minimum', 'SampleCount', 'Sum']
            )

            # Process and cache results
            result = {
                'status': 'success',
                'metric_name': metric_name,
                'statistics': response['Datapoints'],
                'period': period,
                'security_context': current_context,
                'timestamp': datetime.utcnow().isoformat()
            }
            self._metric_cache[cache_key] = result

            # Log successful retrieval
            self._logger.log(
                'info',
                f"Successfully retrieved statistics for metric: {metric_name}",
                extra={
                    'metric_name': metric_name,
                    'datapoints': len(response['Datapoints']),
                    'security_context': current_context
                }
            )

            return result

        except Exception as e:
            self._logger.log(
                'error',
                f"Error retrieving metric statistics: {str(e)}",
                extra={
                    'metric_name': metric_name,
                    'error': str(e)
                }
            )
            raise

def create_log_group(log_group_name: str, security_context: Dict,
                    retention_days: int = DEFAULT_RETENTION_DAYS) -> Dict:
    """
    Creates a CloudWatch log group with enhanced security and retention settings.
    
    Args:
        log_group_name: Name of the log group
        security_context: Security context for the operation
        retention_days: Log retention period in days
    
    Returns:
        Dict containing log group creation response
    """
    try:
        client = get_client('cloudwatch')
        logger = StructuredLogger('cloudwatch', {
            'service': 'CloudWatch',
            'security_context': security_context
        })

        # Create log group with security tags
        response = client.create_log_group(
            logGroupName=log_group_name,
            tags={
                'SecurityContext': json.dumps(security_context),
                'Environment': security_context.get('environment', 'production'),
                'Service': 'AgentBuilderHub'
            }
        )

        # Set retention policy
        client.put_retention_policy(
            logGroupName=log_group_name,
            retentionInDays=retention_days
        )

        logger.log(
            'info',
            f"Successfully created log group: {log_group_name}",
            extra={
                'log_group': log_group_name,
                'retention_days': retention_days,
                'security_context': security_context
            }
        )

        return {
            'status': 'success',
            'log_group_name': log_group_name,
            'retention_days': retention_days,
            'security_context': security_context,
            'timestamp': datetime.utcnow().isoformat()
        }

    except Exception as e:
        logger.log(
            'error',
            f"Error creating log group: {str(e)}",
            extra={
                'log_group': log_group_name,
                'error': str(e)
            }
        )
        raise

def create_metric_alarm(alarm_name: str, metric_name: str, threshold: float,
                       comparison_operator: str, security_context: Dict) -> Dict:
    """
    Creates an enhanced CloudWatch metric alarm with security integration.
    
    Args:
        alarm_name: Name of the alarm
        metric_name: Name of the metric to monitor
        threshold: Alarm threshold value
        comparison_operator: Comparison operator for threshold
        security_context: Security context for the operation
    
    Returns:
        Dict containing alarm configuration response
    """
    try:
        client = get_client('cloudwatch')
        logger = StructuredLogger('cloudwatch', {
            'service': 'CloudWatch',
            'security_context': security_context
        })

        # Create alarm with security context
        response = client.put_metric_alarm(
            AlarmName=alarm_name,
            MetricName=metric_name,
            Namespace=DEFAULT_NAMESPACE,
            Dimensions=METRIC_DIMENSIONS + [
                {'Name': 'SecurityContext', 'Value': json.dumps(security_context)}
            ],
            Statistic='Average',
            Period=60,
            EvaluationPeriods=2,
            Threshold=threshold,
            ComparisonOperator=comparison_operator,
            AlarmActions=[
                f"arn:aws:sns:{security_context.get('region', 'us-west-2')}:"
                f"{security_context.get('account_id')}:alerts-topic"
            ],
            Tags={
                'SecurityContext': json.dumps(security_context),
                'Environment': security_context.get('environment', 'production'),
                'Service': 'AgentBuilderHub'
            }
        )

        logger.log(
            'info',
            f"Successfully created metric alarm: {alarm_name}",
            extra={
                'alarm_name': alarm_name,
                'metric_name': metric_name,
                'threshold': threshold,
                'security_context': security_context
            }
        )

        return {
            'status': 'success',
            'alarm_name': alarm_name,
            'metric_name': metric_name,
            'threshold': threshold,
            'security_context': security_context,
            'timestamp': datetime.utcnow().isoformat()
        }

    except Exception as e:
        logger.log(
            'error',
            f"Error creating metric alarm: {str(e)}",
            extra={
                'alarm_name': alarm_name,
                'error': str(e)
            }
        )
        raise