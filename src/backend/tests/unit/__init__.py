"""
Unit test package initialization module for Agent Builder Hub backend.
Configures test collection, async support, and environment settings for unit tests.

Version: 1.0.0
"""

import logging
import pytest
from typing import List
from _pytest.config import Config
from _pytest.nodes import Item

# Unit test environment constants
UNIT_TEST_ENV = "unit"
UNIT_TEST_TIMEOUT = 15
PYTEST_UNIT_MARKERS = ["unit", "async_unit", "integration_unit", "slow_unit"]
PYTEST_UNIT_TIMEOUT = 15
UNIT_TEST_DEBUG = True
UNIT_TEST_RETRY_COUNT = 3
UNIT_TEST_PARALLEL_WORKERS = "auto"

# Configure logging for unit tests
if UNIT_TEST_DEBUG:
    logging.basicConfig(
        level=logging.DEBUG,
        format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
    )
logger = logging.getLogger(__name__)

def pytest_configure(config: Config) -> None:
    """
    Configure pytest environment for unit tests including async support and CI/CD integration.
    
    Args:
        config: pytest.Config object for test configuration
        
    Returns:
        None - Updates pytest configuration in place
    """
    # Register unit test markers
    for marker in PYTEST_UNIT_MARKERS:
        config.addinivalue_line(
            "markers",
            f"{marker}: mark test as {marker} test type"
        )
    
    # Configure async test settings
    config.option.asyncio_mode = "auto"
    
    # Set test isolation parameters
    config.option.isolated = True
    
    # Configure timeout settings
    config.option.timeout = PYTEST_UNIT_TIMEOUT
    
    # Set up CI/CD reporting
    config.option.junit_family = "xunit2"
    config.option.verbose = 2
    
    # Configure parallel execution
    if UNIT_TEST_PARALLEL_WORKERS:
        config.option.numprocesses = UNIT_TEST_PARALLEL_WORKERS
    
    # Enable test retries for flaky tests
    config.option.reruns = UNIT_TEST_RETRY_COUNT
    
    logger.debug("Pytest unit test configuration completed")

def pytest_collection_modifyitems(config: Config, items: List[Item]) -> None:
    """
    Configure pytest test collection for unit tests, handling async tests, timeouts, and isolation.
    
    Args:
        config: pytest.Config object for test configuration
        items: List of collected test items
        
    Returns:
        None - Modifies test collection in place
    """
    for item in items:
        # Add unit test marker to all tests
        item.add_marker(pytest.mark.unit)
        
        # Configure async test support
        if "async" in item.keywords:
            item.add_marker(pytest.mark.asyncio)
        
        # Set timeouts based on test type
        if "slow" in item.keywords:
            item.add_marker(
                pytest.mark.timeout(UNIT_TEST_TIMEOUT * 2)
            )
        else:
            item.add_marker(
                pytest.mark.timeout(UNIT_TEST_TIMEOUT)
            )
        
        # Configure test isolation
        item.add_marker(pytest.mark.isolated)
        
        # Set up test dependencies
        if hasattr(item, "fixturenames"):
            for fixture in item.fixturenames:
                if fixture.startswith("depends_"):
                    dependency = fixture.replace("depends_", "")
                    item.add_marker(
                        pytest.mark.depends(on=[dependency])
                    )
    
    # Sort tests based on dependencies
    items.sort(key=lambda x: len(getattr(x, "fixturenames", [])))
    
    logger.debug(f"Modified {len(items)} test items for unit testing")