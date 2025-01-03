"""
Alembic migrations environment configuration for Agent Builder Hub.
Manages database migrations with secure connections, comprehensive logging, and transaction management.
Version: 1.0.0
"""

import logging
from logging.handlers import RotatingFileHandler
import os
from typing import Optional, Dict, Any

from alembic import context
from sqlalchemy import engine_from_config, pool
from sqlalchemy.engine import Connection
from sqlalchemy.exc import SQLAlchemyError

# Internal imports
from ...config.database import DatabaseManager
from ...config.settings import Settings
from ..models import Base

# Initialize alembic context config
config = context.config

# Initialize target metadata for migrations
target_metadata = Base.metadata

# Configure logging with enhanced formatting
logger = logging.getLogger('alembic.migration')

# Constants for migration management
BATCH_SIZE = 1000  # Number of operations per batch
CONNECTION_TIMEOUT = 300  # Connection timeout in seconds

def configure_logging(log_level: str = 'INFO') -> None:
    """
    Configure enhanced logging for migration operations.
    
    Args:
        log_level: Logging level to use
    """
    # Create logs directory if it doesn't exist
    log_dir = 'logs'
    if not os.path.exists(log_dir):
        os.makedirs(log_dir)

    # Configure file handler with rotation
    file_handler = RotatingFileHandler(
        f'{log_dir}/alembic_migrations.log',
        maxBytes=10485760,  # 10MB
        backupCount=5
    )

    # Configure console handler
    console_handler = logging.StreamHandler()

    # Set formatter with enhanced details
    formatter = logging.Formatter(
        '%(asctime)s - %(name)s - %(levelname)s - %(message)s - '
        'Migration: %(migration_id)s - Operation: %(operation)s'
    )

    # Apply formatter to handlers
    file_handler.setFormatter(formatter)
    console_handler.setFormatter(formatter)

    # Configure logger
    logger.setLevel(getattr(logging, log_level.upper()))
    logger.addHandler(file_handler)
    logger.addHandler(console_handler)

def run_migrations_offline() -> None:
    """
    Run migrations in 'offline' mode with enhanced script generation.
    
    This configures the context with just a URL and not an Engine,
    though an Engine is acceptable here as well.
    """
    try:
        # Get database configuration
        settings = Settings()
        db_config = settings.database_config

        # Configure database URL with secure parameters
        url = f"postgresql://{db_config.username}:{db_config.password}@{db_config.host}:{db_config.port}/{db_config.database}"

        # Configure context with enhanced settings
        context.configure(
            url=url,
            target_metadata=target_metadata,
            literal_binds=True,
            compare_type=True,
            compare_server_default=True,
            include_schemas=True,
            version_table='alembic_version',
            version_table_schema='public'
        )

        logger.info("Starting offline migration script generation")

        with context.begin_transaction():
            context.run_migrations()

        logger.info("Completed offline migration script generation")

    except Exception as e:
        logger.error(f"Failed to run offline migrations: {str(e)}")
        raise

def run_migrations_online() -> None:
    """
    Run migrations in 'online' mode with transaction management and validation.
    """
    try:
        # Initialize database manager with secure configuration
        db_manager = DatabaseManager()
        engine = db_manager.get_postgres_engine()

        # Validate database connection
        db_manager.validate_connection()

        # Configure connection pool with timeout
        connection = engine.connect()
        connection.dialect.default_schema_name = 'public'

        logger.info("Starting online migration execution")

        with connection.begin() as transaction:
            context.configure(
                connection=connection,
                target_metadata=target_metadata,
                compare_type=True,
                compare_server_default=True,
                include_schemas=True,
                version_table='alembic_version',
                version_table_schema='public',
                transaction_per_migration=True,
                max_batch_size=BATCH_SIZE
            )

            try:
                # Execute migrations with validation
                context.run_migrations()
                
                # Validate migration success
                if validate_migration(connection, context):
                    transaction.commit()
                    logger.info("Successfully committed migrations")
                else:
                    transaction.rollback()
                    logger.error("Migration validation failed, rolling back")
                    raise Exception("Migration validation failed")

            except Exception as e:
                transaction.rollback()
                logger.error(f"Migration failed, rolling back: {str(e)}")
                raise

            finally:
                connection.close()

    except SQLAlchemyError as e:
        logger.error(f"Database error during migration: {str(e)}")
        raise
    except Exception as e:
        logger.error(f"Unexpected error during migration: {str(e)}")
        raise

def validate_migration(connection: Connection, context: Any) -> bool:
    """
    Validate migration execution with comprehensive checks.
    
    Args:
        connection: SQLAlchemy connection
        context: Alembic context
        
    Returns:
        bool: Validation result
    """
    try:
        # Verify schema consistency
        inspector = connection.dialect.inspector
        tables = inspector.get_table_names()
        
        # Check all required tables exist
        required_tables = [table.name for table in target_metadata.tables.values()]
        missing_tables = set(required_tables) - set(tables)
        
        if missing_tables:
            logger.error(f"Missing tables after migration: {missing_tables}")
            return False

        # Verify constraints and indices
        for table_name in required_tables:
            # Check primary keys
            pk = inspector.get_pk_constraint(table_name)
            if not pk:
                logger.error(f"Missing primary key on table: {table_name}")
                return False

            # Check foreign keys
            fks = inspector.get_foreign_keys(table_name)
            expected_fks = [fk for fk in target_metadata.tables[table_name].foreign_keys]
            if len(fks) != len(expected_fks):
                logger.error(f"Foreign key mismatch on table: {table_name}")
                return False

        logger.info("Migration validation successful")
        return True

    except Exception as e:
        logger.error(f"Migration validation failed: {str(e)}")
        return False

# Configure logging based on environment
configure_logging(Settings().get_environment())

if context.is_offline_mode():
    logger.info("Running migrations in offline mode")
    run_migrations_offline()
else:
    logger.info("Running migrations in online mode")
    run_migrations_online()