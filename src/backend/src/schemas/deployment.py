"""
Pydantic schema definitions for deployment configurations, validation rules, and API request/response models.
Implements comprehensive validation for deployment options, multi-environment support, and blue/green deployment strategies.
Version: 1.0.0
"""

from datetime import datetime
from typing import Dict, List, Optional, Union
from uuid import UUID

from pydantic import BaseModel, Field, validator, root_validator

from schemas.agent import AgentResponse
from schemas.metrics import SystemMetricsSchema

# Global constants for validation
DEPLOYMENT_ENVIRONMENTS = ['development', 'staging', 'production']
DEPLOYMENT_STATUSES = ['pending', 'in_progress', 'completed', 'failed', 'rolling_back']
DEPLOYMENT_TYPES = ['streamlit', 'slack', 'react', 'standalone']

# Resource limits per environment
ENVIRONMENT_RESOURCE_LIMITS = {
    'development': {'cpu': 1, 'memory': 2048},
    'staging': {'cpu': 2, 'memory': 4096},
    'production': {'cpu': 4, 'memory': 8192}
}

class DeploymentBase(BaseModel):
    """Enhanced base Pydantic model for deployment configuration with comprehensive validation."""

    agent_id: UUID = Field(..., description="ID of the agent being deployed")
    environment: str = Field(..., description="Target deployment environment")
    config: Dict[str, any] = Field(..., description="Deployment configuration parameters")
    description: Optional[str] = Field(None, max_length=1000, description="Deployment description")
    security_config: Dict[str, any] = Field(
        default_factory=lambda: {
            "encryption_enabled": True,
            "audit_logging": True,
            "access_control": "role_based",
            "network_policies": {
                "ingress_rules": ["allow-internal"],
                "egress_rules": ["allow-api-endpoints"]
            }
        },
        description="Security configuration for deployment"
    )
    monitoring_config: Dict[str, any] = Field(
        default_factory=lambda: {
            "metrics_enabled": True,
            "logging_level": "INFO",
            "alert_thresholds": {
                "error_rate": 0.05,
                "latency_ms": 1000,
                "memory_usage": 80
            },
            "health_check": {
                "enabled": True,
                "interval": 30,
                "timeout": 5,
                "healthy_threshold": 2,
                "unhealthy_threshold": 3
            }
        },
        description="Monitoring configuration for deployment"
    )
    resource_limits: Dict[str, any] = Field(
        default_factory=dict,
        description="Resource limits for deployment"
    )
    rollback_config: Optional[Dict[str, any]] = Field(
        default_factory=lambda: {
            "enabled": True,
            "automatic": True,
            "threshold": {
                "error_rate": 10,
                "latency_increase": 50
            }
        },
        description="Rollback configuration for deployment"
    )

    @validator('environment')
    def validate_environment(cls, value: str, values: Dict) -> str:
        """Enhanced environment validation with resource limits."""
        if value not in DEPLOYMENT_ENVIRONMENTS:
            raise ValueError(f"Environment must be one of: {DEPLOYMENT_ENVIRONMENTS}")

        # Validate resource limits for environment
        resource_limits = values.get('resource_limits', {})
        env_limits = ENVIRONMENT_RESOURCE_LIMITS[value]

        if resource_limits.get('cpu', 0) > env_limits['cpu']:
            raise ValueError(f"CPU limit exceeds {value} environment maximum of {env_limits['cpu']} vCPU")

        if resource_limits.get('memory', 0) > env_limits['memory']:
            raise ValueError(f"Memory limit exceeds {value} environment maximum of {env_limits['memory']} MB")

        return value

    @validator('security_config')
    def validate_security(cls, value: Dict) -> Dict:
        """Validate security configuration requirements."""
        required_settings = ['encryption_enabled', 'audit_logging', 'access_control']
        missing = [setting for setting in required_settings if setting not in value]
        if missing:
            raise ValueError(f"Missing required security settings: {missing}")

        if not value['encryption_enabled']:
            raise ValueError("Encryption must be enabled for security compliance")

        return value

    @validator('monitoring_config')
    def validate_monitoring(cls, value: Dict) -> Dict:
        """Validate monitoring configuration requirements."""
        if not value.get('metrics_enabled'):
            raise ValueError("Metrics collection must be enabled")

        if not value.get('health_check', {}).get('enabled'):
            raise ValueError("Health checks must be enabled")

        return value

class DeploymentCreate(DeploymentBase):
    """Enhanced schema for deployment creation with blue/green support."""

    deployment_type: str = Field(..., description="Type of deployment")
    blue_green_config: Dict[str, any] = Field(
        default_factory=lambda: {
            "enabled": True,
            "traffic_shift": {
                "type": "linear",
                "interval": 10,
                "percentage": 10
            },
            "validation_period": 300,
            "rollback_threshold": {
                "error_rate": 5,
                "latency_ms": 1000
            }
        },
        description="Blue/Green deployment configuration"
    )
    traffic_routing: Dict[str, any] = Field(
        default_factory=lambda: {
            "type": "weighted",
            "rules": [
                {"weight": 100, "target": "blue"},
                {"weight": 0, "target": "green"}
            ]
        },
        description="Traffic routing configuration"
    )
    health_check_config: Dict[str, any] = Field(
        default_factory=lambda: {
            "path": "/health",
            "port": 8080,
            "protocol": "HTTP",
            "timeout": 5,
            "interval": 30,
            "healthy_threshold": 2,
            "unhealthy_threshold": 3
        },
        description="Health check configuration"
    )

    @validator('deployment_type')
    def validate_deployment_type(cls, value: str, values: Dict) -> str:
        """Enhanced deployment type validation with compatibility checks."""
        if value not in DEPLOYMENT_TYPES:
            raise ValueError(f"Deployment type must be one of: {DEPLOYMENT_TYPES}")

        # Validate type-specific configuration
        config = values.get('config', {})
        environment = values.get('environment')

        if value == 'streamlit':
            required = {'page_title', 'theme', 'port'}
        elif value == 'slack':
            required = {'bot_token', 'signing_secret', 'app_token'}
        elif value == 'react':
            required = {'build_command', 'static_path', 'api_endpoint'}
        else:  # standalone
            required = {'command', 'args', 'working_dir'}

        missing = required - set(config.keys())
        if missing:
            raise ValueError(f"Missing required configuration for {value}: {missing}")

        return value

class DeploymentStatus(BaseModel):
    """Schema for deployment status updates with detailed metrics."""

    id: UUID = Field(..., description="Deployment ID")
    status: str = Field(..., description="Current deployment status")
    environment: str = Field(..., description="Deployment environment")
    metrics: SystemMetricsSchema = Field(..., description="System metrics")
    traffic_distribution: Dict[str, float] = Field(
        default_factory=dict,
        description="Current traffic distribution"
    )
    health_status: Dict[str, any] = Field(
        default_factory=lambda: {
            "status": "healthy",
            "last_check": datetime.utcnow(),
            "details": {}
        },
        description="Health check status"
    )
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)

    @validator('status')
    def validate_status(cls, value: str) -> str:
        """Validate deployment status values."""
        if value not in DEPLOYMENT_STATUSES:
            raise ValueError(f"Status must be one of: {DEPLOYMENT_STATUSES}")
        return value

class DeploymentResponse(DeploymentBase):
    """Schema for deployment responses with enhanced metadata."""

    id: UUID = Field(..., description="Deployment ID")
    status: str = Field(..., description="Deployment status")
    agent: AgentResponse = Field(..., description="Associated agent details")
    metrics: SystemMetricsSchema = Field(..., description="System metrics")
    deployment_url: Optional[str] = Field(None, description="Deployment URL")
    version: str = Field(..., description="Deployment version")
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)
    health_status: Dict[str, any] = Field(
        default_factory=dict,
        description="Health check status"
    )