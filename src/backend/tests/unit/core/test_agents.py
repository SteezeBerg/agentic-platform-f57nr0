import pytest
from unittest.mock import Mock, patch
from uuid import UUID
from freezegun import freeze_time

from core.agents.factory import AgentFactory
from core.agents.builder import AgentBuilder
from core.agents.templates import TemplateManager

# Test constants
TEST_TEMPLATE_ID = UUID('12345678-1234-5678-1234-567812345678')
TEST_AGENT_CONFIG = {
    "type": "standalone",
    "capabilities": ["rag"],
    "version": "1.0",
    "security": {
        "access_level": "restricted",
        "encryption": "AES256"
    }
}
TEST_SECURITY_CONFIG = {
    "auth_required": True,
    "access_control": "RBAC",
    "audit_logging": True
}

@pytest.mark.unit
class TestAgentFactory:
    """Test suite for AgentFactory class functionality."""

    def setup_method(self):
        """Setup test dependencies."""
        self.template_manager = Mock(spec=TemplateManager)
        self.security_validator = Mock()
        self.metrics_collector = Mock()
        self.agent_factory = AgentFactory(
            template_manager=self.template_manager,
            security_validator=self.security_validator,
            metrics_collector=self.metrics_collector
        )

    @freeze_time("2024-01-01 12:00:00")
    async def test_create_agent(self):
        """Test creating agent with custom configuration and security controls."""
        # Setup
        config = TEST_AGENT_CONFIG.copy()
        security_context = TEST_SECURITY_CONFIG.copy()
        
        self.security_validator.validate_config.return_value = True
        
        # Execute
        result = await self.agent_factory.create_agent(config, security_context)
        
        # Verify
        assert result["type"] == "standalone"
        assert result["security"]["access_level"] == "restricted"
        assert result["created_at"] == "2024-01-01T12:00:00"
        assert result["status"] == "created"
        
        # Verify security validation
        self.security_validator.validate_config.assert_called_once_with(
            result,
            security_context
        )
        
        # Verify metrics
        self.metrics_collector.track_performance.assert_called_with(
            "agent_created",
            1,
            {
                "agent_type": "standalone",
                "creation_time": 0  # Due to frozen time
            }
        )

    @freeze_time("2024-01-01 12:00:00")
    async def test_create_from_template(self):
        """Test creating agent from template with security validation."""
        # Setup
        template_config = {
            "type": "standalone",
            "default_config": TEST_AGENT_CONFIG,
            "security": TEST_SECURITY_CONFIG
        }
        self.template_manager.get_template.return_value = template_config
        self.security_validator.validate_config.return_value = True
        
        # Execute
        result = await self.agent_factory.create_from_template(
            TEST_TEMPLATE_ID,
            security_context=TEST_SECURITY_CONFIG
        )
        
        # Verify
        assert result["template_id"] == str(TEST_TEMPLATE_ID)
        assert result["type"] == "standalone"
        assert result["created_at"] == "2024-01-01T12:00:00"
        assert result["status"] == "created"
        
        # Verify template retrieval
        self.template_manager.get_template.assert_called_once_with(TEST_TEMPLATE_ID)
        
        # Verify security validation
        self.security_validator.validate_config.assert_called_once_with(
            result,
            TEST_SECURITY_CONFIG
        )
        
        # Verify metrics
        self.metrics_collector.track_performance.assert_called_with(
            "agent_created_from_template",
            1,
            {
                "template_id": str(TEST_TEMPLATE_ID),
                "agent_type": "standalone"
            }
        )

    async def test_security_validation_failure(self):
        """Test handling of security validation failures."""
        # Setup
        config = TEST_AGENT_CONFIG.copy()
        config["security"]["access_level"] = "invalid"
        
        self.security_validator.validate_config.return_value = False
        
        # Execute and verify
        with pytest.raises(Exception) as exc:
            await self.agent_factory.create_agent(config, TEST_SECURITY_CONFIG)
        
        assert "Configuration failed security validation" in str(exc.value)
        
        # Verify metrics
        self.metrics_collector.track_performance.assert_called_with(
            "agent_creation_error",
            1
        )

@pytest.mark.unit
class TestAgentBuilder:
    """Test suite for AgentBuilder class functionality."""

    def setup_method(self):
        """Setup test dependencies."""
        self.agent_factory = Mock(spec=AgentFactory)
        self.config_validator = Mock()
        self.security_validator = Mock()
        self.rag_processor = Mock()
        
        self.builder = AgentBuilder(
            agent_factory=self.agent_factory,
            config_validator=self.config_validator,
            rag_processor=self.rag_processor
        )

    async def test_create_from_template(self):
        """Test builder creation from template with security controls."""
        # Setup
        template_config = {
            "type": "standalone",
            "schema": {},
            "security": TEST_SECURITY_CONFIG
        }
        
        self.agent_factory.create_from_template.return_value = template_config
        self.agent_factory.validate_security_context.return_value = True
        self.config_validator.validate_template_config.return_value = (True, None)
        
        # Execute
        result = await self.builder.create_from_template(
            TEST_TEMPLATE_ID,
            TEST_SECURITY_CONFIG
        )
        
        # Verify
        assert result == self.builder
        assert self.builder._current_config == template_config
        assert self.builder._security_context == TEST_SECURITY_CONFIG
        
        # Verify security validation
        self.agent_factory.validate_security_context.assert_called_once_with(
            TEST_SECURITY_CONFIG
        )
        
        # Verify template validation
        self.config_validator.validate_template_config.assert_called_once_with(
            template_config,
            template_config.get("schema", {})
        )

    async def test_with_knowledge_source(self):
        """Test adding knowledge source with security validation."""
        # Setup
        knowledge_config = {
            "source_type": "confluence",
            "security": TEST_SECURITY_CONFIG
        }
        
        self.rag_processor.validate_source_security.return_value = True
        self.agent_factory.validate_security_context.return_value = True
        
        # Execute
        result = await self.builder.with_knowledge_source(
            knowledge_config,
            TEST_SECURITY_CONFIG
        )
        
        # Verify
        assert result == self.builder
        assert self.builder._knowledge_config == knowledge_config
        assert "knowledge_sources" in self.builder._current_config
        
        # Verify security validation
        self.rag_processor.validate_source_security.assert_called_once_with(
            knowledge_config
        )
        self.agent_factory.validate_security_context.assert_called_once_with(
            TEST_SECURITY_CONFIG
        )

    async def test_build_complete_agent(self):
        """Test building complete agent with all security controls."""
        # Setup
        self.builder._current_config = TEST_AGENT_CONFIG.copy()
        self.builder._security_context = TEST_SECURITY_CONFIG.copy()
        
        self.config_validator.validate_agent_config.return_value = (True, None)
        
        # Execute
        result = await self.builder.build()
        
        # Verify
        assert result["type"] == "standalone"
        assert result["security"]["access_level"] == "restricted"
        assert "build_info" in result
        assert result["build_info"]["security_level"] == "medium"
        
        # Verify final validation
        self.config_validator.validate_agent_config.assert_called_once_with(
            self.builder._current_config,
            "standalone"
        )

def pytest_configure(config):
    """Configure pytest with custom markers."""
    config.addinivalue_line(
        "markers",
        "unit: mark test as a unit test"
    )