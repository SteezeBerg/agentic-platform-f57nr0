/**
 * Authentication configuration file for the Agent Builder Hub frontend application.
 * Implements secure authentication flow with AWS Cognito and comprehensive RBAC.
 * @version 1.0.0
 */

import { Auth } from '@aws-amplify/auth'; // v6.0.0
import { UserRole, Permission } from '../types/auth';
import { amplifyConfig } from './amplify';

/**
 * Core authentication configuration constants
 * Defines security settings and token management parameters
 */
export const authConfig = {
  AUTH_TOKEN_KEY: 'auth_token',
  REFRESH_TOKEN_KEY: 'refresh_token',
  TOKEN_EXPIRY_BUFFER: 300000, // 5 minutes in milliseconds
  MAX_LOGIN_ATTEMPTS: 5,
  PASSWORD_REQUIREMENTS: {
    minLength: 12,
    requireNumbers: true,
    requireSpecialChars: true,
    requireUppercase: true,
    requireLowercase: true,
    specialCharSet: '!@#$%^&*()_+-=[]{}|;:,.<>?',
    maxLength: 64,
    preventReuse: 5,
    expiryDays: 90
  },
  AUTH_MONITORING_CONFIG: {
    logFailedAttempts: true,
    alertThreshold: 3,
    lockoutDuration: 900000, // 15 minutes in milliseconds
    monitoringEndpoint: '/api/security/auth-events'
  }
} as const;

/**
 * Role-based permission mapping based on the access control matrix
 * Defines granular permissions for each user role
 */
export const ROLE_PERMISSION_MAP = {
  [UserRole.ADMIN]: [
    Permission.CREATE_AGENT,
    Permission.EDIT_AGENT,
    Permission.DELETE_AGENT,
    Permission.DEPLOY_AGENT,
    Permission.MANAGE_KNOWLEDGE,
    Permission.VIEW_METRICS
  ],
  [UserRole.POWER_USER]: [
    Permission.CREATE_AGENT,
    Permission.EDIT_AGENT,
    Permission.DELETE_AGENT,
    Permission.DEPLOY_AGENT,
    Permission.MANAGE_KNOWLEDGE,
    Permission.VIEW_METRICS
  ],
  [UserRole.DEVELOPER]: [
    Permission.CREATE_AGENT,
    Permission.EDIT_AGENT,
    Permission.DEPLOY_AGENT,
    Permission.VIEW_METRICS
  ],
  [UserRole.BUSINESS_USER]: [
    Permission.CREATE_AGENT,
    Permission.VIEW_METRICS
  ],
  [UserRole.VIEWER]: [
    Permission.VIEW_METRICS
  ]
} as const;

/**
 * Initializes authentication configuration with AWS Amplify
 * Sets up security monitoring and token refresh mechanism
 */
export const initializeAuth = async (): Promise<void> => {
  try {
    // Configure Amplify Auth with secure settings
    Auth.configure(amplifyConfig.Auth);

    // Set up authentication event monitoring
    let failedAttempts = 0;
    const monitorAuthEvents = async (eventType: string, data: any) => {
      if (eventType === 'signIn_failure') {
        failedAttempts++;
        if (failedAttempts >= authConfig.MAX_LOGIN_ATTEMPTS) {
          // Implement account lockout
          await fetch(authConfig.AUTH_MONITORING_CONFIG.monitoringEndpoint, {
            method: 'POST',
            body: JSON.stringify({
              event: 'ACCOUNT_LOCKED',
              timestamp: new Date().toISOString(),
              data
            })
          });
        }
      } else if (eventType === 'signIn') {
        failedAttempts = 0;
      }
    };

    // Configure token refresh mechanism
    const tokenRefreshInterval = setInterval(async () => {
      try {
        const session = await Auth.currentSession();
        const expirationTime = session.getIdToken().getExpiration() * 1000;
        const currentTime = Date.now();

        if (expirationTime - currentTime <= authConfig.TOKEN_EXPIRY_BUFFER) {
          await Auth.currentSession();
        }
      } catch (error) {
        console.error('Token refresh failed:', error);
      }
    }, authConfig.TOKEN_EXPIRY_BUFFER / 2);

    // Cleanup on unmount
    return () => {
      clearInterval(tokenRefreshInterval);
    };
  } catch (error) {
    console.error('Authentication initialization failed:', error);
    throw error;
  }
};

/**
 * Returns the list of permissions for a given user role
 * Implements validation and security logging
 */
export const getPermissionsForRole = (role: UserRole): ReadonlyArray<Permission> => {
  if (!Object.values(UserRole).includes(role)) {
    console.error('Invalid role requested:', role);
    return [];
  }

  // Log access check for security audit
  const permissions = ROLE_PERMISSION_MAP[role];
  console.debug('Permission check:', { role, permissions });

  return permissions;
};

// Freeze configuration objects to prevent modification
Object.freeze(authConfig);
Object.freeze(ROLE_PERMISSION_MAP);