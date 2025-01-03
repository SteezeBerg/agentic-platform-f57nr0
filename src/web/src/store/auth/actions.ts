/**
 * Redux action creators for authentication state management
 * Implements secure Cognito-based authentication with comprehensive security monitoring
 * @version 1.0.0
 */

import { Dispatch } from 'redux';
import { ThunkAction } from 'redux-thunk';

import { 
  AuthActionTypes, 
  AuthAction, 
  AuthState, 
  LoadingState 
} from './types';
import { 
  User, 
  AuthCredentials, 
  SessionInfo 
} from '../../types/auth';
import { authService } from '../../services/auth';

/**
 * Action creator for initiating login request
 * Sets loading state and clears previous errors
 */
export const loginRequest = (): AuthAction => ({
  type: AuthActionTypes.LOGIN_REQUEST,
  payload: {
    loading: LoadingState.LOADING,
    error: null
  }
});

/**
 * Action creator for successful login
 * Updates state with authenticated user and session data
 */
export const loginSuccess = (user: User, sessionInfo: SessionInfo): AuthAction => ({
  type: AuthActionTypes.LOGIN_SUCCESS,
  payload: {
    user,
    sessionInfo,
    loading: LoadingState.SUCCESS,
    error: null
  }
});

/**
 * Action creator for failed login
 * Updates state with error information and security event
 */
export const loginFailure = (error: string): AuthAction => ({
  type: AuthActionTypes.LOGIN_FAILURE,
  payload: {
    error,
    loading: LoadingState.ERROR
  }
});

/**
 * Action creator for user logout
 * Clears authentication state and session data
 */
export const logout = (): AuthAction => ({
  type: AuthActionTypes.LOGOUT
});

/**
 * Action creator for session expiration
 * Triggers automatic logout and security event logging
 */
export const sessionExpired = (): AuthAction => ({
  type: AuthActionTypes.SESSION_EXPIRED
});

/**
 * Action creator for token refresh
 * Updates session with new token data
 */
export const refreshToken = (token: string): AuthAction => ({
  type: AuthActionTypes.REFRESH_TOKEN,
  payload: {
    token
  }
});

/**
 * Action creator for updating last activity timestamp
 * Used for session timeout monitoring
 */
export const updateLastActivity = (): AuthAction => ({
  type: AuthActionTypes.UPDATE_LAST_ACTIVITY,
  payload: {
    lastActivity: new Date()
  }
});

/**
 * Async thunk action creator for login flow
 * Implements secure authentication with comprehensive error handling
 */
export const loginAsync = (
  credentials: AuthCredentials
): ThunkAction<Promise<void>, AuthState, unknown, AuthAction> => {
  return async (dispatch: Dispatch<AuthAction>) => {
    dispatch(loginRequest());

    try {
      // Attempt login with security monitoring
      const user = await authService.login(credentials);

      // Get current session info
      const session = await authService.getCurrentUser();
      
      // Update auth state with user and session data
      dispatch(loginSuccess(user, session));
      
      // Initialize activity monitoring
      dispatch(updateLastActivity());

    } catch (error) {
      dispatch(loginFailure(error.message));
      throw error;
    }
  };
};

/**
 * Async thunk action creator for token refresh
 * Handles secure token rotation with monitoring
 */
export const refreshTokenAsync = (
): ThunkAction<Promise<void>, AuthState, unknown, AuthAction> => {
  return async (dispatch: Dispatch<AuthAction>) => {
    try {
      const newToken = await authService.refreshToken();
      dispatch(refreshToken(newToken));
      dispatch(updateLastActivity());
    } catch (error) {
      dispatch(sessionExpired());
      throw error;
    }
  };
};

/**
 * Async thunk action creator for session validation
 * Implements secure session management with monitoring
 */
export const validateSessionAsync = (
): ThunkAction<Promise<void>, AuthState, unknown, AuthAction> => {
  return async (dispatch: Dispatch<AuthAction>) => {
    try {
      const isValid = await authService.validateSession();
      
      if (!isValid) {
        dispatch(sessionExpired());
        return;
      }

      dispatch(updateLastActivity());
    } catch (error) {
      dispatch(sessionExpired());
      throw error;
    }
  };
};

/**
 * Async thunk action creator for secure logout
 * Handles cleanup and security event logging
 */
export const logoutAsync = (
): ThunkAction<Promise<void>, AuthState, unknown, AuthAction> => {
  return async (dispatch: Dispatch<AuthAction>) => {
    try {
      await authService.logout();
      dispatch(logout());
    } catch (error) {
      // Still dispatch logout even if service call fails
      dispatch(logout());
      throw error;
    }
  };
};