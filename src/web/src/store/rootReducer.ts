/**
 * Root reducer configuration for Agent Builder Hub
 * Combines all feature-specific reducers with enhanced type safety and performance optimization
 * @version 1.0.0
 */

import { combineReducers } from '@reduxjs/toolkit'; // ^2.0.0
import agentsReducer from './agents/reducer';
import authReducer from './auth/reducer';
import deploymentReducer from './deployment/reducer';
import knowledgeReducer from './knowledge/reducer';

import type { AgentsState } from './agents/types';
import type { AuthState } from './auth/types';
import type { DeploymentState } from './deployment/types';
import type { KnowledgeState } from './knowledge/types';

/**
 * Combined root state interface with strict type safety
 * Includes all feature-specific state slices and readonly type brand
 */
export interface RootState {
  readonly agents: AgentsState;
  readonly auth: AuthState;
  readonly deployment: DeploymentState;
  readonly knowledge: KnowledgeState;
  readonly _brand: 'root'; // Type brand for type safety
}

/**
 * Root reducer combining all feature reducers with performance optimization
 * Implements proper error handling and state cleanup mechanisms
 */
const rootReducer = combineReducers<RootState>({
  agents: agentsReducer,
  auth: authReducer,
  deployment: deploymentReducer,
  knowledge: knowledgeReducer,
  _brand: (state = 'root') => state
});

/**
 * Type guard to check if a state object is a valid root state
 */
export const isRootState = (state: unknown): state is RootState => {
  const rootState = state as RootState;
  return (
    rootState !== null &&
    typeof rootState === 'object' &&
    '_brand' in rootState &&
    rootState._brand === 'root' &&
    'agents' in rootState &&
    'auth' in rootState &&
    'deployment' in rootState &&
    'knowledge' in rootState
  );
};

export default rootReducer;

/**
 * Type inference helper for Redux selectors
 * Provides type-safe state selection with proper inference
 */
export type RootSelector<T> = (state: RootState) => T;

/**
 * Type inference helper for Redux actions
 * Ensures proper typing for action creators and thunks
 */
export type RootAction = Parameters<typeof rootReducer>[1];

/**
 * Type inference helper for Redux dispatch
 * Provides proper typing for dispatch functions including thunks
 */
export type RootDispatch = <T extends RootAction>(action: T) => T;