"""
Configuration initialization module for Agent Builder Hub backend service.
Provides centralized access to all configuration components with enhanced security,
monitoring, and validation capabilities.
Version: 1.0.0
"""

from typing import Dict, Any, Optional
import logging
from functools import wraps
from datetime import datetime

# Internal imports
from .settings import Settings, get_settings
from .aws import AWSConfig, get_client
from .database import DatabaseManager, create_database_manager
from .logging import LogConfig, configure_logging

# Global constants
APP_NAME = 'agent-builder-hub'
VERSION = '1.0.0'
CONFIG_CACHE: Dict[str, Any] = {}

def validate_configuration(func):
    """Decorator to validate configuration completeness and security."""
    @wraps(func)
    def wrapper(*args, **kwargs):
        try:
            config = func(*args, **kwargs)
            
            # Validate required components
            required_components = ['settings', 'aws_config', 'db_config', 'log_config']
            missing = [comp for comp in required_components if comp not in config]
            if missing:
                raise ValueError(f"Missing required configuration components: {missing}")
            
            # Validate security context
            if not config.get('security_context'):
                raise ValueError("Security context is required")
                
            return config
        except Exception as e:
            logging.error(f"Configuration validation failed: {str(e)}")
            raise
    return wrapper

def audit_configuration_access(func):
    """Decorator to audit configuration access and changes."""
    @wraps(func)
    def wrapper(*args, **kwargs):
        try:
            # Record access attempt
            access_time = datetime.utcnow()
            
            result = func(*args, **kwargs)
            
            # Log successful configuration access
            logging.info(
                "Configuration accessed",
                extra={
                    'timestamp': access_time.isoformat(),
                    'components': list(result.keys()),
                    'cache_used': kwargs.get('use_cache', True)
                }
            )
            return result
        except Exception as e:
            # Log configuration access failure
            logging.error(
                f"Configuration access failed: {str(e)}",
                extra={
                    'timestamp': datetime.utcnow().isoformat(),
                    'error': str(e)
                }
            )
            raise
    return wrapper

@validate_configuration
@audit_configuration_access
def initialize_config(validate: bool = True, use_cache: bool = True) -> Dict[str, Any]:
    """
    Initializes all configuration components with enhanced security and validation.
    
    Args:
        validate: Enable configuration validation
        use_cache: Use cached configuration if available
        
    Returns:
        Complete application configuration with security context
    """
    try:
        # Check configuration cache
        if use_cache and CONFIG_CACHE:
            logging.info("Using cached configuration")
            return CONFIG_CACHE

        # Initialize settings with validation
        settings = get_settings()
        
        # Initialize security context
        security_context = {
            'environment': settings.environment,
            'version': VERSION,
            'timestamp': datetime.utcnow().isoformat()
        }
        
        # Initialize AWS configuration with security context
        aws_config = AWSConfig({
            'region': settings.aws_config.region,
            'security_context': security_context
        })
        
        # Initialize database configuration with monitoring
        db_config = create_database_manager()
        
        # Initialize logging configuration with audit capability
        log_config = configure_logging(
            service_name=APP_NAME,
            security_context=security_context,
            performance_config={
                'metrics_enabled': True,
                'logging_level': 'INFO' if settings.environment != 'development' else 'DEBUG'
            }
        )
        
        # Assemble complete configuration
        config = {
            'settings': settings,
            'aws_config': aws_config,
            'db_config': db_config,
            'log_config': log_config,
            'security_context': security_context,
            'app_name': APP_NAME,
            'version': VERSION
        }
        
        # Validate complete configuration if enabled
        if validate:
            settings.validate_config(config)
            
        # Cache configuration if caching is enabled
        if use_cache:
            CONFIG_CACHE.update(config)
            logging.info("Configuration cached successfully")
            
        logging.info(
            "Configuration initialized successfully",
            extra={'environment': settings.environment}
        )
        
        return config
        
    except Exception as e:
        logging.error(f"Configuration initialization failed: {str(e)}")
        raise

# Export configuration components
settings = get_settings()
aws_config = AWSConfig({
    'region': settings.aws_config.region,
    'security_context': {'environment': settings.environment}
})
db_config = create_database_manager()
log_config = configure_logging(
    service_name=APP_NAME,
    security_context={'environment': settings.environment},
    performance_config={'metrics_enabled': True}
)

__all__ = [
    'settings',
    'aws_config', 
    'db_config',
    'log_config',
    'initialize_config',
    'APP_NAME',
    'VERSION'
]