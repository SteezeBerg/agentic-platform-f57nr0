"""
Database module initialization file for Agent Builder Hub.
Provides centralized access to database models, repositories, and connection management
with comprehensive security, monitoring and error handling capabilities.
Version: 1.0.0
"""

import logging
from typing import Optional, Dict, Any

# Third-party imports with versions
from sqlalchemy import create_engine  # ^2.0.0
from sqlalchemy.orm import sessionmaker
from sqlalchemy.exc import SQLAlchemyError
from prometheus_client import Counter, Histogram  # ^0.17.0

# Import all models
from .models import (
    User, Agent, Deployment, KnowledgeSource, Index,
    Metric, AgentMetrics, SystemMetrics, Template
)

# Import all repositories
from .repositories import (
    UserRepository, AgentRepository, DeploymentRepository,
    KnowledgeRepository, TemplateRepository
)

# Import database configuration
from ..config.database import (
    DatabaseManager, create_database_manager, init_databases
)

# Initialize logging
logger = logging.getLogger(__name__)

# Initialize metrics
METRICS = {
    'db_operations': Counter(
        'database_operations_total',
        'Total number of database operations',
        ['operation', 'status']
    ),
    'operation_duration': Histogram(
        'database_operation_duration_seconds',
        'Duration of database operations',
        ['operation']
    )
}

def initialize_db() -> bool:
    """
    Initialize and validate all database connections with comprehensive error handling
    and connection pool management.

    Returns:
        bool: Success status of initialization
    """
    try:
        # Configure logging for database operations
        logger.info("Initializing database connections...")

        # Initialize database manager instance
        db_manager = create_database_manager()

        # Verify PostgreSQL connection and pool settings
        engine = db_manager.get_postgres_engine()
        engine.connect().close()
        logger.info("PostgreSQL connection verified")

        # Verify DynamoDB connection and table status
        dynamodb = db_manager.get_dynamodb_client()
        dynamodb.describe_table(TableName="agents")
        logger.info("DynamoDB connection verified")

        # Verify OpenSearch connection and index status
        opensearch = db_manager.get_opensearch_client()
        cluster_health = opensearch.cluster.health()
        if cluster_health['status'] not in ['green', 'yellow']:
            raise ConnectionError("OpenSearch cluster health check failed")
        logger.info("OpenSearch connection verified")

        # Initialize database tables
        init_databases()
        logger.info("Database tables initialized")

        # Validate model relationships
        session = sessionmaker(bind=engine)()
        try:
            # Test queries to validate connectivity
            session.query(User).first()
            session.query(Agent).first()
            session.query(Deployment).first()
            logger.info("Model relationships validated")
        finally:
            session.close()

        # Track successful initialization
        METRICS['db_operations'].labels(
            operation='initialization',
            status='success'
        ).inc()

        logger.info("Database initialization completed successfully")
        return True

    except SQLAlchemyError as e:
        logger.error(f"Database initialization failed: {str(e)}")
        METRICS['db_operations'].labels(
            operation='initialization',
            status='error'
        ).inc()
        raise

    except Exception as e:
        logger.error(f"Unexpected error during database initialization: {str(e)}")
        METRICS['db_operations'].labels(
            operation='initialization',
            status='error'
        ).inc()
        raise

# Export models, repositories and initialization functions
__all__ = [
    # Models
    "User",
    "Agent", 
    "Deployment",
    "KnowledgeSource",
    "Index",
    "Metric",
    "AgentMetrics",
    "SystemMetrics",
    "Template",
    
    # Repositories
    "UserRepository",
    "AgentRepository",
    "DeploymentRepository",
    "KnowledgeRepository", 
    "TemplateRepository",
    
    # Database management
    "DatabaseManager",
    "init_databases",
    "initialize_db"
]