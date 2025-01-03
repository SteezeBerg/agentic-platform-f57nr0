# SQLAlchemy v2.0.0
from sqlalchemy import Column, String, JSON, ForeignKey, DateTime, ARRAY, Enum, Index, Table
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import relationship, declarative_base, validates
from datetime import datetime
import uuid
import jsonschema

# Initialize SQLAlchemy declarative base
Base = declarative_base()

# Define enums for agent types and statuses
AGENT_TYPES = Enum(
    'AgentType',
    ['streamlit', 'slack', 'aws_react', 'standalone'],
    name='agent_type_enum'
)

AGENT_STATUSES = Enum(
    'AgentStatus',
    ['created', 'configuring', 'ready', 'deploying', 'deployed', 'error', 'archived'],
    name='agent_status_enum'
)

# Define valid agent capabilities
AGENT_CAPABILITIES = ['rag', 'chat', 'automation', 'integration', 'custom']

# Define valid status transitions
STATUS_TRANSITIONS = {
    'created': ['configuring'],
    'configuring': ['ready', 'error'],
    'ready': ['deploying', 'archived'],
    'deploying': ['deployed', 'error'],
    'deployed': ['archived', 'error'],
    'error': ['configuring', 'archived'],
    'archived': []
}

# Association table for agent-knowledge source relationship
agent_knowledge_sources = Table(
    'agent_knowledge_sources',
    Base.metadata,
    Column('agent_id', UUID(as_uuid=True), ForeignKey('agents.id')),
    Column('knowledge_source_id', UUID(as_uuid=True), ForeignKey('knowledge_sources.id'))
)

class Agent(Base):
    """
    SQLAlchemy model representing an AI agent with comprehensive configuration,
    state management, and security features.
    """
    __tablename__ = 'agents'

    # Primary fields
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name = Column(String(255), nullable=False)
    description = Column(String(1000))
    type = Column(AGENT_TYPES, nullable=False)
    config = Column(JSONB, nullable=False)
    capabilities = Column(ARRAY(String), nullable=False)
    status = Column(AGENT_STATUSES, nullable=False, default='created')
    
    # Foreign keys and relationships
    owner_id = Column(UUID(as_uuid=True), ForeignKey('users.id'), nullable=False)
    template_id = Column(UUID(as_uuid=True), ForeignKey('templates.id'))
    knowledge_source_ids = Column(ARRAY(UUID(as_uuid=True)), default=[])

    # Timestamps
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    last_deployed_at = Column(DateTime)

    # JSON fields for historical and audit data
    deployment_history = Column(JSON, default=list)
    audit_log = Column(JSON, default=list)
    performance_metrics = Column(JSON, default=dict)

    # Relationships
    owner = relationship('User', back_populates='agents')
    template = relationship('Template', back_populates='instances')
    knowledge_sources = relationship('KnowledgeSource', secondary=agent_knowledge_sources)
    versions = relationship('AgentVersion', back_populates='agent')
    deployments = relationship('Deployment', back_populates='agent')

    # Indexes
    __table_args__ = (
        Index('ix_agent_owner', 'owner_id'),
        Index('ix_agent_template', 'template_id'),
        Index('ix_agent_status', 'status'),
    )

    def __init__(self, name: str, description: str, type: str, owner_id: UUID, config: dict):
        """Initialize a new Agent instance with required fields and defaults."""
        self.id = uuid.uuid4()
        self.name = name
        self.description = description
        self.type = type
        self.owner_id = owner_id
        self.config = config
        self.capabilities = []
        self.status = 'created'
        self.created_at = datetime.utcnow()
        self.updated_at = datetime.utcnow()
        self.deployment_history = []
        self.audit_log = []
        self.performance_metrics = {}
        self._validate_config(config)

    @validates('status')
    def validate_status(self, key, status):
        """Validate status transitions."""
        if hasattr(self, 'status'):
            current = self.status
            if status not in STATUS_TRANSITIONS[current]:
                raise ValueError(f"Invalid status transition from {current} to {status}")
        return status

    @validates('config')
    def validate_config(self, key, config):
        """Validate configuration against schema."""
        self._validate_config(config)
        return config

    @validates('capabilities')
    def validate_capabilities(self, key, capabilities):
        """Validate agent capabilities."""
        invalid_capabilities = set(capabilities) - set(AGENT_CAPABILITIES)
        if invalid_capabilities:
            raise ValueError(f"Invalid capabilities: {invalid_capabilities}")
        return capabilities

    def update_config(self, new_config: dict, user_id: UUID) -> bool:
        """
        Update agent configuration with validation and audit logging.
        
        Args:
            new_config: New configuration dictionary
            user_id: ID of user making the change
        
        Returns:
            bool: Success status of update
        """
        try:
            # Validate user permissions (implement in security layer)
            self._validate_config(new_config)
            
            # Create configuration delta
            config_delta = {
                'previous': self.config,
                'new': new_config,
                'timestamp': datetime.utcnow(),
                'user_id': user_id
            }
            
            # Update configuration
            self.config = new_config
            self.updated_at = datetime.utcnow()
            
            # Log change
            self.audit_log.append({
                'action': 'config_update',
                'timestamp': datetime.utcnow(),
                'user_id': user_id,
                'details': config_delta
            })
            
            return True
        except Exception as e:
            # Log error and return False
            self.audit_log.append({
                'action': 'config_update_failed',
                'timestamp': datetime.utcnow(),
                'user_id': user_id,
                'error': str(e)
            })
            return False

    def update_status(self, new_status: str, user_id: UUID) -> bool:
        """
        Update agent status with state machine validation and audit logging.
        
        Args:
            new_status: New status to set
            user_id: ID of user making the change
        
        Returns:
            bool: Success status of update
        """
        try:
            # Validate status transition
            self.validate_status('status', new_status)
            
            # Update status
            old_status = self.status
            self.status = new_status
            self.updated_at = datetime.utcnow()
            
            # Update deployment history if applicable
            if new_status == 'deployed':
                self.last_deployed_at = datetime.utcnow()
                self.deployment_history.append({
                    'timestamp': datetime.utcnow(),
                    'user_id': user_id,
                    'status': new_status
                })
            
            # Log change
            self.audit_log.append({
                'action': 'status_update',
                'timestamp': datetime.utcnow(),
                'user_id': user_id,
                'details': {
                    'previous_status': old_status,
                    'new_status': new_status
                }
            })
            
            return True
        except Exception as e:
            # Log error and return False
            self.audit_log.append({
                'action': 'status_update_failed',
                'timestamp': datetime.utcnow(),
                'user_id': user_id,
                'error': str(e)
            })
            return False

    def _validate_config(self, config: dict):
        """Internal method to validate configuration against schema."""
        # TODO: Implement configuration schema validation
        if not isinstance(config, dict):
            raise ValueError("Configuration must be a dictionary")