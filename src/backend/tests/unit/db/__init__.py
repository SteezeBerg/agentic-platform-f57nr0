"""
Database test initialization module for Agent Builder Hub.
Provides test fixtures and utilities for database testing with performance monitoring.
Version: 1.0.0
"""

import asyncio
import contextlib
import logging
from typing import AsyncGenerator, Dict, Any

# Third-party imports with versions
import pytest  # pytest ^7.4.0
import pytest_asyncio  # pytest-asyncio ^0.21.0
from sqlalchemy import event  # sqlalchemy ^2.0.0
from sqlalchemy.ext.asyncio import (
    create_async_engine,
    AsyncEngine,
    AsyncSession,
    async_sessionmaker
)
from sqlalchemy.exc import SQLAlchemyError

# Internal imports
from src.config.settings import get_settings

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Global test configuration
TEST_DATABASE_URL = "sqlite:///:memory:"

TEST_ASYNC_ENGINE_ARGS = {
    "echo": True,
    "pool_pre_ping": True,
    "pool_size": 5,
    "max_overflow": 10,
    "pool_timeout": 30,
    "pool_recycle": 1800,
    "execution_options": {
        "timeout": 30,
        "isolation_level": "REPEATABLE READ"
    }
}

PERFORMANCE_THRESHOLDS = {
    "query_timeout_ms": 100,
    "connection_timeout_ms": 50,
    "pool_timeout_ms": 200
}

class DatabasePerformanceMonitor:
    """Monitors database operation performance during tests."""
    
    def __init__(self):
        self.query_times = []
        self.connection_times = []
        self.start_time = None

    def start_operation(self):
        self.start_time = asyncio.get_event_loop().time()

    def end_operation(self, operation_type: str):
        if self.start_time:
            duration = (asyncio.get_event_loop().time() - self.start_time) * 1000
            if operation_type == "query":
                self.query_times.append(duration)
            elif operation_type == "connection":
                self.connection_times.append(duration)
            self.start_time = None

    def check_thresholds(self):
        """Validates recorded times against performance thresholds."""
        if self.query_times:
            max_query_time = max(self.query_times)
            if max_query_time > PERFORMANCE_THRESHOLDS["query_timeout_ms"]:
                logger.warning(f"Query performance threshold exceeded: {max_query_time}ms")

        if self.connection_times:
            max_conn_time = max(self.connection_times)
            if max_conn_time > PERFORMANCE_THRESHOLDS["connection_timeout_ms"]:
                logger.warning(f"Connection performance threshold exceeded: {max_conn_time}ms")

@pytest.fixture(scope="session")
def event_loop():
    """Create an instance of the default event loop for the test session."""
    loop = asyncio.get_event_loop_policy().new_event_loop()
    yield loop
    loop.close()

@pytest_asyncio.fixture(scope="session")
async def setup_test_database(event_loop) -> AsyncGenerator[AsyncEngine, None]:
    """
    Creates and configures the test database engine with performance monitoring.
    
    Args:
        event_loop: pytest fixture providing the event loop
        
    Yields:
        AsyncEngine: Configured SQLAlchemy engine for test database
    """
    monitor = DatabasePerformanceMonitor()
    
    # Configure test engine with monitoring
    engine = create_async_engine(
        TEST_DATABASE_URL,
        **TEST_ASYNC_ENGINE_ARGS
    )

    # Add performance monitoring listeners
    @event.listens_for(engine.sync_engine, "before_cursor_execute")
    def before_cursor_execute(conn, cursor, statement, parameters, context, executemany):
        monitor.start_operation()

    @event.listens_for(engine.sync_engine, "after_cursor_execute")
    def after_cursor_execute(conn, cursor, statement, parameters, context, executemany):
        monitor.end_operation("query")

    try:
        # Initialize database
        async with engine.begin() as conn:
            # Create all tables - assuming models are imported and configured
            # await conn.run_sync(Base.metadata.create_all)
            logger.info("Test database initialized successfully")

        yield engine

        # Validate performance after tests complete
        monitor.check_thresholds()

    except SQLAlchemyError as e:
        logger.error(f"Database initialization error: {str(e)}")
        raise
    finally:
        # Cleanup
        async with engine.begin() as conn:
            # await conn.run_sync(Base.metadata.drop_all)
            logger.info("Test database cleanup completed")
        await engine.dispose()

@pytest_asyncio.fixture
async def test_session(setup_test_database: AsyncEngine) -> AsyncGenerator[AsyncSession, None]:
    """
    Provides an isolated database session for testing with performance monitoring.
    
    Args:
        setup_test_database: Fixture providing configured test database engine
        
    Yields:
        AsyncSession: SQLAlchemy session for test operations
    """
    monitor = DatabasePerformanceMonitor()
    
    # Create session factory with custom execution options
    session_factory = async_sessionmaker(
        bind=setup_test_database,
        expire_on_commit=False,
        class_=AsyncSession
    )

    async with session_factory() as session:
        # Start transaction
        await session.begin()
        
        # Create savepoint for test isolation
        await session.begin_nested()

        # Add performance monitoring
        @event.listens_for(session.sync_session, "after_transaction_end")
        def after_transaction_end(session, transaction):
            monitor.end_operation("query")

        try:
            yield session
            
            # Validate performance
            monitor.check_thresholds()
            
        except Exception as e:
            logger.error(f"Test session error: {str(e)}")
            await session.rollback()
            raise
        finally:
            # Always rollback to savepoint for isolation
            await session.rollback()
            await session.close()

__all__ = [
    "setup_test_database",
    "test_session",
    "TEST_DATABASE_URL",
    "TEST_ASYNC_ENGINE_ARGS",
    "PERFORMANCE_THRESHOLDS"
]