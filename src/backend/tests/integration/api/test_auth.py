"""
Integration tests for authentication API endpoints in Agent Builder Hub.
Tests authentication flows, token management, and security validations.
Version: 1.0.0
"""

import pytest
import jwt
from datetime import datetime, timedelta
from typing import Dict, Any
from httpx import AsyncClient

from src.schemas.auth import TokenResponse
from src.core.auth.tokens import ALGORITHM, TOKEN_PURPOSE_TYPES

# Test constants
AUTH_PREFIX = "/api/v1/auth"
TEST_USER_EMAIL = "test@hakkoda.io"
TEST_USER_PASSWORD = "Test123!@#"
RATE_LIMIT_WINDOW = 60
MAX_LOGIN_ATTEMPTS = 5
TOKEN_EXPIRY_MINUTES = 60
REFRESH_TOKEN_EXPIRY_DAYS = 7

@pytest.mark.asyncio
@pytest.mark.integration
async def test_login_success(test_client: AsyncClient, test_user: Dict[str, Any]):
    """Test successful login flow with comprehensive security validation."""
    
    # Prepare login request
    login_data = {
        "email": test_user["username"],
        "password": test_user["password"],
        "device_id": "test-device",
        "remember_me": False
    }

    # Execute login request
    response = await test_client.post(
        f"{AUTH_PREFIX}/login",
        json=login_data,
        headers={
            "X-Request-ID": "test-request",
            "User-Agent": "test-client"
        }
    )

    # Verify response status and structure
    assert response.status_code == 200
    token_response = TokenResponse(**response.json())

    # Validate access token
    access_token = jwt.decode(
        token_response.access_token,
        options={"verify_signature": False}
    )
    assert access_token["type"] == TOKEN_PURPOSE_TYPES["access"]
    assert access_token["sub"] == test_user["username"]
    assert "exp" in access_token
    assert "jti" in access_token
    assert "device_id" in access_token

    # Validate refresh token
    refresh_token = jwt.decode(
        token_response.refresh_token,
        options={"verify_signature": False}
    )
    assert refresh_token["type"] == TOKEN_PURPOSE_TYPES["refresh"]
    assert refresh_token["sub"] == test_user["username"]

    # Verify token expiration
    assert datetime.fromtimestamp(access_token["exp"]) > datetime.utcnow()
    assert datetime.fromtimestamp(refresh_token["exp"]) > datetime.utcnow()

    # Verify security headers
    assert "X-Content-Type-Options" in response.headers
    assert "X-Frame-Options" in response.headers
    assert "X-XSS-Protection" in response.headers
    assert response.headers["X-Content-Type-Options"] == "nosniff"

@pytest.mark.asyncio
@pytest.mark.integration
async def test_login_invalid_credentials(test_client: AsyncClient):
    """Test login failure with invalid credentials."""
    
    login_data = {
        "email": "invalid@hakkoda.io",
        "password": "invalid123",
        "device_id": "test-device"
    }

    response = await test_client.post(
        f"{AUTH_PREFIX}/login",
        json=login_data
    )

    assert response.status_code == 401
    assert "Invalid credentials" in response.json()["detail"]

@pytest.mark.asyncio
@pytest.mark.integration
async def test_login_rate_limit(test_client: AsyncClient, test_user: Dict[str, Any]):
    """Test rate limiting on login endpoint."""
    
    login_data = {
        "email": test_user["username"],
        "password": "wrong_password",
        "device_id": "test-device"
    }

    # Exceed rate limit
    for _ in range(MAX_LOGIN_ATTEMPTS + 1):
        response = await test_client.post(
            f"{AUTH_PREFIX}/login",
            json=login_data
        )

    assert response.status_code == 429
    assert "Too many login attempts" in response.json()["detail"]
    
    # Verify rate limit headers
    assert "X-RateLimit-Limit" in response.headers
    assert "X-RateLimit-Remaining" in response.headers
    assert "X-RateLimit-Reset" in response.headers
    assert int(response.headers["X-RateLimit-Remaining"]) == 0

@pytest.mark.asyncio
@pytest.mark.integration
@pytest.mark.parametrize("role", ["admin", "power_user", "developer", "business_user", "viewer"])
async def test_role_based_access(
    test_client: AsyncClient,
    test_user: Dict[str, Any],
    role: str
):
    """Test role-based access control for different user types."""
    
    # Update test user role
    test_user["user_attributes"] = [
        {"Name": "email", "Value": test_user["username"]},
        {"Name": "custom:role", "Value": role}
    ]

    # Login with role
    login_data = {
        "email": test_user["username"],
        "password": test_user["password"],
        "device_id": "test-device"
    }

    response = await test_client.post(
        f"{AUTH_PREFIX}/login",
        json=login_data
    )

    assert response.status_code == 200
    token_response = TokenResponse(**response.json())

    # Verify role in token
    access_token = jwt.decode(
        token_response.access_token,
        options={"verify_signature": False}
    )
    assert role in access_token["scopes"]

    # Test role-specific endpoint access
    headers = {"Authorization": f"Bearer {token_response.access_token}"}
    
    # Admin-only endpoint
    admin_response = await test_client.get(
        f"{AUTH_PREFIX}/admin/users",
        headers=headers
    )
    assert admin_response.status_code == (200 if role == "admin" else 403)

    # Power user endpoint
    power_user_response = await test_client.get(
        f"{AUTH_PREFIX}/agents/create",
        headers=headers
    )
    assert power_user_response.status_code == (200 if role in ["admin", "power_user"] else 403)

@pytest.mark.asyncio
@pytest.mark.integration
async def test_token_refresh(test_client: AsyncClient, test_user: Dict[str, Any]):
    """Test token refresh flow with validation."""
    
    # First login to get tokens
    login_data = {
        "email": test_user["username"],
        "password": test_user["password"],
        "device_id": "test-device"
    }

    login_response = await test_client.post(
        f"{AUTH_PREFIX}/login",
        json=login_data
    )
    assert login_response.status_code == 200
    tokens = TokenResponse(**login_response.json())

    # Refresh token
    refresh_response = await test_client.post(
        f"{AUTH_PREFIX}/refresh",
        headers={"Authorization": f"Bearer {tokens.refresh_token}"}
    )

    assert refresh_response.status_code == 200
    new_tokens = TokenResponse(**refresh_response.json())

    # Verify new tokens
    assert new_tokens.access_token != tokens.access_token
    assert new_tokens.refresh_token != tokens.refresh_token

    # Validate new access token
    new_access_token = jwt.decode(
        new_tokens.access_token,
        options={"verify_signature": False}
    )
    assert new_access_token["type"] == TOKEN_PURPOSE_TYPES["access"]
    assert new_access_token["sub"] == test_user["username"]

@pytest.mark.asyncio
@pytest.mark.integration
async def test_token_revocation(test_client: AsyncClient, test_user: Dict[str, Any]):
    """Test token revocation functionality."""
    
    # Login to get tokens
    login_data = {
        "email": test_user["username"],
        "password": test_user["password"],
        "device_id": "test-device"
    }

    login_response = await test_client.post(
        f"{AUTH_PREFIX}/login",
        json=login_data
    )
    tokens = TokenResponse(**login_response.json())

    # Revoke token
    revoke_response = await test_client.post(
        f"{AUTH_PREFIX}/revoke",
        headers={"Authorization": f"Bearer {tokens.access_token}"}
    )
    assert revoke_response.status_code == 200

    # Verify revoked token is invalid
    test_response = await test_client.get(
        f"{AUTH_PREFIX}/me",
        headers={"Authorization": f"Bearer {tokens.access_token}"}
    )
    assert test_response.status_code == 401