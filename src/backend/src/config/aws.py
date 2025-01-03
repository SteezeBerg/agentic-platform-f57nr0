"""
AWS configuration module for Agent Builder Hub.
Provides centralized AWS service client configuration and management with enhanced security,
monitoring, and comprehensive error handling.
Version: 1.0.0
"""

import logging
from functools import wraps
from typing import Dict, Optional, Any, Union
from datetime import datetime, timedelta

# Third-party imports with versions
import boto3  # ^1.28.0
import botocore  # ^1.31.0
from botocore.config import Config
from botocore.exceptions import ClientError, BotoCoreError
from cryptography.fernet import Fernet  # ^41.0.0

# Internal imports
from .settings import Settings, get_settings

# Configure logging
logger = logging.getLogger(__name__)

# Global constants
DEFAULT_REGION = 'us-west-2'
DEFAULT_TIMEOUT = 30
MAX_RETRIES = 3
CONNECTION_POOL_SIZE = 10
CREDENTIAL_ROTATION_DAYS = 90

def log_client_creation(func):
    """Decorator for logging client creation with audit trail"""
    @wraps(func)
    def wrapper(*args, **kwargs):
        service_name = args[0] if args else kwargs.get('service_name')
        logger.info(f"Creating AWS client for service: {service_name}")
        try:
            client = func(*args, **kwargs)
            logger.info(f"Successfully created AWS client for {service_name}")
            return client
        except Exception as e:
            logger.error(f"Failed to create AWS client for {service_name}: {str(e)}")
            raise
    return wrapper

def validate_config(func):
    """Decorator for validating AWS configuration parameters"""
    @wraps(func)
    def wrapper(*args, **kwargs):
        service_name = args[0] if args else kwargs.get('service_name')
        config = kwargs.get('config', {})
        
        if not service_name:
            raise ValueError("Service name is required")
            
        # Validate service-specific configurations
        if service_name not in boto3.Session().get_available_services():
            raise ValueError(f"Invalid AWS service: {service_name}")
            
        return func(*args, **kwargs)
    return wrapper

class AWSConfig:
    """Enhanced AWS configuration manager with security and monitoring capabilities"""
    
    def __init__(self, config: Dict[str, Any]):
        """Initialize AWS configuration with security controls"""
        self.settings = get_settings()
        self.credentials = self._init_credentials(config)
        self.region = config.get('region', DEFAULT_REGION)
        self.service_config = {}
        self.security_controls = self._init_security_controls()
        self.monitoring_config = self._init_monitoring()
        self.connection_pools = {}
        
        # Initialize encryption for sensitive data
        self.fernet = Fernet(self.settings.security_config.encryption_key.encode())
        
        logger.info(f"Initialized AWS configuration for region: {self.region}")

    def _init_credentials(self, config: Dict[str, Any]) -> Dict[str, str]:
        """Initialize and validate AWS credentials"""
        aws_config = self.settings.aws_config
        return {
            'aws_access_key_id': aws_config.access_key_id,
            'aws_secret_access_key': aws_config.secret_access_key,
            'region_name': aws_config.region
        }

    def _init_security_controls(self) -> Dict[str, Any]:
        """Initialize security controls for AWS services"""
        return {
            'ssl_verify': self.settings.security_config.ssl_verify,
            'signature_version': 'v4',
            'encryption_enabled': True,
            'audit_logging': True
        }

    def _init_monitoring(self) -> Dict[str, Any]:
        """Initialize monitoring configuration"""
        return {
            'metrics_enabled': True,
            'logging_level': logging.INFO,
            'performance_insights_enabled': True,
            'trace_enabled': True
        }

    def get_service_config(self, service_name: str, override_config: Optional[Dict] = None) -> Dict[str, Any]:
        """Get service-specific configuration with security controls"""
        base_config = {
            'region_name': self.region,
            'connect_timeout': DEFAULT_TIMEOUT,
            'read_timeout': DEFAULT_TIMEOUT,
            'retries': {'max_attempts': MAX_RETRIES, 'mode': 'adaptive'},
            'max_pool_connections': CONNECTION_POOL_SIZE
        }

        # Apply service-specific optimizations
        service_specific = self.service_config.get(service_name, {})
        config = {**base_config, **service_specific}

        # Apply security controls
        config.update({
            'verify': self.security_controls['ssl_verify'],
            'signature_version': self.security_controls['signature_version']
        })

        # Merge with override configuration if provided
        if override_config:
            config.update(override_config)

        return config

@log_client_creation
@validate_config
def get_client(service_name: str, config: Optional[Dict] = None, use_connection_pool: bool = True) -> boto3.client:
    """
    Create and return a configured AWS service client with enhanced security and monitoring.
    """
    try:
        aws_config = AWSConfig(config or {})
        service_config = aws_config.get_service_config(service_name, config)

        # Create boto3 config with monitoring
        boto_config = Config(
            region_name=service_config['region_name'],
            signature_version=service_config['signature_version'],
            retries=service_config['retries'],
            connect_timeout=service_config['connect_timeout'],
            read_timeout=service_config['read_timeout'],
            max_pool_connections=service_config['max_pool_connections'] if use_connection_pool else 1
        )

        # Create client with validated configuration
        client = boto3.client(
            service_name,
            config=boto_config,
            **aws_config.credentials
        )

        # Set up event listeners for monitoring
        client.meta.events.register('after-call.*.*', _log_api_call)

        return client

    except (ClientError, BotoCoreError) as e:
        logger.error(f"AWS client creation failed for {service_name}: {str(e)}")
        raise
    except Exception as e:
        logger.error(f"Unexpected error creating AWS client: {str(e)}")
        raise

@log_client_creation
@validate_config
def get_resource(service_name: str, config: Optional[Dict] = None) -> boto3.resource:
    """
    Create and return a configured AWS service resource with security controls.
    """
    try:
        aws_config = AWSConfig(config or {})
        service_config = aws_config.get_service_config(service_name, config)

        # Create boto3 config
        boto_config = Config(
            region_name=service_config['region_name'],
            signature_version=service_config['signature_version'],
            retries=service_config['retries']
        )

        # Create resource with validated configuration
        resource = boto3.resource(
            service_name,
            config=boto_config,
            **aws_config.credentials
        )

        return resource

    except (ClientError, BotoCoreError) as e:
        logger.error(f"AWS resource creation failed for {service_name}: {str(e)}")
        raise
    except Exception as e:
        logger.error(f"Unexpected error creating AWS resource: {str(e)}")
        raise

def _log_api_call(parsed, **kwargs):
    """Log AWS API calls for monitoring and audit"""
    operation = parsed['context']['operation_name']
    service = parsed['context']['service_model'].service_name
    status_code = parsed['context'].get('http_response', {}).get('status_code')
    
    logger.info(f"AWS API Call - Service: {service}, Operation: {operation}, Status: {status_code}")

__all__ = ['get_client', 'get_resource', 'AWSConfig']