"""
Integration Test Configuration Module

Configures test environment, fixtures, and pytest markers for AWS, enterprise, and LLM integration tests.
Provides comprehensive support for test isolation, performance optimization, and maintainability.

Version: 1.0.0
"""

import os
import logging
from typing import List
import pytest

# Integration test markers with descriptions
TEST_MARKERS = [
    "aws",          # AWS service integration tests
    "enterprise",   # Enterprise system integration tests 
    "llm",          # Language model integration tests
    "aws-ecs",      # AWS ECS specific tests
    "aws-lambda",   # AWS Lambda specific tests
    "aws-s3",       # AWS S3 specific tests
    "mavenlink",    # Mavenlink integration tests
    "lever",        # Lever integration tests
    "rippling",     # Rippling integration tests
    "openai",       # OpenAI integration tests
    "anthropic",    # Anthropic integration tests
    "bedrock"       # AWS Bedrock integration tests
]

# Marker descriptions for documentation
MARKER_DESCRIPTIONS = {
    "aws": "AWS service integration tests",
    "enterprise": "Enterprise system integration tests",
    "llm": "Language model integration tests"
}

# Marker dependencies for test organization
MARKER_DEPENDENCIES = {
    "aws-ecs": ["aws"],
    "aws-lambda": ["aws"],
    "aws-s3": ["aws"],
    "mavenlink": ["enterprise"],
    "lever": ["enterprise"],
    "rippling": ["enterprise"],
    "openai": ["llm"],
    "anthropic": ["llm"],
    "bedrock": ["llm", "aws"]
}

def pytest_configure(config):
    """
    Configure pytest environment for integration tests.
    
    Args:
        config: pytest config object
    """
    # Register base markers
    for marker, description in MARKER_DESCRIPTIONS.items():
        config.addinivalue_line(
            "markers",
            f"{marker}: {description}"
        )
    
    # Register service-specific markers
    for marker, deps in MARKER_DEPENDENCIES.items():
        config.addinivalue_line(
            "markers",
            f"{marker}: Integration tests for {marker} service (depends on: {', '.join(deps)})"
        )

    # Configure test environment
    os.environ.setdefault("TEST_ENV", "integration")
    
    # Setup logging
    logging.basicConfig(
        level=logging.INFO,
        format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
    )
    
    # Initialize test isolation
    if not hasattr(config, "workerinput"):
        # Running in main process
        _setup_test_isolation(config)

def pytest_collection_modifyitems(session, config, items: List[pytest.Item]):
    """
    Modify test collection for integration test organization and optimization.
    
    Args:
        session: pytest session object
        config: pytest config object
        items: List of collected test items
    """
    logger = logging.getLogger("integration_tests")
    
    for item in items:
        # Add category markers based on module path
        module_path = item.module.__name__
        
        if "aws" in module_path:
            item.add_marker(pytest.mark.aws)
        elif "enterprise" in module_path:
            item.add_marker(pytest.mark.enterprise)
        elif "llm" in module_path:
            item.add_marker(pytest.mark.llm)
            
        # Apply service-specific markers
        for marker_name in TEST_MARKERS:
            if marker_name in module_path:
                marker = getattr(pytest.mark, marker_name)
                item.add_marker(marker)
                
                # Add dependency markers
                if marker_name in MARKER_DEPENDENCIES:
                    for dep in MARKER_DEPENDENCIES[marker_name]:
                        dep_marker = getattr(pytest.mark, dep)
                        item.add_marker(dep_marker)
        
        # Skip tests based on environment configuration
        if _should_skip_test(item, config):
            item.add_marker(pytest.mark.skip(
                reason="Integration category disabled in current environment"
            ))
            
        logger.debug(f"Configured test: {item.name} with markers: {[m.name for m in item.iter_markers()]}")

def _setup_test_isolation(config):
    """
    Initialize test isolation mechanisms.
    
    Args:
        config: pytest config object
    """
    # Set unique test run ID
    os.environ["TEST_RUN_ID"] = pytest.test_run_id = os.urandom(8).hex()
    
    # Configure resource isolation prefixes
    os.environ["TEST_RESOURCE_PREFIX"] = f"test-{pytest.test_run_id}"
    
    # Setup cleanup hooks
    config.add_cleanup(lambda: _cleanup_test_resources())

def _should_skip_test(item: pytest.Item, config) -> bool:
    """
    Determine if a test should be skipped based on environment configuration.
    
    Args:
        item: pytest test item
        config: pytest config object
    
    Returns:
        bool: True if test should be skipped
    """
    # Check for disabled integration categories
    disabled_categories = os.environ.get("DISABLED_INTEGRATIONS", "").split(",")
    
    for marker in item.iter_markers():
        if marker.name in disabled_categories:
            return True
            
    return False

def _cleanup_test_resources():
    """Clean up any resources created during test execution."""
    logger = logging.getLogger("integration_tests")
    resource_prefix = os.environ.get("TEST_RESOURCE_PREFIX")
    
    if resource_prefix:
        logger.info(f"Cleaning up test resources with prefix: {resource_prefix}")
        # Resource cleanup logic implemented by specific test modules