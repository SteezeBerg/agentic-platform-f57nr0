/**
 * Redux selectors for authentication state management in Agent Builder Hub
 * Implements memoized selectors with strict type safety for auth state, user roles, and permissions
 * @version 1.0.0
 */

import { createSelector } from '@reduxjs/toolkit'; // ^2.0.0
import type { RootState } from '../rootReducer';
import type { AuthState } from './types';
import type { User, Permission, UserRole } from '../../types/auth';

/**
 * Base selector for accessing the auth state slice with strict type safety
 */
export const selectAuthState = (state: Readonly<RootState>): Readonly<AuthState> => state.auth;

/**
 * Memoized selector for accessing current user data with null safety
 */
export const selectUser = createSelector(
  [selectAuthState],
  (authState): Readonly<User> | null => authState.user
);

/**
 * Memoized selector for checking authentication status
 */
export const selectIsAuthenticated = createSelector(
  [selectAuthState],
  (authState): boolean => authState.isAuthenticated
);

/**
 * Memoized selector for accessing auth loading state
 */
export const selectAuthLoading = createSelector(
  [selectAuthState],
  (authState): Readonly<LoadingState> => authState.loading
);

/**
 * Memoized selector for accessing auth error messages
 */
export const selectAuthError = createSelector(
  [selectAuthState],
  (authState): Readonly<string> | null => authState.error
);

/**
 * Memoized selector for accessing JWT token with null safety
 */
export const selectAuthToken = createSelector(
  [selectAuthState],
  (authState): Readonly<string> | null => authState.token
);

/**
 * Memoized selector for accessing last activity timestamp
 */
export const selectLastActivity = createSelector(
  [selectAuthState],
  (authState): Readonly<Date> | null => authState.lastActivity
);

/**
 * Memoized selector for checking if user has specific permission
 */
export const selectHasPermission = createSelector(
  [selectUser, (_state: RootState, permission: Permission) => permission],
  (user, permission): boolean => {
    if (!user?.permissions) return false;
    return user.permissions.includes(permission);
  }
);

/**
 * Memoized selector for checking if user has specific role
 */
export const selectHasRole = createSelector(
  [selectUser, (_state: RootState, role: UserRole) => role],
  (user, role): boolean => {
    if (!user?.role) return false;
    return user.role === role;
  }
);

/**
 * Memoized selector for accessing user permissions with null safety
 */
export const selectUserPermissions = createSelector(
  [selectUser],
  (user): Readonly<Permission[]> => user?.permissions || []
);

/**
 * Memoized selector for accessing user role with null safety
 */
export const selectUserRole = createSelector(
  [selectUser],
  (user): Readonly<UserRole> | null => user?.role || null
);

/**
 * Memoized selector for checking if session is expired
 * Considers 30 minutes of inactivity as session expiration
 */
export const selectIsSessionExpired = createSelector(
  [selectLastActivity],
  (lastActivity): boolean => {
    if (!lastActivity) return true;
    const inactivityThreshold = 30 * 60 * 1000; // 30 minutes in milliseconds
    return Date.now() - lastActivity.getTime() > inactivityThreshold;
  }
);

/**
 * Memoized selector for checking if user is admin
 */
export const selectIsAdmin = createSelector(
  [selectUserRole],
  (role): boolean => role === UserRole.ADMIN
);

/**
 * Memoized selector for checking if user can manage agents
 * Requires either ADMIN or POWER_USER role
 */
export const selectCanManageAgents = createSelector(
  [selectUserRole],
  (role): boolean => role === UserRole.ADMIN || role === UserRole.POWER_USER
);