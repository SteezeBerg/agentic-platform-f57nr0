"""
Pydantic schema models for metrics validation and structuring in the Agent Builder Hub.
Provides comprehensive validation rules and SLA enforcement for system, agent, and operational metrics.

Version: 1.0.0
"""

from datetime import datetime
from typing import Dict, List, Optional, Union
from uuid import UUID, uuid4
from pydantic import BaseModel, Field, validator

class MetricBase(BaseModel):
    """Base schema for all metric types with common fields and timestamp management."""
    
    id: UUID = Field(default_factory=uuid4, description="Unique identifier for the metric record")
    timestamp: datetime = Field(default_factory=datetime.utcnow, description="Timestamp when metric was recorded")
    created_at: datetime = Field(default_factory=datetime.utcnow, description="Record creation timestamp")
    updated_at: datetime = Field(default_factory=datetime.utcnow, description="Last update timestamp")
    tags: Dict[str, str] = Field(
        default_factory=dict,
        description="Key-value pairs for metric categorization and filtering"
    )
    environment: str = Field(
        default="development",
        description="Environment where metric was collected",
        regex="^(development|staging|production)$"
    )

    class Config:
        json_encoders = {
            datetime: lambda v: v.isoformat(),
            UUID: lambda v: str(v)
        }

class AgentMetricsSchema(MetricBase):
    """Schema for validating agent performance metrics with SLA enforcement."""
    
    agent_id: UUID = Field(..., description="Unique identifier of the agent")
    response_time: float = Field(..., description="Agent response time in seconds", ge=0)
    requests_processed: int = Field(
        default=0,
        description="Number of requests processed",
        ge=0
    )
    error_rate: float = Field(
        default=0.0,
        description="Percentage of failed requests",
        ge=0,
        le=100
    )
    resource_usage: Dict[str, float] = Field(
        default_factory=dict,
        description="Resource utilization metrics"
    )
    token_usage: Dict[str, int] = Field(
        default_factory=dict,
        description="Token consumption metrics"
    )
    active_knowledge_sources: List[str] = Field(
        default_factory=list,
        description="Currently active knowledge sources"
    )
    recorded_at: datetime = Field(
        default_factory=datetime.utcnow,
        description="Exact time of metric recording"
    )

    @validator("response_time")
    def validate_response_time(cls, value: float) -> float:
        """Validates response time against 2s SLA threshold."""
        if value < 0:
            raise ValueError("Response time cannot be negative")
        if value > 2.0:
            raise ValueError("Response time exceeds SLA threshold of 2s")
        if value > 1.8:
            # Log warning for approaching threshold
            pass
        return value

    @validator("error_rate")
    def validate_error_rate(cls, value: float) -> float:
        """Validates error rate against 5% threshold."""
        if not 0 <= value <= 100:
            raise ValueError("Error rate must be between 0 and 100")
        if value > 5.0:
            raise ValueError("Error rate exceeds threshold of 5%")
        if value > 4.0:
            # Log alert for approaching threshold
            pass
        return value

class SystemMetricsSchema(MetricBase):
    """Schema for validating system-wide performance metrics with threshold monitoring."""
    
    cpu_usage: float = Field(..., description="CPU utilization percentage", ge=0, le=100)
    memory_usage: float = Field(..., description="Memory utilization percentage", ge=0, le=100)
    active_agents: int = Field(
        default=0,
        description="Number of currently active agents",
        ge=0
    )
    api_latency: float = Field(
        ...,
        description="API endpoint latency in milliseconds",
        ge=0
    )
    service_health: Dict[str, bool] = Field(
        default_factory=dict,
        description="Health status of system services"
    )
    queue_depths: Dict[str, float] = Field(
        default_factory=dict,
        description="Message queue depth metrics"
    )
    connection_pools: Dict[str, int] = Field(
        default_factory=dict,
        description="Connection pool statistics"
    )

    @validator("cpu_usage", "memory_usage")
    def validate_usage_metrics(cls, value: float) -> float:
        """Validates CPU and memory usage against 90% threshold."""
        if not 0 <= value <= 100:
            raise ValueError("Usage metrics must be between 0 and 100")
        if value > 90:
            raise ValueError("Resource usage exceeds threshold of 90%")
        if value > 80:
            # Log warning for approaching threshold
            pass
        return value

    @validator("api_latency")
    def validate_api_latency(cls, value: float) -> float:
        """Validates API latency against 100ms SLA."""
        if value < 0:
            raise ValueError("API latency cannot be negative")
        if value > 100:
            raise ValueError("API latency exceeds SLA threshold of 100ms")
        if value > 90:
            # Log warning for approaching threshold
            pass
        return value

class MetricResponse(BaseModel):
    """Schema for metric query responses with dimensional support."""
    
    metric_name: str = Field(..., description="Name of the metric")
    value: Union[float, int] = Field(..., description="Metric value")
    unit: str = Field(..., description="Unit of measurement")
    dimensions: Dict[str, str] = Field(
        default_factory=dict,
        description="Metric dimensions for aggregation"
    )
    timestamp: datetime = Field(
        default_factory=datetime.utcnow,
        description="Timestamp of the metric"
    )
    metadata: Optional[Dict[str, str]] = Field(
        default=None,
        description="Additional metric metadata"
    )
    aggregation_type: Optional[str] = Field(
        default=None,
        description="Type of aggregation applied",
        regex="^(sum|average|maximum|minimum|count)?$"
    )

    class Config:
        schema_extra = {
            "example": {
                "metric_name": "agent_response_time",
                "value": 1.5,
                "unit": "seconds",
                "dimensions": {
                    "agent_id": "123e4567-e89b-12d3-a456-426614174000",
                    "environment": "production"
                },
                "timestamp": "2024-02-20T12:00:00Z",
                "aggregation_type": "average"
            }
        }