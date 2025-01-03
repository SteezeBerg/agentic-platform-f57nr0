"""
Core utilities package for Agent Builder Hub providing centralized access to enterprise-grade
security, logging, metrics, and validation capabilities.

Version: 1.0.0
"""

from typing import Dict, Any, Optional

# Import encryption utilities with AWS KMS integration
from .encryption import (
    EncryptionService,
    encrypt_string,
    decrypt_string
)

# Import structured logging with CloudWatch integration
from .logging import (
    StructuredLogger,
    setup_logging
)

# Import metrics collection and monitoring
from .metrics import (
    MetricsManager,
    track_time,
    track_resource_usage
)

# Import validation utilities
from .validation import (
    ValidationError,
    validate_agent_config,
    validate_deployment_environment,
    sanitize_input,
    validate_schema
)

# Package metadata
__version__ = "1.0.0"
__author__ = "Hakkoda"

# Define public exports
__all__ = [
    # Encryption utilities
    "EncryptionService",
    "encrypt_string",
    "decrypt_string",
    
    # Logging utilities
    "StructuredLogger",
    "setup_logging",
    
    # Metrics utilities
    "MetricsManager",
    "track_time",
    "track_resource_usage",
    
    # Validation utilities
    "ValidationError",
    "validate_agent_config",
    "validate_deployment_environment",
    "sanitize_input",
    "validate_schema"
]

# Initialize default logger
logger = setup_logging("utils", {
    "json_logs": True,
    "cloudwatch_enabled": True,
    "log_level": "INFO"
})

# Initialize metrics collector
metrics = MetricsManager(
    namespace="AgentBuilderHub/Utils",
    dimensions={"service": "utils"}
)

def init_utils(config: Optional[Dict[str, Any]] = None) -> bool:
    """
    Initialize utility services with configuration and verify setup.
    
    Args:
        config: Optional configuration override
        
    Returns:
        bool: True if initialization successful
    """
    try:
        # Log initialization start
        logger.log("info", "Initializing utility services")
        
        # Track initialization metrics
        metrics.track_performance("utils_initialization", 1)
        
        # Verify encryption service
        encryption_service = EncryptionService(
            key_id=config.get("encryption_key_id") if config else None
        )
        test_value = "test_encryption"
        encrypted = encryption_service.encrypt_data(test_value)
        decrypted = encryption_service.decrypt_data(encrypted)
        if decrypted != test_value:
            raise ValueError("Encryption service validation failed")
            
        # Verify logging service
        logger.log("info", "Logging service test", {"test": True})
        
        # Verify metrics service
        metrics.track_performance("initialization_test", 1)
        
        # Verify validation service
        test_config = {"name": "test", "type": "standalone"}
        validate_agent_config(test_config)
        
        logger.log("info", "Utility services initialized successfully")
        return True
        
    except Exception as e:
        logger.log("error", f"Failed to initialize utility services: {str(e)}")
        metrics.track_performance("initialization_error", 1)
        raise

def get_version() -> str:
    """Returns the current version of the utilities package."""
    return __version__

def get_metrics_manager() -> MetricsManager:
    """Returns the global metrics manager instance."""
    return metrics

def get_logger() -> StructuredLogger:
    """Returns the global logger instance."""
    return logger