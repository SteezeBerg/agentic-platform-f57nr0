"""
Unit tests for deployment strategies and implementations in Agent Builder Hub.
Tests base strategy, ECS deployment, and Lambda deployment functionality with enhanced AWS service mocking.
Version: 1.0.0
"""

import pytest
import uuid
from datetime import datetime
from unittest.mock import Mock, patch, AsyncMock
import boto3
from freezegun import freeze_time
from prometheus_client import CollectorRegistry

from core.deployment.strategy import DeploymentStrategy, BlueGreenStrategy
from core.deployment.ecs import ECSDeploymentStrategy
from core.deployment.lambda_deployer import LambdaDeployer
from schemas.deployment import DeploymentBase
from utils.metrics import MetricsCollector
from utils.logging import StructuredLogger

# Test constants
TEST_AGENT_ID = uuid.uuid4()
TEST_ENVIRONMENT = "development"
TEST_TIMESTAMP = "2024-02-20T12:00:00Z"

@pytest.fixture
def mock_aws_clients():
    """Fixture for mocked AWS clients with enhanced responses."""
    with patch("boto3.client") as mock_client:
        # Mock ECS client responses
        mock_ecs = Mock()
        mock_ecs.register_task_definition.return_value = {
            "taskDefinition": {"taskDefinitionArn": f"arn:aws:ecs:us-west-2:task-def/{TEST_AGENT_ID}"}
        }
        mock_ecs.update_service.return_value = {
            "service": {
                "serviceArn": f"arn:aws:ecs:us-west-2:service/{TEST_AGENT_ID}",
                "deployments": [{"id": str(uuid.uuid4())}]
            }
        }
        
        # Mock Lambda client responses
        mock_lambda = Mock()
        mock_lambda.get_function.return_value = {
            "Configuration": {
                "FunctionArn": f"arn:aws:lambda:us-west-2:function:{TEST_AGENT_ID}"
            }
        }
        mock_lambda.publish_version.return_value = {"Version": "1"}
        
        # Configure client mock
        def get_client(service_name):
            if service_name == "ecs":
                return mock_ecs
            elif service_name == "lambda":
                return mock_lambda
            return Mock()
            
        mock_client.side_effect = get_client
        return mock_client

@pytest.fixture
def base_deployment_config():
    """Fixture for base deployment configuration."""
    return DeploymentBase(
        agent_id=TEST_AGENT_ID,
        environment=TEST_ENVIRONMENT,
        config={
            "image_uri": "test-image:latest",
            "desired_count": 2,
            "memory": 512,
            "cpu": 256
        },
        security_config={
            "encryption_enabled": True,
            "audit_logging": True,
            "access_control": "role_based"
        },
        monitoring_config={
            "metrics_enabled": True,
            "health_check": {"enabled": True}
        },
        resource_limits={
            "cpu": 256,
            "memory": 512
        }
    )

class TestDeploymentStrategy:
    """Test cases for base deployment strategy functionality."""
    
    @pytest.mark.unit
    async def test_validate_config(self, base_deployment_config):
        """Test deployment configuration validation with enhanced checks."""
        strategy = DeploymentStrategy(base_deployment_config)
        
        # Test valid configuration
        assert strategy.validate_config() is True
        
        # Test invalid configuration
        invalid_config = base_deployment_config.copy()
        invalid_config.security_config["encryption_enabled"] = False
        strategy_invalid = DeploymentStrategy(invalid_config)
        assert strategy_invalid.validate_config() is False
        
        # Test missing required fields
        with pytest.raises(ValueError):
            DeploymentStrategy(DeploymentBase(
                agent_id=None,
                environment=TEST_ENVIRONMENT,
                config={}
            ))

    @pytest.mark.unit
    @freeze_time(TEST_TIMESTAMP)
    async def test_deployment_monitoring(self, base_deployment_config):
        """Test deployment monitoring and metrics collection."""
        strategy = DeploymentStrategy(base_deployment_config)
        
        # Mock metrics collector
        mock_metrics = Mock(spec=MetricsCollector)
        strategy._metrics = mock_metrics
        
        # Execute deployment
        await strategy.deploy()
        
        # Verify metrics were collected
        mock_metrics.track_performance.assert_called_with(
            'deployment_started',
            1,
            {'environment': TEST_ENVIRONMENT}
        )

class TestECSDeployment:
    """Test cases for ECS deployment strategy."""
    
    @pytest.mark.unit
    async def test_ecs_validate_config(self, base_deployment_config, mock_aws_clients):
        """Test ECS configuration validation with service-specific rules."""
        strategy = ECSDeploymentStrategy(
            base_deployment_config,
            deployment_options={
                "cluster": "test-cluster",
                "subnets": ["subnet-1"],
                "security_groups": ["sg-1"]
            }
        )
        
        # Test valid configuration
        assert strategy.validate_config() is True
        
        # Test missing required fields
        invalid_config = base_deployment_config.copy()
        invalid_config.config.pop("image_uri")
        strategy_invalid = ECSDeploymentStrategy(invalid_config)
        assert strategy_invalid.validate_config() is False

    @pytest.mark.unit
    @freeze_time(TEST_TIMESTAMP)
    async def test_ecs_deployment(self, base_deployment_config, mock_aws_clients):
        """Test ECS deployment process with health checks."""
        strategy = ECSDeploymentStrategy(
            base_deployment_config,
            deployment_options={
                "cluster": "test-cluster",
                "subnets": ["subnet-1"],
                "security_groups": ["sg-1"],
                "target_group_arn": "arn:aws:elasticloadbalancing:target-group"
            }
        )
        
        # Execute deployment
        deployment_result = await strategy.deploy()
        
        # Verify deployment success
        assert deployment_result["status"] == "success"
        assert "service_arn" in deployment_result
        assert "deployment_id" in deployment_result
        
        # Verify AWS client calls
        mock_aws_clients("ecs").register_task_definition.assert_called_once()
        mock_aws_clients("ecs").update_service.assert_called_once()

class TestLambdaDeployment:
    """Test cases for Lambda deployment strategy."""
    
    @pytest.mark.unit
    async def test_lambda_validate_config(self, base_deployment_config, mock_aws_clients):
        """Test Lambda configuration validation with runtime checks."""
        strategy = LambdaDeployer(
            base_deployment_config,
            deployment_options={
                "runtime": "python3.11",
                "memory_size": 1024,
                "timeout": 300
            }
        )
        
        # Test valid configuration
        assert strategy.validate_config() is True
        
        # Test invalid memory configuration
        invalid_config = base_deployment_config.copy()
        invalid_config.config["lambda_config"] = {"memory_size": 100000}
        strategy_invalid = LambdaDeployer(invalid_config)
        assert strategy_invalid.validate_config() is False

    @pytest.mark.unit
    @freeze_time(TEST_TIMESTAMP)
    async def test_lambda_deployment(self, base_deployment_config, mock_aws_clients):
        """Test Lambda deployment process with version management."""
        strategy = LambdaDeployer(
            base_deployment_config,
            deployment_options={
                "runtime": "python3.11",
                "memory_size": 1024,
                "timeout": 300
            }
        )
        
        # Execute deployment
        deployment_result = await strategy.deploy()
        
        # Verify deployment success
        assert deployment_result["status"] == "success"
        assert "version" in deployment_result
        assert "function_name" in deployment_result
        
        # Verify AWS client calls
        mock_aws_clients("lambda").publish_version.assert_called_once()
        mock_aws_clients("lambda").update_alias.assert_called()

    @pytest.mark.unit
    async def test_lambda_rollback(self, base_deployment_config, mock_aws_clients):
        """Test Lambda deployment rollback functionality."""
        strategy = LambdaDeployer(base_deployment_config)
        
        # Execute rollback
        rollback_result = await strategy.rollback()
        
        # Verify rollback execution
        mock_aws_clients("lambda").update_alias.assert_called_with(
            FunctionName=f"agent-{TEST_AGENT_ID}-{TEST_ENVIRONMENT}",
            Name="current",
            FunctionVersion=mock_aws_clients("lambda").publish_version.return_value["Version"]
        )