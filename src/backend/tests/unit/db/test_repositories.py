"""
Comprehensive unit test suite for database repository layer implementations.
Tests CRUD operations, security validation, error handling, and performance monitoring.
Version: 1.0.0
"""

import uuid
import pytest
import json
from datetime import datetime, timedelta
from typing import Dict, Any
from unittest.mock import Mock, patch

# Third-party imports with versions
from cryptography.fernet import Fernet  # ^41.0.0
from prometheus_client import Counter, Histogram  # ^0.17.0

# Internal imports
from src.db.repositories.user_repository import UserRepository
from src.db.repositories.agent_repository import AgentRepository
from src.db.models.user import User, ROLES
from src.db.models.agent import Agent, AGENT_TYPES, AGENT_STATUSES
from src.utils.encryption import EncryptionService
from src.utils.metrics import MetricsManager

@pytest.fixture
def encryption_service():
    """Fixture for mocked encryption service"""
    service = Mock(spec=EncryptionService)
    service.encrypt_data.return_value = "encrypted_data"
    service.decrypt_data.return_value = "decrypted_data"
    return service

@pytest.fixture
def metrics_manager():
    """Fixture for mocked metrics manager"""
    manager = Mock(spec=MetricsManager)
    return manager

@pytest.fixture
def test_db(mocker):
    """Fixture for mocked database session"""
    session = mocker.Mock()
    session.begin.return_value.__aenter__ = mocker.AsyncMock()
    session.begin.return_value.__aexit__ = mocker.AsyncMock()
    session.commit = mocker.AsyncMock()
    session.rollback = mocker.AsyncMock()
    return session

@pytest.mark.asyncio
class TestUserRepository:
    """Test suite for UserRepository class including security and validation tests."""

    def setup_method(self):
        """Setup test data and repository instance"""
        self.test_user_data = {
            "email": "test@example.com",
            "first_name": "Test",
            "last_name": "User",
            "role": "business_user",
            "hashed_password": "hashed_password_value"
        }
        self.user_id = uuid.uuid4()

    async def test_create_user_with_encryption(self, test_db, encryption_service):
        """Test user creation with field-level encryption"""
        # Setup
        repository = UserRepository()
        repository._encryption = encryption_service
        
        # Execute
        user = await repository.create_user(self.test_user_data, "test_audit")
        
        # Verify
        assert user is not None
        assert user.email == "encrypted_data"
        assert user.first_name == "encrypted_data"
        assert user.last_name == "encrypted_data"
        encryption_service.encrypt_data.assert_called()
        test_db.add.assert_called_once()
        test_db.commit.assert_called_once()

    async def test_user_access_control(self, test_db, encryption_service):
        """Test role-based access control for user operations"""
        repository = UserRepository()
        repository._encryption = encryption_service

        # Test admin access
        self.test_user_data["role"] = "admin"
        admin_user = await repository.create_user(self.test_user_data, "test_audit")
        assert admin_user.role == "admin"

        # Test invalid role
        with pytest.raises(ValueError):
            self.test_user_data["role"] = "invalid_role"
            await repository.create_user(self.test_user_data, "test_audit")

    async def test_user_update_with_validation(self, test_db, encryption_service):
        """Test user update with field validation and encryption"""
        repository = UserRepository()
        repository._encryption = encryption_service

        # Create initial user
        user = await repository.create_user(self.test_user_data, "test_audit")

        # Test valid update
        update_data = {"first_name": "Updated", "last_name": "Name"}
        updated_user = await repository.update_user(user.id, update_data, "test_audit")
        assert updated_user is not None
        assert encryption_service.encrypt_data.call_count == 2

        # Test invalid update
        with pytest.raises(ValueError):
            await repository.update_user(user.id, {"role": "invalid_role"}, "test_audit")

@pytest.mark.asyncio
class TestAgentRepository:
    """Test suite for AgentRepository class including configuration and deployment tests."""

    def setup_method(self):
        """Setup test data and repository instance"""
        self.test_agent_data = {
            "name": "Test Agent",
            "type": "streamlit",
            "owner_id": uuid.uuid4(),
            "config": {
                "model": "gpt-4",
                "temperature": 0.7
            }
        }
        self.agent_id = uuid.uuid4()

    async def test_agent_creation(self, test_db):
        """Test agent creation with validation"""
        repository = AgentRepository(test_db)
        
        # Test valid creation
        agent = await repository.create(
            name=self.test_agent_data["name"],
            type=self.test_agent_data["type"],
            owner_id=self.test_agent_data["owner_id"],
            config=self.test_agent_data["config"]
        )
        
        assert agent is not None
        assert agent.status == AGENT_STATUSES.created
        test_db.add.assert_called_once()
        test_db.commit.assert_called_once()

    async def test_agent_config_validation(self, test_db):
        """Test agent configuration validation and security checks"""
        repository = AgentRepository(test_db)

        # Test invalid agent type
        with pytest.raises(ValueError):
            await repository.create(
                name="Invalid Agent",
                type="invalid_type",
                owner_id=uuid.uuid4()
            )

        # Test invalid config
        with pytest.raises(ValueError):
            await repository.create(
                name="Invalid Config",
                type="streamlit",
                owner_id=uuid.uuid4(),
                config="invalid_config"
            )

    async def test_agent_status_transitions(self, test_db):
        """Test agent status transitions and validation"""
        repository = AgentRepository(test_db)
        
        # Create agent
        agent = await repository.create(
            name=self.test_agent_data["name"],
            type=self.test_agent_data["type"],
            owner_id=self.test_agent_data["owner_id"]
        )
        
        # Test valid transition
        updated_agent = await repository.update(
            agent.id,
            self.test_agent_data["owner_id"],
            {"status": "configuring"}
        )
        assert updated_agent.status == "configuring"

        # Test invalid transition
        with pytest.raises(ValueError):
            await repository.update(
                agent.id,
                self.test_agent_data["owner_id"],
                {"status": "deployed"}
            )

@pytest.mark.asyncio
async def test_repository_performance(test_db, metrics_manager):
    """Test repository operation performance and resource usage"""
    # Setup repositories with metrics
    user_repo = UserRepository()
    agent_repo = AgentRepository(test_db)
    
    # Track user creation performance
    start_time = datetime.utcnow()
    user = await user_repo.create_user({
        "email": "perf@test.com",
        "first_name": "Performance",
        "last_name": "Test",
        "role": "business_user",
        "hashed_password": "test_hash"
    }, "performance_test")
    creation_time = (datetime.utcnow() - start_time).total_seconds()
    
    # Verify performance metrics
    assert creation_time < 1.0  # Should complete within 1 second
    metrics_manager.track_performance.assert_called()

    # Test agent repository performance
    start_time = datetime.utcnow()
    agent = await agent_repo.create(
        name="Performance Agent",
        type="streamlit",
        owner_id=uuid.uuid4()
    )
    agent_creation_time = (datetime.utcnow() - start_time).total_seconds()
    
    assert agent_creation_time < 1.0
    metrics_manager.track_performance.assert_called()