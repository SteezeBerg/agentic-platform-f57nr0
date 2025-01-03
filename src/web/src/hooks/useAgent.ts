/**
 * Custom React hook for managing agent state and operations in the Agent Builder Hub frontend
 * Provides a unified interface for agent CRUD operations, template management, and monitoring
 * @version 1.0.0
 */

import { useEffect, useCallback, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useErrorBoundary } from 'react-error-boundary';

import { Agent, AgentTemplate, AgentStatus, isValidAgentConfig } from '../../types/agent';
import { UUID, LoadingState, ApiResponse, ErrorResponse } from '../../types/common';

// Hook options interface
interface AgentOptions {
  enableOptimisticUpdates?: boolean;
  retryAttempts?: number;
  cacheTimeout?: number;
  monitorPerformance?: boolean;
}

// Performance metrics interface
interface PerformanceMetrics {
  operationLatency: number;
  stateUpdateTime: number;
  cacheHitRate: number;
  errorRate: number;
}

// Hook return interface
interface UseAgentReturn {
  agent: Agent | null;
  isLoading: boolean;
  error: ErrorResponse | null;
  performance: PerformanceMetrics;
  createAgent: (template: AgentTemplate) => Promise<Agent>;
  updateAgent: (updates: Partial<Agent>) => Promise<Agent>;
  deleteAgent: () => Promise<void>;
  retryOperation: () => Promise<void>;
  rollbackChanges: () => Promise<void>;
  validateTemplate: (template: AgentTemplate) => Promise<boolean>;
}

// Cache implementation
const requestCache = new Map<string, { data: any; timestamp: number }>();

/**
 * Custom hook for managing agent state and operations
 * @param agentId - Optional UUID of the agent to manage
 * @param options - Configuration options for the hook
 */
export function useAgent(
  agentId?: UUID,
  options: AgentOptions = {}
): UseAgentReturn {
  const {
    enableOptimisticUpdates = true,
    retryAttempts = 3,
    cacheTimeout = 5000,
    monitorPerformance = true
  } = options;

  const dispatch = useDispatch();
  const { showBoundary } = useErrorBoundary();
  
  // State management
  const [loadingState, setLoadingState] = useState<LoadingState>(LoadingState.IDLE);
  const [error, setError] = useState<ErrorResponse | null>(null);
  const [performance, setPerformance] = useState<PerformanceMetrics>({
    operationLatency: 0,
    stateUpdateTime: 0,
    cacheHitRate: 0,
    errorRate: 0
  });

  // Redux selectors
  const agent = useSelector((state: any) => 
    agentId ? state.agents.entities[agentId] : null
  );
  const agentHistory = useSelector((state: any) => 
    state.agents.history[agentId] || []
  );

  /**
   * Performance monitoring wrapper
   */
  const monitorOperation = useCallback(async <T>(
    operation: () => Promise<T>,
    operationName: string
  ): Promise<T> => {
    if (!monitorPerformance) return operation();

    const startTime = performance.now();
    try {
      const result = await operation();
      const endTime = performance.now();
      
      setPerformance(prev => ({
        ...prev,
        operationLatency: endTime - startTime,
        errorRate: prev.errorRate
      }));
      
      return result;
    } catch (error) {
      setPerformance(prev => ({
        ...prev,
        errorRate: prev.errorRate + 1
      }));
      throw error;
    }
  }, [monitorPerformance]);

  /**
   * Cache management utilities
   */
  const getCachedData = useCallback(<T>(key: string): T | null => {
    const cached = requestCache.get(key);
    if (!cached) return null;
    
    if (Date.now() - cached.timestamp > cacheTimeout) {
      requestCache.delete(key);
      return null;
    }
    
    return cached.data as T;
  }, [cacheTimeout]);

  const setCachedData = useCallback(<T>(key: string, data: T): void => {
    requestCache.set(key, {
      data,
      timestamp: Date.now()
    });
  }, []);

  /**
   * Create new agent from template
   */
  const createAgent = useCallback(async (template: AgentTemplate): Promise<Agent> => {
    return monitorOperation(async () => {
      try {
        setLoadingState(LoadingState.LOADING);
        
        if (!isValidAgentConfig(template.defaultConfig)) {
          throw new Error('Invalid template configuration');
        }

        const newAgent: Agent = {
          id: crypto.randomUUID() as UUID,
          name: template.name,
          description: template.description,
          type: template.type,
          config: template.defaultConfig,
          status: AgentStatus.CREATED,
          version: template.version,
          templateId: template.id,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        };

        if (enableOptimisticUpdates) {
          dispatch({ type: 'agents/created', payload: newAgent });
        }

        const response = await fetch('/api/agents', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(newAgent)
        });

        const result: ApiResponse<Agent> = await response.json();
        
        if (!result.success) {
          throw result.error;
        }

        setLoadingState(LoadingState.SUCCESS);
        return result.data;
      } catch (error) {
        setLoadingState(LoadingState.ERROR);
        setError(error as ErrorResponse);
        showBoundary(error);
        throw error;
      }
    }, 'createAgent');
  }, [dispatch, enableOptimisticUpdates, monitorOperation, showBoundary]);

  /**
   * Update existing agent
   */
  const updateAgent = useCallback(async (updates: Partial<Agent>): Promise<Agent> => {
    return monitorOperation(async () => {
      if (!agentId) throw new Error('Agent ID required for updates');

      try {
        setLoadingState(LoadingState.LOADING);

        if (enableOptimisticUpdates) {
          dispatch({ 
            type: 'agents/updated', 
            payload: { id: agentId, changes: updates } 
          });
        }

        const response = await fetch(`/api/agents/${agentId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(updates)
        });

        const result: ApiResponse<Agent> = await response.json();
        
        if (!result.success) {
          throw result.error;
        }

        setLoadingState(LoadingState.SUCCESS);
        return result.data;
      } catch (error) {
        setLoadingState(LoadingState.ERROR);
        setError(error as ErrorResponse);
        showBoundary(error);
        throw error;
      }
    }, 'updateAgent');
  }, [agentId, dispatch, enableOptimisticUpdates, monitorOperation, showBoundary]);

  /**
   * Delete agent
   */
  const deleteAgent = useCallback(async (): Promise<void> => {
    return monitorOperation(async () => {
      if (!agentId) throw new Error('Agent ID required for deletion');

      try {
        setLoadingState(LoadingState.LOADING);

        if (enableOptimisticUpdates) {
          dispatch({ type: 'agents/deleted', payload: agentId });
        }

        const response = await fetch(`/api/agents/${agentId}`, {
          method: 'DELETE'
        });

        if (!response.ok) {
          const error = await response.json();
          throw error;
        }

        setLoadingState(LoadingState.SUCCESS);
      } catch (error) {
        setLoadingState(LoadingState.ERROR);
        setError(error as ErrorResponse);
        showBoundary(error);
        throw error;
      }
    }, 'deleteAgent');
  }, [agentId, dispatch, enableOptimisticUpdates, monitorOperation, showBoundary]);

  /**
   * Retry failed operation
   */
  const retryOperation = useCallback(async (): Promise<void> => {
    if (!error || loadingState !== LoadingState.ERROR) return;

    setError(null);
    setLoadingState(LoadingState.IDLE);
  }, [error, loadingState]);

  /**
   * Rollback changes to previous state
   */
  const rollbackChanges = useCallback(async (): Promise<void> => {
    if (!agentId || agentHistory.length === 0) return;

    const previousState = agentHistory[agentHistory.length - 1];
    dispatch({ 
      type: 'agents/updated', 
      payload: { id: agentId, changes: previousState } 
    });
  }, [agentId, agentHistory, dispatch]);

  /**
   * Validate agent template
   */
  const validateTemplate = useCallback(async (template: AgentTemplate): Promise<boolean> => {
    return monitorOperation(async () => {
      try {
        const response = await fetch('/api/templates/validate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(template)
        });

        const result = await response.json();
        return result.valid;
      } catch (error) {
        setError(error as ErrorResponse);
        return false;
      }
    }, 'validateTemplate');
  }, [monitorOperation]);

  // Fetch agent data on mount if ID provided
  useEffect(() => {
    if (!agentId) return;

    const fetchAgent = async () => {
      try {
        setLoadingState(LoadingState.LOADING);

        // Check cache first
        const cached = getCachedData<Agent>(`agent-${agentId}`);
        if (cached) {
          dispatch({ type: 'agents/loaded', payload: cached });
          setLoadingState(LoadingState.SUCCESS);
          return;
        }

        const response = await fetch(`/api/agents/${agentId}`);
        const result: ApiResponse<Agent> = await response.json();

        if (!result.success) {
          throw result.error;
        }

        setCachedData(`agent-${agentId}`, result.data);
        dispatch({ type: 'agents/loaded', payload: result.data });
        setLoadingState(LoadingState.SUCCESS);
      } catch (error) {
        setLoadingState(LoadingState.ERROR);
        setError(error as ErrorResponse);
        showBoundary(error);
      }
    };

    fetchAgent();
  }, [agentId, dispatch, getCachedData, setCachedData, showBoundary]);

  return {
    agent,
    isLoading: loadingState === LoadingState.LOADING,
    error,
    performance,
    createAgent,
    updateAgent,
    deleteAgent,
    retryOperation,
    rollbackChanges,
    validateTemplate
  };
}