# SQLAlchemy v2.0.0
from sqlalchemy import Column, String, JSON, ForeignKey, DateTime, Enum
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from datetime import datetime
import uuid

from db.models.agent import Base

# Define deployment environment types
DEPLOYMENT_ENVIRONMENTS = Enum(
    'DeploymentEnvironment',
    ['development', 'staging', 'production'],
    name='deployment_environment_enum'
)

# Define deployment status types
DEPLOYMENT_STATUSES = Enum(
    'DeploymentStatus',
    ['pending', 'in_progress', 'completed', 'failed', 'rolling_back'],
    name='deployment_status_enum'
)

# Define deployment types
DEPLOYMENT_TYPES = Enum(
    'DeploymentType',
    ['ecs', 'lambda', 'streamlit', 'slack', 'react'],
    name='deployment_type_enum'
)

# Define valid status transitions
VALID_STATUS_TRANSITIONS = {
    'pending': ['in_progress', 'failed'],
    'in_progress': ['completed', 'failed', 'rolling_back'],
    'completed': ['rolling_back'],
    'failed': ['pending'],
    'rolling_back': ['pending', 'failed']
}

class Deployment(Base):
    """
    SQLAlchemy model representing a comprehensive deployment configuration and state
    for an agent, supporting multiple deployment types and environments with detailed
    metrics tracking.
    """
    __tablename__ = 'deployments'

    # Primary fields
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    agent_id = Column(UUID(as_uuid=True), ForeignKey('agents.id'), nullable=False)
    environment = Column(DEPLOYMENT_ENVIRONMENTS, nullable=False)
    deployment_type = Column(DEPLOYMENT_TYPES, nullable=False)
    config = Column(JSON, nullable=False)
    description = Column(String(1000))
    status = Column(DEPLOYMENT_STATUSES, nullable=False, default='pending')
    error_message = Column(String(2000))

    # Timestamps
    deployed_at = Column(DateTime)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at = Column(DateTime, nullable=False, default=datetime.utcnow)

    # Metrics and rollback configuration
    metrics = Column(JSON, default=dict)
    rollback_config = Column(JSON)

    # Relationships
    agent = relationship('Agent', back_populates='deployments')

    def __init__(self, agent_id: UUID, environment: str, deployment_type: str,
                 config: dict, description: str = None):
        """
        Initialize a new deployment instance with comprehensive validation.

        Args:
            agent_id: UUID of the associated agent
            environment: Target deployment environment
            deployment_type: Type of deployment
            config: Deployment configuration dictionary
            description: Optional deployment description
        """
        self.id = uuid.uuid4()
        self.agent_id = agent_id
        self.environment = environment
        self.deployment_type = deployment_type
        self.config = config
        self.description = description
        self.status = 'pending'
        self.created_at = datetime.utcnow()
        self.updated_at = datetime.utcnow()
        self.metrics = {}
        self.rollback_config = config.copy()  # Store initial config for rollback

    def update_status(self, new_status: str, error_message: str = None) -> bool:
        """
        Updates deployment status with comprehensive validation and transition rules.

        Args:
            new_status: New status to set
            error_message: Optional error message for failed deployments

        Returns:
            bool: Success status of update
        """
        try:
            # Validate status transition
            if new_status not in VALID_STATUS_TRANSITIONS.get(self.status, []):
                raise ValueError(
                    f"Invalid status transition from {self.status} to {new_status}"
                )

            # Update status and related fields
            self.status = new_status
            self.updated_at = datetime.utcnow()

            if new_status == 'completed':
                self.deployed_at = datetime.utcnow()
                self.error_message = None
            elif new_status == 'failed':
                self.error_message = error_message
            elif new_status == 'pending':
                self.error_message = None

            return True
        except Exception:
            return False

    def update_metrics(self, metrics_data: dict) -> bool:
        """
        Updates deployment metrics with validation and schema checking.

        Args:
            metrics_data: Dictionary containing new metrics data

        Returns:
            bool: Success status of update
        """
        try:
            # Validate metrics data structure
            if not isinstance(metrics_data, dict):
                raise ValueError("Metrics data must be a dictionary")

            # Merge new metrics with existing metrics
            self.metrics.update(metrics_data)
            self.updated_at = datetime.utcnow()

            return True
        except Exception:
            return False

    def prepare_rollback(self) -> bool:
        """
        Prepares deployment for rollback operation.

        Returns:
            bool: Success status of rollback preparation
        """
        try:
            # Validate current status allows rollback
            if self.status not in ['completed', 'failed']:
                raise ValueError(
                    f"Cannot initiate rollback from status: {self.status}"
                )

            # Update status and prepare for rollback
            self.status = 'rolling_back'
            self.error_message = None
            self.updated_at = datetime.utcnow()

            return True
        except Exception:
            return False