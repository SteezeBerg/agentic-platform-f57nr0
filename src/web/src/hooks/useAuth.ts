/**
 * Enhanced React hook for managing secure authentication state and operations
 * in the Agent Builder Hub frontend application.
 * @version 1.0.0
 */

import { useDispatch, useSelector } from 'react-redux'; // v8.1.0
import { useState, useEffect, useCallback, useMemo } from 'react'; // v18.2.0
import { AuthService } from '../services/auth';
import { Permission, User, UserRole } from '../types/auth';
import { LoadingState } from '../types/common';

// Session status enum for granular state tracking
enum SessionStatus {
  ACTIVE = 'ACTIVE',
  EXPIRED = 'EXPIRED',
  INVALID = 'INVALID',
  LOCKED = 'LOCKED'
}

// Enhanced error interface for comprehensive error handling
interface AuthError {
  code: string;
  message: string;
  timestamp: Date;
  retryable: boolean;
  context?: Record<string, unknown>;
}

// Login credentials interface
interface LoginCredentials {
  email: string;
  password: string;
}

/**
 * Enhanced authentication hook with comprehensive security features
 * Implements secure session management, token refresh, and security monitoring
 */
export function useAuth() {
  const dispatch = useDispatch();
  const user = useSelector((state: any) => state.auth.user);
  
  // Enhanced state management
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<AuthError | null>(null);
  const [lastActivity, setLastActivity] = useState<Date | null>(null);
  const [sessionStatus, setSessionStatus] = useState<SessionStatus>(SessionStatus.INVALID);

  // Security monitoring interval
  const SECURITY_CHECK_INTERVAL = 60000; // 1 minute
  const INACTIVITY_TIMEOUT = 30 * 60000; // 30 minutes

  /**
   * Handles security events and updates monitoring state
   */
  const handleSecurityEvent = useCallback(async (event: string, data?: any) => {
    try {
      await AuthService.validateSession();
      setLastActivity(new Date());
      
      // Update session status based on validation
      const isValid = await AuthService.validateSession();
      setSessionStatus(isValid ? SessionStatus.ACTIVE : SessionStatus.INVALID);
    } catch (error) {
      setError({
        code: 'SECURITY_EVENT_ERROR',
        message: 'Failed to process security event',
        timestamp: new Date(),
        retryable: true,
        context: { event, error }
      });
    }
  }, []);

  /**
   * Enhanced login function with security measures
   */
  const login = useCallback(async (credentials: LoginCredentials) => {
    setIsLoading(true);
    setError(null);
    
    try {
      const user = await AuthService.signIn(credentials);
      dispatch({ type: 'AUTH_LOGIN_SUCCESS', payload: user });
      setSessionStatus(SessionStatus.ACTIVE);
      await handleSecurityEvent('LOGIN_SUCCESS', { userId: user.id });
    } catch (error) {
      setError({
        code: error.code || 'LOGIN_ERROR',
        message: error.message,
        timestamp: new Date(),
        retryable: !error.code?.includes('NotAuthorizedException'),
        context: error
      });
      await handleSecurityEvent('LOGIN_FAILURE', { error });
      throw error;
    } finally {
      setIsLoading(false);
    }
  }, [dispatch, handleSecurityEvent]);

  /**
   * Enhanced logout function with cleanup
   */
  const logout = useCallback(async () => {
    try {
      await AuthService.signOut();
      dispatch({ type: 'AUTH_LOGOUT' });
      setSessionStatus(SessionStatus.INVALID);
      await handleSecurityEvent('LOGOUT_SUCCESS');
    } catch (error) {
      setError({
        code: 'LOGOUT_ERROR',
        message: error.message,
        timestamp: new Date(),
        retryable: true,
        context: error
      });
      await handleSecurityEvent('LOGOUT_FAILURE', { error });
    }
  }, [dispatch, handleSecurityEvent]);

  /**
   * Validates current authentication state
   */
  const checkAuth = useCallback(async () => {
    try {
      const currentUser = await AuthService.getCurrentUser();
      if (currentUser) {
        dispatch({ type: 'AUTH_REFRESH', payload: currentUser });
        setSessionStatus(SessionStatus.ACTIVE);
      }
    } catch (error) {
      setSessionStatus(SessionStatus.INVALID);
      setError({
        code: 'AUTH_CHECK_ERROR',
        message: error.message,
        timestamp: new Date(),
        retryable: true,
        context: error
      });
    }
  }, [dispatch]);

  /**
   * Refreshes authentication session
   */
  const refreshSession = useCallback(async () => {
    try {
      await AuthService.refreshToken();
      setSessionStatus(SessionStatus.ACTIVE);
      await handleSecurityEvent('TOKEN_REFRESH_SUCCESS');
    } catch (error) {
      setSessionStatus(SessionStatus.EXPIRED);
      setError({
        code: 'REFRESH_ERROR',
        message: error.message,
        timestamp: new Date(),
        retryable: true,
        context: error
      });
      await handleSecurityEvent('TOKEN_REFRESH_FAILURE', { error });
    }
  }, [handleSecurityEvent]);

  /**
   * Validates user permissions against required permissions
   */
  const validateAccess = useCallback((requiredPermissions: Permission[]): boolean => {
    if (!user) return false;
    return requiredPermissions.every(permission => 
      user.permissions.includes(permission)
    );
  }, [user]);

  // Set up security monitoring and session management
  useEffect(() => {
    let securityInterval: NodeJS.Timeout;
    
    const monitorSecurity = async () => {
      // Check for inactivity timeout
      if (lastActivity && Date.now() - lastActivity.getTime() > INACTIVITY_TIMEOUT) {
        await logout();
        return;
      }

      // Validate session status
      await checkAuth();
    };

    securityInterval = setInterval(monitorSecurity, SECURITY_CHECK_INTERVAL);

    // Initial auth check
    checkAuth();

    return () => {
      clearInterval(securityInterval);
    };
  }, [checkAuth, lastActivity, logout]);

  // Cross-tab session synchronization
  useEffect(() => {
    const handleStorageChange = async (event: StorageEvent) => {
      if (event.key === 'auth_token' && !event.newValue) {
        await logout();
      }
    };

    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, [logout]);

  // Memoized auth state
  const authState = useMemo(() => ({
    user,
    isAuthenticated: !!user && sessionStatus === SessionStatus.ACTIVE,
    isLoading,
    error,
    lastActivity,
    sessionStatus,
    login,
    logout,
    checkAuth,
    refreshSession,
    validateAccess
  }), [
    user,
    isLoading,
    error,
    lastActivity,
    sessionStatus,
    login,
    logout,
    checkAuth,
    refreshSession,
    validateAccess
  ]);

  return authState;
}