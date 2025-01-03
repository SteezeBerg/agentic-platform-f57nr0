/**
 * Redux selectors for deployment state management
 * Implements memoized selectors for efficient access to deployment data, health metrics, and filtering
 * @version 1.0.0
 */

import { createSelector } from '@reduxjs/toolkit'; // ^2.0.0
import type { RootState } from '../rootReducer';
import type { DeploymentState } from './types';
import type { Deployment, DeploymentEnvironment } from '../../types/deployment';

/**
 * Base selector to access the deployment slice of the Redux store
 * Provides type-safe access to deployment state
 */
export const selectDeploymentState = (state: RootState): DeploymentState => state.deployment;

/**
 * Memoized selector to get all deployments as a sorted array
 * Includes health metrics and monitoring data
 */
export const selectDeployments = createSelector(
  [selectDeploymentState],
  (deploymentState): Deployment[] => {
    const deployments = Object.values(deploymentState.items);
    
    // Sort deployments by creation date and attach health metrics
    return deployments
      .map(deployment => ({
        ...deployment,
        metrics: deploymentState.metrics[deployment.id] || {},
        health: deploymentState.healthStatus[deployment.id] || 'unknown'
      }))
      .sort((a, b) => {
        // Sort by created_at in descending order
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      });
  }
);

/**
 * Memoized selector to get a specific deployment by ID with health data
 * Returns undefined if deployment is not found
 */
export const selectDeploymentById = createSelector(
  [selectDeploymentState, (_state: RootState, deploymentId: string) => deploymentId],
  (deploymentState, deploymentId): Deployment | undefined => {
    const deployment = deploymentState.items[deploymentId];
    if (!deployment) return undefined;

    return {
      ...deployment,
      metrics: deploymentState.metrics[deploymentId] || {},
      health: deploymentState.healthStatus[deploymentId] || 'unknown'
    };
  }
);

/**
 * Memoized selector to get deployments filtered by environment
 * Sorts results by health status priority
 */
export const selectDeploymentsByEnvironment = createSelector(
  [selectDeployments, (_state: RootState, environment: DeploymentEnvironment) => environment],
  (deployments, environment): Deployment[] => {
    // Filter deployments by environment
    const filteredDeployments = deployments.filter(
      deployment => deployment.environment === environment
    );

    // Sort by health status priority
    return filteredDeployments.sort((a, b) => {
      const healthPriority = {
        critical: 0,
        unhealthy: 1,
        degraded: 2,
        healthy: 3,
        unknown: 4
      };
      return healthPriority[a.health] - healthPriority[b.health];
    });
  }
);

/**
 * Memoized selector to get deployment metrics and monitoring data
 * Aggregates health statistics across all deployments
 */
export const selectDeploymentMetrics = createSelector(
  [selectDeploymentState],
  (deploymentState) => {
    const deployments = Object.values(deploymentState.items);
    const metrics = Object.values(deploymentState.metrics);

    // Calculate aggregate metrics
    const aggregateMetrics = {
      total_deployments: deployments.length,
      health_summary: {
        healthy: 0,
        degraded: 0,
        unhealthy: 0,
        critical: 0,
        unknown: 0
      },
      resource_utilization: {
        average_cpu_usage: 0,
        average_memory_usage: 0,
        total_storage_usage: 0
      },
      performance: {
        total_requests: 0,
        average_error_rate: 0,
        average_success_rate: 0
      }
    };

    // Aggregate health status
    Object.values(deploymentState.healthStatus).forEach(health => {
      aggregateMetrics.health_summary[health]++;
    });

    // Aggregate metrics if available
    if (metrics.length > 0) {
      const totalMetrics = metrics.reduce((acc, metric) => ({
        cpu_usage: acc.cpu_usage + metric.resource_utilization.cpu_usage,
        memory_usage: acc.memory_usage + metric.resource_utilization.memory_usage,
        storage_usage: acc.storage_usage + metric.resource_utilization.storage_usage,
        requests: acc.requests + metric.performance.request_count,
        error_rate: acc.error_rate + metric.performance.error_rate,
        success_rate: acc.success_rate + metric.performance.success_rate
      }), {
        cpu_usage: 0,
        memory_usage: 0,
        storage_usage: 0,
        requests: 0,
        error_rate: 0,
        success_rate: 0
      });

      // Calculate averages
      aggregateMetrics.resource_utilization = {
        average_cpu_usage: totalMetrics.cpu_usage / metrics.length,
        average_memory_usage: totalMetrics.memory_usage / metrics.length,
        total_storage_usage: totalMetrics.storage_usage
      };

      aggregateMetrics.performance = {
        total_requests: totalMetrics.requests,
        average_error_rate: totalMetrics.error_rate / metrics.length,
        average_success_rate: totalMetrics.success_rate / metrics.length
      };
    }

    return aggregateMetrics;
  }
);

/**
 * Memoized selector to get filtered and paginated deployments
 * Supports complex filtering and sorting options
 */
export const selectFilteredDeployments = createSelector(
  [selectDeployments, (state: RootState) => state.deployment.filters],
  (deployments, filters) => {
    let filtered = deployments;

    // Apply filters if they exist
    if (filters.environment) {
      filtered = filtered.filter(d => d.environment === filters.environment);
    }

    if (filters.status?.length) {
      filtered = filtered.filter(d => filters.status!.includes(d.status));
    }

    if (filters.health_status) {
      filtered = filtered.filter(d => d.health === filters.health_status);
    }

    if (filters.metrics_threshold) {
      filtered = filtered.filter(d => {
        const metrics = d.metrics;
        return (
          (!filters.metrics_threshold.cpu_usage || 
           metrics.resource_utilization.cpu_usage <= filters.metrics_threshold.cpu_usage) &&
          (!filters.metrics_threshold.memory_usage || 
           metrics.resource_utilization.memory_usage <= filters.metrics_threshold.memory_usage) &&
          (!filters.metrics_threshold.error_rate || 
           metrics.performance.error_rate <= filters.metrics_threshold.error_rate) &&
          (!filters.metrics_threshold.success_rate || 
           metrics.performance.success_rate >= filters.metrics_threshold.success_rate)
        );
      });
    }

    return filtered;
  }
);