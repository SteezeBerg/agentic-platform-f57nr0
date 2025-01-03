"""
Enhanced repository layer implementation for secure user data management.
Provides comprehensive audit logging, field-level encryption, and role-based access control.
Version: 1.0.0
"""

import uuid
from typing import Optional, Dict, List
from datetime import datetime
import logging

# Third-party imports with versions
from sqlalchemy import create_engine, text  # ^2.0.0
from sqlalchemy.orm import sessionmaker, Session
from aws_kms_encryption import EncryptionService  # ^1.2.0
from prometheus_client import Counter, Histogram  # ^0.17.0
from security_auditor import SecurityAuditor  # ^1.0.0

# Internal imports
from ..models.user import User, ROLES, ROLE_HIERARCHY
from ...config.database import DatabaseManager
from ...utils.encryption import EncryptionService
from ...utils.logging import StructuredLogger
from ...utils.metrics import MetricsManager, track_time

# Initialize logging
logger = StructuredLogger('repositories.user')

# Initialize metrics
METRICS = {
    'user_operations': Counter(
        'user_repository_operations_total',
        'Total number of user repository operations',
        ['operation', 'status']
    ),
    'operation_duration': Histogram(
        'user_repository_operation_duration_seconds',
        'Duration of user repository operations',
        ['operation']
    )
}

class UserRepository:
    """Enhanced repository class for secure user data management with audit logging and encryption."""

    def __init__(self):
        """Initialize repository with security services and monitoring."""
        # Initialize database connection
        self._db_manager = DatabaseManager()
        self._engine = self._db_manager.get_postgres_engine()
        self._session_factory = sessionmaker(bind=self._engine)

        # Initialize security services
        self._encryption = EncryptionService()
        self._auditor = SecurityAuditor()
        self._metrics = MetricsManager()

        logger.log('info', 'User repository initialized with security controls')

    def _get_session(self) -> Session:
        """Create new database session with security context."""
        return self._session_factory()

    @track_time('create_user')
    async def create_user(self, user_data: Dict, audit_context: str) -> User:
        """
        Creates user with comprehensive security validation and audit logging.
        
        Args:
            user_data: User creation data
            audit_context: Context for audit logging
            
        Returns:
            Created user instance
        """
        try:
            # Validate role permissions
            if user_data['role'] not in ROLES:
                raise ValueError(f"Invalid role. Must be one of: {', '.join(ROLES)}")

            # Encrypt sensitive fields
            encrypted_fields = {}
            for field in ['email', 'first_name', 'last_name']:
                if field in user_data:
                    encrypted_fields[field] = self._encryption.encrypt_data(
                        user_data[field],
                        check_pii=True
                    )

            # Create user instance with encrypted data
            user = User(
                email=encrypted_fields['email'],
                hashed_password=user_data['hashed_password'],
                first_name=encrypted_fields['first_name'],
                last_name=encrypted_fields['last_name'],
                role=user_data['role']
            )

            # Persist user with security context
            with self._get_session() as session:
                session.add(user)
                session.commit()

                # Log security audit
                self._auditor.log_operation(
                    operation='create_user',
                    user_id=str(user.id),
                    context=audit_context,
                    metadata={
                        'role': user.role,
                        'timestamp': datetime.utcnow().isoformat()
                    }
                )

                # Track metrics
                self._metrics.track_performance(
                    'user_creation',
                    1,
                    {'role': user.role}
                )

                logger.log('info', 'User created successfully', {
                    'user_id': str(user.id),
                    'role': user.role
                })

                return user

        except Exception as e:
            # Track error metrics
            self._metrics.track_performance('user_creation_error', 1)
            logger.log('error', f'User creation failed: {str(e)}')
            raise

    @track_time('update_user')
    async def update_user(self, user_id: uuid.UUID, user_data: Dict, audit_context: str) -> Optional[User]:
        """
        Updates user with security validation and audit logging.
        
        Args:
            user_id: User ID to update
            user_data: Update data
            audit_context: Context for audit logging
            
        Returns:
            Updated user if found
        """
        try:
            with self._get_session() as session:
                user = session.query(User).filter(User.id == str(user_id)).first()
                if not user:
                    return None

                # Validate role update permissions
                if 'role' in user_data:
                    if user_data['role'] not in ROLES:
                        raise ValueError(f"Invalid role. Must be one of: {', '.join(ROLES)}")

                # Encrypt updated sensitive fields
                for field in ['email', 'first_name', 'last_name']:
                    if field in user_data:
                        setattr(user, field, self._encryption.encrypt_data(
                            user_data[field],
                            check_pii=True
                        ))

                # Update non-sensitive fields
                for field in ['role', 'is_active', 'is_locked']:
                    if field in user_data:
                        setattr(user, field, user_data[field])

                # Update security metadata
                user.security_metadata.update({
                    'last_updated': datetime.utcnow().isoformat(),
                    'update_context': audit_context
                })

                session.commit()

                # Log security audit
                self._auditor.log_operation(
                    operation='update_user',
                    user_id=str(user.id),
                    context=audit_context,
                    metadata={
                        'updated_fields': list(user_data.keys()),
                        'timestamp': datetime.utcnow().isoformat()
                    }
                )

                # Track metrics
                self._metrics.track_performance(
                    'user_update',
                    1,
                    {'role': user.role}
                )

                logger.log('info', 'User updated successfully', {
                    'user_id': str(user.id),
                    'updated_fields': list(user_data.keys())
                })

                return user

        except Exception as e:
            # Track error metrics
            self._metrics.track_performance('user_update_error', 1)
            logger.log('error', f'User update failed: {str(e)}')
            raise

    def __del__(self):
        """Cleanup security resources on repository destruction."""
        try:
            self._engine.dispose()
            logger.log('info', 'User repository resources cleaned up')
        except Exception as e:
            logger.log('error', f'Error cleaning up repository resources: {str(e)}')