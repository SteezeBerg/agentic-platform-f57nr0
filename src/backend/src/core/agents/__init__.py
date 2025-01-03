"""
Main entry point for the agents module, providing centralized access to agent creation,
configuration, and execution functionality with enhanced security, monitoring, and RAG capabilities.
Version: 1.0.0
"""

from typing import Dict, List, Optional, Any, Union
from datetime import datetime

# Third-party imports with versions
from circuitbreaker import CircuitBreaker  # ^1.4.0
from opentelemetry import trace  # ^1.20.0

# Internal imports
from core.agents.templates import TemplateManager
from core.agents.builder import AgentBuilder
from core.agents.factory import AgentFactory
from core.agents.executor import AgentExecutor

# Initialize tracer
tracer = trace.get_tracer(__name__)

# Global version
__version__ = "1.0.0"

# Export core components
__all__ = [
    "TemplateManager",
    "AgentBuilder",
    "AgentFactory",
    "AgentExecutor"
]

# Global constants
SUPPORTED_AGENT_TYPES = ["streamlit", "slack", "aws_react", "standalone"]
SUPPORTED_CAPABILITIES = ["rag", "chat", "task_automation", "data_processing", "secure_communication"]
SECURITY_LEVELS = ["basic", "enhanced", "enterprise"]

# Circuit breaker configuration
CIRCUIT_BREAKER_CONFIG = {
    "failure_threshold": 5,
    "recovery_timeout": 30,
    "half_open_timeout": 15
}

@tracer.start_as_current_span("validate_agent_config")
def validate_agent_config(config: Dict[str, Any]) -> bool:
    """
    Validate agent configuration against required schema.
    
    Args:
        config: Agent configuration dictionary
        
    Returns:
        bool: Validation result
    """
    required_fields = {
        "name", 
        "type", 
        "config", 
        "security_config", 
        "monitoring_config"
    }
    
    if not all(field in config for field in required_fields):
        return False
        
    if config["type"] not in SUPPORTED_AGENT_TYPES:
        return False
        
    if "capabilities" in config:
        if not all(cap in SUPPORTED_CAPABILITIES for cap in config["capabilities"]):
            return False
            
    return True

@tracer.start_as_current_span("validate_security_context") 
def validate_security_context(context: Dict[str, Any]) -> bool:
    """
    Validate security context for agent operations.
    
    Args:
        context: Security context dictionary
        
    Returns:
        bool: Validation result
    """
    required_fields = {
        "security_level",
        "encryption_enabled",
        "audit_logging",
        "access_control"
    }
    
    if not all(field in context for field in required_fields):
        return False
        
    if not context.get("encryption_enabled", False):
        return False
        
    if context.get("security_level") not in SECURITY_LEVELS:
        return False
        
    return True

@tracer.start_as_current_span("validate_monitoring_config")
def validate_monitoring_config(config: Dict[str, Any]) -> bool:
    """
    Validate monitoring configuration.
    
    Args:
        config: Monitoring configuration dictionary
        
    Returns:
        bool: Validation result
    """
    required_fields = {
        "metrics_enabled",
        "performance_tracking",
        "health_checks",
        "alert_thresholds"
    }
    
    if not all(field in config for field in required_fields):
        return False
        
    if not config.get("metrics_enabled", False):
        return False
        
    thresholds = config.get("alert_thresholds", {})
    required_thresholds = {"error_rate", "latency_ms", "memory_usage"}
    
    if not all(threshold in thresholds for threshold in required_thresholds):
        return False
        
    return True

# Initialize circuit breaker for core operations
circuit_breaker = CircuitBreaker(**CIRCUIT_BREAKER_CONFIG)