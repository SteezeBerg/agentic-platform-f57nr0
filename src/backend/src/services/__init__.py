"""
Service layer entry point for Agent Builder Hub.
Provides centralized access to core services with comprehensive monitoring and security controls.
Version: 1.0.0
"""

from typing import Dict, Any, Optional

# Import core services
from .auth_service import AuthService
from .agent_service import AgentService
from .deployment_service import DeploymentService
from .knowledge_service import KnowledgeService

# Define exported services
__all__ = [
    "AuthService",
    "AgentService", 
    "DeploymentService",
    "KnowledgeService"
]

# Service configuration and monitoring
SERVICE_VERSION = "1.0.0"
SERVICE_NAMESPACE = "AgentBuilderHub/Services"

# Service health check status tracking
_service_health_status: Dict[str, Any] = {
    "auth_service": {"status": "unknown", "last_check": None},
    "agent_service": {"status": "unknown", "last_check": None},
    "deployment_service": {"status": "unknown", "last_check": None},
    "knowledge_service": {"status": "unknown", "last_check": None}
}

# Service initialization status
_initialized_services: Dict[str, bool] = {
    "auth_service": False,
    "agent_service": False,
    "deployment_service": False,
    "knowledge_service": False
}

def get_service_status() -> Dict[str, Any]:
    """Get comprehensive status of all services."""
    return {
        "version": SERVICE_VERSION,
        "namespace": SERVICE_NAMESPACE,
        "services": _service_health_status,
        "initialized": _initialized_services
    }

def update_service_status(service_name: str, status: Dict[str, Any]) -> None:
    """Update health status for a specific service."""
    if service_name in _service_health_status:
        _service_health_status[service_name].update(status)

def mark_service_initialized(service_name: str) -> None:
    """Mark a service as successfully initialized."""
    if service_name in _initialized_services:
        _initialized_services[service_name] = True

# Service layer documentation
SERVICE_DOCUMENTATION = {
    "AuthService": {
        "description": "Authentication and authorization service",
        "capabilities": [
            "User authentication",
            "Token management",
            "Permission verification",
            "Security audit logging"
        ]
    },
    "AgentService": {
        "description": "Agent lifecycle management service",
        "capabilities": [
            "Agent creation",
            "Configuration management",
            "State tracking",
            "Template-based instantiation"
        ]
    },
    "DeploymentService": {
        "description": "Deployment orchestration service",
        "capabilities": [
            "Multi-environment deployments",
            "Blue/green deployment",
            "Health monitoring",
            "Automated rollback"
        ]
    },
    "KnowledgeService": {
        "description": "Knowledge management service",
        "capabilities": [
            "Content indexing",
            "RAG processing",
            "Vector operations",
            "Knowledge retrieval"
        ]
    }
}

def get_service_documentation(service_name: Optional[str] = None) -> Dict[str, Any]:
    """Get service documentation for one or all services."""
    if service_name:
        return SERVICE_DOCUMENTATION.get(service_name, {})
    return SERVICE_DOCUMENTATION