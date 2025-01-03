/**
 * Centralized barrel file that exports authentication-related components and their type definitions
 * for implementing secure authentication flows and role-based access control in the Agent Builder Hub.
 * @version 1.0.0
 */

// Import components and their types
import AuthGuard, { AuthGuardProps } from './AuthGuard';
import LoginForm from './LoginForm';
import PermissionGuard from './PermissionGuard';
import type { PermissionGuardProps } from './PermissionGuard';

// Re-export components and their types
export {
  // Components
  AuthGuard,
  LoginForm,
  PermissionGuard,
  
  // Type definitions
  type AuthGuardProps,
  type PermissionGuardProps
};

// Default export for convenient importing
export default {
  AuthGuard,
  LoginForm,
  PermissionGuard
};