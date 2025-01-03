"""
Deployment module initialization for Agent Builder Hub.
Provides unified interface for deployment strategies with enhanced monitoring, security, and error handling.
Version: 1.0.0
"""

from typing import Dict, Any, Literal, Union, Type, Optional
from functools import wraps

from .strategy import DeploymentStrategy
from .ecs import ECSDeploymentStrategy
from .lambda_deployer import LambdaDeployer
from core.exceptions import DeploymentError
from utils.logging import StructuredLogger
from utils.metrics import MetricsCollector

# Type definitions for deployment strategies
DEPLOYMENT_STRATEGIES: Dict[Literal['ecs', 'lambda'], Type[DeploymentStrategy]] = {
    'ecs': ECSDeploymentStrategy,
    'lambda': LambdaDeployer
}

DEPLOYMENT_TYPES = Literal['ecs', 'lambda']

# Initialize logging and metrics
logger = StructuredLogger('deployment_module', {
    'service': 'agent_builder',
    'component': 'deployment'
})
metrics = MetricsCollector(namespace='AgentBuilderHub/Deployment')

def validate_deployment_config(func):
    """Decorator for validating deployment configuration."""
    @wraps(func)
    def wrapper(deployment_type: DEPLOYMENT_TYPES, config: Dict[str, Any], *args, **kwargs):
        try:
            # Validate deployment type
            if deployment_type not in DEPLOYMENT_STRATEGIES:
                raise DeploymentError(f"Invalid deployment type: {deployment_type}")

            # Validate required configuration
            if not config:
                raise DeploymentError("Deployment configuration is required")

            # Validate environment
            environment = config.get('environment')
            if not environment or environment not in ['development', 'staging', 'production']:
                raise DeploymentError(f"Invalid environment: {environment}")

            # Track validation metrics
            metrics.track_performance('config_validation', 1, {
                'deployment_type': deployment_type,
                'environment': environment
            })

            return func(deployment_type, config, *args, **kwargs)

        except Exception as e:
            logger.log('error', f"Deployment configuration validation failed: {str(e)}")
            metrics.track_performance('config_validation_error', 1)
            raise DeploymentError(f"Configuration validation failed: {str(e)}")

    return wrapper

@validate_deployment_config
def get_deployment_strategy(
    deployment_type: DEPLOYMENT_TYPES,
    config: Dict[str, Any],
    deployment_options: Optional[Dict[str, Any]] = None
) -> DeploymentStrategy:
    """
    Factory function to get appropriate deployment strategy with enhanced monitoring.

    Args:
        deployment_type: Type of deployment (ecs or lambda)
        config: Deployment configuration
        deployment_options: Additional deployment options

    Returns:
        Initialized deployment strategy instance

    Raises:
        DeploymentError: If strategy initialization fails
    """
    try:
        # Get strategy class
        strategy_class = DEPLOYMENT_STRATEGIES[deployment_type]

        # Initialize metrics collection
        metrics.track_performance('strategy_initialization', 1, {
            'deployment_type': deployment_type,
            'environment': config['environment']
        })

        # Initialize strategy with monitoring
        strategy = strategy_class(
            config=config,
            deployment_options=deployment_options or {}
        )

        # Validate strategy configuration
        if not strategy.validate_config():
            raise DeploymentError(f"Invalid configuration for {deployment_type} deployment")

        logger.log('info', f"Successfully initialized {deployment_type} deployment strategy")
        return strategy

    except Exception as e:
        logger.log('error', f"Failed to initialize deployment strategy: {str(e)}")
        metrics.track_performance('strategy_initialization_error', 1, {
            'deployment_type': deployment_type,
            'error': str(e)
        })
        raise DeploymentError(f"Strategy initialization failed: {str(e)}")

__all__ = [
    'DeploymentStrategy',
    'get_deployment_strategy',
    'DEPLOYMENT_STRATEGIES',
    'DEPLOYMENT_TYPES'
]