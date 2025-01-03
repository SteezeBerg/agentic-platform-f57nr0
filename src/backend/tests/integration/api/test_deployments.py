"""
Integration tests for deployment management API endpoints.
Tests deployment lifecycle, environment configurations, and rollback capabilities.
Version: 1.0.0
"""

import pytest
import uuid
import asyncio
from datetime import datetime
from typing import Dict

from tests.conftest import test_client, test_user, test_db, mock_aws
from schemas.deployment import DeploymentCreate, DeploymentUpdate, DeploymentResponse, SystemMetricsSchema

# Base URL for deployment endpoints
DEPLOYMENT_BASE_URL = '/deployments'

# Test constants
TEST_AGENT_ID = uuid.uuid4()

# Test deployment configurations by type
DEPLOYMENT_TYPES = {
    'streamlit': {
        'config': {
            'page_title': 'Test App',
            'theme': 'light',
            'port': 8501
        },
        'security_config': {
            'encryption_enabled': True,
            'audit_logging': True,
            'access_control': 'role_based'
        }
    },
    'slack': {
        'config': {
            'bot_token': 'xoxb-test-token',
            'signing_secret': 'test-secret',
            'app_token': 'xapp-test-token'
        },
        'security_config': {
            'encryption_enabled': True,
            'audit_logging': True,
            'access_control': 'role_based'
        }
    },
    'react': {
        'config': {
            'build_command': 'npm run build',
            'static_path': '/dist',
            'api_endpoint': 'https://api.test.com'
        },
        'security_config': {
            'encryption_enabled': True,
            'audit_logging': True,
            'access_control': 'role_based'
        }
    },
    'standalone': {
        'config': {
            'command': 'python',
            'args': ['app.py'],
            'working_dir': '/app'
        },
        'security_config': {
            'encryption_enabled': True,
            'audit_logging': True,
            'access_control': 'role_based'
        }
    }
}

# Environment-specific configurations
ENVIRONMENT_CONFIGS = {
    'development': {
        'resource_limits': {'cpu': 1, 'memory': 2048},
        'monitoring_config': {'logging_level': 'DEBUG'}
    },
    'staging': {
        'resource_limits': {'cpu': 2, 'memory': 4096},
        'monitoring_config': {'logging_level': 'INFO'}
    },
    'production': {
        'resource_limits': {'cpu': 4, 'memory': 8192},
        'monitoring_config': {'logging_level': 'WARNING'}
    }
}

@pytest.mark.asyncio
@pytest.mark.integration
async def test_create_deployment_all_types(test_client, test_user):
    """Test deployment creation for all supported deployment types."""
    
    for deployment_type, type_config in DEPLOYMENT_TYPES.items():
        for environment, env_config in ENVIRONMENT_CONFIGS.items():
            # Prepare deployment request
            deployment_data = {
                'agent_id': str(TEST_AGENT_ID),
                'environment': environment,
                'deployment_type': deployment_type,
                'config': type_config['config'],
                'security_config': type_config['security_config'],
                'resource_limits': env_config['resource_limits'],
                'monitoring_config': env_config['monitoring_config'],
                'description': f'Test {deployment_type} deployment in {environment}'
            }

            # Create deployment
            response = await test_client.post(
                DEPLOYMENT_BASE_URL,
                json=deployment_data,
                headers={'Authorization': f'Bearer {test_user["access_token"]}'}
            )

            assert response.status_code == 201
            deployment = DeploymentResponse(**response.json())

            # Verify deployment configuration
            assert deployment.agent_id == TEST_AGENT_ID
            assert deployment.environment == environment
            assert deployment.status == 'pending'
            assert deployment.config == type_config['config']
            assert deployment.resource_limits == env_config['resource_limits']

            # Verify security settings
            assert deployment.security_config['encryption_enabled'] is True
            assert deployment.security_config['audit_logging'] is True

            # Verify monitoring configuration
            assert deployment.monitoring_config['metrics_enabled'] is True
            assert deployment.monitoring_config['logging_level'] == env_config['monitoring_config']['logging_level']

@pytest.mark.asyncio
@pytest.mark.integration
async def test_deployment_lifecycle(test_client, test_user, mock_aws):
    """Test complete deployment lifecycle including creation, execution, monitoring, and cleanup."""
    
    # Create initial deployment
    deployment_data = {
        'agent_id': str(TEST_AGENT_ID),
        'environment': 'staging',
        'deployment_type': 'streamlit',
        'config': DEPLOYMENT_TYPES['streamlit']['config'],
        'security_config': DEPLOYMENT_TYPES['streamlit']['security_config'],
        'resource_limits': ENVIRONMENT_CONFIGS['staging']['resource_limits'],
        'monitoring_config': ENVIRONMENT_CONFIGS['staging']['monitoring_config']
    }

    response = await test_client.post(
        DEPLOYMENT_BASE_URL,
        json=deployment_data,
        headers={'Authorization': f'Bearer {test_user["access_token"]}'}
    )

    assert response.status_code == 201
    deployment_id = response.json()['id']

    # Execute deployment
    response = await test_client.post(
        f'{DEPLOYMENT_BASE_URL}/{deployment_id}/execute',
        headers={'Authorization': f'Bearer {test_user["access_token"]}'}
    )

    assert response.status_code == 200
    assert response.json()['status'] == 'in_progress'

    # Monitor deployment progress
    for _ in range(5):
        response = await test_client.get(
            f'{DEPLOYMENT_BASE_URL}/{deployment_id}/status',
            headers={'Authorization': f'Bearer {test_user["access_token"]}'}
        )
        
        assert response.status_code == 200
        status = response.json()['status']
        
        if status in ['completed', 'failed']:
            break
            
        await asyncio.sleep(2)

    assert status == 'completed'

    # Verify metrics
    response = await test_client.get(
        f'{DEPLOYMENT_BASE_URL}/{deployment_id}/metrics',
        headers={'Authorization': f'Bearer {test_user["access_token"]}'}
    )

    assert response.status_code == 200
    metrics = SystemMetricsSchema(**response.json())
    assert metrics.cpu_usage <= ENVIRONMENT_CONFIGS['staging']['resource_limits']['cpu'] * 100
    assert metrics.memory_usage <= 90  # Should be below 90% threshold

    # Cleanup deployment
    response = await test_client.delete(
        f'{DEPLOYMENT_BASE_URL}/{deployment_id}',
        headers={'Authorization': f'Bearer {test_user["access_token"]}'}
    )

    assert response.status_code == 204

@pytest.mark.asyncio
@pytest.mark.integration
async def test_blue_green_deployment(test_client, test_user, mock_aws):
    """Test Blue/Green deployment strategy with rollback scenarios."""
    
    # Create initial (blue) deployment
    blue_deployment = {
        'agent_id': str(TEST_AGENT_ID),
        'environment': 'production',
        'deployment_type': 'react',
        'config': DEPLOYMENT_TYPES['react']['config'],
        'security_config': DEPLOYMENT_TYPES['react']['security_config'],
        'resource_limits': ENVIRONMENT_CONFIGS['production']['resource_limits'],
        'monitoring_config': ENVIRONMENT_CONFIGS['production']['monitoring_config'],
        'blue_green_config': {
            'enabled': True,
            'traffic_shift': {
                'type': 'linear',
                'interval': 5,
                'percentage': 20
            }
        }
    }

    response = await test_client.post(
        DEPLOYMENT_BASE_URL,
        json=blue_deployment,
        headers={'Authorization': f'Bearer {test_user["access_token"]}'}
    )

    assert response.status_code == 201
    blue_id = response.json()['id']

    # Wait for blue deployment to complete
    await asyncio.sleep(5)

    # Create green deployment
    green_deployment = blue_deployment.copy()
    green_deployment['config']['build_command'] = 'npm run build:new'

    response = await test_client.post(
        f'{DEPLOYMENT_BASE_URL}/{blue_id}/green',
        json=green_deployment,
        headers={'Authorization': f'Bearer {test_user["access_token"]}'}
    )

    assert response.status_code == 201
    green_id = response.json()['id']

    # Monitor traffic shift
    for _ in range(5):
        response = await test_client.get(
            f'{DEPLOYMENT_BASE_URL}/{blue_id}/traffic',
            headers={'Authorization': f'Bearer {test_user["access_token"]}'}
        )
        
        assert response.status_code == 200
        traffic = response.json()
        
        if traffic['green_percentage'] >= 100:
            break
            
        await asyncio.sleep(2)

    # Simulate error detection and rollback
    response = await test_client.post(
        f'{DEPLOYMENT_BASE_URL}/{green_id}/rollback',
        json={'reason': 'High error rate detected'},
        headers={'Authorization': f'Bearer {test_user["access_token"]}'}
    )

    assert response.status_code == 200
    assert response.json()['status'] == 'rolling_back'

    # Verify traffic returned to blue deployment
    response = await test_client.get(
        f'{DEPLOYMENT_BASE_URL}/{blue_id}/traffic',
        headers={'Authorization': f'Bearer {test_user["access_token"]}'}
    )

    assert response.status_code == 200
    traffic = response.json()
    assert traffic['blue_percentage'] == 100
    assert traffic['green_percentage'] == 0