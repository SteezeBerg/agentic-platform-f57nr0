"""
Core metrics utility module for Agent Builder Hub.
Provides centralized metrics collection, tracking, and reporting capabilities with CloudWatch integration.
Version: 1.0.0
"""

import time
from datetime import datetime, timedelta
from functools import wraps
from typing import Dict, Optional, Any, List, Callable, Union
import asyncio
import statistics
from collections import deque

# Internal imports
from ..config.aws import get_client

# Constants
DEFAULT_NAMESPACE = "AgentBuilderHub"
METRIC_UNITS = {
    "latency": "Milliseconds",
    "memory": "Megabytes", 
    "cpu": "Percent",
    "count": "Count",
    "throughput": "Count/Second",
    "error_rate": "Percent"
}

PERFORMANCE_THRESHOLDS = {
    "api_latency": 100,  # milliseconds
    "memory_usage": 80,  # percent
    "cpu_usage": 70,    # percent
    "error_rate": 1,    # percent
    "throughput_min": 100  # requests/second
}

ALERT_CONFIGURATIONS = {
    "critical": {
        "threshold_multiplier": 1.5,
        "notification_interval": 300  # 5 minutes
    },
    "warning": {
        "threshold_multiplier": 1.2,
        "notification_interval": 900  # 15 minutes
    }
}

class MetricsManager:
    """Central metrics management class with advanced monitoring capabilities."""
    
    def __init__(self, 
                 namespace: str = DEFAULT_NAMESPACE,
                 dimensions: Optional[Dict[str, str]] = None,
                 custom_thresholds: Optional[Dict[str, float]] = None,
                 alert_config: Optional[Dict[str, Any]] = None):
        """
        Initialize metrics manager with enhanced configuration.
        
        Args:
            namespace: CloudWatch namespace
            dimensions: Default metric dimensions
            custom_thresholds: Custom performance thresholds
            alert_config: Alert configuration overrides
        """
        self._cloudwatch = get_client('cloudwatch')
        self.namespace = namespace
        self.dimensions = dimensions or {}
        self.thresholds = {**PERFORMANCE_THRESHOLDS, **(custom_thresholds or {})}
        self.alert_config = {**ALERT_CONFIGURATIONS, **(alert_config or {})}
        
        # Metric buffering for batch processing
        self._metric_buffer = {
            'metrics': [],
            'last_flush': datetime.now(),
            'buffer_size': 20,
            'flush_interval': 60  # seconds
        }
        
        # Trend analysis components
        self._metric_history = {}
        self._anomaly_detection = {}
        self._last_alert_time = {}

    def track_performance(self, 
                         metric_name: str,
                         value: float,
                         extra_dimensions: Optional[Dict[str, str]] = None,
                         enable_alerts: bool = True) -> Dict[str, Any]:
        """
        Record and analyze system performance metrics.
        
        Args:
            metric_name: Name of the metric
            value: Metric value
            extra_dimensions: Additional dimensions
            enable_alerts: Enable threshold alerts
            
        Returns:
            Dict containing metric processing results
        """
        try:
            # Validate metric name and value
            if not metric_name or not isinstance(value, (int, float)):
                raise ValueError("Invalid metric name or value")

            # Prepare dimensions
            dimensions = [
                {'Name': key, 'Value': val}
                for key, val in {**self.dimensions, **(extra_dimensions or {})}.items()
            ]

            # Prepare metric data
            metric_data = {
                'MetricName': metric_name,
                'Value': value,
                'Unit': METRIC_UNITS.get(metric_name.split('_')[-1], 'None'),
                'Timestamp': datetime.now(),
                'Dimensions': dimensions
            }

            # Add to buffer
            self._metric_buffer['metrics'].append(metric_data)

            # Update metric history for trend analysis
            if metric_name not in self._metric_history:
                self._metric_history[metric_name] = deque(maxlen=100)
            self._metric_history[metric_name].append((datetime.now(), value))

            # Perform trend analysis
            trend_data = self.analyze_trends(metric_name)

            # Check thresholds and trigger alerts
            alert_data = None
            if enable_alerts and metric_name in self.thresholds:
                alert_data = self._check_thresholds(metric_name, value, trend_data)

            # Flush buffer if needed
            self._check_buffer_flush()

            return {
                'status': 'success',
                'metric': metric_data,
                'trend_analysis': trend_data,
                'alerts': alert_data
            }

        except Exception as e:
            self._track_error('metric_processing_error', str(e))
            raise

    def analyze_trends(self, metric_name: str, window_size: int = 10) -> Dict[str, Any]:
        """
        Perform statistical analysis on metric patterns.
        
        Args:
            metric_name: Name of the metric
            window_size: Analysis window size
            
        Returns:
            Dict containing trend analysis results
        """
        if metric_name not in self._metric_history:
            return {}

        try:
            # Get recent values
            recent_values = [v for _, v in self._metric_history[metric_name]][-window_size:]
            
            if not recent_values:
                return {}

            # Calculate statistics
            analysis = {
                'current': recent_values[-1],
                'mean': statistics.mean(recent_values),
                'median': statistics.median(recent_values),
                'std_dev': statistics.stdev(recent_values) if len(recent_values) > 1 else 0
            }

            # Detect anomalies (values outside 2 standard deviations)
            analysis['is_anomaly'] = abs(analysis['current'] - analysis['mean']) > 2 * analysis['std_dev']

            # Calculate trend direction
            if len(recent_values) >= 2:
                analysis['trend'] = 'increasing' if recent_values[-1] > recent_values[-2] else 'decreasing'
            else:
                analysis['trend'] = 'stable'

            return analysis

        except Exception as e:
            self._track_error('trend_analysis_error', str(e))
            return {}

    def _check_thresholds(self, metric_name: str, value: float, trend_data: Dict[str, Any]) -> Dict[str, Any]:
        """Check metric values against defined thresholds."""
        threshold = self.thresholds.get(metric_name)
        if not threshold:
            return None

        alert_data = {
            'threshold_exceeded': False,
            'severity': None,
            'alert_sent': False
        }

        # Check critical threshold
        critical_threshold = threshold * self.alert_config['critical']['threshold_multiplier']
        if value >= critical_threshold:
            alert_data.update({
                'threshold_exceeded': True,
                'severity': 'critical',
                'value': value,
                'threshold': critical_threshold
            })
        # Check warning threshold
        elif value >= threshold * self.alert_config['warning']['threshold_multiplier']:
            alert_data.update({
                'threshold_exceeded': True,
                'severity': 'warning',
                'value': value,
                'threshold': threshold
            })

        # Send alert if needed
        if (alert_data['threshold_exceeded'] and 
            self._should_send_alert(metric_name, alert_data['severity'])):
            self._send_alert(metric_name, alert_data)
            alert_data['alert_sent'] = True

        return alert_data

    def _should_send_alert(self, metric_name: str, severity: str) -> bool:
        """Determine if an alert should be sent based on notification intervals."""
        now = datetime.now()
        key = f"{metric_name}_{severity}"
        last_alert = self._last_alert_time.get(key)

        if not last_alert:
            return True

        interval = self.alert_config[severity]['notification_interval']
        return (now - last_alert).total_seconds() >= interval

    def _send_alert(self, metric_name: str, alert_data: Dict[str, Any]) -> None:
        """Send metric alert to CloudWatch."""
        try:
            self._cloudwatch.put_metric_alarm(
                AlarmName=f"{self.namespace}-{metric_name}-{alert_data['severity']}",
                MetricName=metric_name,
                Namespace=self.namespace,
                Statistic='Average',
                Period=60,
                EvaluationPeriods=2,
                Threshold=alert_data['threshold'],
                ComparisonOperator='GreaterThanThreshold',
                AlarmActions=['arn:aws:sns:region:account-id:alerts-topic']
            )
            self._last_alert_time[f"{metric_name}_{alert_data['severity']}"] = datetime.now()
        except Exception as e:
            self._track_error('alert_sending_error', str(e))

    def _check_buffer_flush(self) -> None:
        """Check and flush metric buffer if needed."""
        now = datetime.now()
        should_flush = (
            len(self._metric_buffer['metrics']) >= self._metric_buffer['buffer_size'] or
            (now - self._metric_buffer['last_flush']).total_seconds() >= self._metric_buffer['flush_interval']
        )

        if should_flush:
            self._flush_metrics()

    def _flush_metrics(self) -> None:
        """Flush buffered metrics to CloudWatch."""
        if not self._metric_buffer['metrics']:
            return

        try:
            self._cloudwatch.put_metric_data(
                Namespace=self.namespace,
                MetricData=self._metric_buffer['metrics']
            )
            self._metric_buffer['metrics'] = []
            self._metric_buffer['last_flush'] = datetime.now()
        except Exception as e:
            self._track_error('metric_flush_error', str(e))

    def _track_error(self, error_type: str, error_message: str) -> None:
        """Track internal errors as metrics."""
        try:
            self._cloudwatch.put_metric_data(
                Namespace=self.namespace,
                MetricData=[{
                    'MetricName': 'metrics_system_errors',
                    'Value': 1,
                    'Unit': 'Count',
                    'Dimensions': [
                        {'Name': 'ErrorType', 'Value': error_type}
                    ]
                }]
            )
        except Exception:
            pass  # Prevent recursive error tracking

def track_time(operation_name: str,
               custom_dimensions: Optional[Dict[str, str]] = None,
               track_errors: bool = True) -> Callable:
    """
    Decorator for tracking function execution time.
    
    Args:
        operation_name: Name of the operation being timed
        custom_dimensions: Additional metric dimensions
        track_errors: Enable error tracking
    """
    def decorator(func: Callable) -> Callable:
        @wraps(func)
        async def async_wrapper(*args, **kwargs) -> Any:
            start_time = time.time()
            error = None
            try:
                if asyncio.iscoroutinefunction(func):
                    result = await func(*args, **kwargs)
                else:
                    result = func(*args, **kwargs)
                return result
            except Exception as e:
                error = e
                raise
            finally:
                duration = (time.time() - start_time) * 1000  # Convert to milliseconds
                metrics_manager = MetricsManager()
                dimensions = {
                    'Operation': operation_name,
                    'Status': 'Error' if error else 'Success',
                    **(custom_dimensions or {})
                }
                metrics_manager.track_performance('execution_time', duration, dimensions)
                
                if track_errors and error:
                    metrics_manager.track_performance('error_count', 1, dimensions)

        @wraps(func)
        def sync_wrapper(*args, **kwargs) -> Any:
            return asyncio.run(async_wrapper(*args, **kwargs))

        return async_wrapper if asyncio.iscoroutinefunction(func) else sync_wrapper
    return decorator

def track_resource_usage(resource_type: str,
                        usage_value: float,
                        context_data: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    """
    Track resource utilization with prediction capabilities.
    
    Args:
        resource_type: Type of resource (cpu, memory, etc.)
        usage_value: Current usage value
        context_data: Additional context information
    
    Returns:
        Dict containing resource analysis results
    """
    metrics_manager = MetricsManager()
    dimensions = {
        'ResourceType': resource_type,
        **(context_data or {})
    }
    
    # Track current usage
    tracking_result = metrics_manager.track_performance(
        f'{resource_type}_usage',
        usage_value,
        dimensions
    )
    
    # Analyze trends and predict future usage
    trend_analysis = metrics_manager.analyze_trends(f'{resource_type}_usage')
    
    return {
        'current_usage': usage_value,
        'tracking_result': tracking_result,
        'trend_analysis': trend_analysis
    }

__all__ = ['MetricsManager', 'track_time', 'track_resource_usage']