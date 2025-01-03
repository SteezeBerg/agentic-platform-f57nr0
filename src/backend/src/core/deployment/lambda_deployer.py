"""
AWS Lambda deployment strategy implementation for Agent Builder Hub.
Provides enterprise-grade Lambda deployments with blue-green support, enhanced monitoring,
and comprehensive security controls.

Version: 1.0.0
"""

import json
import os
import time
from typing import Dict, Any, Optional, List
from datetime import datetime
import uuid

import boto3  # ^1.26.0
from botocore.exceptions import ClientError

from core.deployment.strategy import DeploymentStrategy
from schemas.deployment import DeploymentBase
from utils.metrics import MetricsCollector
from utils.logging import StructuredLogger

# Constants for Lambda deployment configuration
DEFAULT_MEMORY = 1024
DEFAULT_TIMEOUT = 300
DEFAULT_RUNTIME = "python3.11"
TRAFFIC_SHIFT_INTERVAL = 10  # seconds
HEALTH_CHECK_INTERVAL = 30  # seconds
MAX_DEPLOYMENT_TIME = 1800  # 30 minutes

class LambdaDeployer(DeploymentStrategy):
    """Implements Lambda-specific deployment strategy with enhanced security and monitoring."""

    def __init__(self, config: DeploymentBase, deployment_options: Optional[Dict[str, Any]] = None):
        """Initialize Lambda deployment strategy with monitoring and security configuration."""
        super().__init__(config, deployment_options)
        
        # Initialize AWS clients with proper credentials
        self._lambda_client = boto3.client('lambda')
        self._iam_client = boto3.client('iam')
        self._cloudwatch_client = boto3.client('cloudwatch')
        
        # Initialize deployment configuration
        self._function_config = self._init_function_config()
        self._function_name = f"agent-{self._config.agent_id}-{self._environment}"
        
        # Initialize metrics collector
        self._metrics_collector = MetricsCollector(
            namespace="AgentBuilderHub/Lambda",
            dimensions={
                "function_name": self._function_name,
                "environment": self._environment
            }
        )
        
        # Initialize deployment history tracking
        self._deployment_history = {
            "versions": [],
            "aliases": {},
            "rollbacks": []
        }

    def _init_function_config(self) -> Dict[str, Any]:
        """Initialize Lambda function configuration with security controls."""
        base_config = {
            "runtime": DEFAULT_RUNTIME,
            "memory_size": DEFAULT_MEMORY,
            "timeout": DEFAULT_TIMEOUT,
            "environment": {
                "Variables": {
                    "AGENT_ID": str(self._config.agent_id),
                    "ENVIRONMENT": self._environment,
                    "DEPLOYMENT_TIME": datetime.utcnow().isoformat()
                }
            },
            "tracing_config": {
                "Mode": "Active"
            },
            "layers": []
        }

        # Merge with deployment-specific configuration
        return {**base_config, **self._config.config.get("lambda_config", {})}

    def validate_config(self) -> bool:
        """Comprehensive validation of Lambda deployment configuration."""
        try:
            # Validate base deployment configuration
            if not super().validate_config():
                return False

            # Validate Lambda-specific configuration
            if not self._function_config:
                raise ValueError("Lambda function configuration is required")

            # Validate memory settings
            memory_size = self._function_config.get("memory_size", DEFAULT_MEMORY)
            if not 128 <= memory_size <= 10240:
                raise ValueError("Memory size must be between 128MB and 10240MB")

            # Validate timeout settings
            timeout = self._function_config.get("timeout", DEFAULT_TIMEOUT)
            if not 1 <= timeout <= 900:
                raise ValueError("Timeout must be between 1 and 900 seconds")

            # Validate runtime
            runtime = self._function_config.get("runtime", DEFAULT_RUNTIME)
            if not runtime.startswith("python3."):
                raise ValueError("Only Python runtimes are supported")

            # Validate VPC configuration if specified
            vpc_config = self._function_config.get("vpc_config")
            if vpc_config:
                if not vpc_config.get("subnet_ids"):
                    raise ValueError("VPC configuration requires subnet IDs")
                if not vpc_config.get("security_group_ids"):
                    raise ValueError("VPC configuration requires security group IDs")

            return True

        except Exception as e:
            self._logger.log("error", f"Configuration validation failed: {str(e)}")
            return False

    async def prepare_deployment(self) -> Dict[str, Any]:
        """Prepare Lambda deployment with enhanced security and monitoring."""
        try:
            # Start deployment preparation metrics
            self._metrics_collector.track_performance("deployment_preparation_started", 1)

            # Create or update IAM role with least privilege
            role_arn = await self._create_lambda_role()

            # Prepare function code package
            code_package = self._prepare_code_package()

            # Configure function settings
            function_config = {
                "FunctionName": self._function_name,
                "Runtime": self._function_config["runtime"],
                "Role": role_arn,
                "Handler": "handler.lambda_handler",
                "Code": {"ZipFile": code_package},
                "MemorySize": self._function_config["memory_size"],
                "Timeout": self._function_config["timeout"],
                "Environment": self._function_config["environment"],
                "TracingConfig": self._function_config["tracing_config"],
                "Layers": self._function_config["layers"],
                "Tags": {
                    "AgentId": str(self._config.agent_id),
                    "Environment": self._environment,
                    "DeploymentTime": datetime.utcnow().isoformat()
                }
            }

            # Add VPC configuration if specified
            if vpc_config := self._function_config.get("vpc_config"):
                function_config["VpcConfig"] = vpc_config

            # Configure encryption settings
            if self._config.security_config.get("encryption_enabled"):
                function_config["KMSKeyArn"] = self._config.security_config.get("kms_key_arn")

            # Track successful preparation
            self._metrics_collector.track_performance("deployment_preparation_completed", 1)

            return {
                "function_config": function_config,
                "role_arn": role_arn,
                "code_package": code_package
            }

        except Exception as e:
            self._logger.log("error", f"Deployment preparation failed: {str(e)}")
            self._metrics_collector.track_performance("deployment_preparation_error", 1)
            raise

    async def deploy(self) -> Dict[str, Any]:
        """Deploy Lambda function with blue-green deployment pattern."""
        try:
            # Start deployment metrics collection
            deployment_id = str(uuid.uuid4())
            start_time = datetime.utcnow()
            self._metrics_collector.track_performance("deployment_started", 1)

            # Prepare deployment resources
            preparation = await self.prepare_deployment()
            function_config = preparation["function_config"]

            # Check if function exists
            try:
                existing_config = self._lambda_client.get_function(
                    FunctionName=self._function_name
                )
                # Update existing function
                self._lambda_client.update_function_configuration(**function_config)
                self._lambda_client.update_function_code(
                    FunctionName=self._function_name,
                    ZipFile=preparation["code_package"]
                )
            except ClientError as e:
                if e.response["Error"]["Code"] == "ResourceNotFoundException":
                    # Create new function
                    self._lambda_client.create_function(**function_config)
                else:
                    raise

            # Publish new version
            version_response = self._lambda_client.publish_version(
                FunctionName=self._function_name,
                Description=f"Deployment {deployment_id}"
            )
            new_version = version_response["Version"]

            # Implement blue-green deployment
            await self._implement_blue_green_deployment(new_version)

            # Update deployment history
            self._deployment_history["versions"].append({
                "version": new_version,
                "deployment_id": deployment_id,
                "timestamp": datetime.utcnow().isoformat(),
                "config": function_config
            })

            # Track deployment success
            deployment_time = (datetime.utcnow() - start_time).total_seconds()
            self._metrics_collector.track_performance("deployment_completed", 1)
            self._metrics_collector.track_performance("deployment_duration", deployment_time)

            return {
                "status": "success",
                "deployment_id": deployment_id,
                "version": new_version,
                "function_name": self._function_name,
                "deployment_time": deployment_time
            }

        except Exception as e:
            self._logger.log("error", f"Deployment failed: {str(e)}")
            self._metrics_collector.track_performance("deployment_error", 1)
            await self.rollback()
            raise

    async def rollback(self) -> bool:
        """Rollback Lambda deployment with monitoring."""
        try:
            self._metrics_collector.track_performance("rollback_started", 1)

            # Get previous stable version
            if not self._deployment_history["versions"]:
                self._logger.log("error", "No previous versions available for rollback")
                return False

            previous_version = self._deployment_history["versions"][-2]["version"]

            # Update alias to point to previous version
            self._lambda_client.update_alias(
                FunctionName=self._function_name,
                Name="current",
                FunctionVersion=previous_version
            )

            # Update deployment history
            self._deployment_history["rollbacks"].append({
                "timestamp": datetime.utcnow().isoformat(),
                "from_version": self._deployment_history["versions"][-1]["version"],
                "to_version": previous_version
            })

            self._metrics_collector.track_performance("rollback_completed", 1)
            return True

        except Exception as e:
            self._logger.log("error", f"Rollback failed: {str(e)}")
            self._metrics_collector.track_performance("rollback_error", 1)
            raise

    async def _implement_blue_green_deployment(self, new_version: str) -> None:
        """Implement blue-green deployment with gradual traffic shifting."""
        try:
            # Create or update aliases
            self._lambda_client.create_alias(
                FunctionName=self._function_name,
                Name="blue",
                FunctionVersion=new_version
            )

            current_version = self._deployment_history["versions"][-1]["version"] if self._deployment_history["versions"] else "$LATEST"
            self._lambda_client.create_alias(
                FunctionName=self._function_name,
                Name="green",
                FunctionVersion=current_version
            )

            # Gradually shift traffic
            for percentage in range(0, 101, 10):
                self._lambda_client.update_alias(
                    FunctionName=self._function_name,
                    Name="current",
                    FunctionVersion=new_version,
                    RoutingConfig={
                        "AdditionalVersionWeights": {
                            current_version: (100 - percentage) / 100
                        }
                    }
                )

                # Monitor health during shift
                if not await self._check_deployment_health():
                    raise Exception("Health check failed during traffic shift")

                time.sleep(TRAFFIC_SHIFT_INTERVAL)

        except Exception as e:
            self._logger.log("error", f"Blue-green deployment failed: {str(e)}")
            raise

    async def _check_deployment_health(self) -> bool:
        """Monitor Lambda function health during deployment."""
        try:
            # Check CloudWatch metrics
            metrics_response = self._cloudwatch_client.get_metric_data(
                MetricDataQueries=[
                    {
                        "Id": "errors",
                        "MetricStat": {
                            "Metric": {
                                "Namespace": "AWS/Lambda",
                                "MetricName": "Errors",
                                "Dimensions": [
                                    {
                                        "Name": "FunctionName",
                                        "Value": self._function_name
                                    }
                                ]
                            },
                            "Period": 60,
                            "Stat": "Sum"
                        }
                    }
                ],
                StartTime=datetime.utcnow().timestamp() - 300,
                EndTime=datetime.utcnow().timestamp()
            )

            error_count = sum(metrics_response["MetricDataResults"][0]["Values"])
            if error_count > 0:
                self._logger.log("warning", f"Detected {error_count} errors during deployment")
                return False

            return True

        except Exception as e:
            self._logger.log("error", f"Health check failed: {str(e)}")
            return False

    async def _create_lambda_role(self) -> str:
        """Create IAM role for Lambda function with least privilege."""
        role_name = f"agent-lambda-role-{self._config.agent_id}"
        
        try:
            # Create role if it doesn't exist
            try:
                role = self._iam_client.get_role(RoleName=role_name)
                return role["Role"]["Arn"]
            except ClientError:
                # Create new role with basic Lambda execution policy
                role = self._iam_client.create_role(
                    RoleName=role_name,
                    AssumeRolePolicyDocument=json.dumps({
                        "Version": "2012-10-17",
                        "Statement": [{
                            "Effect": "Allow",
                            "Principal": {"Service": "lambda.amazonaws.com"},
                            "Action": "sts:AssumeRole"
                        }]
                    })
                )

                # Attach necessary policies
                self._iam_client.attach_role_policy(
                    RoleName=role_name,
                    PolicyArn="arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
                )

                # Add custom policies if specified
                if custom_policies := self._config.security_config.get("custom_policies"):
                    for policy in custom_policies:
                        self._iam_client.attach_role_policy(
                            RoleName=role_name,
                            PolicyArn=policy
                        )

                return role["Role"]["Arn"]

        except Exception as e:
            self._logger.log("error", f"Failed to create Lambda role: {str(e)}")
            raise

    def _prepare_code_package(self) -> bytes:
        """Prepare Lambda function code package."""
        # Implementation for code packaging would go here
        # This is a placeholder that would need to be implemented based on
        # the actual code packaging requirements
        return b""