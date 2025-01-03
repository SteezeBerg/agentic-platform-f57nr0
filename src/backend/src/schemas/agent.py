"""
Pydantic schema definitions for agent configuration, validation, and API request/response models.
Implements comprehensive data validation for agent creation, updates, and management with enhanced
security, monitoring, and performance tracking capabilities.
Version: 1.0.0
"""

from datetime import datetime
from typing import Dict, List, Optional, Any, Literal
from uuid import UUID

from pydantic import BaseModel, Field, validator, root_validator

from schemas.knowledge import KnowledgeSourceResponse
from utils.metrics import MetricsCollector

# Global constants for validation
AGENT_TYPES = ["streamlit", "slack", "aws_react", "standalone"]
AGENT_STATUSES = ["created", "configuring", "ready", "deploying", "deployed", "error", "archived"]
SECURITY_LEVELS = ["basic", "enhanced", "enterprise"]
MONITORING_LEVELS = ["basic", "detailed", "debug"]

class AgentBase(BaseModel):
    """Enhanced base Pydantic model for agent configuration with security and monitoring capabilities."""
    
    name: str = Field(..., min_length=3, max_length=100, description="Agent name")
    description: str = Field(..., min_length=10, max_length=1000, description="Agent description")
    type: Literal[tuple(AGENT_TYPES)] = Field(..., description="Agent deployment type")
    config: Dict[str, Any] = Field(..., description="Agent configuration parameters")
    capabilities: List[str] = Field(default_factory=list, description="Agent capabilities")
    security_config: Dict[str, Any] = Field(
        default_factory=lambda: {
            "level": "enhanced",
            "encryption_enabled": True,
            "audit_logging": True,
            "access_control": "role_based"
        },
        description="Security configuration"
    )
    monitoring_config: Dict[str, Any] = Field(
        default_factory=lambda: {
            "level": "detailed",
            "metrics_enabled": True,
            "performance_tracking": True,
            "alert_thresholds": {
                "error_rate": 0.05,
                "latency_ms": 1000,
                "memory_usage": 80
            }
        },
        description="Monitoring configuration"
    )
    performance_metrics: Dict[str, Any] = Field(
        default_factory=lambda: {
            "average_latency_ms": 0,
            "error_rate": 0,
            "success_rate": 100,
            "uptime_percentage": 100
        },
        description="Performance metrics"
    )

    @validator('security_config')
    def validate_security_config(cls, v):
        """Validate security configuration against deployment type."""
        if not v.get('level') in SECURITY_LEVELS:
            raise ValueError(f"Security level must be one of {SECURITY_LEVELS}")
        
        if not v.get('encryption_enabled', True):
            raise ValueError("Encryption must be enabled for security compliance")
            
        required_fields = {'level', 'encryption_enabled', 'audit_logging', 'access_control'}
        missing_fields = required_fields - set(v.keys())
        if missing_fields:
            raise ValueError(f"Missing required security fields: {missing_fields}")
            
        return v

    @validator('monitoring_config')
    def validate_monitoring_config(cls, v):
        """Validate monitoring configuration for deployment."""
        if not v.get('level') in MONITORING_LEVELS:
            raise ValueError(f"Monitoring level must be one of {MONITORING_LEVELS}")
            
        if not v.get('metrics_enabled', True):
            raise ValueError("Metrics collection must be enabled")
            
        required_fields = {'level', 'metrics_enabled', 'performance_tracking', 'alert_thresholds'}
        missing_fields = required_fields - set(v.keys())
        if missing_fields:
            raise ValueError(f"Missing required monitoring fields: {missing_fields}")
            
        return v

    @root_validator
    def validate_config(cls, values):
        """Enhanced configuration validation with security and monitoring checks."""
        if not values.get('config'):
            raise ValueError("Agent configuration is required")
            
        agent_type = values.get('type')
        config = values.get('config')
        
        # Type-specific validation
        if agent_type == 'streamlit':
            required = {'page_title', 'layout', 'theme'}
        elif agent_type == 'slack':
            required = {'bot_token', 'signing_secret', 'app_token'}
        elif agent_type == 'aws_react':
            required = {'aws_region', 'cognito_pool_id', 'api_endpoint'}
        else:  # standalone
            required = {'runtime', 'environment', 'dependencies'}
            
        missing = required - set(config.keys())
        if missing:
            raise ValueError(f"Missing required configuration for {agent_type}: {missing}")
            
        return values

class AgentCreate(AgentBase):
    """Enhanced schema for agent creation with security and monitoring."""
    
    template_id: Optional[str] = Field(None, description="Template ID for agent creation")
    knowledge_source_ids: Optional[List[UUID]] = Field(
        default_factory=list,
        description="Associated knowledge source IDs"
    )

class AgentUpdate(BaseModel):
    """Enhanced schema for agent updates with security and monitoring."""
    
    name: Optional[str] = Field(None, min_length=3, max_length=100)
    description: Optional[str] = Field(None, min_length=10, max_length=1000)
    config: Optional[Dict[str, Any]] = None
    capabilities: Optional[List[str]] = None
    knowledge_source_ids: Optional[List[UUID]] = None
    security_config: Optional[Dict[str, Any]] = None
    monitoring_config: Optional[Dict[str, Any]] = None

    @validator('security_config')
    def validate_security_update(cls, v):
        """Validate security configuration updates."""
        if v and 'level' in v and v['level'] not in SECURITY_LEVELS:
            raise ValueError(f"Security level must be one of {SECURITY_LEVELS}")
        return v

    @validator('monitoring_config')
    def validate_monitoring_update(cls, v):
        """Validate monitoring configuration updates."""
        if v and 'level' in v and v['level'] not in MONITORING_LEVELS:
            raise ValueError(f"Monitoring level must be one of {MONITORING_LEVELS}")
        return v

class AgentResponse(AgentBase):
    """Enhanced schema for agent responses with performance metrics."""
    
    id: UUID = Field(..., description="Agent unique identifier")
    status: str = Field(..., description="Agent deployment status")
    owner_id: UUID = Field(..., description="Agent owner ID")
    template_id: Optional[str] = Field(None, description="Source template ID")
    knowledge_source_ids: List[UUID] = Field(default_factory=list, description="Knowledge source IDs")
    created_at: datetime = Field(..., description="Creation timestamp")
    updated_at: datetime = Field(..., description="Last update timestamp")
    last_health_check: datetime = Field(..., description="Last health check timestamp")

    class Config:
        """Pydantic model configuration."""
        json_encoders = {
            datetime: lambda v: v.isoformat(),
            UUID: lambda v: str(v)
        }