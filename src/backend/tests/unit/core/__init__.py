"""
Core unit tests initialization module for Agent Builder Hub backend.
Configures test environment, async support, test discovery, and comprehensive test markers.
Version: 1.0.0
"""

import pytest
import pytest_asyncio
from typing import List
from tests.conftest import fixture

# Core test module configuration
CORE_TEST_MODULES = ["agents", "auth", "deployment", "knowledge", "orchestration"]
PYTEST_ASYNC_MODE = "auto"
CORE_TEST_TIMEOUT = 30
CORE_TEST_MARKERS = [
    "agents",
    "auth", 
    "deployment",
    "knowledge",
    "orchestration",
    "integration",
    "performance",
    "security"
]

# Register test plugins for core modules
pytest_plugins = [
    "tests.unit.core.fixtures.agent_fixtures",
    "tests.unit.core.fixtures.auth_fixtures",
    "tests.unit.core.fixtures.knowledge_fixtures",
    "tests.unit.core.fixtures.deployment_fixtures"
]

def pytest_configure(config: pytest.Config) -> None:
    """
    Configure pytest environment with custom markers and settings for core testing.
    
    Args:
        config: pytest configuration object
    """
    # Register custom markers for core test modules
    for marker in CORE_TEST_MARKERS:
        config.addinivalue_line(
            "markers",
            f"{marker}: mark test as {marker} test"
        )

    # Configure async test settings
    config.option.asyncio_mode = PYTEST_ASYNC_MODE

    # Set test timeouts
    config.option.timeout = CORE_TEST_TIMEOUT

    # Initialize test isolation mechanisms
    config.option.isolated_download = True
    config.option.isolated_build = True

    # Configure test database isolation
    config.option.nomigrations = True
    config.option.reuse_db = False

    # Set core test environment variables
    config.option.environment = "test"
    config.option.log_level = "DEBUG"

def pytest_collection_modifyitems(config: pytest.Config, items: List[pytest.Item]) -> None:
    """
    Modifies test collection to ensure proper test ordering and dependencies.
    
    Args:
        config: pytest configuration object
        items: List of collected test items
    """
    # Sort tests by dependencies
    items.sort(key=lambda x: x.get_closest_marker("dependency").args[0] if x.get_closest_marker("dependency") else 0)

    # Apply markers based on test path
    for item in items:
        # Add module-specific markers
        for module in CORE_TEST_MODULES:
            if module in str(item.fspath):
                item.add_marker(getattr(pytest.mark, module))

        # Add integration test marker if needed
        if "integration" in str(item.fspath):
            item.add_marker(pytest.mark.integration)

        # Add performance test marker if needed
        if "performance" in str(item.fspath):
            item.add_marker(pytest.mark.performance)

        # Add security test marker if needed
        if "security" in str(item.fspath):
            item.add_marker(pytest.mark.security)

    # Configure async test groups
    async_items = [item for item in items if item.get_closest_marker("asyncio")]
    for item in async_items:
        item.add_marker(pytest.mark.asyncio)

    # Set test timeouts based on markers
    for item in items:
        if item.get_closest_marker("performance"):
            item.add_marker(pytest.mark.timeout(60))  # Longer timeout for performance tests
        elif item.get_closest_marker("integration"):
            item.add_marker(pytest.mark.timeout(45))  # Medium timeout for integration tests
        else:
            item.add_marker(pytest.mark.timeout(CORE_TEST_TIMEOUT))  # Default timeout