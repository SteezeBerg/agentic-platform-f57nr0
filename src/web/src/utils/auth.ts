/**
 * Enterprise-grade authentication utility functions for the Agent Builder Hub.
 * Implements secure token handling, permission validation, and comprehensive security monitoring.
 * @version 1.0.0
 */

import { Auth } from '@aws-amplify/auth'; // v6.0.0
import { Logger } from '@aws-amplify/core'; // v6.0.0
import { SecurityMonitor } from '@aws-security-monitoring'; // v1.0.0
import { User, Permission } from '../types/auth';
import { rolePermissions } from '../config/auth';

// Initialize logger and security monitor
const logger = new Logger('AuthUtils');
const securityMonitor = new SecurityMonitor({
  component: 'AuthUtils',
  alertThreshold: MAX_ATTEMPTS_PER_WINDOW
});

// Constants for security configuration
const TOKEN_STORAGE_KEY = 'auth_token';
const TOKEN_EXPIRY_BUFFER = 300; // 5 minutes in seconds
const MAX_RETRY_ATTEMPTS = 3;
const RATE_LIMIT_WINDOW = 300; // 5 minutes in seconds
const MAX_ATTEMPTS_PER_WINDOW = 5;
const SECURITY_HEADERS = {
  'X-Frame-Options': 'DENY',
  'X-XSS-Protection': '1; mode=block'
};

/**
 * Checks if a user has a specific permission with comprehensive security monitoring
 * @param user - User object containing role and permissions
 * @param permission - Permission to check
 * @returns Promise resolving to boolean indicating if user has permission
 */
export async function hasPermission(user: User, permission: Permission): Promise<boolean> {
  try {
    // Log permission check attempt
    logger.debug('Checking permission', { userId: user.id, permission });
    
    // Start monitoring span
    const span = securityMonitor.startSpan('permission.check');
    
    // Validate inputs
    if (!user || !permission) {
      logger.error('Invalid input parameters', { user, permission });
      return false;
    }

    // Check if user has valid session
    const isAuthenticated = await Auth.currentSession();
    if (!isAuthenticated) {
      logger.warn('User session invalid during permission check');
      return false;
    }

    // Get role permissions
    const userRolePermissions = rolePermissions[user.role];
    const hasRequiredPermission = userRolePermissions.includes(permission);

    // Log result
    logger.debug('Permission check result', { 
      userId: user.id, 
      permission, 
      granted: hasRequiredPermission 
    });

    // Track security metric
    securityMonitor.trackMetric('permission.check', {
      userId: user.id,
      permission,
      result: hasRequiredPermission
    });

    span.end();
    return hasRequiredPermission;
  } catch (error) {
    logger.error('Permission check failed', { error });
    securityMonitor.trackError('permission.check.error', error);
    return false;
  }
}

/**
 * Retrieves and validates the current authentication token
 * @returns Promise resolving to JWT token or null if not authenticated
 */
export async function getToken(): Promise<string | null> {
  try {
    const span = securityMonitor.startSpan('token.retrieve');
    
    // Check token in secure storage
    const storedToken = localStorage.getItem(TOKEN_STORAGE_KEY);
    if (!storedToken) {
      return null;
    }

    // Validate token expiry
    const tokenData = parseToken(storedToken);
    if (!tokenData || tokenData.exp * 1000 < Date.now() + TOKEN_EXPIRY_BUFFER * 1000) {
      logger.debug('Token expired or invalid');
      localStorage.removeItem(TOKEN_STORAGE_KEY);
      return null;
    }

    // Get current session and verify
    const session = await Auth.currentSession();
    const token = session.getIdToken().getJwtToken();

    // Track token metrics
    securityMonitor.trackMetric('token.retrieved', { valid: true });
    
    span.end();
    return token;
  } catch (error) {
    logger.error('Token retrieval failed', { error });
    securityMonitor.trackError('token.retrieve.error', error);
    return null;
  }
}

/**
 * Checks if user is currently authenticated with security monitoring
 * @returns Promise resolving to boolean indicating authentication status
 */
export async function isAuthenticated(): Promise<boolean> {
  try {
    const span = securityMonitor.startSpan('auth.check');
    
    // Check token
    const token = await getToken();
    if (!token) {
      return false;
    }

    // Verify session
    const session = await Auth.currentSession();
    const isValid = !!session && !session.isExpired();

    // Track authentication check
    securityMonitor.trackMetric('auth.check', { 
      valid: isValid,
      timestamp: new Date().toISOString()
    });

    span.end();
    return isValid;
  } catch (error) {
    logger.error('Authentication check failed', { error });
    securityMonitor.trackError('auth.check.error', error);
    return false;
  }
}

/**
 * Securely parses JWT token with validation
 * @param token - JWT token string
 * @returns Decoded and validated token payload or null if invalid
 */
export function parseToken(token: string): any {
  try {
    const span = securityMonitor.startSpan('token.parse');
    
    // Validate token format
    if (!token || typeof token !== 'string' || !token.includes('.')) {
      logger.warn('Invalid token format');
      return null;
    }

    // Decode token parts
    const [headerB64, payloadB64, signature] = token.split('.');
    if (!headerB64 || !payloadB64 || !signature) {
      logger.warn('Missing token components');
      return null;
    }

    // Parse payload
    const payload = JSON.parse(Buffer.from(payloadB64, 'base64').toString());

    // Validate claims
    if (!payload.exp || !payload.iat || !payload.sub) {
      logger.warn('Missing required token claims');
      return null;
    }

    // Track parsing metrics
    securityMonitor.trackMetric('token.parse', { 
      valid: true,
      tokenAge: Date.now() - (payload.iat * 1000)
    });

    span.end();
    return payload;
  } catch (error) {
    logger.error('Token parsing failed', { error });
    securityMonitor.trackError('token.parse.error', error);
    return null;
  }
}