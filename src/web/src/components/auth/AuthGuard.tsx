import React, { memo, useEffect, useCallback } from 'react';
import { Navigate } from 'react-router-dom';
import { SecurityLogger } from '@aws-amplify/core';
import { useAuth } from '../../hooks/useAuth';
import Loading from '../common/Loading';
import { UserRole } from '../../types/auth';

/**
 * Security audit level for authentication monitoring
 */
enum SecurityAuditLevel {
  HIGH = 'HIGH',
  MEDIUM = 'MEDIUM',
  LOW = 'LOW'
}

/**
 * Props interface for AuthGuard component with enhanced security options
 */
interface AuthGuardProps {
  children: React.ReactNode;
  requiredRoles?: UserRole[];
  strictMode?: boolean;
  auditLevel?: SecurityAuditLevel;
}

/**
 * Validates user access based on roles and security settings
 */
const validateUserAccess = (
  user: any,
  requiredRoles?: UserRole[],
  strictMode: boolean = false
): boolean => {
  if (!user) return false;

  // If no specific roles are required, only check authentication
  if (!requiredRoles || requiredRoles.length === 0) {
    return true;
  }

  // In strict mode, user must have all required roles
  if (strictMode) {
    return requiredRoles.every(role => user.role === role);
  }

  // In normal mode, user must have at least one of the required roles
  return requiredRoles.some(role => user.role === role);
};

/**
 * Enhanced higher-order component for secure route protection with comprehensive
 * security features including role-based access control, security logging,
 * and session validation.
 *
 * @component
 */
const AuthGuard: React.FC<AuthGuardProps> = memo(({
  children,
  requiredRoles,
  strictMode = false,
  auditLevel = SecurityAuditLevel.MEDIUM
}) => {
  const { 
    isAuthenticated, 
    isLoading, 
    user, 
    refreshToken 
  } = useAuth();

  // Security logger instance for monitoring authentication events
  const securityLogger = new SecurityLogger({
    level: auditLevel,
    service: 'AuthGuard'
  });

  /**
   * Handles security event logging with detailed context
   */
  const logSecurityEvent = useCallback((
    eventType: string,
    details: Record<string, any>
  ) => {
    securityLogger.info({
      eventType,
      timestamp: new Date().toISOString(),
      userId: user?.id,
      userRole: user?.role,
      requiredRoles,
      strictMode,
      ...details
    });
  }, [user, requiredRoles, strictMode, securityLogger]);

  /**
   * Validates session and refreshes token if needed
   */
  useEffect(() => {
    const validateSession = async () => {
      try {
        if (isAuthenticated && user) {
          await refreshToken();
          logSecurityEvent('SESSION_VALIDATED', {
            status: 'success'
          });
        }
      } catch (error) {
        logSecurityEvent('SESSION_VALIDATION_FAILED', {
          error: error.message,
          status: 'failed'
        });
      }
    };

    validateSession();
  }, [isAuthenticated, user, refreshToken, logSecurityEvent]);

  // Show loading state during authentication checks
  if (isLoading) {
    return (
      <Loading
        size="medium"
        overlay={true}
        text="Verifying authentication..."
        timeout={5000}
      />
    );
  }

  // Handle unauthenticated users
  if (!isAuthenticated) {
    logSecurityEvent('ACCESS_DENIED', {
      reason: 'not_authenticated',
      redirectTo: '/login'
    });
    return <Navigate to="/login" replace />;
  }

  // Validate user access based on roles
  const hasAccess = validateUserAccess(user, requiredRoles, strictMode);

  if (!hasAccess) {
    logSecurityEvent('ACCESS_DENIED', {
      reason: 'insufficient_permissions',
      redirectTo: '/unauthorized'
    });
    return <Navigate to="/unauthorized" replace />;
  }

  // Log successful access
  logSecurityEvent('ACCESS_GRANTED', {
    path: window.location.pathname
  });

  return <>{children}</>;
});

AuthGuard.displayName = 'AuthGuard';

export type { AuthGuardProps, SecurityAuditLevel };
export { validateUserAccess };
export default AuthGuard;