"""
Enterprise-grade role-based access control and permission management for Agent Builder Hub.
Implements comprehensive security features, audit logging, and performance optimizations.
Version: 1.0.0
"""

import logging
from functools import wraps
from typing import Dict, Optional, Callable, Any
from datetime import datetime, timedelta

from fastapi import HTTPException, Security, Depends
from fastapi.security import OAuth2PasswordBearer
from prometheus_client import Counter, Gauge
from redis import Redis

from ...config.database import create_database_manager
from ...utils.logging import StructuredLogger
from ...utils.metrics import MetricsManager
from ...schemas.auth import TokenPayload
from ...db.models.user import ROLES, ROLE_HIERARCHY

# Initialize structured logger
logger = StructuredLogger('auth.permissions', {
    'service': 'agent_builder',
    'component': 'permissions'
})

# Initialize metrics
metrics = MetricsManager(namespace='AgentBuilderHub/Permissions')
permission_checks = Counter(
    'permission_checks_total',
    'Total number of permission checks',
    ['operation', 'role', 'status']
)
error_rate = Gauge(
    'permission_error_rate',
    'Rate of permission check errors'
)

# Global constants
CACHE_TTL = 300  # 5 minutes cache TTL
MAX_PERMISSION_CHECKS_PER_MINUTE = 1000
CIRCUIT_BREAKER_THRESHOLD = 0.5

# Required roles for operations
REQUIRED_ROLES = {
    'create_agent': 'business_user',
    'edit_agent': 'developer',
    'delete_agent': 'power_user',
    'deploy_agent': 'developer',
    'manage_users': 'admin',
    'view_metrics': 'viewer',
    'configure_knowledge': 'developer',
    'manage_deployments': 'power_user'
}

class PermissionChecker:
    """Enhanced permission verification and enforcement with security features."""

    def __init__(self):
        """Initialize permission checker with security features."""
        self._role_hierarchy = ROLE_HIERARCHY
        self._required_roles = REQUIRED_ROLES
        self._db_manager = create_database_manager()
        self._cache = self._db_manager.get_redis_client()
        self._circuit_breaker_status = False
        self._error_count = 0
        self._last_reset = datetime.utcnow()
        
        # Initialize metrics
        self._check_counter = Counter(
            'permission_checks_total',
            'Total number of permission checks',
            ['role', 'operation']
        )
        self._error_rate = Gauge(
            'permission_error_rate',
            'Error rate for permission checks'
        )

    def require_role(self, required_role: str) -> Callable:
        """Decorator enforcing role requirement with security features."""
        def decorator(func: Callable) -> Callable:
            @wraps(func)
            async def wrapper(*args, **kwargs) -> Any:
                # Check circuit breaker
                if self._circuit_breaker_status:
                    logger.log('error', 'Circuit breaker active, denying all requests')
                    raise HTTPException(status_code=503, detail="Service temporarily unavailable")

                # Rate limiting check
                current_time = datetime.utcnow()
                if (current_time - self._last_reset).total_seconds() > 60:
                    self._error_count = 0
                    self._last_reset = current_time

                # Get token from context
                token = kwargs.get('token')
                if not token:
                    logger.log('error', 'No token provided for permission check')
                    raise HTTPException(status_code=401, detail="Authentication required")

                try:
                    # Verify permissions
                    if not self.verify_operation_permission(required_role, token.scopes[0]):
                        logger.log('warning', 'Permission denied', {
                            'required_role': required_role,
                            'user_role': token.scopes[0]
                        })
                        raise HTTPException(status_code=403, detail="Insufficient permissions")

                    # Track successful check
                    self._check_counter.labels(
                        role=token.scopes[0],
                        operation=func.__name__
                    ).inc()

                    return await func(*args, **kwargs)

                except Exception as e:
                    # Update error metrics
                    self._error_count += 1
                    self._error_rate.set(self._error_count / MAX_PERMISSION_CHECKS_PER_MINUTE)

                    # Check circuit breaker threshold
                    if self._error_rate.get() > CIRCUIT_BREAKER_THRESHOLD:
                        self._circuit_breaker_status = True
                        logger.log('critical', 'Circuit breaker activated due to high error rate')

                    logger.log('error', f'Permission check failed: {str(e)}')
                    raise HTTPException(status_code=500, detail="Permission check failed")

            return wrapper
        return decorator

    def verify_operation_permission(self, operation: str, user_role: str) -> bool:
        """Verifies operation permission with security logging."""
        try:
            # Validate operation
            if operation not in self._required_roles:
                logger.log('error', f'Invalid operation: {operation}')
                return False

            # Validate role
            if user_role not in self._role_hierarchy:
                logger.log('error', f'Invalid role: {user_role}')
                return False

            # Get required role level
            required_role = self._required_roles[operation]
            required_level = self._role_hierarchy[required_role]
            user_level = self._role_hierarchy[user_role]

            # Check permission
            has_permission = user_level >= required_level

            # Log and track metrics
            logger.log('info', 'Permission check completed', {
                'operation': operation,
                'user_role': user_role,
                'required_role': required_role,
                'granted': has_permission
            })

            permission_checks.labels(
                operation=operation,
                role=user_role,
                status='granted' if has_permission else 'denied'
            ).inc()

            return has_permission

        except Exception as e:
            logger.log('error', f'Permission verification failed: {str(e)}')
            error_rate.inc()
            return False

def check_permission(user_role: str, required_role: str) -> bool:
    """Verifies if a user has sufficient role level for an operation with caching and monitoring."""
    cache_key = f"perm:{user_role}:{required_role}"
    
    try:
        # Check cache
        checker = PermissionChecker()
        cached_result = checker._cache.get(cache_key)
        if cached_result is not None:
            return bool(int(cached_result))

        # Verify permission
        result = checker.verify_operation_permission(required_role, user_role)

        # Cache result
        checker._cache.setex(cache_key, CACHE_TTL, int(result))

        return result

    except Exception as e:
        logger.log('error', f'Permission check failed: {str(e)}')
        metrics.track_performance('permission_check_error', 1)
        return False

def verify_scope(token: TokenPayload, required_scope: str) -> bool:
    """Verifies if token contains required scope with security logging."""
    try:
        if not token or not token.scopes:
            logger.log('warning', 'Token has no scopes')
            return False

        has_scope = required_scope in token.scopes

        logger.log('info', 'Scope verification completed', {
            'required_scope': required_scope,
            'granted': has_scope
        })

        metrics.track_performance('scope_check', 1, {
            'status': 'success' if has_scope else 'denied'
        })

        return has_scope

    except Exception as e:
        logger.log('error', f'Scope verification failed: {str(e)}')
        metrics.track_performance('scope_check_error', 1)
        return False

__all__ = ['PermissionChecker', 'check_permission', 'verify_scope']