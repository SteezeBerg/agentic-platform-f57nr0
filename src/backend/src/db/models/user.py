"""
SQLAlchemy model definition for User entity in Agent Builder Hub.
Implements secure user data storage with role-based access control,
field-level encryption for PII data, and comprehensive activity tracking.
Version: 1.0.0
"""

import uuid
from datetime import datetime
from typing import Dict, Optional, List

# Third-party imports with versions
from sqlalchemy import Column, String, Boolean, Integer, DateTime, JSON  # ^2.0.0
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import validates
from passlib.hash import pbkdf2_sha512  # ^1.7.4
from email_validator import validate_email, EmailNotValidError  # ^2.0.0

# Internal imports
from ...config.database import DatabaseManager
from ...utils.encryption import EncryptionService

# Initialize base model
Base = declarative_base()

# Constants for role-based access control
ROLES: List[str] = ["admin", "power_user", "developer", "business_user", "viewer"]
ROLE_HIERARCHY: Dict[str, int] = {
    "admin": 4,
    "power_user": 3,
    "developer": 2,
    "business_user": 1,
    "viewer": 0
}

# Fields requiring encryption
PII_FIELDS: List[str] = ["email", "first_name", "last_name"]

# Security constants
MAX_LOGIN_ATTEMPTS = 5
PASSWORD_EXPIRY_DAYS = 90

class User(Base):
    """SQLAlchemy model for secure user management with comprehensive security features."""
    
    __tablename__ = 'users'

    # Primary identification fields
    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    email = Column(String(255), unique=True, nullable=False)
    hashed_password = Column(String(255), nullable=False)
    
    # Personal information (encrypted)
    first_name = Column(String(255), nullable=False)
    last_name = Column(String(255), nullable=False)
    
    # Access control
    role = Column(String(50), nullable=False)
    is_active = Column(Boolean, default=True, nullable=False)
    is_locked = Column(Boolean, default=False, nullable=False)
    failed_login_attempts = Column(Integer, default=0, nullable=False)
    
    # Audit timestamps
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at = Column(DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)
    last_login = Column(DateTime)
    password_changed_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    last_activity = Column(DateTime)
    
    # Security metadata
    last_ip_address = Column(String(45))
    security_metadata = Column(JSON, default={})

    def __init__(self, email: str, hashed_password: str, first_name: str, last_name: str, role: str):
        """Initialize user with secure defaults and field-level encryption."""
        # Validate email format
        try:
            validate_email(email)
        except EmailNotValidError as e:
            raise ValueError(f"Invalid email format: {str(e)}")

        # Validate role
        if role not in ROLES:
            raise ValueError(f"Invalid role. Must be one of: {', '.join(ROLES)}")

        # Generate secure UUID
        self.id = str(uuid.uuid4())

        # Encrypt PII fields
        encryption_service = EncryptionService(key_id=self.id)
        self.email = encryption_service.encrypt_data(email)
        self.first_name = encryption_service.encrypt_data(first_name)
        self.last_name = encryption_service.encrypt_data(last_name)

        # Set basic fields
        self.hashed_password = hashed_password
        self.role = role
        
        # Initialize security-related fields
        self.is_active = True
        self.is_locked = False
        self.failed_login_attempts = 0
        
        # Set timestamps
        now = datetime.utcnow()
        self.created_at = now
        self.updated_at = now
        self.password_changed_at = now
        
        # Initialize security metadata
        self.security_metadata = {
            "password_history": [],
            "encryption_key_version": "1.0",
            "last_security_audit": now.isoformat(),
            "security_questions_configured": False
        }

    @validates('email')
    def validate_email(self, key: str, email: str) -> str:
        """Validate email format before setting."""
        try:
            validate_email(email)
            return email
        except EmailNotValidError as e:
            raise ValueError(f"Invalid email format: {str(e)}")

    @validates('role')
    def validate_role(self, key: str, role: str) -> str:
        """Validate role against allowed values."""
        if role not in ROLES:
            raise ValueError(f"Invalid role. Must be one of: {', '.join(ROLES)}")
        return role

    def update_last_login(self, ip_address: str) -> None:
        """Update login-related timestamps and security metadata."""
        now = datetime.utcnow()
        self.last_login = now
        self.last_activity = now
        self.last_ip_address = ip_address
        self.failed_login_attempts = 0
        
        # Update security metadata
        self.security_metadata.update({
            "last_login_ip": ip_address,
            "last_login_timestamp": now.isoformat()
        })

    def check_password(self, password: str) -> bool:
        """Securely verify password and manage login attempts."""
        # Check if account is locked
        if self.is_locked:
            return False

        # Verify password
        is_valid = pbkdf2_sha512.verify(password, self.hashed_password)
        
        if not is_valid:
            self.failed_login_attempts += 1
            
            # Lock account if max attempts exceeded
            if self.failed_login_attempts >= MAX_LOGIN_ATTEMPTS:
                self.is_locked = True
                self.security_metadata["locked_timestamp"] = datetime.utcnow().isoformat()
        
        return is_valid

    def has_permission(self, required_role: str) -> bool:
        """Check user's permission level against required role."""
        if required_role not in ROLES:
            raise ValueError(f"Invalid role requirement: {required_role}")
            
        user_level = ROLE_HIERARCHY[self.role]
        required_level = ROLE_HIERARCHY[required_role]
        
        return user_level >= required_level

    def rotate_encryption_keys(self) -> bool:
        """Rotate encryption keys for PII data."""
        try:
            encryption_service = EncryptionService(key_id=self.id)
            
            # Decrypt current PII data
            decrypted_email = encryption_service.decrypt_data(self.email)
            decrypted_first_name = encryption_service.decrypt_data(self.first_name)
            decrypted_last_name = encryption_service.decrypt_data(self.last_name)
            
            # Generate new encryption key
            encryption_service.rotate_encryption_key()
            
            # Re-encrypt PII data with new key
            self.email = encryption_service.encrypt_data(decrypted_email)
            self.first_name = encryption_service.encrypt_data(decrypted_first_name)
            self.last_name = encryption_service.encrypt_data(decrypted_last_name)
            
            # Update security metadata
            self.security_metadata.update({
                "encryption_key_version": str(float(self.security_metadata["encryption_key_version"]) + 0.1),
                "last_key_rotation": datetime.utcnow().isoformat()
            })
            
            return True
            
        except Exception as e:
            return False