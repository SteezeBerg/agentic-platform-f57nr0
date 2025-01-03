/**
 * Redux action creators and thunks for managing deployment state in the Agent Builder Hub frontend.
 * Implements comprehensive deployment lifecycle management with security and monitoring.
 * @version 1.0.0
 */

import { createAsyncThunk } from '@reduxjs/toolkit'; // v2.0.0
import { Logger } from 'winston'; // v3.10.0
import { SecurityMonitor } from '@security/monitor'; // v1.0.0

import {
  DeploymentActionTypes,
  DeploymentState,
  DeploymentFilter,
  DeploymentConfig,
  DeploymentStatus,
  DeploymentEnvironment,
  DeploymentMetrics
} from './types';

import {
  createDeployment as createDeploymentService,
  listDeployments as listDeploymentsService,
  updateDeploymentStatus as updateDeploymentStatusService,
  getDeploymentMetrics,
  rollbackDeployment as rollbackDeploymentService,
  validateDeployment,
  checkDeploymentHealth
} from '../../services/deployment';

import { hasPermission } from '../../utils/auth';

// Initialize logger and security monitor
const logger = new Logger({
  level: 'info',
  defaultMeta: { service: 'DeploymentActions' }
});

const securityMonitor = new SecurityMonitor({
  component: 'DeploymentActions',
  alertThreshold: 5
});

/**
 * Fetches deployments with optional filters and health metrics
 */
export const fetchDeployments = createAsyncThunk(
  'deployments/fetchDeployments',
  async (filters: DeploymentFilter, { rejectWithValue }) => {
    try {
      const span = securityMonitor.startSpan('fetch.deployments');

      // Fetch deployments with filters
      const deployments = await listDeploymentsService(filters);

      // Fetch health metrics for each deployment
      const metricsPromises = deployments.map(deployment =>
        getDeploymentMetrics(deployment.id)
      );
      const metrics = await Promise.all(metricsPromises);

      // Combine deployments with their metrics
      const deploymentsWithMetrics = deployments.map((deployment, index) => ({
        ...deployment,
        metrics: metrics[index]
      }));

      logger.info('Deployments fetched successfully', {
        count: deployments.length,
        filters
      });

      span.end();
      return deploymentsWithMetrics;
    } catch (error) {
      logger.error('Failed to fetch deployments', { error, filters });
      securityMonitor.trackError('fetch.deployments.error', error);
      return rejectWithValue(error);
    }
  }
);

/**
 * Creates a new deployment with environment validation and health checks
 */
export const createDeployment = createAsyncThunk(
  'deployments/createDeployment',
  async (config: DeploymentConfig, { rejectWithValue }) => {
    try {
      const span = securityMonitor.startSpan('create.deployment');

      // Verify deployment permissions
      const hasDeployPermission = await hasPermission(config.environment);
      if (!hasDeployPermission) {
        throw new Error(`Insufficient permissions to deploy to ${config.environment}`);
      }

      // Validate deployment configuration
      const validationResult = await validateDeployment(config);
      if (!validationResult.isValid) {
        throw new Error(`Invalid deployment configuration: ${validationResult.errors.join(', ')}`);
      }

      // Create deployment
      const deployment = await createDeploymentService(config);

      // Initialize health monitoring
      const initialHealth = await checkDeploymentHealth(deployment.id);
      
      // Handle blue/green deployment if configured
      if (config.strategy === 'blue_green') {
        await setupBlueGreenDeployment(deployment.id, config);
      }

      logger.info('Deployment created successfully', {
        deploymentId: deployment.id,
        environment: config.environment,
        health: initialHealth
      });

      span.end();
      return { ...deployment, health: initialHealth };
    } catch (error) {
      logger.error('Failed to create deployment', { error, config });
      securityMonitor.trackError('create.deployment.error', error);
      return rejectWithValue(error);
    }
  }
);

/**
 * Updates deployment status with health validation
 */
export const updateDeploymentStatus = createAsyncThunk(
  'deployments/updateStatus',
  async ({
    deploymentId,
    status,
    healthMetrics
  }: {
    deploymentId: string;
    status: DeploymentStatus;
    healthMetrics: DeploymentMetrics;
  }, { rejectWithValue }) => {
    try {
      const span = securityMonitor.startSpan('update.deployment.status');

      // Validate status transition
      const currentHealth = await checkDeploymentHealth(deploymentId);
      if (status === 'completed' && currentHealth !== 'healthy') {
        throw new Error('Cannot complete deployment with unhealthy status');
      }

      // Update deployment status
      const updatedDeployment = await updateDeploymentStatusService(
        deploymentId,
        status,
        healthMetrics
      );

      // Handle blue/green deployment switch if needed
      if (status === 'completed' && updatedDeployment.config.strategy === 'blue_green') {
        await switchBlueGreenSlot(deploymentId);
      }

      logger.info('Deployment status updated', {
        deploymentId,
        status,
        health: currentHealth
      });

      span.end();
      return updatedDeployment;
    } catch (error) {
      logger.error('Failed to update deployment status', { error, deploymentId, status });
      securityMonitor.trackError('update.deployment.status.error', error);
      return rejectWithValue(error);
    }
  }
);

/**
 * Rolls back a deployment with health validation
 */
export const rollbackDeployment = createAsyncThunk(
  'deployments/rollback',
  async (deploymentId: string, { rejectWithValue }) => {
    try {
      const span = securityMonitor.startSpan('rollback.deployment');

      // Check rollback capability
      const deployment = await rollbackDeploymentService(deploymentId);
      if (!deployment.config.rollback.enabled) {
        throw new Error('Rollback not enabled for this deployment');
      }

      // Perform rollback
      const rolledBackDeployment = await rollbackDeploymentService(deploymentId);

      // Monitor rollback health
      const healthAfterRollback = await checkDeploymentHealth(deploymentId);

      logger.info('Deployment rolled back successfully', {
        deploymentId,
        health: healthAfterRollback
      });

      span.end();
      return { ...rolledBackDeployment, health: healthAfterRollback };
    } catch (error) {
      logger.error('Failed to rollback deployment', { error, deploymentId });
      securityMonitor.trackError('rollback.deployment.error', error);
      return rejectWithValue(error);
    }
  }
);

/**
 * Helper function to setup blue/green deployment
 */
async function setupBlueGreenDeployment(deploymentId: string, config: DeploymentConfig): Promise<void> {
  // Implementation for blue/green deployment setup
  logger.debug('Setting up blue/green deployment', { deploymentId });
}

/**
 * Helper function to switch blue/green deployment slot
 */
async function switchBlueGreenSlot(deploymentId: string): Promise<void> {
  // Implementation for switching blue/green deployment slot
  logger.debug('Switching blue/green deployment slot', { deploymentId });
}