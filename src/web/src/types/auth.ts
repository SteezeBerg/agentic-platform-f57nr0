/**
 * Core TypeScript type definitions for authentication and authorization
 * in the Agent Builder Hub frontend application.
 * @version 1.0.0
 */

import { CognitoUser } from '@aws-amplify/auth'; // v6.0.0
import { BaseEntity } from './common';

/**
 * Enumeration of available user roles in the system
 * Defines the hierarchy of access levels from Admin to Viewer
 */
export enum UserRole {
  ADMIN = 'ADMIN',
  POWER_USER = 'POWER_USER',
  DEVELOPER = 'DEVELOPER',
  BUSINESS_USER = 'BUSINESS_USER',
  VIEWER = 'VIEWER'
}

/**
 * Enumeration of granular permissions available in the system
 * Maps to specific actions that can be performed by users
 */
export enum Permission {
  CREATE_AGENT = 'CREATE_AGENT',
  EDIT_AGENT = 'EDIT_AGENT',
  DELETE_AGENT = 'DELETE_AGENT',
  DEPLOY_AGENT = 'DEPLOY_AGENT',
  MANAGE_KNOWLEDGE = 'MANAGE_KNOWLEDGE',
  VIEW_METRICS = 'VIEW_METRICS'
}

/**
 * Interface defining the structure of user attributes in Cognito
 */
export interface UserAttributes {
  sub: string;
  email: string;
  email_verified: boolean;
  'custom:role': UserRole;
}

/**
 * Type alias for JWT authentication tokens
 */
export type AuthToken = string;

/**
 * Interface for authentication credentials
 */
export interface AuthCredentials {
  email: string;
  password: string;
}

/**
 * Interface defining the core user data structure
 * Extends BaseEntity for consistent entity management
 */
export interface User extends BaseEntity {
  email: string;
  firstName: string;
  lastName: string;
  role: UserRole;
  permissions: Permission[];
}

/**
 * Type definition mapping user roles to their allowed permissions
 * Based on the access control matrix defined in the technical specifications
 */
export type RolePermissionMap = Record<UserRole, Permission[]>;

/**
 * Default role permission mappings based on the access control matrix
 */
export const DEFAULT_ROLE_PERMISSIONS: RolePermissionMap = {
  [UserRole.ADMIN]: Object.values(Permission),
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
};

/**
 * Type guard to check if a string is a valid UserRole
 */
export const isUserRole = (role: string): role is UserRole => {
  return Object.values(UserRole).includes(role as UserRole);
};

/**
 * Type guard to check if a string is a valid Permission
 */
export const isPermission = (permission: string): permission is Permission => {
  return Object.values(Permission).includes(permission as Permission);
};

/**
 * Helper function to check if a user has a specific permission
 */
export const hasPermission = (user: User, permission: Permission): boolean => {
  return user.permissions.includes(permission);
};

/**
 * Helper function to get permissions for a given role
 */
export const getPermissionsForRole = (role: UserRole): Permission[] => {
  return DEFAULT_ROLE_PERMISSIONS[role] || [];
};