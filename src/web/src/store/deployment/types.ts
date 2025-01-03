/**
 * TypeScript type definitions for deployment-related Redux store state management
 * Provides comprehensive type safety for deployment operations, monitoring, and multi-environment support
 * @version 1.0.0
 */

import { 
  Deployment, 
  DeploymentConfig,
  DeploymentEnvironment,
  DeploymentStatus,
  DeploymentHealth,
  DeploymentType,
  DeploymentMetrics
} from '../../types/deployment';
import { LoadingState, ISO8601DateTime } from '../../types/common';

/**
 * Comprehensive enum of all possible deployment action types
 * Supports full deployment lifecycle including monitoring and health updates
 */
export enum DeploymentActionTypes {
  FETCH_DEPLOYMENTS_REQUEST = 'FETCH_DEPLOYMENTS_REQUEST',
  FETCH_DEPLOYMENTS_SUCCESS = 'FETCH_DEPLOYMENTS_SUCCESS',
  FETCH_DEPLOYMENTS_FAILURE = 'FETCH_DEPLOYMENTS_FAILURE',
  
  CREATE_DEPLOYMENT_REQUEST = 'CREATE_DEPLOYMENT_REQUEST',
  CREATE_DEPLOYMENT_SUCCESS = 'CREATE_DEPLOYMENT_SUCCESS',
  CREATE_DEPLOYMENT_FAILURE = 'CREATE_DEPLOYMENT_FAILURE',
  
  UPDATE_DEPLOYMENT_STATUS = 'UPDATE_DEPLOYMENT_STATUS',
  UPDATE_DEPLOYMENT_HEALTH = 'UPDATE_DEPLOYMENT_HEALTH',
  UPDATE_DEPLOYMENT_METRICS = 'UPDATE_DEPLOYMENT_METRICS',
  
  SWITCH_DEPLOYMENT_SLOT = 'SWITCH_DEPLOYMENT_SLOT',
  ROLLBACK_DEPLOYMENT = 'ROLLBACK_DEPLOYMENT',
  
  DELETE_DEPLOYMENT_REQUEST = 'DELETE_DEPLOYMENT_REQUEST',
  DELETE_DEPLOYMENT_SUCCESS = 'DELETE_DEPLOYMENT_SUCCESS',
  DELETE_DEPLOYMENT_FAILURE = 'DELETE_DEPLOYMENT_FAILURE'
}

/**
 * Interface for date range filtering
 */
interface DateRange {
  start: ISO8601DateTime;
  end: ISO8601DateTime;
}

/**
 * Interface for metrics-based filtering thresholds
 */
interface MetricsThreshold {
  cpu_usage?: number;
  memory_usage?: number;
  error_rate?: number;
  success_rate?: number;
}

/**
 * Enhanced type for deployment list filtering options
 */
export type DeploymentFilter = {
  environment?: DeploymentEnvironment;
  status?: DeploymentStatus[];
  agent_id?: string;
  deployment_type?: DeploymentType;
  health_status?: DeploymentHealth;
  date_range?: DateRange;
  metrics_threshold?: MetricsThreshold;
};

/**
 * Enhanced interface for deployment store state with comprehensive monitoring support
 */
export interface DeploymentState {
  // Optimized map of deployment entities indexed by ID
  readonly items: Record<string, Deployment>;
  
  // Currently selected deployment ID with null safety
  readonly selectedDeploymentId: string | null;
  
  // Granular loading states for each action type
  readonly loadingState: Record<DeploymentActionTypes, LoadingState>;
  
  // Error tracking per action type with null safety
  readonly error: Record<DeploymentActionTypes, string | null>;
  
  // Active filters for deployment list
  readonly filters: DeploymentFilter;
  
  // Real-time deployment metrics by deployment ID
  readonly metrics: Record<string, DeploymentMetrics>;
  
  // Current health status by deployment ID
  readonly healthStatus: Record<string, DeploymentHealth>;
  
  // Deployment configuration cache
  readonly configCache: Record<string, DeploymentConfig>;
  
  // Pagination state
  readonly pagination: {
    readonly currentPage: number;
    readonly itemsPerPage: number;
    readonly totalItems: number;
  };
  
  // Sort state
  readonly sorting: {
    readonly field: keyof Deployment;
    readonly direction: 'asc' | 'desc';
  };
}