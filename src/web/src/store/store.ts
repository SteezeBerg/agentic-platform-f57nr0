/**
 * Redux store configuration for Agent Builder Hub
 * Implements advanced middleware, performance optimizations, and monitoring
 * @version 1.0.0
 */

import { configureStore } from '@reduxjs/toolkit'; // ^2.0.0
import thunk from 'redux-thunk'; // ^2.4.0
import { createStateSyncMiddleware } from 'redux-state-sync'; // ^3.1.0
import rootReducer from './rootReducer';
import type { RootState } from './rootReducer';

/**
 * Custom middleware for performance monitoring and telemetry
 */
const monitoringMiddleware = () => (next: any) => (action: any) => {
  const start = performance.now();
  const result = next(action);
  const end = performance.now();
  const duration = end - start;

  // Log performance metrics if action took longer than 100ms
  if (duration > 100) {
    console.warn(`Action ${action.type} took ${duration}ms to process`);
  }

  return result;
};

/**
 * Custom middleware for error tracking and reporting
 */
const errorTrackingMiddleware = () => (next: any) => (action: any) => {
  try {
    return next(action);
  } catch (error) {
    console.error('Redux Error:', {
      action,
      error,
      timestamp: new Date().toISOString()
    });
    throw error;
  }
};

/**
 * State synchronization configuration for multi-tab support
 */
const stateSyncConfig = {
  blacklist: ['FETCH_DEPLOYMENTS_REQUEST', 'UPDATE_DEPLOYMENT_METRICS'],
  broadcastChannelOption: {
    type: 'localstorage'
  }
};

/**
 * Configure and create the Redux store with enhanced capabilities
 */
const configureAppStore = () => {
  const store = configureStore({
    reducer: rootReducer,
    middleware: (getDefaultMiddleware) => getDefaultMiddleware({
      serializableCheck: {
        // Ignore non-serializable values in specific paths
        ignoredActions: ['UPDATE_LAST_ACTIVITY'],
        ignoredPaths: ['auth.lastActivity', 'knowledge.syncStatus']
      },
      thunk: {
        extraArgument: {
          // Add any extra arguments for thunks here
        }
      }
    }).concat([
      thunk,
      createStateSyncMiddleware(stateSyncConfig),
      monitoringMiddleware,
      errorTrackingMiddleware
    ]),
    devTools: {
      // Enhanced DevTools configuration
      trace: true,
      traceLimit: 25,
      actionsBlacklist: ['UPDATE_DEPLOYMENT_METRICS'],
      actionSanitizer: (action) => {
        // Sanitize sensitive data from actions before logging
        if (action.type === 'LOGIN_SUCCESS') {
          return { ...action, payload: { ...action.payload, token: '[REDACTED]' } };
        }
        return action;
      },
      stateSanitizer: (state) => {
        // Sanitize sensitive data from state before logging
        const sanitizedState = { ...state };
        if (sanitizedState.auth?.token) {
          sanitizedState.auth = { ...sanitizedState.auth, token: '[REDACTED]' };
        }
        return sanitizedState;
      }
    }
  });

  // Enable hot module replacement for reducers in development
  if (process.env.NODE_ENV === 'development' && module.hot) {
    module.hot.accept('./rootReducer', () => {
      store.replaceReducer(rootReducer);
    });
  }

  return store;
};

/**
 * Configure store monitoring and performance tracking
 */
const setupStoreMonitoring = (store: ReturnType<typeof configureAppStore>) => {
  let lastUpdateTime = Date.now();
  
  store.subscribe(() => {
    const now = Date.now();
    const timeSinceLastUpdate = now - lastUpdateTime;
    
    // Monitor for frequent updates that might indicate performance issues
    if (timeSinceLastUpdate < 16) { // ~60fps threshold
      console.warn('State updates occurring too frequently:', timeSinceLastUpdate + 'ms');
    }
    
    lastUpdateTime = now;
  });
};

// Create the store instance
export const store = configureAppStore();

// Set up monitoring in non-production environments
if (process.env.NODE_ENV !== 'production') {
  setupStoreMonitoring(store);
}

// Export type-safe hooks and types
export type AppDispatch = typeof store.dispatch;
export type RootState = ReturnType<typeof store.getState>;

// Validate store state type matches root reducer type
type StoreState = ReturnType<typeof store.getState>;
type _TypesMatch = StoreState extends RootState ? true : never;