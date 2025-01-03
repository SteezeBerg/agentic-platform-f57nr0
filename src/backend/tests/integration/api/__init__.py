"""
Agent Builder Hub API Integration Test Package
Configures test environment and utilities for API integration testing with security and async support.

Version: 1.0.0
"""

import logging
import os
from typing import Dict

import pytest  # ^7.4.0
import pytest_asyncio  # ^0.21.0
import httpx  # ^0.24.0

from tests.integration import pytest_configure as base_configure

# API test configuration
API_TEST_TIMEOUT = 15  # Shorter timeout for API tests
API_BASE_PATH = "/api/v1"

# API-specific test markers
API_TEST_MARKERS = {
    "auth": "Authentication and authorization tests",
    "endpoints": "API endpoint functionality tests",
    "integration": "External service integration tests"
}

# Configure logging for API tests
logger = logging.getLogger(__name__)

def pytest_configure(config: pytest.Config) -> None:
    """
    Configure pytest environment specifically for API integration tests.
    Extends base integration test configuration with API-specific settings.
    
    Args:
        config: pytest configuration object
    """
    # Initialize base integration test configuration
    base_configure(config)
    
    # Set API test environment variables
    os.environ["API_TEST_TIMEOUT"] = str(API_TEST_TIMEOUT)
    os.environ["API_BASE_PATH"] = API_BASE_PATH
    
    # Register API-specific test markers
    for marker, description in API_TEST_MARKERS.items():
        config.addinivalue_line(
            "markers",
            f"{marker}: {description}"
        )
    
    # Configure async test settings for API operations
    config.option.asyncio_mode = "auto"
    
    # Configure HTTP client defaults for API testing
    httpx.DEFAULT_TIMEOUT_CONFIG.connect = API_TEST_TIMEOUT
    httpx.DEFAULT_TIMEOUT_CONFIG.read = API_TEST_TIMEOUT
    httpx.DEFAULT_TIMEOUT_CONFIG.write = API_TEST_TIMEOUT
    
    # Configure default headers for API requests
    os.environ["DEFAULT_API_HEADERS"] = str({
        "Content-Type": "application/json",
        "Accept": "application/json",
        "X-Test-Client": "API-Integration-Tests"
    })
    
    # Configure mock server settings for API testing
    os.environ["MOCK_API_SERVER_PORT"] = "8081"
    os.environ["MOCK_API_SERVER_HOST"] = "localhost"
    
    # Configure API test authentication settings
    os.environ["TEST_API_KEY"] = "test-api-key"
    os.environ["TEST_JWT_SECRET"] = "test-jwt-secret"
    
    # Configure API rate limiting for tests
    os.environ["API_RATE_LIMIT_ENABLED"] = "true"
    os.environ["API_RATE_LIMIT_REQUESTS"] = "100"
    os.environ["API_RATE_LIMIT_PERIOD"] = "60"
    
    # Configure API response validation
    os.environ["API_RESPONSE_VALIDATION_ENABLED"] = "true"
    os.environ["API_SCHEMA_VALIDATION_ENABLED"] = "true"
    
    # Configure API metrics collection
    os.environ["API_METRICS_ENABLED"] = "true"
    os.environ["API_METRICS_NAMESPACE"] = "api_integration_tests"
    
    # Configure API test reporting format
    config.option.report_format = "API Integration Test Report"
    
    logger.info("API integration test environment configured successfully")

# Export API test configuration
__all__ = [
    "pytest_configure",
    "API_TEST_TIMEOUT",
    "API_BASE_PATH"
]