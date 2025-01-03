/**
 * Redux reducer for deployment state management in Agent Builder Hub
 * Handles deployment operations, health tracking, and metrics across environments
 * @version 1.0.0
 */

import { AnyAction } from 'redux';
import { 
  DeploymentState, 
  DeploymentActionTypes,
  DeploymentFilter 
} from './types';
import { 
  Deployment,
  DeploymentHealth,
  DeploymentStatus,
  DeploymentMetrics 
} from '../../types/deployment';
import { LoadingState } from '../../types/common';

// Default health thresholds for monitoring
const DEFAULT_HEALTH_THRESHOLDS = {
  cpu_usage: 80,
  memory_usage: 85,
  error_rate: 5,
  success_rate: 98
};

// Initial state with comprehensive tracking
const initialState: DeploymentState = {
  items: {},
  selectedDeploymentId: null,
  loadingState: Object.values(DeploymentActionTypes).reduce(
    (acc, type) => ({ ...acc, [type]: LoadingState.IDLE }),
    {} as Record<DeploymentActionTypes, LoadingState>
  ),
  error: Object.values(DeploymentActionTypes).reduce(
    (acc, type) => ({ ...acc, [type]: null }),
    {} as Record<DeploymentActionTypes, string | null>
  ),
  filters: {} as DeploymentFilter,
  metrics: {},
  healthStatus: {},
  configCache: {},
  pagination: {
    currentPage: 1,
    itemsPerPage: 10,
    totalItems: 0
  },
  sorting: {
    field: 'created_at',
    direction: 'desc'
  }
};

/**
 * Enhanced reducer for deployment state management
 * Handles comprehensive deployment lifecycle including health and metrics
 */
export default function deploymentReducer(
  state: DeploymentState = initialState,
  action: AnyAction
): DeploymentState {
  switch (action.type) {
    case DeploymentActionTypes.FETCH_DEPLOYMENTS_REQUEST:
      return {
        ...state,
        loadingState: {
          ...state.loadingState,
          [DeploymentActionTypes.FETCH_DEPLOYMENTS_REQUEST]: LoadingState.LOADING
        }
      };

    case DeploymentActionTypes.FETCH_DEPLOYMENTS_SUCCESS:
      return {
        ...state,
        items: action.payload.deployments.reduce(
          (acc: Record<string, Deployment>, deployment: Deployment) => ({
            ...acc,
            [deployment.id]: deployment
          }),
          {}
        ),
        loadingState: {
          ...state.loadingState,
          [DeploymentActionTypes.FETCH_DEPLOYMENTS_REQUEST]: LoadingState.SUCCESS
        },
        pagination: {
          ...state.pagination,
          totalItems: action.payload.totalItems
        }
      };

    case DeploymentActionTypes.FETCH_DEPLOYMENTS_FAILURE:
      return {
        ...state,
        loadingState: {
          ...state.loadingState,
          [DeploymentActionTypes.FETCH_DEPLOYMENTS_REQUEST]: LoadingState.ERROR
        },
        error: {
          ...state.error,
          [DeploymentActionTypes.FETCH_DEPLOYMENTS_REQUEST]: action.payload.error
        }
      };

    case DeploymentActionTypes.UPDATE_DEPLOYMENT_STATUS:
      return {
        ...state,
        items: {
          ...state.items,
          [action.payload.deploymentId]: {
            ...state.items[action.payload.deploymentId],
            status: action.payload.status as DeploymentStatus
          }
        }
      };

    case DeploymentActionTypes.UPDATE_DEPLOYMENT_HEALTH:
      return {
        ...state,
        healthStatus: {
          ...state.healthStatus,
          [action.payload.deploymentId]: action.payload.health as DeploymentHealth
        }
      };

    case DeploymentActionTypes.UPDATE_DEPLOYMENT_METRICS:
      const newMetrics: DeploymentMetrics = action.payload.metrics;
      const deploymentId = action.payload.deploymentId;
      
      // Calculate health based on metrics and thresholds
      const newHealth = calculateHealthStatus(
        newMetrics,
        DEFAULT_HEALTH_THRESHOLDS
      );

      return {
        ...state,
        metrics: {
          ...state.metrics,
          [deploymentId]: newMetrics
        },
        healthStatus: {
          ...state.healthStatus,
          [deploymentId]: newHealth
        }
      };

    case DeploymentActionTypes.SWITCH_DEPLOYMENT_SLOT:
      const deployment = state.items[action.payload.deploymentId];
      if (!deployment) return state;

      return {
        ...state,
        items: {
          ...state.items,
          [action.payload.deploymentId]: {
            ...deployment,
            status: 'in_progress' as DeploymentStatus
          }
        }
      };

    case DeploymentActionTypes.ROLLBACK_DEPLOYMENT:
      const targetDeployment = state.items[action.payload.deploymentId];
      if (!targetDeployment) return state;

      return {
        ...state,
        items: {
          ...state.items,
          [action.payload.deploymentId]: {
            ...targetDeployment,
            status: 'rolling_back' as DeploymentStatus
          }
        }
      };

    default:
      return state;
  }
}

/**
 * Calculate deployment health status based on metrics and thresholds
 */
function calculateHealthStatus(
  metrics: DeploymentMetrics,
  thresholds: typeof DEFAULT_HEALTH_THRESHOLDS
): DeploymentHealth {
  const { cpu_usage, memory_usage } = metrics.resource_utilization;
  const { error_rate, success_rate } = metrics.performance;

  if (
    cpu_usage > thresholds.cpu_usage ||
    memory_usage > thresholds.memory_usage ||
    error_rate > thresholds.error_rate ||
    success_rate < thresholds.success_rate
  ) {
    if (error_rate > thresholds.error_rate * 2 || success_rate < thresholds.success_rate * 0.8) {
      return 'critical';
    }
    return 'degraded';
  }

  if (
    cpu_usage > thresholds.cpu_usage * 0.8 ||
    memory_usage > thresholds.memory_usage * 0.8
  ) {
    return 'degraded';
  }

  return 'healthy';
}