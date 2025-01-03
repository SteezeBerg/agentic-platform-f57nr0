"""
Integration tests for AgentBuilder class with comprehensive validation of security,
performance, and enterprise integration capabilities.
Version: 1.0.0
"""

import pytest
import json
from datetime import datetime
from uuid import uuid4

from src.core.agents.builder import AgentBuilder
from src.core.agents.factory import AgentFactory
from src.core.agents.config_validator import ConfigValidator
from src.core.knowledge.rag import RAGProcessor
from src.utils.metrics import MetricsManager
from src.utils.logging import StructuredLogger

# Test constants
PERFORMANCE_THRESHOLDS = {
    "rag_processing_ms": 2000,
    "security_validation_ms": 500,
    "build_time_ms": 1000
}

SECURITY_CONTEXT = {
    "roles": ["agent_creator"],
    "permissions": ["create", "deploy"],
    "boundaries": {
        "max_resources": {
            "cpu": "2",
            "memory": "4Gi"
        }
    }
}

@pytest.fixture
async def agent_builder(test_security_context, test_performance_monitor):
    """Initialize AgentBuilder with test dependencies."""
    agent_factory = AgentFactory(
        template_manager=test_security_context.template_manager,
        metrics_collector=test_performance_monitor.metrics,
        security_validator=test_security_context.security_validator
    )
    
    config_validator = ConfigValidator()
    rag_processor = RAGProcessor(
        vector_store=test_security_context.vector_store,
        anthropic_client=test_security_context.anthropic_client,
        openai_client=test_security_context.openai_client,
        config=test_security_context.rag_config
    )
    
    builder = AgentBuilder(
        agent_factory=agent_factory,
        config_validator=config_validator,
        rag_processor=rag_processor
    )
    
    return builder

@pytest.mark.asyncio
@pytest.mark.timeout(30)
async def test_create_agent_from_template_with_security(
    agent_builder,
    test_security_context,
    test_performance_monitor
):
    """Test creating an agent from template with security validation."""
    
    # Initialize performance monitoring
    metrics_manager = MetricsManager()
    start_time = datetime.utcnow()
    
    # Create test template
    template_id = uuid4()
    template_config = {
        "name": "Test Agent",
        "description": "Test agent for integration testing",
        "type": "standalone",
        "config": {
            "runtime": "python3.9",
            "environment": "production",
            "dependencies": ["langchain", "openai"]
        },
        "security_config": {
            "encryption_enabled": True,
            "audit_logging": True,
            "access_control": "role_based",
            "security_level": "high"
        },
        "monitoring_config": {
            "metrics_enabled": True,
            "performance_tracking": True,
            "alert_thresholds": {
                "error_rate": 0.05,
                "latency_ms": 1000
            }
        }
    }
    
    try:
        # Create agent with security context
        agent = await agent_builder.create_from_template(
            template_id=template_id,
            security_context=SECURITY_CONTEXT
        )
        
        # Add knowledge integration
        knowledge_config = {
            "source_type": "confluence",
            "connection_config": {
                "base_url": "https://example.atlassian.net",
                "username": "test_user",
                "api_token": "test_token",
                "space_keys": ["TEST"]
            }
        }
        
        agent = await agent.with_knowledge_source(
            knowledge_config=knowledge_config,
            security_context=SECURITY_CONTEXT
        )
        
        # Add capabilities
        agent = await agent.with_capabilities(
            capabilities=["rag", "chat"],
            security_context=SECURITY_CONTEXT
        )
        
        # Build final configuration
        final_config = await agent.build()
        
        # Validate security configuration
        assert final_config["security_config"]["encryption_enabled"]
        assert final_config["security_config"]["audit_logging"]
        assert final_config["security_config"]["access_control"] == "role_based"
        
        # Validate knowledge integration
        assert "knowledge_sources" in final_config
        assert final_config["knowledge_sources"]["source_type"] == "confluence"
        
        # Validate capabilities
        assert "rag" in final_config["capabilities"]
        assert "chat" in final_config["capabilities"]
        
        # Validate build metadata
        assert "build_info" in final_config
        assert "timestamp" in final_config["build_info"]
        assert final_config["build_info"]["security_level"] == "high"
        
        # Check performance metrics
        end_time = datetime.utcnow()
        duration_ms = (end_time - start_time).total_seconds() * 1000
        assert duration_ms < PERFORMANCE_THRESHOLDS["build_time_ms"]
        
        metrics_manager.track_performance(
            "agent_creation_success",
            1,
            {"duration_ms": duration_ms}
        )
        
    except Exception as e:
        metrics_manager.track_performance("agent_creation_error", 1)
        raise

@pytest.mark.asyncio
@pytest.mark.timeout(45)
async def test_agent_knowledge_integration_performance(
    agent_builder,
    test_security_context,
    test_performance_monitor
):
    """Test knowledge integration with performance monitoring."""
    
    # Initialize monitoring
    metrics_manager = MetricsManager()
    start_time = datetime.utcnow()
    
    try:
        # Create base agent
        agent = await agent_builder.create_custom(
            base_config={
                "name": "Knowledge Test Agent",
                "description": "Test agent for knowledge integration",
                "type": "standalone",
                "config": {
                    "runtime": "python3.9",
                    "environment": "production"
                }
            },
            security_context=SECURITY_CONTEXT
        )
        
        # Configure knowledge sources
        knowledge_sources = [
            {
                "source_type": "confluence",
                "connection_config": {
                    "base_url": "https://example.atlassian.net",
                    "username": "test_user",
                    "api_token": "test_token",
                    "space_keys": ["TEST1"]
                }
            },
            {
                "source_type": "docebo",
                "connection_config": {
                    "api_url": "https://example.docebo.com/api",
                    "client_id": "test_client",
                    "client_secret": "test_secret"
                }
            }
        ]
        
        # Add knowledge sources with performance tracking
        for source in knowledge_sources:
            source_start = datetime.utcnow()
            
            agent = await agent.with_knowledge_source(
                knowledge_config=source,
                security_context=SECURITY_CONTEXT
            )
            
            source_duration = (datetime.utcnow() - source_start).total_seconds() * 1000
            metrics_manager.track_performance(
                "knowledge_source_integration",
                source_duration,
                {"source_type": source["source_type"]}
            )
            
            assert source_duration < PERFORMANCE_THRESHOLDS["rag_processing_ms"]
        
        # Build final configuration
        final_config = await agent.build()
        
        # Validate knowledge integration
        assert "knowledge_sources" in final_config
        assert len(final_config["knowledge_sources"]) == 2
        
        # Validate source configurations
        sources = final_config["knowledge_sources"]
        assert any(s["source_type"] == "confluence" for s in sources)
        assert any(s["source_type"] == "docebo" for s in sources)
        
        # Check overall performance
        total_duration = (datetime.utcnow() - start_time).total_seconds() * 1000
        metrics_manager.track_performance(
            "knowledge_integration_total",
            total_duration
        )
        
        assert total_duration < PERFORMANCE_THRESHOLDS["rag_processing_ms"] * 3
        
    except Exception as e:
        metrics_manager.track_performance("knowledge_integration_error", 1)
        raise