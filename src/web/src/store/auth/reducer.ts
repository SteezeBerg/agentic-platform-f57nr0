/**
 * Redux reducer for authentication state management in Agent Builder Hub
 * Implements Cognito-based auth flow with role-based access control
 * @version 1.0.0
 */

import { Reducer } from 'redux'; // v4.2.1
import {
  AuthState,
  AuthActionTypes,
  AuthAction,
  LoadingState,
  UserRole,
  Permission
} from './types';

/**
 * Initial authentication state with strict null checks
 */
const initialState: AuthState = {
  user: null,
  isAuthenticated: false,
  loading: LoadingState.IDLE,
  error: null,
  token: null,
  lastActivity: null
};

/**
 * Redux reducer for handling authentication state transitions
 * Implements comprehensive session management and RBAC
 */
export const authReducer: Reducer<AuthState, AuthAction> = (
  state = initialState,
  action
): AuthState => {
  switch (action.type) {
    case AuthActionTypes.LOGIN_REQUEST:
      return {
        ...state,
        loading: LoadingState.LOADING,
        error: null
      };

    case AuthActionTypes.LOGIN_SUCCESS:
      return {
        ...state,
        isAuthenticated: true,
        user: action.payload.user,
        token: action.payload.token,
        loading: LoadingState.SUCCESS,
        error: null,
        lastActivity: new Date()
      };

    case AuthActionTypes.LOGIN_FAILURE:
      return {
        ...state,
        isAuthenticated: false,
        user: null,
        token: null,
        loading: LoadingState.ERROR,
        error: action.payload,
        lastActivity: null
      };

    case AuthActionTypes.LOGOUT:
      return {
        ...initialState
      };

    case AuthActionTypes.SET_USER:
      // Validate role and set corresponding permissions
      const role = action.payload.role;
      const permissions = Object.values(Permission).filter(permission => {
        switch (role) {
          case UserRole.ADMIN:
            return true;
          case UserRole.POWER_USER:
            return permission !== Permission.DELETE_AGENT;
          case UserRole.DEVELOPER:
            return ![Permission.DELETE_AGENT, Permission.MANAGE_KNOWLEDGE].includes(permission);
          case UserRole.BUSINESS_USER:
            return [Permission.CREATE_AGENT, Permission.VIEW_METRICS].includes(permission);
          case UserRole.VIEWER:
            return permission === Permission.VIEW_METRICS;
          default:
            return false;
        }
      });

      return {
        ...state,
        user: {
          ...action.payload,
          permissions
        }
      };

    case AuthActionTypes.CLEAR_ERROR:
      return {
        ...state,
        error: null,
        loading: LoadingState.IDLE
      };

    case AuthActionTypes.REFRESH_TOKEN:
      return {
        ...state,
        token: action.payload,
        lastActivity: new Date()
      };

    case AuthActionTypes.SESSION_EXPIRED:
      return {
        ...initialState
      };

    case AuthActionTypes.UPDATE_LAST_ACTIVITY:
      return {
        ...state,
        lastActivity: action.payload
      };

    default:
      return state;
  }
};