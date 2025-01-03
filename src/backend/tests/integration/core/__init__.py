"""
Package initializer for core integration tests in Agent Builder Hub.
Provides comprehensive test utilities, fixtures, and base classes for testing core functionality.
Version: 1.0.0
"""

import pytest
from typing import Dict, Any, Optional
import structlog
from datetime import datetime

# Test environment constants
TEST_ENV = "integration"
TEST_MARKERS = ["core", "agent", "knowledge", "orchestration", "async", "security"]
LOG_LEVEL = "INFO"
METRICS_ENABLED = True

def pytest_configure(config: pytest.Config) -> None:
    """
    Enhanced pytest configuration for core integration tests with security and monitoring.
    
    Args:
        config: pytest configuration object
    """
    # Register core test markers
    for marker in TEST_MARKERS:
        config.addinivalue_line(
            "markers",
            f"{marker}: mark test as {marker} integration test"
        )

    # Configure test environment
    config.option.env = TEST_ENV
    
    # Configure structured logging for tests
    structlog.configure(
        processors=[
            structlog.processors.TimeStamper(fmt="iso"),
            structlog.processors.StackInfoRenderer(),
            structlog.processors.format_exc_info,
            structlog.processors.JSONRenderer()
        ],
        context_class=dict,
        logger_factory=structlog.PrintLoggerFactory(),
        wrapper_class=structlog.BoundLogger,
        cache_logger_on_first_use=True,
    )

    # Initialize test metrics collection
    if METRICS_ENABLED:
        config.metrics = {
            'test_counts': {'passed': 0, 'failed': 0, 'skipped': 0},
            'execution_times': {},
            'resource_usage': {},
            'error_counts': {}
        }

@pytest.mark.asyncio
class CoreIntegrationTest:
    """
    Enhanced base class for core integration tests providing comprehensive utilities,
    fixtures, async support, metrics collection and proper resource management.
    """

    @classmethod
    def setup_class(cls) -> None:
        """Enhanced class-level setup for integration tests."""
        # Initialize test configuration
        cls.test_config = {
            'environment': TEST_ENV,
            'timestamp': datetime.utcnow().isoformat(),
            'metrics_enabled': METRICS_ENABLED
        }

        # Configure structured logging
        cls.logger = structlog.get_logger(cls.__name__)
        cls.logger = cls.logger.bind(
            test_class=cls.__name__,
            environment=TEST_ENV
        )

        # Initialize test metrics
        cls.test_metrics = {
            'start_time': datetime.utcnow(),
            'execution_times': {},
            'resource_usage': {},
            'error_counts': {}
        }

        cls.logger.info(
            "Test class setup complete",
            test_class=cls.__name__,
            config=cls.test_config
        )

    @classmethod
    def teardown_class(cls) -> None:
        """Enhanced class-level teardown for integration tests."""
        try:
            # Calculate test execution metrics
            end_time = datetime.utcnow()
            execution_time = (end_time - cls.test_metrics['start_time']).total_seconds()
            
            cls.test_metrics.update({
                'end_time': end_time.isoformat(),
                'total_execution_time': execution_time
            })

            # Log test completion metrics
            cls.logger.info(
                "Test class teardown complete",
                test_class=cls.__name__,
                metrics=cls.test_metrics
            )

        except Exception as e:
            cls.logger.error(
                "Error in test teardown",
                test_class=cls.__name__,
                error=str(e)
            )
            raise

    def collect_metrics(self, metrics: Dict[str, Any]) -> None:
        """
        Collects and stores test execution metrics.
        
        Args:
            metrics: Dictionary containing test metrics
        """
        try:
            # Update test metrics
            self.test_metrics['execution_times'].update(metrics.get('execution_times', {}))
            self.test_metrics['resource_usage'].update(metrics.get('resource_usage', {}))
            self.test_metrics['error_counts'].update(metrics.get('error_counts', {}))

            # Log metric collection
            self.logger.info(
                "Test metrics collected",
                test_class=self.__class__.__name__,
                metrics=metrics
            )

        except Exception as e:
            self.logger.error(
                "Error collecting test metrics",
                test_class=self.__class__.__name__,
                error=str(e)
            )
            raise

__all__ = ['CoreIntegrationTest', 'pytest_configure']