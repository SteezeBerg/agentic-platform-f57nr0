"""
Root package initialization module for Agent Builder Hub backend service.
Provides core application initialization, logging configuration, and system monitoring.
Version: 1.0.0
"""

import os
import logging
from typing import Dict, Optional

# Third-party imports with versions
import boto3  # ^1.28.0
import opentelemetry  # ^1.20.0
from opentelemetry.trace import get_tracer
from opentelemetry.metrics import get_meter

# Internal imports
from config.settings import Settings, get_settings
from config.logging import configure_logging
from config.aws import get_client
from integrations.aws.cloudwatch import CloudWatchMetrics

# Global constants
VERSION = "1.0.0"
SERVICE_NAME = "agent-builder-hub"
ENVIRONMENT = os.getenv('ENVIRONMENT', 'development')

# Initialize tracer and meter
tracer = get_tracer(__name__, VERSION)
meter = get_meter(__name__, VERSION)

@opentelemetry.trace.span
def initialize_app(config_override: Optional[Dict] = None) -> bool:
    """
    Initializes the Agent Builder Hub backend application with comprehensive error handling and monitoring.
    
    Args:
        config_override: Optional configuration overrides
        
    Returns:
        bool: True if initialization successful, False otherwise
    """
    try:
        # Initialize settings with overrides
        settings = get_settings()
        if config_override:
            settings.update(config_override)

        # Validate environment and configuration
        if not settings.validate_environment():
            raise ValueError(f"Invalid environment configuration: {ENVIRONMENT}")

        # Configure logging with CloudWatch integration
        logger = configure_logging(
            service_name=SERVICE_NAME,
            security_context={
                'environment': ENVIRONMENT,
                'version': VERSION,
                'service': SERVICE_NAME
            },
            performance_config={
                'metrics_enabled': True,
                'trace_enabled': True
            }
        )

        # Initialize AWS services
        aws_client = get_client('cloudwatch')
        metrics = CloudWatchMetrics(
            namespace='AgentBuilderHub',
            dimensions=[
                {'Name': 'Service', 'Value': SERVICE_NAME},
                {'Name': 'Environment', 'Value': ENVIRONMENT}
            ],
            security_context={
                'service': SERVICE_NAME,
                'environment': ENVIRONMENT
            }
        )

        # Initialize monitoring
        metrics.put_metric(
            'application_initialization',
            1.0,
            'Count',
            {'initialization_phase': 'start'}
        )

        # Set up database connections
        db_config = settings.database_config
        if not db_config:
            raise ValueError("Database configuration missing")

        # Configure distributed tracing
        opentelemetry.trace.set_tracer_provider(
            opentelemetry.sdk.trace.TracerProvider()
        )

        # Initialize error reporting
        logger.info(
            "Application initialization completed successfully",
            extra={
                'service': SERVICE_NAME,
                'environment': ENVIRONMENT,
                'version': VERSION
            }
        )

        # Track successful initialization
        metrics.put_metric(
            'application_initialization',
            1.0,
            'Count',
            {'initialization_phase': 'complete'}
        )

        return True

    except Exception as e:
        logging.error(f"Application initialization failed: {str(e)}", exc_info=True)
        if 'metrics' in locals():
            metrics.put_metric(
                'application_initialization_error',
                1.0,
                'Count',
                {'error': str(e)}
            )
        return False

def get_app_version() -> str:
    """
    Returns the current application version with build information.
    
    Returns:
        str: Current application version string
    """
    try:
        settings = get_settings()
        return f"{VERSION}-{settings.environment}"
    except Exception as e:
        logging.error(f"Error retrieving app version: {str(e)}")
        return VERSION

# Initialize application on module import
if not initialize_app():
    raise RuntimeError("Failed to initialize Agent Builder Hub application")

__all__ = [
    'VERSION',
    'SERVICE_NAME',
    'initialize_app',
    'get_app_version'
]