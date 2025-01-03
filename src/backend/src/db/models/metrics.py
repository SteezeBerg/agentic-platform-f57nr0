"""
SQLAlchemy models for storing and managing various types of metrics in the Agent Builder Hub.
Includes models for agent performance, system metrics, and operational metrics with comprehensive validation.
Version: 1.0.0
"""

import uuid
from datetime import datetime, timezone
from typing import Dict, Any, Optional
import json

from sqlalchemy import Column, DateTime, Float, Integer, String, JSON, ForeignKey, Index, CheckConstraint
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import validates
from sqlalchemy.event import listens_for

# Internal imports
from ...config.database import DatabaseManager

# Configure base model
Base = declarative_base()

class MetricBase(Base):
    """Base model for all metric types with common fields and validation"""
    __abstract__ = True

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    created_at = Column(DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc))

    @validates('created_at', 'updated_at')
    def validate_timestamps(self, key: str, timestamp: datetime) -> datetime:
        """Validates timestamp fields are in UTC timezone"""
        if not timestamp.tzinfo:
            raise ValueError(f"{key} must have timezone info")
        if timestamp.tzinfo != timezone.utc:
            raise ValueError(f"{key} must be in UTC timezone")
        if timestamp > datetime.now(timezone.utc):
            raise ValueError(f"{key} cannot be in the future")
        return timestamp

class AgentMetrics(MetricBase):
    """Model for storing detailed agent performance metrics"""
    __tablename__ = 'agent_metrics'

    agent_id = Column(UUID(as_uuid=True), nullable=False)
    response_time = Column(Float, nullable=False)
    requests_processed = Column(Integer, nullable=False)
    error_rate = Column(Float, nullable=False)
    resource_usage = Column(JSONB, nullable=False)
    recorded_at = Column(DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc))

    # Indexes for efficient querying
    __table_args__ = (
        Index('ix_agent_metrics_agent_id', 'agent_id'),
        Index('ix_agent_metrics_recorded_at', 'recorded_at'),
        CheckConstraint('response_time >= 0', name='check_response_time_positive'),
        CheckConstraint('requests_processed >= 0', name='check_requests_processed_positive'),
        CheckConstraint('error_rate >= 0 AND error_rate <= 1', name='check_error_rate_range'),
    )

    @validates('response_time')
    def validate_response_time(self, key: str, value: float) -> float:
        """Validates response time is positive"""
        if value < 0:
            raise ValueError("Response time must be positive")
        return value

    @validates('requests_processed')
    def validate_requests_processed(self, key: str, value: int) -> int:
        """Validates requests processed is non-negative"""
        if value < 0:
            raise ValueError("Requests processed must be non-negative")
        return value

    @validates('error_rate')
    def validate_error_rate(self, key: str, value: float) -> float:
        """Validates error rate is between 0 and 1"""
        if not 0 <= value <= 1:
            raise ValueError("Error rate must be between 0 and 1")
        return value

    @validates('resource_usage')
    def validate_resource_usage(self, key: str, value: Dict[str, Any]) -> Dict[str, Any]:
        """Validates resource usage contains required metrics"""
        required_metrics = {'cpu', 'memory', 'disk'}
        if not all(metric in value for metric in required_metrics):
            raise ValueError(f"Resource usage must contain all required metrics: {required_metrics}")
        return value

class SystemMetrics(MetricBase):
    """Model for storing system-wide performance metrics"""
    __tablename__ = 'system_metrics'

    cpu_usage = Column(Float, nullable=False)
    memory_usage = Column(Float, nullable=False)
    active_agents = Column(Integer, nullable=False)
    api_latency = Column(Float, nullable=False)
    service_health = Column(JSONB, nullable=False)
    recorded_at = Column(DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc))

    # Indexes and constraints
    __table_args__ = (
        Index('ix_system_metrics_recorded_at', 'recorded_at'),
        CheckConstraint('cpu_usage >= 0 AND cpu_usage <= 100', name='check_cpu_usage_range'),
        CheckConstraint('memory_usage >= 0 AND memory_usage <= 100', name='check_memory_usage_range'),
        CheckConstraint('active_agents >= 0', name='check_active_agents_positive'),
        CheckConstraint('api_latency >= 0', name='check_api_latency_positive'),
    )

    @validates('cpu_usage', 'memory_usage')
    def validate_usage_percentage(self, key: str, value: float) -> float:
        """Validates usage percentages are between 0 and 100"""
        if not 0 <= value <= 100:
            raise ValueError(f"{key} must be between 0 and 100")
        return value

    @validates('active_agents')
    def validate_active_agents(self, key: str, value: int) -> int:
        """Validates active agents count is non-negative"""
        if value < 0:
            raise ValueError("Active agents count must be non-negative")
        return value

    @validates('api_latency')
    def validate_api_latency(self, key: str, value: float) -> float:
        """Validates API latency is positive"""
        if value < 0:
            raise ValueError("API latency must be positive")
        return value

    @validates('service_health')
    def validate_service_health(self, key: str, value: Dict[str, Any]) -> Dict[str, Any]:
        """Validates service health contains required services"""
        required_services = {'database', 'cache', 'search', 'ai_models'}
        if not all(service in value for service in required_services):
            raise ValueError(f"Service health must contain status for all required services: {required_services}")
        return value

# Event listeners for automatic timestamp updates
@listens_for(MetricBase, 'before_update', propagate=True)
def update_timestamp(mapper, connection, target):
    """Updates updated_at timestamp before each update"""
    target.updated_at = datetime.now(timezone.utc)

__all__ = ['MetricBase', 'AgentMetrics', 'SystemMetrics']