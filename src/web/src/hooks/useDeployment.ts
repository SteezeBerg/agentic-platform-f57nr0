/**
 * Enhanced custom React hook for managing agent deployments with comprehensive features
 * Provides deployment lifecycle management, health monitoring, and blue/green deployment support
 * @version 1.0.0
 */

import { useSelector, useDispatch } from 'react-redux'; // v8.0.0
import { useCallback, useEffect, useRef } from 'react'; // v18.2.0

import { 
  Deployment, 
  DeploymentConfig, 
  DeploymentStatus, 
  DeploymentHealth, 
  DeploymentMetrics, 
  DeploymentStrategy,
  DeploymentEnvironment 
} from '../types/deployment';
import { 
  fetchDeployments, 
  createDeployment, 
  updateDeploymentStatus, 
  updateDeploymentHealth, 
  updateDeploymentMetrics, 
  switchDeploymentVersion 
} from '../store/deployment/actions';
import { RootState } from '../store/rootReducer';
import { LoadingState } from '../types/common';

// Constants for rate limiting and retry logic
const REFRESH_INTERVAL = 30000; // 30 seconds
const MAX_RETRIES = 3;
const RETRY_DELAY = 1000; // 1 second
const RATE_LIMIT_WINDOW = 5000; // 5 seconds

/**
 * Custom hook for comprehensive deployment management
 * @param agentId - ID of the agent being deployed
 * @param environment - Target deployment environment
 */
export function useDeployment(agentId: string, environment: DeploymentEnvironment) {
  const dispatch = useDispatch();
  const lastRefreshRef = useRef<number>(0);
  const retryCountRef = useRef<number>(0);
  const refreshTimerRef = useRef<NodeJS.Timeout>();

  // Select deployment state from Redux store with memoization
  const {
    deployment,
    deployments,
    isLoading,
    error,
    metrics
  } = useSelector((state: RootState) => ({
    deployment: state.deployment.items[agentId],
    deployments: Object.values(state.deployment.items).filter(d => 
      d.agent_id === agentId && d.environment === environment
    ),
    isLoading: state.deployment.loadingState[agentId] === LoadingState.LOADING,
    error: state.deployment.error[agentId],
    metrics: state.deployment.metrics[agentId]
  }));

  /**
   * Fetches deployments with rate limiting
   */
  const refreshDeployments = useCallback(async () => {
    const now = Date.now();
    if (now - lastRefreshRef.current < RATE_LIMIT_WINDOW) {
      return;
    }

    try {
      lastRefreshRef.current = now;
      await dispatch(fetchDeployments({ agentId, environment }));
      retryCountRef.current = 0;
    } catch (error) {
      if (retryCountRef.current < MAX_RETRIES) {
        retryCountRef.current++;
        setTimeout(refreshDeployments, RETRY_DELAY * Math.pow(2, retryCountRef.current));
      }
    }
  }, [dispatch, agentId, environment]);

  /**
   * Creates new deployment with validation
   */
  const handleCreateDeployment = useCallback(async (config: DeploymentConfig) => {
    try {
      // Validate environment-specific configuration
      if (environment === 'production' && !config.rollback.enabled) {
        throw new Error('Rollback must be enabled for production deployments');
      }

      const result = await dispatch(createDeployment({
        agentId,
        environment,
        config
      }));

      await refreshDeployments();
      return result;
    } catch (error) {
      console.error('Deployment creation failed:', error);
      throw error;
    }
  }, [dispatch, agentId, environment, refreshDeployments]);

  /**
   * Updates deployment status with retry mechanism
   */
  const handleUpdateStatus = useCallback(async (status: DeploymentStatus) => {
    try {
      await dispatch(updateDeploymentStatus({
        deploymentId: deployment?.id,
        status,
        timestamp: new Date().toISOString()
      }));
      await refreshDeployments();
    } catch (error) {
      if (retryCountRef.current < MAX_RETRIES) {
        retryCountRef.current++;
        setTimeout(() => handleUpdateStatus(status), 
          RETRY_DELAY * Math.pow(2, retryCountRef.current)
        );
      } else {
        throw error;
      }
    }
  }, [dispatch, deployment?.id, refreshDeployments]);

  /**
   * Updates deployment health with validation
   */
  const handleUpdateHealth = useCallback(async (health: DeploymentHealth) => {
    if (!deployment?.id) return;

    await dispatch(updateDeploymentHealth({
      deploymentId: deployment.id,
      health,
      timestamp: new Date().toISOString()
    }));
  }, [dispatch, deployment?.id]);

  /**
   * Handles blue/green deployment switches
   */
  const handleSwitchVersion = useCallback(async () => {
    if (!deployment?.id || deployment.config.strategy !== DeploymentStrategy.BLUE_GREEN) {
      throw new Error('Blue/green deployment not configured');
    }

    try {
      await dispatch(switchDeploymentVersion({
        deploymentId: deployment.id,
        timestamp: new Date().toISOString()
      }));
      await refreshDeployments();
    } catch (error) {
      console.error('Version switch failed:', error);
      throw error;
    }
  }, [dispatch, deployment, refreshDeployments]);

  /**
   * Cleanup function for unmounting
   */
  const cleanup = useCallback(() => {
    if (refreshTimerRef.current) {
      clearInterval(refreshTimerRef.current);
    }
  }, []);

  // Set up automatic refresh interval
  useEffect(() => {
    refreshDeployments();
    refreshTimerRef.current = setInterval(refreshDeployments, REFRESH_INTERVAL);

    return cleanup;
  }, [refreshDeployments, cleanup]);

  return {
    deployment,
    deployments,
    isLoading,
    error,
    metrics,
    createDeployment: handleCreateDeployment,
    updateStatus: handleUpdateStatus,
    updateHealth: handleUpdateHealth,
    switchVersion: handleSwitchVersion,
    refreshDeployments,
    cleanup
  };
}