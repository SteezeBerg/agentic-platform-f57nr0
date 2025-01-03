"""
Comprehensive unit test suite for AuthService class.
Tests authentication flows, token management, permission verification, and security controls.
Version: 1.0.0
"""

import pytest
from datetime import datetime, timedelta
from unittest.mock import Mock, patch
import json
from uuid import uuid4
from freezegun import freeze_time
from faker import Faker

from src.services.auth_service import AuthService
from src.schemas.auth import TokenPayload, LoginRequest, TokenResponse, RoleType
from src.core.auth.tokens import create_access_token, create_refresh_token
from src.utils.validation import ValidationError

# Test constants
VALID_TOKEN = "eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ0ZXN0QGhha2tvZGEuaW8iLCJyb2xlIjoiQWRtaW4iLCJleHAiOjE3MDg2NTQ0MDB9.X2kK8AAAjrDNS-vvC7ZgHxKBpjUZKqF-4F9F4K9VrY0"
EXPIRED_TOKEN = "eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ0ZXN0QGhha2tvZGEuaW8iLCJyb2xlIjoiQWRtaW4iLCJleHAiOjE2NzY5ODIwMDB9.Y8nVGr-2_OvKzV8D4CzlN1K9qdGGkY6y-3_UX1L4Z1E"
BLACKLISTED_TOKEN = "eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ0ZXN0QGhha2tvZGEuaW8iLCJyb2xlIjoiQWRtaW4iLCJleHAiOjE3MDg2NTQ0MDB9.Q7B9_q3_3XwAJK_2LKq4z2V8_YzJ-2_UX1L4Z1E"
RATE_LIMIT_WINDOW = 60
MAX_LOGIN_ATTEMPTS = 5

@pytest.mark.asyncio
class TestAuthService:
    """Comprehensive test suite for AuthService class."""

    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup test fixtures and mocks."""
        self.faker = Faker()
        
        # Mock Cognito client
        self.mock_cognito = Mock()
        self.mock_cognito.authenticate.return_value = {
            'access_token': VALID_TOKEN,
            'refresh_token': 'refresh_token',
            'expires_in': 3600,
            'token_type': 'bearer',
            'scopes': ['admin']
        }

        # Mock Redis client
        self.mock_redis = Mock()
        self.mock_redis.get.return_value = None
        self.mock_redis.setex.return_value = True
        self.mock_redis.delete.return_value = True

        # Mock metrics collector
        self.mock_metrics = Mock()
        self.mock_metrics.track_performance.return_value = None

        # Initialize AuthService with mocks
        self.auth_service = AuthService()
        self.auth_service._cognito_auth = self.mock_cognito
        self.auth_service._redis_client = self.mock_redis
        self.auth_service._metrics = self.mock_metrics

    async def test_authenticate_user_success(self):
        """Test successful user authentication with valid credentials."""
        # Prepare test data
        login_data = LoginRequest(
            email=self.faker.email(),
            password=self.faker.password(length=12),
            device_id=str(uuid4())
        )

        # Execute authentication
        response = await self.auth_service.authenticate_user(login_data)

        # Verify Cognito client called correctly
        self.mock_cognito.authenticate.assert_called_once_with(
            login_data.email,
            login_data.password,
            None
        )

        # Verify response structure
        assert isinstance(response, TokenResponse)
        assert response.token_type == "bearer"
        assert response.expires_in == 3600
        assert "last_login" in response.metadata
        assert response.scopes == ['admin']

        # Verify metrics tracked
        self.mock_metrics['auth_attempts'].labels.assert_called_with(status='success')

    async def test_authenticate_user_rate_limited(self):
        """Test rate limiting during authentication attempts."""
        # Setup rate limit exceeded
        self.mock_redis.incr.return_value = MAX_LOGIN_ATTEMPTS + 1
        
        login_data = LoginRequest(
            email=self.faker.email(),
            password=self.faker.password()
        )

        # Verify rate limit error raised
        with pytest.raises(ValidationError) as exc_info:
            await self.auth_service.authenticate_user(login_data)

        assert "Too many login attempts" in str(exc_info.value)
        self.mock_metrics['auth_attempts'].labels.assert_called_with(status='rate_limited')

    @freeze_time("2024-02-20 12:00:00")
    async def test_verify_token_success(self):
        """Test successful token verification."""
        # Mock token validation response
        token_data = TokenPayload(
            sub="test@hakkoda.io",
            exp=int((datetime.utcnow() + timedelta(hours=1)).timestamp()),
            scopes=["admin"]
        )

        with patch('src.services.auth_service.verify_token', return_value=token_data):
            result = await self.auth_service.verify_token(VALID_TOKEN)
            assert isinstance(result, TokenPayload)
            assert result.sub == "test@hakkoda.io"
            assert "admin" in result.scopes

    async def test_verify_token_blacklisted(self):
        """Test verification of blacklisted token."""
        # Setup blacklisted token
        self.mock_redis.get.return_value = "1"

        with pytest.raises(ValidationError) as exc_info:
            await self.auth_service.verify_token(BLACKLISTED_TOKEN)

        assert "Token has been revoked" in str(exc_info.value)
        self.mock_metrics['token_operations'].labels.assert_called_with(
            operation='verify',
            status='error'
        )

    async def test_refresh_auth_tokens_success(self):
        """Test successful token refresh."""
        # Mock token validation
        token_data = TokenPayload(
            sub="test@hakkoda.io",
            exp=int((datetime.utcnow() + timedelta(days=30)).timestamp()),
            scopes=["admin"]
        )

        with patch('src.services.auth_service.verify_token', return_value=token_data):
            response = await self.auth_service.refresh_auth_tokens("refresh_token")

            assert isinstance(response, TokenResponse)
            assert response.token_type == "bearer"
            assert "refreshed_at" in response.metadata
            
            # Verify old token blacklisted
            self.mock_redis.setex.assert_called_once()
            self.mock_metrics['token_operations'].labels.assert_called_with(
                operation='refresh',
                status='success'
            )

    async def test_check_permission_success(self):
        """Test successful permission check."""
        result = await self.auth_service.check_permission(
            operation="create_agent",
            user_role="admin"
        )
        assert result is True

    async def test_check_permission_insufficient_role(self):
        """Test permission check with insufficient role."""
        result = await self.auth_service.check_permission(
            operation="manage_users",
            user_role="viewer"
        )
        assert result is False

    @freeze_time("2024-02-20 12:00:00")
    async def test_verify_token_expired(self):
        """Test verification of expired token."""
        with pytest.raises(ValidationError) as exc_info:
            await self.auth_service.verify_token(EXPIRED_TOKEN)

        assert "Token has expired" in str(exc_info.value)
        self.mock_metrics['token_operations'].labels.assert_called_with(
            operation='verify',
            status='error'
        )

    async def test_authenticate_user_invalid_credentials(self):
        """Test authentication with invalid credentials."""
        self.mock_cognito.authenticate.side_effect = ValidationError(
            "Invalid credentials",
            "authentication",
            "INVALID_CREDENTIALS"
        )

        login_data = LoginRequest(
            email=self.faker.email(),
            password=self.faker.password()
        )

        with pytest.raises(ValidationError) as exc_info:
            await self.auth_service.authenticate_user(login_data)

        assert "Invalid credentials" in str(exc_info.value)
        self.mock_metrics['auth_attempts'].labels.assert_called_with(status='error')

    async def test_verify_token_required_role(self):
        """Test token verification with required role."""
        token_data = TokenPayload(
            sub="test@hakkoda.io",
            exp=int((datetime.utcnow() + timedelta(hours=1)).timestamp()),
            scopes=["admin"]
        )

        with patch('src.services.auth_service.verify_token', return_value=token_data):
            result = await self.auth_service.verify_token(
                VALID_TOKEN,
                required_role="admin"
            )
            assert isinstance(result, TokenPayload)
            assert result.scopes == ["admin"]

    async def test_refresh_token_invalid(self):
        """Test refresh with invalid token."""
        with patch('src.services.auth_service.verify_token', side_effect=ValidationError(
            "Invalid token",
            "token",
            "INVALID_TOKEN"
        )):
            with pytest.raises(ValidationError) as exc_info:
                await self.auth_service.refresh_auth_tokens("invalid_token")

            assert "Invalid token" in str(exc_info.value)
            self.mock_metrics['token_operations'].labels.assert_called_with(
                operation='refresh',
                status='error'
            )