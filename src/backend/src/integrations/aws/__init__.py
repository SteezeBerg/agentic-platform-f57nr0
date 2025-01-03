"""
AWS integrations initialization module for Agent Builder Hub.
Provides secure, monitored, and performant access to AWS services with comprehensive security controls,
multi-account support, encryption standards, and observability features.
Version: 1.0.0
"""

import os
from typing import Dict, Optional, Any
from functools import wraps
from datetime import datetime

# Third-party imports with versions
import boto3  # ^1.28.0
from botocore.exceptions import ClientError, BotoCoreError  # ^1.31.0
from aws_xray_sdk.core import xray_recorder  # ^2.12.0
from aws_xray_sdk.core import patch_all as xray_patch_all

# Internal imports
from .s3 import S3Client
from .dynamodb import DynamoDBClient
from ...config.aws import get_client
from ...utils.logging import StructuredLogger
from ...utils.metrics import track_time, MetricsManager

# Initialize structured logger
logger = StructuredLogger('aws_integration', {'service': 'aws'})

# Global configuration
AWS_REGION = os.getenv('AWS_REGION', 'us-west-2')
AWS_PROFILE = os.getenv('AWS_PROFILE', 'default')
AWS_KMS_KEY_ID = os.getenv('AWS_KMS_KEY_ID')
AWS_MONITORING_ENABLED = os.getenv('AWS_MONITORING_ENABLED', 'true').lower() == 'true'

def xray_trace(func):
    """Decorator for AWS X-Ray tracing with error tracking."""
    @wraps(func)
    def wrapper(*args, **kwargs):
        try:
            with xray_recorder.capture(func.__name__):
                return func(*args, **kwargs)
        except Exception as e:
            xray_recorder.current_segment.add_exception(e)
            raise
    return wrapper

def validate_security_context(func):
    """Decorator for validating AWS security context and credentials."""
    @wraps(func)
    def wrapper(*args, **kwargs):
        try:
            # Validate AWS credentials
            session = boto3.Session()
            if not session.get_credentials():
                raise ValueError("AWS credentials not found")

            # Validate KMS key if encryption is required
            if AWS_KMS_KEY_ID:
                kms = get_client('kms')
                kms.describe_key(KeyId=AWS_KMS_KEY_ID)

            return func(*args, **kwargs)
        except Exception as e:
            logger.error("Security context validation failed", {'error': str(e)})
            raise
    return wrapper

class AWSIntegration:
    """Secure AWS integration class with monitoring, encryption, and cross-account support."""

    def __init__(self, config: Dict[str, Any], enable_monitoring: bool = True):
        """Initialize AWS integration with security validation and monitoring.
        
        Args:
            config: AWS configuration dictionary
            enable_monitoring: Enable performance monitoring
        """
        self.config = config
        self.enable_monitoring = enable_monitoring
        self.metrics = MetricsManager() if enable_monitoring else None
        
        # Initialize encryption context
        self.encryption_context = {
            'KeyId': AWS_KMS_KEY_ID,
            'Environment': config.get('environment', 'production'),
            'Application': 'agent-builder-hub',
            'Version': config.get('version', '1.0.0')
        }

        # Initialize service clients with security validation
        self._initialize_clients()
        
        # Configure X-Ray tracing
        if enable_monitoring:
            xray_patch_all()
            
        logger.info("AWS integration initialized", {
            'region': AWS_REGION,
            'monitoring_enabled': enable_monitoring
        })

    def _initialize_clients(self):
        """Initialize AWS service clients with security validation."""
        try:
            # Initialize S3 client with encryption
            self.s3_client = S3Client(
                bucket_name=self.config.get('s3_bucket'),
                encryption_config=self.encryption_context
            )

            # Initialize DynamoDB client with encryption
            self.dynamodb_client = DynamoDBClient(
                table_name=self.config.get('dynamodb_table'),
                encryption_config=self.encryption_context
            )

            # Track initialization metrics
            if self.enable_monitoring:
                self.metrics.track_performance(
                    'aws_client_initialization',
                    1,
                    {'status': 'success'}
                )

        except Exception as e:
            logger.error("Failed to initialize AWS clients", {'error': str(e)})
            if self.enable_monitoring:
                self.metrics.track_performance(
                    'aws_client_initialization',
                    1,
                    {'status': 'error'}
                )
            raise

    @xray_trace
    @validate_security_context
    def get_service_client(self, service_name: str, options: Optional[Dict] = None) -> Any:
        """Returns secure, monitored client for specified AWS service.
        
        Args:
            service_name: AWS service name
            options: Optional client configuration
            
        Returns:
            Initialized and validated service client
        """
        try:
            # Prepare client configuration
            client_config = {
                'service_name': service_name,
                'region_name': AWS_REGION,
                'encryption_context': self.encryption_context,
                **(options or {})
            }

            # Get client with security validation
            client = get_client(**client_config)

            # Track client creation metrics
            if self.enable_monitoring:
                self.metrics.track_performance(
                    'aws_client_creation',
                    1,
                    {'service': service_name, 'status': 'success'}
                )

            return client

        except Exception as e:
            logger.error(f"Failed to get {service_name} client", {'error': str(e)})
            if self.enable_monitoring:
                self.metrics.track_performance(
                    'aws_client_creation',
                    1,
                    {'service': service_name, 'status': 'error'}
                )
            raise

@xray_trace
@validate_security_context
def initialize_aws_clients(config: Dict[str, Any], enable_monitoring: bool = True) -> Dict[str, Any]:
    """Initializes AWS service clients with security validation, monitoring, and proper configuration.
    
    Args:
        config: AWS configuration dictionary
        enable_monitoring: Enable performance monitoring
        
    Returns:
        Dictionary of initialized and validated AWS service clients
    """
    try:
        aws = AWSIntegration(config, enable_monitoring)
        
        return {
            's3': aws.s3_client,
            'dynamodb': aws.dynamodb_client,
            'get_client': aws.get_service_client
        }

    except Exception as e:
        logger.error("AWS initialization failed", {'error': str(e)})
        raise

__all__ = [
    'AWSIntegration',
    'initialize_aws_clients',
    'S3Client',
    'DynamoDBClient'
]