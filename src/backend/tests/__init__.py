"""
Agent Builder Hub Backend Test Suite Configuration
Configures global test settings, fixtures, and environment setup for automated testing.

Version: 1.0.0
"""

import os
import logging
from typing import List

import pytest  # ^7.4.0
import pytest_asyncio  # ^0.21.0

# Global test configuration
TEST_ENV = "test"
DEBUG = True
TEST_TIMEOUT = 30

# Configure logging for tests
logging.basicConfig(
    level=logging.DEBUG if DEBUG else logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

def pytest_configure(config: pytest.Config) -> None:
    """
    Configure global pytest environment before test execution.
    
    Args:
        config: pytest configuration object
    """
    # Set test environment variables
    os.environ["TEST_ENV"] = TEST_ENV
    os.environ["DEBUG"] = str(DEBUG)
    os.environ["AWS_DEFAULT_REGION"] = "us-east-1"
    
    # Register custom markers
    config.addinivalue_line(
        "markers",
        "unit: mark test as a unit test"
    )
    config.addinivalue_line(
        "markers",
        "integration: mark test as an integration test"
    )
    config.addinivalue_line(
        "markers",
        "performance: mark test as a performance test"
    )
    config.addinivalue_line(
        "markers",
        "security: mark test as a security test"
    )
    
    # Configure test coverage settings
    config.option.cov_report = {
        'term-missing': True,
        'html': True,
        'xml': True
    }
    
    # Configure parallel execution settings
    if hasattr(config.option, 'numprocesses'):
        logger.info(f"Configuring parallel execution with {config.option.numprocesses} processes")
    
    # Configure test database settings
    os.environ["TEST_DATABASE_URL"] = "postgresql://test:test@localhost:5432/test_db"
    
    # Configure AWS mocking
    os.environ["AWS_ACCESS_KEY_ID"] = "testing"
    os.environ["AWS_SECRET_ACCESS_KEY"] = "testing"
    os.environ["AWS_SECURITY_TOKEN"] = "testing"
    
    logger.info("Test environment configured successfully")

def pytest_collection_modifyitems(config: pytest.Config, items: List[pytest.Item]) -> None:
    """
    Modify test collection for proper test handling and organization.
    
    Args:
        config: pytest configuration object
        items: list of collected test items
    """
    # Add async marker to async test functions
    for item in items:
        if item.get_closest_marker('asyncio') is None:
            if item.name.startswith('test_') and 'async' in item.name:
                item.add_marker(pytest.mark.asyncio)
    
    # Configure test timeouts
    for item in items:
        # Set different timeouts based on test type
        if item.get_closest_marker('integration'):
            item.add_marker(pytest.mark.timeout(TEST_TIMEOUT * 2))
        elif item.get_closest_marker('performance'):
            item.add_marker(pytest.mark.timeout(TEST_TIMEOUT * 3))
        else:
            item.add_marker(pytest.mark.timeout(TEST_TIMEOUT))
    
    # Configure test ordering
    items.sort(key=lambda x: (
        # Run unit tests first, then integration tests
        1 if x.get_closest_marker('integration') else 0,
        # Run performance tests last
        1 if x.get_closest_marker('performance') else 0,
        # Maintain file order for same type tests
        x.fspath.strpath,
        x.name
    ))
    
    # Configure flaky test retries
    for item in items:
        if "flaky" in item.keywords:
            item.add_marker(pytest.mark.flaky(reruns=3))
    
    # Apply environment-specific skip markers
    skip_integration = pytest.mark.skip(reason="Integration tests disabled")
    if os.environ.get("SKIP_INTEGRATION_TESTS"):
        for item in items:
            if item.get_closest_marker('integration'):
                item.add_marker(skip_integration)
    
    logger.info(f"Collected {len(items)} tests")