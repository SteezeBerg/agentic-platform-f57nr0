/**
 * Barrel file exporting all deployment-related components and types for the Agent Builder Hub.
 * Centralizes deployment component exports to simplify imports in other parts of the application.
 * @version 1.0.0
 */

// Component exports with comprehensive type definitions
export { default as DeploymentCard } from './DeploymentCard';
export type { DeploymentCardProps } from './DeploymentCard';

export { default as DeploymentDashboard } from './DeploymentDashboard';
export type { DeploymentDashboardProps } from './DeploymentDashboard';

export { default as DeploymentList } from './DeploymentList';
export type { DeploymentListProps } from './DeploymentList';

export { default as DeploymentMetrics } from './DeploymentMetrics';

// Export deployment-related types from the types module
export {
  type Deployment,
  type DeploymentConfig,
  type DeploymentEnvironment,
  type DeploymentType,
  type DeploymentStatus,
  type DeploymentHealth,
  type DeploymentMetrics,
  type DeploymentHistory
} from '../../types/deployment';

// Export deployment-related constants and utilities
export {
  VALIDATION_THRESHOLDS,
  ENVIRONMENT_REQUIREMENTS
} from '../../services/deployment';

// Export deployment-related API endpoints
export {
  API_ENDPOINTS
} from '../../config/api';

/**
 * Namespace containing deployment-related enums and interfaces
 * for enhanced type safety and organization
 */
export namespace DeploymentTypes {
  export enum DeploymentStatus {
    PENDING = 'pending',
    IN_PROGRESS = 'in_progress',
    COMPLETED = 'completed',
    FAILED = 'failed',
    ROLLING_BACK = 'rolling_back',
    ROLLED_BACK = 'rolled_back',
    VALIDATING = 'validating'
  }

  export enum DeploymentEnvironment {
    DEVELOPMENT = 'development',
    STAGING = 'staging',
    PRODUCTION = 'production'
  }

  export enum DeploymentHealth {
    HEALTHY = 'healthy',
    DEGRADED = 'degraded',
    UNHEALTHY = 'unhealthy',
    CRITICAL = 'critical',
    UNKNOWN = 'unknown'
  }

  export interface DeploymentError {
    code: string;
    message: string;
    details?: Record<string, unknown>;
    timestamp: string;
  }
}