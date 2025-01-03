"""
SQLAlchemy models initialization module for Agent Builder Hub.
Provides centralized access to all database models with comprehensive validation and relationship management.
Version: 1.0.0
"""

# Import all models
from .user import User
from .agent import Agent
from .deployment import Deployment
from .knowledge import KnowledgeSource, Index
from .metrics import Metric, AgentMetrics, SystemMetrics
from .template import Template

# Export all models for centralized access
__all__ = [
    'User',           # User authentication and authorization model
    'Agent',          # Core agent configuration and state model
    'Deployment',     # Agent deployment and runtime model
    'KnowledgeSource',# Enterprise knowledge source model
    'Index',         # Vector index for knowledge retrieval
    'Metric',        # Base metrics model
    'AgentMetrics',  # Agent-specific performance metrics
    'SystemMetrics', # System-wide monitoring metrics
    'Template'       # Reusable agent template model
]

# Model relationships are automatically handled by SQLAlchemy's
# relationship() declarations in individual model files

# Database initialization and validation can be performed by importing
# and using these models in database management scripts

"""
Model Hierarchy:

User
 └── Agent
      ├── Deployment
      ├── KnowledgeSource
      │    └── Index
      └── Template

Metrics (Independent)
 ├── AgentMetrics
 └── SystemMetrics
"""