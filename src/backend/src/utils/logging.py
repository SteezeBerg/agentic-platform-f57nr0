"""
Core logging utility module that provides structured logging capabilities with CloudWatch integration.
Implements environment-aware logging configuration with support for JSON formatting, trace context,
and performance monitoring through metrics integration.
Version: 1.0.0
"""

import logging
from typing import Dict, Optional, Any
from contextvars import ContextVar
import json

# Third-party imports with versions
import watchtower  # ^3.0.0
import json_logging  # ^1.0.0

# Internal imports
from config.settings import get_settings, get_aws_config
from utils.metrics import MetricsManager

# Global context variables for trace and correlation IDs
TRACE_ID_CTX = ContextVar('trace_id', default='unknown')
CORRELATION_ID_CTX = ContextVar('correlation_id', default='unknown')

# Logging format templates
LOG_FORMAT = "%(asctime)s - %(name)s - %(levelname)s - %(message)s - %(trace_id)s"
JSON_LOG_FORMAT = """{"timestamp": "%(asctime)s", "service": "%(name)s", "level": "%(levelname)s", 
                     "message": "%(message)s", "trace_id": "%(trace_id)s", "environment": "%(environment)s", 
                     "version": "%(version)s", "correlation_id": "%(correlation_id)s"}"""

class StructuredLogger:
    """Enhanced logger class that provides structured logging with trace context and metrics integration."""

    def __init__(self, service_name: str, log_config: Dict[str, Any]):
        """Initialize structured logger with service name and metrics integration."""
        self._logger = logging.getLogger(service_name)
        self._metrics = MetricsManager()
        self.service_name = service_name
        self._log_config = log_config

        # Configure logger with JSON formatting
        json_logging.init_non_web(enable_json=True)
        json_logging.init_request_instrument()

        # Set log level from config
        self._logger.setLevel(log_config.get('log_level', logging.INFO))

        # Configure handlers
        self._setup_handlers()

    def _setup_handlers(self):
        """Set up logging handlers with formatting."""
        # Create formatters
        standard_formatter = logging.Formatter(LOG_FORMAT)
        json_formatter = logging.Formatter(JSON_LOG_FORMAT)

        # Console handler
        console_handler = logging.StreamHandler()
        console_handler.setFormatter(json_formatter if self._log_config.get('json_logs', True) else standard_formatter)
        self._logger.addHandler(console_handler)

        # CloudWatch handler if enabled
        if self._log_config.get('cloudwatch_enabled', True):
            cloudwatch_handler = get_cloudwatch_handler(
                self._log_config['log_group'],
                self._log_config['stream_name'],
                self._log_config.get('batch_config', {})
            )
            cloudwatch_handler.setFormatter(json_formatter)
            self._logger.addHandler(cloudwatch_handler)

    def set_trace_id(self, trace_id: str, correlation_id: Optional[str] = None):
        """Sets the trace ID for the current context with correlation support."""
        if not trace_id:
            raise ValueError("Trace ID cannot be empty")
        
        TRACE_ID_CTX.set(trace_id)
        if correlation_id:
            CORRELATION_ID_CTX.set(correlation_id)

        # Track trace context metrics
        self._metrics.track_performance(
            'trace_context_set',
            1,
            {'service': self.service_name, 'trace_id': trace_id}
        )

    def get_trace_id(self) -> Dict[str, str]:
        """Gets the current trace ID and correlation info from context."""
        return {
            'trace_id': TRACE_ID_CTX.get(),
            'correlation_id': CORRELATION_ID_CTX.get()
        }

    def log(self, level: str, message: str, extra: Optional[Dict] = None, track_performance: bool = True):
        """Logs a message with structured format and performance tracking."""
        try:
            # Get trace context
            trace_context = self.get_trace_id()
            
            # Prepare extra fields
            log_extra = {
                'trace_id': trace_context['trace_id'],
                'correlation_id': trace_context['correlation_id'],
                'service': self.service_name,
                'environment': self._log_config.get('environment', 'unknown'),
                'version': self._log_config.get('version', '1.0.0'),
                **(extra or {})
            }

            # Log message with context
            log_method = getattr(self._logger, level.lower())
            log_method(message, extra=log_extra)

            # Track logging performance if enabled
            if track_performance:
                self._metrics.track_performance(
                    'log_operation',
                    1,
                    {'level': level, 'service': self.service_name}
                )

        except Exception as e:
            # Fallback logging for errors in logging system
            self._logger.error(f"Error in logging system: {str(e)}", exc_info=True)
            self._metrics.track_performance('logging_error', 1)

def setup_logging(service_name: str, config_override: Optional[Dict] = None) -> StructuredLogger:
    """Configures global logging settings based on environment with enhanced features."""
    try:
        # Get base settings
        settings = get_settings()
        aws_config = get_aws_config()

        # Prepare logging configuration
        log_config = {
            'environment': settings.environment,
            'version': settings.config_version,
            'log_level': logging.DEBUG if settings.debug else logging.INFO,
            'json_logs': True,
            'cloudwatch_enabled': True,
            'log_group': f"/agent-builder/{settings.environment}/{service_name}",
            'stream_name': f"{service_name}-{settings.config_version}",
            'batch_config': {
                'batch_size': 100,
                'flush_interval': 5,
                'max_retries': 3
            }
        }

        # Override with custom config if provided
        if config_override:
            log_config.update(config_override)

        # Initialize and return structured logger
        return StructuredLogger(service_name, log_config)

    except Exception as e:
        # Fallback to basic logging if setup fails
        logging.error(f"Failed to setup structured logging: {str(e)}", exc_info=True)
        basic_logger = logging.getLogger(service_name)
        basic_logger.setLevel(logging.INFO)
        return basic_logger

def get_cloudwatch_handler(log_group: str, stream_name: str, batch_config: Dict) -> watchtower.CloudWatchLogHandler:
    """Creates and configures CloudWatch log handler with enhanced features."""
    try:
        aws_config = get_aws_config()
        
        return watchtower.CloudWatchLogHandler(
            log_group=log_group,
            stream_name=stream_name,
            use_queues=True,
            send_interval=batch_config.get('flush_interval', 5),
            max_batch_size=batch_config.get('batch_size', 100),
            max_batch_count=batch_config.get('max_retries', 3),
            create_log_group=True,
            region=aws_config['region']
        )

    except Exception as e:
        logging.error(f"Failed to create CloudWatch handler: {str(e)}", exc_info=True)
        raise

__all__ = ['StructuredLogger', 'setup_logging']