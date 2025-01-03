"""
Agent Builder Hub Integration Test Package
Configures integration test specific settings, handles test isolation, and manages test resources.

Version: 1.0.0
"""

import logging
import os
from typing import List

import pytest  # ^7.4.0
import pytest_asyncio  # ^0.21.0

from tests import pytest_configure

# Integration test environment configuration
INTEGRATION_TEST_ENV = "integration"
INTEGRATION_TEST_TIMEOUT = 30
INTEGRATION_TEST_DEBUG = True
INTEGRATION_TEST_RETRY_COUNT = 3
INTEGRATION_TEST_CLEANUP_ENABLED = True
INTEGRATION_TEST_PARALLEL_WORKERS = 4
INTEGRATION_TEST_LOG_LEVEL = "DEBUG"

# Integration test markers
PYTEST_INTEGRATION_MARKERS = ["integration", "slow", "database", "external"]

# Configure logging for integration tests
logging.basicConfig(
    level=logging.DEBUG if INTEGRATION_TEST_DEBUG else logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

def pytest_collection_modifyitems(config: pytest.Config, items: List[pytest.Item]) -> None:
    """
    Modifies test collection to handle integration test specific requirements.
    
    Args:
        config: pytest configuration object
        items: list of collected test items
    """
    # Add integration marker to all tests in this package
    for item in items:
        if "integration" not in [marker.name for marker in item.iter_markers()]:
            item.add_marker(pytest.mark.integration)
    
    # Configure test timeouts based on test type
    for item in items:
        if item.get_closest_marker("slow"):
            item.add_marker(pytest.mark.timeout(INTEGRATION_TEST_TIMEOUT * 2))
        elif item.get_closest_marker("database"):
            item.add_marker(pytest.mark.timeout(INTEGRATION_TEST_TIMEOUT * 1.5))
        else:
            item.add_marker(pytest.mark.timeout(INTEGRATION_TEST_TIMEOUT))
    
    # Configure test ordering for dependency management
    items.sort(key=lambda x: (
        # Run database setup tests first
        0 if "database_setup" in x.name else 1,
        # Run external integration tests last
        1 if x.get_closest_marker("external") else 0,
        # Maintain file order for same type tests
        x.fspath.strpath,
        x.name
    ))
    
    # Configure retry logic for flaky tests
    for item in items:
        if any(marker in item.keywords for marker in ["flaky", "external"]):
            item.add_marker(pytest.mark.flaky(reruns=INTEGRATION_TEST_RETRY_COUNT))
    
    # Configure parallel execution groups
    for item in items:
        if item.get_closest_marker("database"):
            item.add_marker(pytest.mark.group("database"))
        elif item.get_closest_marker("external"):
            item.add_marker(pytest.mark.group("external"))
    
    # Configure resource cleanup
    if INTEGRATION_TEST_CLEANUP_ENABLED:
        for item in items:
            if item.get_closest_marker("database"):
                item.add_marker(pytest.mark.usefixtures("cleanup_database"))
            elif item.get_closest_marker("external"):
                item.add_marker(pytest.mark.usefixtures("cleanup_external"))
    
    # Configure test environment variables
    os.environ["TEST_ENV"] = INTEGRATION_TEST_ENV
    os.environ["TEST_TIMEOUT"] = str(INTEGRATION_TEST_TIMEOUT)
    os.environ["TEST_DEBUG"] = str(INTEGRATION_TEST_DEBUG)
    os.environ["TEST_PARALLEL_WORKERS"] = str(INTEGRATION_TEST_PARALLEL_WORKERS)
    
    # Configure mock data and service responses
    for item in items:
        if item.get_closest_marker("external"):
            item.add_marker(pytest.mark.usefixtures("mock_external_services"))
    
    # Configure performance monitoring
    for item in items:
        if item.get_closest_marker("slow"):
            item.add_marker(pytest.mark.benchmark)
    
    logger.info(f"Configured {len(items)} integration tests")