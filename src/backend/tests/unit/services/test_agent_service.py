import pytest
import uuid
from datetime import datetime
from unittest.mock import Mock, patch

from services.agent_service import AgentService
from db.repositories.agent_repository import AgentRepository
from core.agents.builder import AgentBuilder
from utils.metrics import MetricsManager
from security_utils import SecurityContext
from audit_logging import AuditLogger

# Test constants
TEST_AGENT_ID = uuid.UUID('12345678-1234-5678-1234-567812345678')
TEST_OWNER_ID = uuid.UUID('87654321-4321-8765-4321-876543210987')
TEST_KNOWLEDGE_SOURCE_ID = uuid.UUID('98765432-5678-1234-8765-432187654321')

@pytest.mark.asyncio
class TestAgentService:
    """Comprehensive test suite for AgentService with security and monitoring validation."""

    async def setup_method(self):
        """Initialize test dependencies with mocks."""
        self.repository = Mock(spec=AgentRepository)
        self.builder = Mock(spec=AgentBuilder)
        self.security_context = Mock(spec=SecurityContext)
        self.metrics = Mock(spec=MetricsManager)
        self.audit_logger = Mock(spec=AuditLogger)

        self.service = AgentService(
            repository=self.repository,
            builder=self.builder,
            security_context=self.security_context,
            metrics=self.metrics,
            audit_logger=self.audit_logger
        )

    async def test_create_agent_with_template(self, mocker):
        """Test agent creation from template with security validation."""
        # Arrange
        template_id = str(uuid.uuid4())
        agent_data = {
            "name": "Test Agent",
            "type": "streamlit",
            "template_id": template_id,
            "knowledge_source_ids": [str(TEST_KNOWLEDGE_SOURCE_ID)],
            "capabilities": ["rag", "chat"]
        }
        security_context = {"role": "admin"}

        self.security_context.validate_context.return_value = True
        self.security_context.validate_permissions.return_value = True
        
        builder_mock = mocker.patch.object(self.builder, 'create_from_template')
        builder_mock.return_value.build.return_value = {
            "config": {"page_title": "Test"},
            "capabilities": ["rag", "chat"]
        }

        # Act
        result = await self.service.create_agent(agent_data, TEST_OWNER_ID, security_context)

        # Assert
        assert result is not None
        self.security_context.validate_context.assert_called_once_with(security_context)
        self.security_context.validate_permissions.assert_called_once_with(TEST_OWNER_ID, "agent:create")
        self.metrics.track_performance.assert_called()
        self.audit_logger.log_event.assert_called_once()

    async def test_create_agent_with_knowledge_integration(self, mocker):
        """Test agent creation with knowledge source integration."""
        # Arrange
        agent_data = {
            "name": "Knowledge Agent",
            "type": "standalone",
            "knowledge_source_ids": [str(TEST_KNOWLEDGE_SOURCE_ID)],
            "config": {
                "rag_enabled": True,
                "chunk_size": 1000
            }
        }

        builder_mock = mocker.patch.object(self.builder, 'create_custom')
        builder_mock.return_value.with_knowledge_source.return_value = builder_mock.return_value
        builder_mock.return_value.build.return_value = {
            "config": agent_data["config"],
            "knowledge_sources": [str(TEST_KNOWLEDGE_SOURCE_ID)]
        }

        # Act
        result = await self.service.create_agent(agent_data, TEST_OWNER_ID)

        # Assert
        builder_mock.return_value.with_knowledge_source.assert_called_once()
        assert result is not None
        self.metrics.track_performance.assert_called()

    async def test_create_agent_security_validation_failure(self, mocker):
        """Test agent creation with failed security validation."""
        # Arrange
        agent_data = {
            "name": "Test Agent",
            "type": "streamlit"
        }
        self.security_context.validate_context.return_value = False

        # Act/Assert
        with pytest.raises(PermissionError):
            await self.service.create_agent(agent_data, TEST_OWNER_ID)

        self.metrics.track_performance.assert_called_with("agent_creation_error", 1)

    async def test_update_agent_with_config_change(self, mocker):
        """Test agent update with configuration changes."""
        # Arrange
        updates = {
            "config": {
                "page_title": "Updated Title",
                "theme": "dark"
            }
        }

        self.repository.get.return_value = Mock(
            id=TEST_AGENT_ID,
            owner_id=TEST_OWNER_ID,
            type="streamlit"
        )

        # Act
        result = await self.service.update_agent(TEST_AGENT_ID, updates, TEST_OWNER_ID)

        # Assert
        assert result is not None
        self.repository.update.assert_called_once()
        self.audit_logger.log_event.assert_called_once()

    async def test_deployment_validation_streamlit(self, mocker):
        """Test Streamlit-specific deployment validation."""
        # Arrange
        agent_data = {
            "name": "Streamlit Agent",
            "type": "streamlit",
            "deployment_config": {
                "page_title": "Test App",
                "theme": "light",
                "layout": "wide"
            }
        }

        builder_mock = mocker.patch.object(self.builder, 'create_custom')
        builder_mock.return_value.with_deployment_config.return_value = builder_mock.return_value
        builder_mock.return_value.build.return_value = {
            "config": agent_data["deployment_config"],
            "type": "streamlit"
        }

        # Act
        result = await self.service.create_agent(agent_data, TEST_OWNER_ID)

        # Assert
        assert result is not None
        builder_mock.return_value.with_deployment_config.assert_called_once()

    async def test_deployment_validation_slack(self, mocker):
        """Test Slack-specific deployment validation."""
        # Arrange
        agent_data = {
            "name": "Slack Bot",
            "type": "slack",
            "deployment_config": {
                "bot_token": "xoxb-test",
                "signing_secret": "test-secret",
                "app_token": "xapp-test"
            }
        }

        builder_mock = mocker.patch.object(self.builder, 'create_custom')
        builder_mock.return_value.with_deployment_config.return_value = builder_mock.return_value
        builder_mock.return_value.build.return_value = {
            "config": agent_data["deployment_config"],
            "type": "slack"
        }

        # Act
        result = await self.service.create_agent(agent_data, TEST_OWNER_ID)

        # Assert
        assert result is not None
        builder_mock.return_value.with_deployment_config.assert_called_once()

    async def test_agent_metrics_tracking(self, mocker):
        """Test comprehensive metrics tracking during agent operations."""
        # Arrange
        agent_data = {
            "name": "Test Agent",
            "type": "standalone"
        }

        # Act
        await self.service.create_agent(agent_data, TEST_OWNER_ID)

        # Assert
        self.metrics.track_performance.assert_any_call(
            "agent_creation_started",
            1,
            {
                "agent_type": "standalone",
                "owner_id": str(TEST_OWNER_ID)
            }
        )

    async def test_audit_logging(self, mocker):
        """Test comprehensive audit logging for agent operations."""
        # Arrange
        agent_data = {
            "name": "Audit Test Agent",
            "type": "standalone"
        }

        # Act
        result = await self.service.create_agent(agent_data, TEST_OWNER_ID)

        # Assert
        self.audit_logger.log_event.assert_called_once_with(
            "agent_created",
            mocker.ANY  # Verify audit details structure
        )

    async def test_get_agent_with_security(self, mocker):
        """Test agent retrieval with security validation."""
        # Arrange
        self.repository.get.return_value = Mock(
            id=TEST_AGENT_ID,
            owner_id=TEST_OWNER_ID
        )
        security_context = {"role": "user"}

        # Act
        result = await self.service.get_agent(TEST_AGENT_ID, security_context)

        # Assert
        assert result is not None
        self.security_context.validate_context.assert_called_once_with(security_context)
        self.security_context.validate_access.assert_called_once()

    async def test_delete_agent_with_audit(self, mocker):
        """Test agent deletion with audit logging."""
        # Arrange
        self.repository.get.return_value = Mock(
            id=TEST_AGENT_ID,
            owner_id=TEST_OWNER_ID
        )

        # Act
        result = await self.service.delete_agent(TEST_AGENT_ID, TEST_OWNER_ID)

        # Assert
        assert result is True
        self.repository.delete.assert_called_once_with(TEST_AGENT_ID)
        self.audit_logger.log_event.assert_called_once()