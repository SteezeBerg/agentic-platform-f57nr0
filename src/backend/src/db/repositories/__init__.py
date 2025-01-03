"""
Repository module initialization file for Agent Builder Hub.
Provides centralized access to all database repository classes with enterprise-grade
connection pooling, security controls, and audit logging capabilities.
Version: 1.0.0
"""

from typing import Dict, Optional, Any
import logging
from datetime import datetime

# Third-party imports with versions
from psycopg2.pool import ConnectionPool  # v2.9.9
from aws_xray_sdk import AuditLogger  # v2.12.0

# Internal repository imports
from .user_repository import UserRepository
from .agent_repository import AgentRepository
from .deployment_repository import DeploymentRepository
from .knowledge_repository import KnowledgeRepository
from .template_repository import TemplateRepository

# Internal utility imports
from ...config.database import create_database_manager
from ...utils.logging import StructuredLogger
from ...utils.metrics import MetricsManager

# Initialize logging
logger = StructuredLogger("repositories", {"service": "data_access_layer"})
metrics = MetricsManager(namespace="AgentBuilderHub/Repositories")

# Initialize database manager
db_manager = create_database_manager()

# Configure connection pools with security settings
connection_pools = {
    "postgres": db_manager.get_postgres_engine(),
    "dynamodb": db_manager.get_dynamodb_client(),
    "redis": db_manager.get_redis_client(),
    "opensearch": db_manager.get_opensearch_client()
}

# Initialize audit logger
audit_logger = AuditLogger(
    service_name="repository_module",
    env=db_manager._config.get("environment", "development")
)

class RepositoryFactory:
    """Factory class for creating repository instances with connection management."""

    def __init__(self):
        """Initialize factory with connection pools and monitoring."""
        self._db_manager = db_manager
        self._connection_pools = connection_pools
        self._audit_logger = audit_logger
        self._metrics = metrics
        self._active_repositories: Dict[str, Any] = {}

    def get_user_repository(self) -> UserRepository:
        """Get or create UserRepository instance with connection pooling."""
        if "user" not in self._active_repositories:
            self._active_repositories["user"] = UserRepository(
                self._connection_pools["postgres"]
            )
        return self._active_repositories["user"]

    def get_agent_repository(self) -> AgentRepository:
        """Get or create AgentRepository instance with connection pooling."""
        if "agent" not in self._active_repositories:
            self._active_repositories["agent"] = AgentRepository(
                self._connection_pools["postgres"]
            )
        return self._active_repositories["agent"]

    def get_deployment_repository(self) -> DeploymentRepository:
        """Get or create DeploymentRepository instance with connection pooling."""
        if "deployment" not in self._active_repositories:
            self._active_repositories["deployment"] = DeploymentRepository(
                self._connection_pools["postgres"]
            )
        return self._active_repositories["deployment"]

    def get_knowledge_repository(self) -> KnowledgeRepository:
        """Get or create KnowledgeRepository instance with connection pooling."""
        if "knowledge" not in self._active_repositories:
            self._active_repositories["knowledge"] = KnowledgeRepository(
                self._db_manager
            )
        return self._active_repositories["knowledge"]

    def get_template_repository(self) -> TemplateRepository:
        """Get or create TemplateRepository instance with connection pooling."""
        if "template" not in self._active_repositories:
            self._active_repositories["template"] = TemplateRepository(
                self._connection_pools["postgres"]
            )
        return self._active_repositories["template"]

    def cleanup(self):
        """Clean up repository connections and resources."""
        try:
            for repo in self._active_repositories.values():
                if hasattr(repo, "cleanup"):
                    repo.cleanup()
            self._active_repositories.clear()
            logger.log("info", "Repository connections cleaned up successfully")
        except Exception as e:
            logger.log("error", f"Error cleaning up repository connections: {str(e)}")
            metrics.track_performance("repository_cleanup_error", 1)

# Create singleton factory instance
repository_factory = RepositoryFactory()

# Export repository classes and factory
__all__ = [
    "UserRepository",
    "AgentRepository", 
    "DeploymentRepository",
    "KnowledgeRepository",
    "TemplateRepository",
    "repository_factory"
]