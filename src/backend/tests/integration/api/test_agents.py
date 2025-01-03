"""
Integration tests for Agent Builder Hub's agent management API endpoints.
Tests agent lifecycle management, validation, authentication, authorization, and performance monitoring.
Version: 1.0.0
"""

import pytest
import uuid
from datetime import datetime, timedelta
from typing import Dict, List

# Third-party imports with versions
from faker import Faker  # ^19.3.0
from freezegun import freeze_time  # ^1.2.0
import httpx  # ^0.24.0

# Internal imports
from tests.conftest import test_client, test_user, test_db
from src.utils.metrics import MetricsCollector
from src.schemas.agent import (
    AgentCreate,
    AgentUpdate,
    AgentResponse,
    AgentList,
    DeploymentConfig
)

# Test constants
TEST_AGENT_TEMPLATES = {
    'streamlit': {
        'name': 'Streamlit Test Agent',
        'type': 'streamlit',
        'config': {'port': 8501, 'theme': 'light'},
        'capabilities': ['data_visualization', 'user_interaction']
    },
    'slack': {
        'name': 'Slack Test Agent',
        'type': 'slack',
        'config': {'channel': 'test-channel'},
        'capabilities': ['messaging', 'notifications']
    },
    'react': {
        'name': 'React Test Agent',
        'type': 'react',
        'config': {'port': 3000},
        'capabilities': ['web_interface', 'user_interaction']
    }
}

PERFORMANCE_THRESHOLDS = {
    'create_agent': 100,  # ms
    'get_agent': 50,      # ms
    'list_agents': 75,    # ms
    'update_agent': 100,  # ms
    'delete_agent': 50    # ms
}

@pytest.mark.integration
@pytest.mark.asyncio
class TestAgentEndpoints:
    """Comprehensive test suite for agent management API endpoints."""

    def setup_method(self):
        """Setup test environment before each test method."""
        self.base_url = "/api/v1/agents"
        self.faker = Faker()
        self.metrics = MetricsCollector()
        
        # Initialize test data
        self.test_data = {
            'name': self.faker.company(),
            'description': self.faker.text(max_nb_chars=200),
            'type': 'streamlit',
            'config': TEST_AGENT_TEMPLATES['streamlit']['config'].copy(),
            'capabilities': ['data_analysis', 'visualization'],
            'security_config': {
                'encryption_enabled': True,
                'audit_logging': True,
                'access_control': 'role_based'
            },
            'monitoring_config': {
                'metrics_enabled': True,
                'performance_tracking': True,
                'alert_thresholds': {
                    'error_rate': 0.05,
                    'latency_ms': 1000
                }
            }
        }

    @pytest.mark.performance
    async def test_create_agent_success(self, test_client, test_user):
        """Test successful agent creation with performance monitoring."""
        # Setup metrics collection
        with self.metrics.record_timing('create_agent'):
            response = await test_client.post(
                self.base_url,
                json=self.test_data,
                headers={'Authorization': f"Bearer {test_user['access_token']}"}
            )

        # Verify response
        assert response.status_code == 201
        assert response.elapsed.total_seconds() * 1000 <= PERFORMANCE_THRESHOLDS['create_agent']
        
        data = response.json()
        assert data['name'] == self.test_data['name']
        assert data['type'] == self.test_data['type']
        assert data['status'] == 'created'
        assert uuid.UUID(data['id'])

    async def test_create_agent_validation(self, test_client, test_user):
        """Test agent creation validation rules."""
        # Test invalid type
        invalid_data = self.test_data.copy()
        invalid_data['type'] = 'invalid_type'
        
        response = await test_client.post(
            self.base_url,
            json=invalid_data,
            headers={'Authorization': f"Bearer {test_user['access_token']}"}
        )
        assert response.status_code == 422

        # Test missing required fields
        invalid_data = {'name': 'Test Agent'}
        response = await test_client.post(
            self.base_url,
            json=invalid_data,
            headers={'Authorization': f"Bearer {test_user['access_token']}"}
        )
        assert response.status_code == 422

    @pytest.mark.performance
    async def test_get_agent(self, test_client, test_user):
        """Test agent retrieval with performance monitoring."""
        # Create test agent
        create_response = await test_client.post(
            self.base_url,
            json=self.test_data,
            headers={'Authorization': f"Bearer {test_user['access_token']}"}
        )
        agent_id = create_response.json()['id']

        # Get agent with timing
        with self.metrics.record_timing('get_agent'):
            response = await test_client.get(
                f"{self.base_url}/{agent_id}",
                headers={'Authorization': f"Bearer {test_user['access_token']}"}
            )

        assert response.status_code == 200
        assert response.elapsed.total_seconds() * 1000 <= PERFORMANCE_THRESHOLDS['get_agent']
        
        data = response.json()
        assert data['id'] == agent_id
        assert data['name'] == self.test_data['name']

    @pytest.mark.performance
    async def test_list_agents(self, test_client, test_user):
        """Test agent listing with pagination and performance monitoring."""
        # Create multiple test agents
        for _ in range(3):
            await test_client.post(
                self.base_url,
                json={**self.test_data, 'name': self.faker.company()},
                headers={'Authorization': f"Bearer {test_user['access_token']}"}
            )

        # Test pagination
        with self.metrics.record_timing('list_agents'):
            response = await test_client.get(
                f"{self.base_url}?page=1&per_page=2",
                headers={'Authorization': f"Bearer {test_user['access_token']}"}
            )

        assert response.status_code == 200
        assert response.elapsed.total_seconds() * 1000 <= PERFORMANCE_THRESHOLDS['list_agents']
        
        data = response.json()
        assert len(data['items']) == 2
        assert data['total'] >= 3
        assert 'next_page' in data

    @pytest.mark.performance
    async def test_update_agent(self, test_client, test_user):
        """Test agent update with performance monitoring."""
        # Create test agent
        create_response = await test_client.post(
            self.base_url,
            json=self.test_data,
            headers={'Authorization': f"Bearer {test_user['access_token']}"}
        )
        agent_id = create_response.json()['id']

        # Update agent
        update_data = {
            'name': 'Updated Agent',
            'description': 'Updated description'
        }

        with self.metrics.record_timing('update_agent'):
            response = await test_client.patch(
                f"{self.base_url}/{agent_id}",
                json=update_data,
                headers={'Authorization': f"Bearer {test_user['access_token']}"}
            )

        assert response.status_code == 200
        assert response.elapsed.total_seconds() * 1000 <= PERFORMANCE_THRESHOLDS['update_agent']
        
        data = response.json()
        assert data['name'] == update_data['name']
        assert data['description'] == update_data['description']

    @pytest.mark.performance
    async def test_delete_agent(self, test_client, test_user):
        """Test agent deletion with performance monitoring."""
        # Create test agent
        create_response = await test_client.post(
            self.base_url,
            json=self.test_data,
            headers={'Authorization': f"Bearer {test_user['access_token']}"}
        )
        agent_id = create_response.json()['id']

        # Delete agent
        with self.metrics.record_timing('delete_agent'):
            response = await test_client.delete(
                f"{self.base_url}/{agent_id}",
                headers={'Authorization': f"Bearer {test_user['access_token']}"}
            )

        assert response.status_code == 204
        assert response.elapsed.total_seconds() * 1000 <= PERFORMANCE_THRESHOLDS['delete_agent']

        # Verify deletion
        get_response = await test_client.get(
            f"{self.base_url}/{agent_id}",
            headers={'Authorization': f"Bearer {test_user['access_token']}"}
        )
        assert get_response.status_code == 404

    async def test_authorization_rules(self, test_client):
        """Test authorization rules for agent operations."""
        # Test unauthorized access
        response = await test_client.get(self.base_url)
        assert response.status_code == 401

        # Test invalid token
        response = await test_client.get(
            self.base_url,
            headers={'Authorization': 'Bearer invalid_token'}
        )
        assert response.status_code == 401

    async def test_agent_deployment_validation(self, test_client, test_user):
        """Test agent deployment configuration validation."""
        # Create test agent
        create_response = await test_client.post(
            self.base_url,
            json=self.test_data,
            headers={'Authorization': f"Bearer {test_user['access_token']}"}
        )
        agent_id = create_response.json()['id']

        # Test invalid deployment config
        invalid_config = {
            'environment': 'invalid',
            'config': {}
        }
        response = await test_client.post(
            f"{self.base_url}/{agent_id}/deploy",
            json=invalid_config,
            headers={'Authorization': f"Bearer {test_user['access_token']}"}
        )
        assert response.status_code == 422

        # Test valid deployment config
        valid_config = {
            'environment': 'development',
            'config': {
                'replicas': 1,
                'resources': {
                    'cpu': 0.5,
                    'memory': '512Mi'
                }
            }
        }
        response = await test_client.post(
            f"{self.base_url}/{agent_id}/deploy",
            json=valid_config,
            headers={'Authorization': f"Bearer {test_user['access_token']}"}
        )
        assert response.status_code == 202