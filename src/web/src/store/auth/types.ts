/**
 * Redux store type definitions for authentication state management
 * Defines state shape, action types, and related interfaces for auth store slice
 * @version 1.0.0
 */

import { User, UserRole, Permission } from '../../types/auth';
import { LoadingState } from '../../types/common';

/**
 * Interface defining the shape of the authentication state
 * Manages user session, tokens, and loading states
 */
export interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  loading: LoadingState;
  error: string | null;
  token: string | null;
  lastActivity: Date | null;
}

/**
 * Enumeration of all possible authentication action types
 * Includes comprehensive session management and error handling
 */
export enum AuthActionTypes {
  LOGIN_REQUEST = '@auth/LOGIN_REQUEST',
  LOGIN_SUCCESS = '@auth/LOGIN_SUCCESS',
  LOGIN_FAILURE = '@auth/LOGIN_FAILURE',
  LOGOUT = '@auth/LOGOUT',
  SET_USER = '@auth/SET_USER',
  CLEAR_ERROR = '@auth/CLEAR_ERROR',
  REFRESH_TOKEN = '@auth/REFRESH_TOKEN',
  SESSION_EXPIRED = '@auth/SESSION_EXPIRED',
  UPDATE_LAST_ACTIVITY = '@auth/UPDATE_LAST_ACTIVITY'
}

/**
 * Interface for login request action
 * Contains user credentials for authentication
 */
export interface LoginRequestAction {
  type: AuthActionTypes.LOGIN_REQUEST;
  payload: {
    username: string;
    password: string;
  };
}

/**
 * Interface for successful login action
 * Contains authenticated user data and JWT token
 */
export interface LoginSuccessAction {
  type: AuthActionTypes.LOGIN_SUCCESS;
  payload: {
    user: User;
    token: string;
  };
}

/**
 * Interface for failed login action
 * Contains error message from authentication attempt
 */
export interface LoginFailureAction {
  type: AuthActionTypes.LOGIN_FAILURE;
  payload: string;
}

/**
 * Interface for logout action
 * Clears user session and authentication state
 */
export interface LogoutAction {
  type: AuthActionTypes.LOGOUT;
}

/**
 * Interface for setting user data action
 * Updates user information in state
 */
export interface SetUserAction {
  type: AuthActionTypes.SET_USER;
  payload: User;
}

/**
 * Interface for clearing error messages
 * Resets error state in auth slice
 */
export interface ClearErrorAction {
  type: AuthActionTypes.CLEAR_ERROR;
}

/**
 * Interface for token refresh action
 * Updates JWT token during session
 */
export interface RefreshTokenAction {
  type: AuthActionTypes.REFRESH_TOKEN;
  payload: string;
}

/**
 * Interface for session expiration action
 * Handles expired user sessions
 */
export interface SessionExpiredAction {
  type: AuthActionTypes.SESSION_EXPIRED;
}

/**
 * Interface for updating last activity timestamp
 * Tracks user session activity
 */
export interface UpdateLastActivityAction {
  type: AuthActionTypes.UPDATE_LAST_ACTIVITY;
  payload: Date;
}

/**
 * Union type of all possible authentication actions
 * Provides type safety for action handlers
 */
export type AuthAction =
  | LoginRequestAction
  | LoginSuccessAction
  | LoginFailureAction
  | LogoutAction
  | SetUserAction
  | ClearErrorAction
  | RefreshTokenAction
  | SessionExpiredAction
  | UpdateLastActivityAction;