"""
Metrics Service for Agent Builder Hub.
Provides comprehensive metrics collection, analysis, and monitoring capabilities with CloudWatch integration.
Version: 1.0.0
"""

from datetime import datetime, timedelta
from typing import Dict, List, Optional, Union, Callable
from uuid import UUID

# Third-party imports
from datetime import datetime  # ^3.11+
from uuid import UUID  # ^3.11+
from typing import List, Dict, Optional, Union, Callable  # ^3.11+

# Internal imports
from integrations.aws.cloudwatch import CloudWatchMetrics
from schemas.metrics import AgentMetricsSchema, SystemMetricsSchema, MetricResponse, HealthMetricsSchema

# Global constants
METRIC_NAMESPACE = "AgentBuilderHub"
DEFAULT_PERIOD = 300  # 5 minutes
METRIC_UNITS = {
    'response_time': 'Seconds',
    'error_rate': 'Percent',
    'cpu_usage': 'Percent',
    'memory_usage': 'Percent',
    'api_latency': 'Milliseconds',
    'health_score': 'None'
}
BATCH_SIZE = 100
RETRY_ATTEMPTS = 3
SLA_THRESHOLDS = {
    'response_time': 0.1,  # 100ms
    'error_rate': 1.0,    # 1%
    'health_score': 0.95  # 95%
}

class MetricsService:
    """
    Enterprise-grade service for managing system-wide and agent-specific metrics with
    enhanced monitoring, predictive analysis, and SLA validation capabilities.
    """

    def __init__(self, 
                 custom_thresholds: Optional[Dict[str, float]] = None,
                 alert_handlers: Optional[Dict[str, Callable]] = None):
        """
        Initialize metrics service with customizable thresholds and alert handlers.

        Args:
            custom_thresholds: Optional override for default SLA thresholds
            alert_handlers: Optional custom alert handling functions
        """
        self._cloudwatch = CloudWatchMetrics(
            namespace=METRIC_NAMESPACE,
            dimensions=[{'Name': 'Service', 'Value': 'AgentBuilderHub'}]
        )
        self._metric_buffer = {'metrics': [], 'last_flush': datetime.utcnow()}
        self._sla_thresholds = {**SLA_THRESHOLDS, **(custom_thresholds or {})}
        self._alert_handlers = alert_handlers or {}
        self._metric_history = {}

    async def record_agent_metrics(self, metrics: AgentMetricsSchema) -> Dict:
        """
        Record and validate agent metrics with SLA checking and alerting.

        Args:
            metrics: Validated agent metrics schema

        Returns:
            Dict containing submission status and analysis
        """
        try:
            # Validate metrics against SLA thresholds
            self._validate_sla_compliance(metrics)

            # Prepare CloudWatch metrics
            metric_data = [
                {
                    'MetricName': 'agent_response_time',
                    'Value': metrics.response_time,
                    'Unit': METRIC_UNITS['response_time'],
                    'Dimensions': [
                        {'Name': 'AgentId', 'Value': str(metrics.agent_id)},
                        {'Name': 'Environment', 'Value': metrics.environment}
                    ]
                },
                {
                    'MetricName': 'agent_error_rate',
                    'Value': metrics.error_rate,
                    'Unit': METRIC_UNITS['error_rate'],
                    'Dimensions': [
                        {'Name': 'AgentId', 'Value': str(metrics.agent_id)},
                        {'Name': 'Environment', 'Value': metrics.environment}
                    ]
                }
            ]

            # Add resource usage metrics
            for resource, value in metrics.resource_usage.items():
                metric_data.append({
                    'MetricName': f'agent_{resource}_usage',
                    'Value': value,
                    'Unit': METRIC_UNITS.get(resource, 'None'),
                    'Dimensions': [
                        {'Name': 'AgentId', 'Value': str(metrics.agent_id)},
                        {'Name': 'Environment', 'Value': metrics.environment}
                    ]
                })

            # Buffer metrics for batch processing
            self._buffer_metrics(metric_data)

            # Calculate health score
            health_score = self._calculate_health_score(metrics)

            # Perform trend analysis
            trend_data = self._analyze_metric_trends(
                agent_id=metrics.agent_id,
                metric_data=metric_data
            )

            return {
                'status': 'success',
                'metrics_processed': len(metric_data),
                'health_score': health_score,
                'trend_analysis': trend_data,
                'timestamp': datetime.utcnow().isoformat()
            }

        except Exception as e:
            self._handle_metric_error('agent_metrics_error', str(e), metrics.agent_id)
            raise

    async def record_system_metrics(self, metrics: SystemMetricsSchema) -> Dict:
        """
        Record and analyze system-wide metrics with performance tracking.

        Args:
            metrics: Validated system metrics schema

        Returns:
            Dict containing system metrics analysis
        """
        try:
            metric_data = [
                {
                    'MetricName': 'system_cpu_usage',
                    'Value': metrics.cpu_usage,
                    'Unit': METRIC_UNITS['cpu_usage']
                },
                {
                    'MetricName': 'system_memory_usage',
                    'Value': metrics.memory_usage,
                    'Unit': METRIC_UNITS['memory_usage']
                },
                {
                    'MetricName': 'system_api_latency',
                    'Value': metrics.api_latency,
                    'Unit': METRIC_UNITS['api_latency']
                }
            ]

            # Add service health metrics
            for service, status in metrics.service_health.items():
                metric_data.append({
                    'MetricName': 'service_health_status',
                    'Value': 1 if status else 0,
                    'Unit': 'Count',
                    'Dimensions': [{'Name': 'ServiceName', 'Value': service}]
                })

            # Buffer system metrics
            self._buffer_metrics(metric_data)

            # Analyze system health
            health_analysis = self._analyze_system_health(metrics)

            return {
                'status': 'success',
                'metrics_processed': len(metric_data),
                'health_analysis': health_analysis,
                'timestamp': datetime.utcnow().isoformat()
            }

        except Exception as e:
            self._handle_metric_error('system_metrics_error', str(e))
            raise

    async def analyze_trends(self, 
                           metric_name: str,
                           start_time: datetime,
                           end_time: datetime,
                           dimensions: Optional[Dict[str, str]] = None) -> Dict:
        """
        Perform advanced trend analysis on metric data.

        Args:
            metric_name: Name of the metric to analyze
            start_time: Analysis start time
            end_time: Analysis end time
            dimensions: Optional metric dimensions

        Returns:
            Dict containing trend analysis results
        """
        try:
            # Retrieve metric statistics
            stats = await self._cloudwatch.get_metric_statistics(
                metric_name=metric_name,
                start_time=start_time,
                end_time=end_time,
                period=DEFAULT_PERIOD
            )

            # Perform trend analysis
            trend_data = self._analyze_metric_patterns(stats['Datapoints'])

            # Generate predictions
            predictions = self._generate_metric_predictions(trend_data)

            return {
                'status': 'success',
                'metric_name': metric_name,
                'trend_data': trend_data,
                'predictions': predictions,
                'analysis_period': {
                    'start': start_time.isoformat(),
                    'end': end_time.isoformat()
                }
            }

        except Exception as e:
            self._handle_metric_error('trend_analysis_error', str(e))
            raise

    def _validate_sla_compliance(self, metrics: AgentMetricsSchema) -> None:
        """Validate metrics against defined SLA thresholds."""
        if metrics.response_time > self._sla_thresholds['response_time']:
            self._trigger_sla_alert('response_time', metrics.response_time, metrics.agent_id)
        
        if metrics.error_rate > self._sla_thresholds['error_rate']:
            self._trigger_sla_alert('error_rate', metrics.error_rate, metrics.agent_id)

    def _buffer_metrics(self, metrics: List[Dict]) -> None:
        """Buffer metrics for batch processing with automatic flushing."""
        self._metric_buffer['metrics'].extend(metrics)
        
        if len(self._metric_buffer['metrics']) >= BATCH_SIZE:
            self._flush_metric_buffer()

    def _flush_metric_buffer(self) -> None:
        """Flush buffered metrics to CloudWatch."""
        if not self._metric_buffer['metrics']:
            return

        try:
            self._cloudwatch.put_metrics_batch(self._metric_buffer['metrics'])
            self._metric_buffer['metrics'] = []
            self._metric_buffer['last_flush'] = datetime.utcnow()
        except Exception as e:
            self._handle_metric_error('metric_flush_error', str(e))

    def _calculate_health_score(self, metrics: AgentMetricsSchema) -> float:
        """Calculate agent health score based on multiple metrics."""
        weights = {
            'response_time': 0.4,
            'error_rate': 0.4,
            'resource_usage': 0.2
        }

        response_time_score = max(0, 1 - (metrics.response_time / self._sla_thresholds['response_time']))
        error_rate_score = max(0, 1 - (metrics.error_rate / self._sla_thresholds['error_rate']))
        resource_score = 1 - (sum(metrics.resource_usage.values()) / len(metrics.resource_usage)) / 100

        return (
            weights['response_time'] * response_time_score +
            weights['error_rate'] * error_rate_score +
            weights['resource_usage'] * resource_score
        )

    def _analyze_metric_patterns(self, datapoints: List[Dict]) -> Dict:
        """Analyze metric patterns for trend detection."""
        if not datapoints:
            return {}

        values = [d['Value'] for d in datapoints]
        return {
            'mean': sum(values) / len(values),
            'min': min(values),
            'max': max(values),
            'trend': 'increasing' if values[-1] > values[0] else 'decreasing',
            'volatility': max(values) - min(values)
        }

    def _generate_metric_predictions(self, trend_data: Dict) -> Dict:
        """Generate metric predictions based on trend analysis."""
        if not trend_data:
            return {}

        return {
            'next_hour': trend_data['mean'] * (1.1 if trend_data['trend'] == 'increasing' else 0.9),
            'confidence': 0.8,
            'factors': ['historical_trend', 'current_load', 'time_of_day']
        }

    def _trigger_sla_alert(self, metric_name: str, value: float, agent_id: UUID) -> None:
        """Trigger SLA violation alerts."""
        alert_data = {
            'metric_name': metric_name,
            'current_value': value,
            'threshold': self._sla_thresholds[metric_name],
            'agent_id': str(agent_id),
            'timestamp': datetime.utcnow().isoformat()
        }

        if metric_name in self._alert_handlers:
            self._alert_handlers[metric_name](alert_data)

    def _handle_metric_error(self, error_type: str, error_message: str, agent_id: Optional[UUID] = None) -> None:
        """Handle and record metric processing errors."""
        error_data = {
            'MetricName': 'metric_processing_error',
            'Value': 1,
            'Unit': 'Count',
            'Dimensions': [
                {'Name': 'ErrorType', 'Value': error_type},
                {'Name': 'Environment', 'Value': 'production'}
            ]
        }
        
        if agent_id:
            error_data['Dimensions'].append({'Name': 'AgentId', 'Value': str(agent_id)})

        try:
            self._cloudwatch.put_metric(error_data)
        except Exception:
            pass  # Prevent recursive error handling