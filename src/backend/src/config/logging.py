"""
Centralized logging configuration module for Agent Builder Hub backend service.
Provides environment-aware logging setup with enhanced CloudWatch integration,
structured logging capabilities, and advanced security context management.
Version: 1.0.0
"""

import logging
from typing import Dict, Optional, Any

# Third-party imports with versions
import watchtower  # ^3.0.0
import json_logging  # ^1.0.0

# Internal imports
from config.settings import Settings, get_settings
from utils.logging import StructuredLogger
from integrations.aws.cloudwatch import CloudWatchMetrics

# Global constants
LOG_FORMAT = "%(asctime)s - %(name)s - %(levelname)s - %(message)s - %(trace_id)s - %(security_context)s - %(performance_metrics)s"
JSON_LOG_FORMAT = """{"timestamp": "%(asctime)s", "service": "%(name)s", "level": "%(levelname)s", 
                     "message": "%(message)s", "trace_id": "%(trace_id)s", "security_context": "%(security_context)s", 
                     "performance_metrics": "%(performance_metrics)s"}"""
DEFAULT_LOG_LEVEL = "INFO"
BATCH_SIZE = 100
FLUSH_INTERVAL = 5
RETENTION_DAYS = 90

class LogConfig:
    """Enhanced configuration class for advanced logging settings."""
    
    def __init__(self, service_name: str, security_context: Dict, performance_config: Dict):
        """
        Initialize enhanced logging configuration with advanced settings.
        
        Args:
            service_name: Name of the service for logging context
            security_context: Security context for enhanced logging
            performance_config: Performance monitoring configuration
        """
        self.settings = get_settings()
        self.service_name = service_name
        self.log_level = self._get_log_level()
        self.json_format = True
        self.security_context = security_context
        self.performance_config = performance_config
        self.cloudwatch_config = {
            'enabled': True,
            'log_group': f"/agent-builder/{self.settings.environment}/{service_name}",
            'stream_name': f"{service_name}-{self.settings.config_version}",
            'retention_days': RETENTION_DAYS,
            'batch_settings': {
                'batch_size': BATCH_SIZE,
                'flush_interval': FLUSH_INTERVAL
            }
        }
        
    def _get_log_level(self) -> str:
        """Determine appropriate log level based on environment."""
        if self.settings.environment == 'development':
            return logging.DEBUG if self.settings.debug else logging.INFO
        return logging.INFO if self.settings.environment == 'staging' else logging.WARNING
        
    def get_handler(self, config: Dict) -> logging.Handler:
        """
        Returns optimized logging handler based on environment and configuration.
        
        Args:
            config: Handler-specific configuration
            
        Returns:
            Configured logging handler
        """
        if config.get('type') == 'cloudwatch':
            return setup_cloudwatch_logging(
                self.cloudwatch_config['log_group'],
                self.cloudwatch_config['stream_name'],
                self.cloudwatch_config['batch_settings']
            )
        
        # Console handler with JSON formatting
        handler = logging.StreamHandler()
        formatter = logging.Formatter(
            JSON_LOG_FORMAT if self.json_format else LOG_FORMAT
        )
        handler.setFormatter(formatter)
        return handler

def configure_logging(
    service_name: str,
    security_context: Dict,
    performance_config: Dict
) -> logging.Logger:
    """
    Configures the enhanced global logging system with advanced features.
    
    Args:
        service_name: Name of the service for logging context
        security_context: Security context for enhanced logging
        performance_config: Performance monitoring configuration
        
    Returns:
        Configured logger instance with enhanced capabilities
    """
    try:
        # Initialize logging configuration
        log_config = LogConfig(service_name, security_context, performance_config)
        
        # Configure root logger
        logger = logging.getLogger(service_name)
        logger.setLevel(log_config.log_level)
        
        # Clear existing handlers
        logger.handlers.clear()
        
        # Add console handler for all environments
        console_handler = log_config.get_handler({'type': 'console'})
        logger.addHandler(console_handler)
        
        # Add CloudWatch handler for non-development environments
        if log_config.settings.environment != 'development':
            cloudwatch_handler = log_config.get_handler({'type': 'cloudwatch'})
            logger.addHandler(cloudwatch_handler)
        
        # Initialize metrics tracking
        metrics = CloudWatchMetrics(
            namespace='AgentBuilderHub',
            dimensions=[
                {'Name': 'Service', 'Value': service_name},
                {'Name': 'Environment', 'Value': log_config.settings.environment}
            ],
            security_context=security_context
        )
        
        # Configure JSON logging
        if log_config.json_format:
            json_logging.init_non_web(enable_json=True)
            json_logging.init_request_instrument()
        
        logger.info(
            f"Logging configured for service: {service_name}",
            extra={
                'security_context': security_context,
                'performance_config': performance_config
            }
        )
        
        return logger
        
    except Exception as e:
        # Fallback to basic logging if setup fails
        basic_logger = logging.getLogger(service_name)
        basic_logger.setLevel(logging.INFO)
        basic_logger.error(f"Failed to configure enhanced logging: {str(e)}", exc_info=True)
        return basic_logger

def setup_cloudwatch_logging(
    log_group_name: str,
    stream_name: str,
    batch_config: Dict
) -> watchtower.CloudWatchLogHandler:
    """
    Sets up enhanced CloudWatch logging handler with optimized configuration.
    
    Args:
        log_group_name: CloudWatch log group name
        stream_name: CloudWatch stream name
        batch_config: Batch processing configuration
        
    Returns:
        Configured CloudWatch handler
    """
    try:
        settings = get_settings()
        
        return watchtower.CloudWatchLogHandler(
            log_group=log_group_name,
            stream_name=stream_name,
            use_queues=True,
            send_interval=batch_config.get('flush_interval', FLUSH_INTERVAL),
            max_batch_size=batch_config.get('batch_size', BATCH_SIZE),
            max_batch_count=batch_config.get('max_retries', 3),
            create_log_group=True,
            retention_days=RETENTION_DAYS,
            region=settings.aws_config.region
        )
        
    except Exception as e:
        logging.error(f"Failed to create CloudWatch handler: {str(e)}", exc_info=True)
        raise

def get_log_level(config: Dict) -> str:
    """
    Determines appropriate log level based on environment and configuration.
    
    Args:
        config: Configuration dictionary with environment settings
        
    Returns:
        Appropriate logging level
    """
    environment = config.get('environment', 'production')
    debug_mode = config.get('debug', False)
    
    if environment == 'development':
        return logging.DEBUG if debug_mode else logging.INFO
    elif environment == 'staging':
        return logging.INFO
    return logging.WARNING

__all__ = ['configure_logging', 'LogConfig']