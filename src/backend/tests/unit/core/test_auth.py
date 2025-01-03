"""
Comprehensive unit tests for authentication and authorization functionality.
Tests token lifecycle, permissions, and Cognito integration with security validation.
Version: 1.0.0
"""

import pytest
from datetime import datetime, timedelta
from unittest.mock import Mock, patch, MagicMock
from freezegun import freeze_time
import uuid

# Internal imports
from core.auth.tokens import (
    create_access_token,
    create_refresh_token,
    decode_token,
    verify_token,
    revoke_token
)
from core.auth.permissions import (
    PermissionChecker,
    check_permission,
    verify_scope,
    RoleHierarchy
)
from core.auth.cognito import CognitoAuth

@pytest.fixture
def test_user():
    """Fixture providing test user data."""
    return {
        'id': str(uuid.uuid4()),
        'email': 'test@hakkoda.io',
        'role': 'developer',
        'device_id': 'test-device-123'
    }

@pytest.fixture
def test_claims(test_user):
    """Fixture providing test token claims."""
    return {
        'sub': test_user['id'],
        'email': test_user['email'],
        'scopes': ['developer'],
        'device_id': test_user['device_id']
    }

@pytest.fixture
def mock_cognito():
    """Fixture providing mocked Cognito client."""
    with patch('core.auth.cognito.boto3') as mock_boto3:
        mock_client = Mock()
        mock_boto3.client.return_value = mock_client
        yield mock_client

class TestTokenLifecycle:
    """Test suite for comprehensive token lifecycle management."""

    @pytest.mark.unit
    @pytest.mark.benchmark
    async def test_token_creation_and_validation(self, test_user, test_claims, benchmark):
        """Test token creation with security validation."""
        # Create access token
        access_token = await benchmark(create_access_token,
            subject=test_user['id'],
            scopes=['developer'],
            device_id=test_user['device_id']
        )

        # Validate token structure
        assert access_token is not None
        decoded = decode_token(access_token)
        assert decoded.sub == test_user['id']
        assert 'developer' in decoded.scopes
        assert decoded.device_id == test_user['device_id']

        # Verify token validity
        assert verify_token(
            access_token,
            required_scopes=['developer'],
            device_id=test_user['device_id']
        )

    @pytest.mark.unit
    async def test_token_expiration(self, test_user):
        """Test token expiration handling."""
        with freeze_time(datetime.utcnow()) as frozen_time:
            # Create token
            token = await create_access_token(
                subject=test_user['id'],
                scopes=['developer']
            )

            # Advance time beyond expiration
            frozen_time.tick(timedelta(minutes=31))

            # Verify token is expired
            with pytest.raises(ValueError, match="Token has expired"):
                decode_token(token)

    @pytest.mark.unit
    async def test_refresh_token_rotation(self, test_user):
        """Test secure refresh token rotation."""
        # Create initial refresh token
        refresh_token = await create_refresh_token(
            subject=test_user['id'],
            device_id=test_user['device_id']
        )

        # Create rotated refresh token
        new_refresh_token = await create_refresh_token(
            subject=test_user['id'],
            device_id=test_user['device_id'],
            previous_token_id=refresh_token
        )

        # Verify both tokens
        assert decode_token(refresh_token).sub == test_user['id']
        assert decode_token(new_refresh_token).sub == test_user['id']

    @pytest.mark.unit
    async def test_token_revocation(self, test_user):
        """Test token revocation and blacklisting."""
        # Create token
        token = await create_access_token(
            subject=test_user['id'],
            scopes=['developer']
        )

        # Revoke token
        await revoke_token(token)

        # Verify token is revoked
        with pytest.raises(ValueError, match="Token has been revoked"):
            verify_token(token)

class TestPermissionManagement:
    """Test suite for permission management and role hierarchy."""

    @pytest.fixture
    def permission_checker(self):
        """Fixture providing permission checker instance."""
        return PermissionChecker()

    @pytest.mark.unit
    @pytest.mark.benchmark
    async def test_role_hierarchy_validation(self, permission_checker, benchmark):
        """Test role hierarchy enforcement."""
        # Test permission inheritance
        assert benchmark(permission_checker.verify_operation_permission,
            operation='view_metrics',
            user_role='admin'
        )

        # Test insufficient permissions
        assert not permission_checker.verify_operation_permission(
            operation='manage_users',
            user_role='developer'
        )

    @pytest.mark.unit
    async def test_operation_specific_permissions(self, permission_checker):
        """Test operation-specific permission checks."""
        operations = {
            'create_agent': ['admin', 'power_user', 'developer', 'business_user'],
            'manage_users': ['admin'],
            'deploy_agent': ['admin', 'power_user', 'developer']
        }

        for operation, allowed_roles in operations.items():
            for role in allowed_roles:
                assert permission_checker.verify_operation_permission(
                    operation=operation,
                    user_role=role
                )

    @pytest.mark.unit
    async def test_permission_caching(self, permission_checker):
        """Test permission check caching."""
        # First check - should hit database
        result1 = check_permission('developer', 'create_agent')
        
        # Second check - should hit cache
        result2 = check_permission('developer', 'create_agent')
        
        assert result1 == result2

class TestCognitoIntegration:
    """Test suite for AWS Cognito integration."""

    @pytest.mark.unit
    @patch('core.auth.cognito.boto3')
    async def test_cognito_authentication(self, mock_boto3, test_user):
        """Test Cognito authentication flow."""
        mock_client = Mock()
        mock_boto3.client.return_value = mock_client

        # Mock successful authentication
        mock_client.initiate_auth.return_value = {
            'AuthenticationResult': {
                'AccessToken': 'mock-access-token',
                'RefreshToken': 'mock-refresh-token',
                'IdToken': 'mock-id-token',
                'ExpiresIn': 3600,
                'TokenType': 'Bearer'
            }
        }

        cognito = CognitoAuth()
        result = await cognito.authenticate(
            username=test_user['email'],
            password='TestPassword123!',
            ip_address='127.0.0.1'
        )

        assert result['access_token'] is not None
        assert result['refresh_token'] == 'mock-refresh-token'

    @pytest.mark.unit
    @patch('core.auth.cognito.boto3')
    async def test_mfa_flow(self, mock_boto3, test_user):
        """Test MFA authentication flow."""
        mock_client = Mock()
        mock_boto3.client.return_value = mock_client

        # Mock MFA challenge
        mock_client.initiate_auth.return_value = {
            'ChallengeName': 'SMS_MFA',
            'Session': 'mock-session-token'
        }

        cognito = CognitoAuth()
        result = await cognito.authenticate(
            username=test_user['email'],
            password='TestPassword123!'
        )

        assert result['status'] == 'mfa_required'
        assert result['session'] == 'mock-session-token'

    @pytest.mark.unit
    @patch('core.auth.cognito.boto3')
    async def test_rate_limiting(self, mock_boto3, test_user):
        """Test authentication rate limiting."""
        mock_client = Mock()
        mock_boto3.client.return_value = mock_client

        cognito = CognitoAuth()
        
        # Attempt multiple logins
        for _ in range(5):
            await cognito.authenticate(
                username=test_user['email'],
                password='WrongPassword123!',
                ip_address='127.0.0.1'
            )

        # Next attempt should be rate limited
        with pytest.raises(ValueError, match="Too many login attempts"):
            await cognito.authenticate(
                username=test_user['email'],
                password='TestPassword123!',
                ip_address='127.0.0.1'
            )

    @pytest.mark.unit
    @patch('core.auth.cognito.boto3')
    async def test_token_verification(self, mock_boto3):
        """Test Cognito token verification."""
        mock_client = Mock()
        mock_boto3.client.return_value = mock_client

        # Mock user attributes
        mock_client.get_user.return_value = {
            'UserAttributes': [
                {'Name': 'sub', 'Value': 'test-user-id'},
                {'Name': 'custom:scopes', 'Value': 'developer,viewer'},
                {'Name': 'exp', 'Value': str(int((datetime.utcnow() + timedelta(hours=1)).timestamp()))}
            ]
        }

        cognito = CognitoAuth()
        result = await cognito.verify_token(
            token='mock-token',
            required_scopes=['developer']
        )

        assert result.sub == 'test-user-id'
        assert 'developer' in result.scopes