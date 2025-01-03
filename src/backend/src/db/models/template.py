from datetime import datetime
import uuid
from sqlalchemy import Column, String, JSON, Boolean, DateTime, Integer
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import declarative_base, relationship

# Version comment: SQLAlchemy ^2.0.0

Base = declarative_base()

# Define valid template categories
TEMPLATE_CATEGORIES = ["streamlit", "slack", "aws_react", "standalone", "custom"]

class Template(Base):
    """
    SQLAlchemy model for agent templates with comprehensive version control and validation capabilities.
    Provides database schema and relationships for reusable agent configurations with full audit tracking.
    """
    __tablename__ = 'templates'

    # Primary identification fields
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name = Column(String(255), nullable=False, unique=True)
    description = Column(String(1000), nullable=False)
    category = Column(String(50), nullable=False)
    
    # Configuration and capability fields
    default_config = Column(JSON, nullable=False)
    supported_capabilities = Column(JSON, nullable=False)
    schema = Column(JSON, nullable=False)
    validation_rules = Column(JSON, nullable=False)
    deployment_config = Column(JSON, nullable=False)
    integration_points = Column(JSON, nullable=False)
    
    # State and version tracking
    is_active = Column(Boolean, nullable=False, default=True)
    version = Column(Integer, nullable=False, default=1)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at = Column(DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)
    audit_trail = Column(JSON, nullable=False)

    def __init__(self, name: str, description: str, category: str, default_config: dict,
                 supported_capabilities: list, schema: dict, validation_rules: dict,
                 deployment_config: dict, integration_points: dict):
        """
        Initialize a new template record with comprehensive validation and configuration.
        
        Args:
            name: Unique template identifier name
            description: Detailed template description
            category: Template category from TEMPLATE_CATEGORIES
            default_config: Default configuration settings
            supported_capabilities: List of supported agent capabilities
            schema: JSON schema for template configuration
            validation_rules: Rules for template validation
            deployment_config: Deployment-specific configuration
            integration_points: Integration configuration
        """
        # Validate category
        if category not in TEMPLATE_CATEGORIES:
            raise ValueError(f"Category must be one of: {TEMPLATE_CATEGORIES}")

        # Initialize primary fields
        self.id = uuid.uuid4()
        self.name = name
        self.description = description
        self.category = category
        
        # Initialize configuration fields
        self.default_config = default_config
        self.supported_capabilities = supported_capabilities
        self.schema = schema
        self.validation_rules = validation_rules
        self.deployment_config = deployment_config
        self.integration_points = integration_points
        
        # Initialize state tracking
        self.is_active = True
        self.version = 1
        self.created_at = datetime.utcnow()
        self.updated_at = datetime.utcnow()
        
        # Initialize audit trail
        self.audit_trail = {
            "created": {
                "timestamp": self.created_at.isoformat(),
                "version": self.version,
                "event": "template_created"
            }
        }

    def to_dict(self, include_audit: bool = False) -> dict:
        """
        Convert template to dictionary representation with associated metadata.
        
        Args:
            include_audit: Whether to include audit trail in the output
            
        Returns:
            Dictionary containing template data and metadata
        """
        template_dict = {
            "id": str(self.id),
            "name": self.name,
            "description": self.description,
            "category": self.category,
            "default_config": self.default_config,
            "supported_capabilities": self.supported_capabilities,
            "schema": self.schema,
            "validation_rules": self.validation_rules,
            "deployment_config": self.deployment_config,
            "integration_points": self.integration_points,
            "is_active": self.is_active,
            "version": self.version,
            "created_at": self.created_at.isoformat(),
            "updated_at": self.updated_at.isoformat()
        }
        
        if include_audit:
            template_dict["audit_trail"] = self.audit_trail
            
        return template_dict

    def create_version(self, updates: dict, change_reason: str, author: str) -> 'Template':
        """
        Create a new version of the template with full state and audit tracking.
        
        Args:
            updates: Dictionary containing fields to update
            change_reason: Reason for creating new version
            author: Author of the version change
            
        Returns:
            New Template instance with updated configuration
        """
        # Create new template instance with current values
        new_version = Template(
            name=self.name,
            description=self.description,
            category=self.category,
            default_config=self.default_config.copy(),
            supported_capabilities=self.supported_capabilities.copy(),
            schema=self.schema.copy(),
            validation_rules=self.validation_rules.copy(),
            deployment_config=self.deployment_config.copy(),
            integration_points=self.integration_points.copy()
        )
        
        # Apply updates
        for key, value in updates.items():
            if hasattr(new_version, key):
                setattr(new_version, key, value)
        
        # Update version tracking
        new_version.version = self.version + 1
        new_version.updated_at = datetime.utcnow()
        
        # Update audit trail
        new_version.audit_trail = self.audit_trail.copy()
        new_version.audit_trail[str(datetime.utcnow().isoformat())] = {
            "version": new_version.version,
            "event": "version_created",
            "change_reason": change_reason,
            "author": author,
            "updates": updates
        }
        
        return new_version