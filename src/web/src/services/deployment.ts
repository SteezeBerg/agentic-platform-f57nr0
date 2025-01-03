/**
 * Enterprise-grade deployment service for the Agent Builder Hub frontend.
 * Handles agent deployment operations, status tracking, metrics monitoring,
 * security validation, and health checks across different environments.
 * @version 1.0.0
 */

import { retry } from 'axios-retry'; // v3.8.0
import { Logger } from 'winston'; // v3.8.0
import { 
  Deployment,
  DeploymentConfig,
  DeploymentEnvironment,
  DeploymentType,
  DeploymentStatus,
  DeploymentHealth,
  DeploymentMetrics
} from '../types/deployment';
import { api } from '../utils/api';
import { API_ENDPOINTS } from '../config/api';
import { hasPermission } from '../utils/auth';

// Initialize logger for deployment operations
const logger = new Logger({
  level: 'info',
  defaultMeta: { service: 'DeploymentService' }
});

// Deployment validation thresholds
const VALIDATION_THRESHOLDS = {
  MIN_INSTANCES: 1,
  MAX_INSTANCES: 100,
  MIN_CPU: '0.25',
  MAX_CPU: '4',
  MIN_MEMORY: '512Mi',
  MAX_MEMORY: '8Gi',
  HEALTH_CHECK_MIN_INTERVAL: 10,
  HEALTH_CHECK_MAX_TIMEOUT: 60
} as const;

// Environment-specific configuration requirements
const ENVIRONMENT_REQUIREMENTS = {
  development: {
    requiresApproval: false,
    maxInstances: 10,
    allowedTypes: ['streamlit', 'standalone'] as DeploymentType[]
  },
  staging: {
    requiresApproval: true,
    maxInstances: 20,
    allowedTypes: ['streamlit', 'slack', 'standalone'] as DeploymentType[]
  },
  production: {
    requiresApproval: true,
    maxInstances: 100,
    allowedTypes: ['streamlit', 'slack', 'aws-react', 'standalone'] as DeploymentType[]
  }
} as const;

/**
 * Validates deployment configuration against environment-specific rules
 * @param config - Deployment configuration to validate
 * @param environment - Target deployment environment
 * @returns Promise resolving to validation result with error messages
 */
export async function validateDeploymentConfig(
  config: DeploymentConfig,
  environment: DeploymentEnvironment
): Promise<{ isValid: boolean; errors: string[] }> {
  const errors: string[] = [];
  const envRequirements = ENVIRONMENT_REQUIREMENTS[environment];

  try {
    // Validate deployment type
    if (!envRequirements.allowedTypes.includes(config.deployment_type)) {
      errors.push(`Deployment type ${config.deployment_type} not allowed in ${environment}`);
    }

    // Validate scaling configuration
    if (config.scaling.min_instances < VALIDATION_THRESHOLDS.MIN_INSTANCES) {
      errors.push(`Minimum instances cannot be less than ${VALIDATION_THRESHOLDS.MIN_INSTANCES}`);
    }
    if (config.scaling.max_instances > envRequirements.maxInstances) {
      errors.push(`Maximum instances cannot exceed ${envRequirements.maxInstances} in ${environment}`);
    }

    // Validate resource requirements
    const cpuValue = parseFloat(config.resources.cpu);
    if (cpuValue < parseFloat(VALIDATION_THRESHOLDS.MIN_CPU)) {
      errors.push(`CPU allocation cannot be less than ${VALIDATION_THRESHOLDS.MIN_CPU}`);
    }

    // Validate health check configuration
    if (config.health_check.interval < VALIDATION_THRESHOLDS.HEALTH_CHECK_MIN_INTERVAL) {
      errors.push(`Health check interval cannot be less than ${VALIDATION_THRESHOLDS.HEALTH_CHECK_MIN_INTERVAL}s`);
    }

    // Environment-specific validations
    if (environment === 'production') {
      if (!config.rollback.enabled) {
        errors.push('Rollback must be enabled for production deployments');
      }
      if (config.scaling.min_instances < 2) {
        errors.push('Production deployments require minimum 2 instances for high availability');
      }
    }

    logger.debug('Deployment configuration validation completed', {
      environment,
      errors: errors.length,
      config: { ...config, environment_variables: '[REDACTED]' }
    });

    return {
      isValid: errors.length === 0,
      errors
    };
  } catch (error) {
    logger.error('Deployment validation failed', { error, config: { type: config.deployment_type, environment }});
    throw new Error('Failed to validate deployment configuration');
  }
}

/**
 * Creates a new deployment for an agent with enhanced security and validation
 * @param agentId - ID of the agent to deploy
 * @param config - Deployment configuration
 * @returns Promise resolving to created deployment details
 */
export async function createDeployment(
  agentId: string,
  config: DeploymentConfig
): Promise<Deployment> {
  try {
    // Verify deployment permissions
    const hasDeployPermission = await hasPermission(config.environment);
    if (!hasDeployPermission) {
      throw new Error(`Insufficient permissions to deploy to ${config.environment}`);
    }

    // Validate deployment configuration
    const validation = await validateDeploymentConfig(config, config.environment);
    if (!validation.isValid) {
      throw new Error(`Invalid deployment configuration: ${validation.errors.join(', ')}`);
    }

    // Configure retry strategy for deployment request
    const retryConfig = {
      retries: 3,
      retryDelay: (retryCount: number) => Math.min(1000 * Math.pow(2, retryCount), 10000),
      retryCondition: (error: any) => {
        return error.response?.status >= 500 || !error.response;
      }
    };

    // Create deployment with retry logic
    const response = await api.post<Deployment>(
      `${API_ENDPOINTS.DEPLOYMENTS}`,
      {
        agent_id: agentId,
        config,
        timestamp: new Date().toISOString()
      },
      { 'axios-retry': retryConfig }
    );

    // Initialize deployment monitoring
    await monitorDeploymentHealth(response.data.id);

    logger.info('Deployment created successfully', {
      agentId,
      deploymentId: response.data.id,
      environment: config.environment
    });

    return response.data;
  } catch (error) {
    logger.error('Deployment creation failed', { error, agentId, environment: config.environment });
    throw error;
  }
}

/**
 * Monitors deployment health metrics and triggers alerts
 * @param deploymentId - ID of the deployment to monitor
 * @returns Promise resolving to current deployment health status
 */
export async function monitorDeploymentHealth(
  deploymentId: string
): Promise<DeploymentHealth> {
  try {
    const metrics = await api.get<DeploymentMetrics>(
      `${API_ENDPOINTS.DEPLOYMENTS}/${deploymentId}/metrics`
    );

    // Analyze metrics and determine health status
    const health: DeploymentHealth = calculateHealthStatus(metrics.data);

    // Log health status for monitoring
    logger.info('Deployment health check completed', {
      deploymentId,
      health,
      metrics: {
        cpu: metrics.data.resource_utilization.cpu_usage,
        memory: metrics.data.resource_utilization.memory_usage,
        errorRate: metrics.data.performance.error_rate
      }
    });

    return health;
  } catch (error) {
    logger.error('Health monitoring failed', { error, deploymentId });
    return 'unknown';
  }
}

/**
 * Calculates deployment health status based on metrics
 * @param metrics - Current deployment metrics
 * @returns Calculated health status
 */
function calculateHealthStatus(metrics: DeploymentMetrics): DeploymentHealth {
  const {
    resource_utilization: { cpu_usage, memory_usage },
    performance: { error_rate },
    availability: { health_check_success }
  } = metrics;

  if (error_rate > 10 || health_check_success < 80) {
    return 'critical';
  }
  if (cpu_usage > 90 || memory_usage > 90 || error_rate > 5) {
    return 'degraded';
  }
  if (health_check_success > 95 && error_rate < 1) {
    return 'healthy';
  }
  return 'degraded';
}