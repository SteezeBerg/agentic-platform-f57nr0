import React, { useCallback, useEffect, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { View } from '@aws-amplify/ui-react'; // v6.0.0
import { Analytics } from '@aws-amplify/analytics'; // v6.0.0
import { useRateLimit } from '@aws-amplify/auth'; // v6.0.0
import { withErrorBoundary } from 'react-error-boundary'; // v4.0.0

import AuthLayout from '../../layouts/AuthLayout';
import LoginForm from '../../components/auth/LoginForm';
import { useAuth } from '../../hooks/useAuth';
import { useNotification } from '../../hooks/useNotification';
import { NotificationType } from '../../hooks/useNotification';

// Constants for security monitoring
const MAX_LOGIN_ATTEMPTS = 5;
const LOCKOUT_DURATION = 900000; // 15 minutes
const RATE_LIMIT_WINDOW = 60000; // 1 minute

/**
 * Login page component implementing secure authentication flow with
 * comprehensive security monitoring and accessibility features.
 */
const Login: React.FC = () => {
  const navigate = useNavigate();
  const { isAuthenticated, error: authError } = useAuth();
  const { showNotification } = useNotification();
  const [isLocked, setIsLocked] = useState(false);
  const [lockoutEndTime, setLockoutEndTime] = useState<number | null>(null);
  const { isRateLimited, incrementRateLimit } = useRateLimit({
    maxAttempts: MAX_LOGIN_ATTEMPTS,
    windowMs: RATE_LIMIT_WINDOW
  });

  // Check for existing lockout on component mount
  useEffect(() => {
    const storedLockoutEnd = localStorage.getItem('lockoutUntil');
    if (storedLockoutEnd) {
      const endTime = parseInt(storedLockoutEnd, 10);
      if (Date.now() < endTime) {
        setIsLocked(true);
        setLockoutEndTime(endTime);
      } else {
        localStorage.removeItem('lockoutUntil');
      }
    }
  }, []);

  // Handle lockout timer
  useEffect(() => {
    let lockoutTimer: NodeJS.Timeout;
    if (isLocked && lockoutEndTime) {
      lockoutTimer = setTimeout(() => {
        setIsLocked(false);
        setLockoutEndTime(null);
        localStorage.removeItem('lockoutUntil');
      }, lockoutEndTime - Date.now());
    }
    return () => clearTimeout(lockoutTimer);
  }, [isLocked, lockoutEndTime]);

  // Redirect if already authenticated
  if (isAuthenticated) {
    return <Navigate to="/dashboard" replace />;
  }

  /**
   * Handles successful login with security logging and analytics
   */
  const handleLoginSuccess = useCallback(async () => {
    try {
      // Track successful login
      await Analytics.record({
        name: 'LOGIN_SUCCESS',
        attributes: {
          timestamp: new Date().toISOString()
        }
      });

      // Clear any existing lockout
      setIsLocked(false);
      setLockoutEndTime(null);
      localStorage.removeItem('lockoutUntil');

      // Show success notification
      showNotification({
        message: 'Successfully logged in',
        type: NotificationType.SUCCESS
      });

      // Navigate to dashboard
      navigate('/dashboard');
    } catch (error) {
      console.error('Error handling login success:', error);
    }
  }, [navigate, showNotification]);

  /**
   * Handles login failure with security measures
   */
  const handleLoginError = useCallback(async (error: Error) => {
    try {
      // Increment rate limit counter
      incrementRateLimit();

      // Track failed attempt
      await Analytics.record({
        name: 'LOGIN_FAILURE',
        attributes: {
          error: error.message,
          timestamp: new Date().toISOString()
        }
      });

      // Handle rate limiting
      if (isRateLimited) {
        const lockoutEnd = Date.now() + LOCKOUT_DURATION;
        setIsLocked(true);
        setLockoutEndTime(lockoutEnd);
        localStorage.setItem('lockoutUntil', lockoutEnd.toString());

        showNotification({
          message: 'Too many failed attempts. Please try again later.',
          type: NotificationType.ERROR,
          persistent: true
        });
      } else {
        showNotification({
          message: error.message,
          type: NotificationType.ERROR
        });
      }
    } catch (err) {
      console.error('Error handling login failure:', err);
    }
  }, [incrementRateLimit, isRateLimited, showNotification]);

  return (
    <AuthLayout>
      <View
        as="main"
        role="main"
        aria-label="Login page"
        data-testid="login-page"
      >
        <LoginForm
          onSuccess={handleLoginSuccess}
          onError={handleLoginError}
          disabled={isLocked}
          error={authError}
          lockoutEndTime={lockoutEndTime}
        />
      </View>
    </AuthLayout>
  );
};

// Wrap with error boundary for production error handling
export default withErrorBoundary(Login, {
  fallback: <AuthLayout>Error loading login page. Please refresh.</AuthLayout>,
  onError: (error) => {
    Analytics.record({
      name: 'LOGIN_PAGE_ERROR',
      attributes: {
        error: error.message,
        timestamp: new Date().toISOString()
      }
    });
  }
});