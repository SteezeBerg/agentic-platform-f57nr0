/**
 * Enhanced React component that implements role-based access control
 * with comprehensive security monitoring and performance optimizations.
 * @version 1.0.0
 */

import React, { ReactNode, useMemo } from 'react'; // v18.2.0
import { CloudWatchLogs } from '@aws-sdk/client-cloudwatch-logs'; // v3.x
import { useAuth } from '../../hooks/useAuth';
import { Permission } from '../../types/auth';

// Initialize CloudWatch client for security logging
const cloudWatchLogs = new CloudWatchLogs({
  region: process.env.REACT_APP_AWS_REGION,
});

/**
 * Props interface for the PermissionGuard component
 */
interface PermissionGuardProps {
  /** Child components to render when permission check passes */
  children: ReactNode;
  /** List of permissions required to render children */
  requiredPermissions: Permission[];
  /** Optional component to render when permission check fails */
  fallback?: ReactNode;
  /** Enable debug mode for development */
  debug?: boolean;
}

/**
 * Security logging function for access attempts
 */
const logAccessAttempt = async (
  userId: string | undefined,
  requiredPermissions: Permission[],
  granted: boolean
): Promise<void> => {
  try {
    const logEvent = {
      timestamp: new Date().getTime(),
      message: JSON.stringify({
        event: 'ACCESS_ATTEMPT',
        userId,
        requiredPermissions,
        granted,
        component: 'PermissionGuard',
        sessionId: sessionStorage.getItem('sessionId'),
      }),
    };

    await cloudWatchLogs.putLogEvents({
      logGroupName: '/agent-builder/security',
      logStreamName: 'access-control',
      logEvents: [logEvent],
    });
  } catch (error) {
    console.error('Failed to log access attempt:', error);
  }
};

/**
 * Enhanced PermissionGuard component that implements role-based access control
 * with security monitoring and performance optimizations.
 */
const PermissionGuard: React.FC<PermissionGuardProps> = React.memo(({
  children,
  requiredPermissions,
  fallback = null,
  debug = false,
}) => {
  const { user, isAuthenticated } = useAuth();

  // Memoized permission check for performance
  const hasRequiredPermissions = useMemo(() => {
    if (!isAuthenticated || !user?.permissions) {
      return false;
    }

    return requiredPermissions.every(permission =>
      user.permissions.includes(permission)
    );
  }, [isAuthenticated, user?.permissions, requiredPermissions]);

  // Log access attempt for security monitoring
  React.useEffect(() => {
    if (isAuthenticated) {
      logAccessAttempt(user?.id, requiredPermissions, hasRequiredPermissions)
        .catch(error => console.error('Access logging failed:', error));
    }
  }, [isAuthenticated, user?.id, requiredPermissions, hasRequiredPermissions]);

  // Debug logging in development
  if (debug && process.env.NODE_ENV === 'development') {
    console.debug('PermissionGuard:', {
      isAuthenticated,
      userId: user?.id,
      requiredPermissions,
      userPermissions: user?.permissions,
      hasAccess: hasRequiredPermissions,
    });
  }

  // Early return if not authenticated
  if (!isAuthenticated) {
    return fallback;
  }

  // Render children if user has required permissions
  return hasRequiredPermissions ? <>{children}</> : fallback;
});

// Display name for debugging
PermissionGuard.displayName = 'PermissionGuard';

export default PermissionGuard;