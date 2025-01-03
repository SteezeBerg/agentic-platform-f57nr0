import { renderHook, act } from '@testing-library/react-hooks';
import { jest } from '@jest/globals';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import { ErrorBoundary } from 'react-error-boundary';

import { useAgent } from '../../src/hooks/useAgent';
import { agentService } from '../../src/services/agent';
import { LoadingState, UUID } from '../../src/types/common';
import { AgentType, AgentStatus, AgentConfig } from '../../src/types/agent';
import { Permission } from '../../src/types/auth';
import { hasPermission } from '../../src/utils/auth';
import { ERROR_MESSAGES } from '../../src/config/constants';

// Mock dependencies
jest.mock('../../src/services/agent');
jest.mock('../../src/utils/auth');

// Test data
const mockAgentId = 'test-agent-id' as UUID;
const mockAgent = {
  id: mockAgentId,
  name: 'Test Agent',
  description: 'Test agent description',
  type: AgentType.STREAMLIT,
  status: AgentStatus.CREATED,
  config: {
    capabilities: [],
    knowledgeSourceIds: [],
    settings: {},
    version: '1.0.0',
    deploymentConfig: {
      environment: 'development',
      resources: {
        cpu: 1,
        memory: 2048
      }
    }
  } as AgentConfig,
  version: '1.0.0',
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString()
};

// Mock store setup
const mockStore = configureStore({
  reducer: {
    agents: {
      entities: {
        [mockAgentId]: mockAgent
      },
      history: []
    }
  }
});

// Test wrapper component
const wrapper = ({ children }: { children: React.ReactNode }) => (
  <Provider store={mockStore}>
    <ErrorBoundary fallback={<div>Error</div>}>
      {children}
    </ErrorBoundary>
  </Provider>
);

describe('useAgent Hook', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (hasPermission as jest.Mock).mockResolvedValue(true);
  });

  describe('Security Validation', () => {
    it('should verify permissions before creating agent', async () => {
      const { result } = renderHook(() => useAgent(), { wrapper });

      (hasPermission as jest.Mock).mockResolvedValueOnce(false);

      await act(async () => {
        try {
          await result.current.createAgent({
            name: 'Test Agent',
            type: AgentType.STREAMLIT,
            defaultConfig: mockAgent.config
          });
          fail('Should have thrown permission error');
        } catch (error) {
          expect(error.message).toContain('Insufficient permissions');
        }
      });

      expect(hasPermission).toHaveBeenCalledWith(expect.any(Object), Permission.CREATE_AGENT);
    });

    it('should validate security context during agent operations', async () => {
      const { result } = renderHook(() => useAgent(mockAgentId), { wrapper });

      await act(async () => {
        await result.current.updateAgent({ name: 'Updated Agent' });
      });

      expect(hasPermission).toHaveBeenCalledWith(expect.any(Object), Permission.EDIT_AGENT);
    });
  });

  describe('Performance Monitoring', () => {
    it('should track operation latency', async () => {
      const { result } = renderHook(() => useAgent(mockAgentId, { monitorPerformance: true }), { wrapper });

      await act(async () => {
        await result.current.createAgent({
          name: 'Test Agent',
          type: AgentType.STREAMLIT,
          defaultConfig: mockAgent.config
        });
      });

      expect(result.current.performance.operationLatency).toBeGreaterThan(0);
    });

    it('should monitor error rates', async () => {
      const { result } = renderHook(() => useAgent(mockAgentId, { monitorPerformance: true }), { wrapper });

      (agentService.createAgent as jest.Mock).mockRejectedValueOnce(new Error('Test error'));

      await act(async () => {
        try {
          await result.current.createAgent({
            name: 'Test Agent',
            type: AgentType.STREAMLIT,
            defaultConfig: mockAgent.config
          });
        } catch (error) {
          expect(error).toBeDefined();
        }
      });

      expect(result.current.performance.errorRate).toBeGreaterThan(0);
    });
  });

  describe('Cache Management', () => {
    it('should cache agent data with proper TTL', async () => {
      const { result, rerender } = renderHook(() => useAgent(mockAgentId, { cacheTimeout: 1000 }), { wrapper });

      await act(async () => {
        await result.current.getAgent();
      });

      // Verify cached data is used
      rerender();
      expect(agentService.getAgent).toHaveBeenCalledTimes(1);

      // Wait for cache to expire
      await new Promise(resolve => setTimeout(resolve, 1100));

      rerender();
      expect(agentService.getAgent).toHaveBeenCalledTimes(2);
    });

    it('should invalidate cache on updates', async () => {
      const { result } = renderHook(() => useAgent(mockAgentId), { wrapper });

      await act(async () => {
        await result.current.updateAgent({ name: 'Updated Agent' });
      });

      expect(result.current.agent.name).toBe('Updated Agent');
      expect(agentService.getAgent).toHaveBeenCalled();
    });
  });

  describe('Error Handling', () => {
    it('should handle network errors gracefully', async () => {
      const { result } = renderHook(() => useAgent(mockAgentId), { wrapper });

      (agentService.getAgent as jest.Mock).mockRejectedValueOnce(new Error('Network error'));

      await act(async () => {
        await result.current.getAgent();
      });

      expect(result.current.error).toBeDefined();
      expect(result.current.error.message).toContain('Network error');
    });

    it('should support error recovery through retry', async () => {
      const { result } = renderHook(() => useAgent(mockAgentId, { retryAttempts: 3 }), { wrapper });

      let attempts = 0;
      (agentService.getAgent as jest.Mock).mockImplementation(() => {
        attempts++;
        if (attempts < 3) throw new Error('Temporary error');
        return Promise.resolve(mockAgent);
      });

      await act(async () => {
        await result.current.getAgent();
      });

      expect(attempts).toBe(3);
      expect(result.current.agent).toBeDefined();
    });
  });

  describe('Optimistic Updates', () => {
    it('should update store immediately before API call', async () => {
      const { result } = renderHook(() => useAgent(mockAgentId, { enableOptimisticUpdates: true }), { wrapper });

      const updatedName = 'Optimistically Updated Agent';

      await act(async () => {
        await result.current.updateAgent({ name: updatedName });
      });

      expect(result.current.agent.name).toBe(updatedName);
      expect(mockStore.getState().agents.entities[mockAgentId].name).toBe(updatedName);
    });

    it('should rollback changes on API failure', async () => {
      const { result } = renderHook(() => useAgent(mockAgentId, { enableOptimisticUpdates: true }), { wrapper });

      (agentService.updateAgent as jest.Mock).mockRejectedValueOnce(new Error('Update failed'));

      const originalName = result.current.agent.name;

      await act(async () => {
        try {
          await result.current.updateAgent({ name: 'Failed Update' });
        } catch (error) {
          await result.current.rollbackChanges();
        }
      });

      expect(result.current.agent.name).toBe(originalName);
    });
  });
});