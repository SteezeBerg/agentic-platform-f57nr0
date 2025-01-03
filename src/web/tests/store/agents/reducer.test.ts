import { describe, it, expect } from '@jest/globals';
import { agentsReducer } from '../../../src/store/agents/reducer';
import { 
  AgentsState, 
  AgentActionTypes,
  FetchAgentsPayload,
  CreateAgentPayload,
  UpdateAgentPayload,
  DeleteAgentPayload,
  SelectAgentPayload,
  FetchTemplatesPayload,
  DeployAgentPayload
} from '../../../src/store/agents/types';
import { LoadingState } from '../../../src/types/common';
import { AgentStatus, AgentType, AgentCapability } from '../../../src/types/agent';

describe('agentsReducer', () => {
  // Initial state for testing
  const initialState: AgentsState = {
    agents: {},
    templates: {},
    selectedAgentId: null,
    loadingState: LoadingState.IDLE,
    error: null,
    lastUpdated: null,
    deploymentStatus: {},
    templateValidation: {}
  };

  // Mock data
  const mockAgent = {
    id: 'test-agent-1',
    name: 'Test Agent',
    description: 'Test agent description',
    type: AgentType.STANDALONE,
    status: AgentStatus.CREATED,
    config: {
      capabilities: [AgentCapability.RAG],
      knowledgeSourceIds: ['source-1'],
      version: '1.0.0',
      deploymentConfig: {
        environment: 'development',
        resources: {
          cpu: 1,
          memory: 1024
        }
      }
    },
    createdAt: '2024-02-20T12:00:00Z',
    updatedAt: '2024-02-20T12:00:00Z',
    version: '1.0.0'
  };

  const mockTemplate = {
    id: 'test-template-1',
    name: 'Test Template',
    description: 'Test template description',
    type: AgentType.STANDALONE,
    defaultConfig: {
      capabilities: [AgentCapability.RAG],
      knowledgeSourceIds: [],
      version: '1.0.0',
      deploymentConfig: {
        environment: 'development',
        resources: {
          cpu: 1,
          memory: 1024
        }
      }
    },
    version: '1.0.0'
  };

  describe('Fetch Agents', () => {
    it('should handle pending state', () => {
      const action = { type: `${AgentActionTypes.FETCH_AGENTS}/pending` };
      const state = agentsReducer(initialState, action);
      
      expect(state.loadingState).toBe(LoadingState.LOADING);
      expect(state.error).toBeNull();
    });

    it('should handle successful fetch', () => {
      const payload: FetchAgentsPayload = {
        agents: [mockAgent],
        timestamp: new Date()
      };
      const action = { 
        type: `${AgentActionTypes.FETCH_AGENTS}/fulfilled`,
        payload 
      };
      const state = agentsReducer(initialState, action);
      
      expect(state.agents[mockAgent.id]).toEqual(mockAgent);
      expect(state.loadingState).toBe(LoadingState.SUCCESS);
      expect(state.lastUpdated).toBeDefined();
    });

    it('should handle fetch failure', () => {
      const error = { message: 'Network error', code: 'NETWORK_ERROR' };
      const action = { 
        type: `${AgentActionTypes.FETCH_AGENTS}/rejected`,
        error 
      };
      const state = agentsReducer(initialState, action);
      
      expect(state.loadingState).toBe(LoadingState.ERROR);
      expect(state.error).toBeDefined();
      expect(state.error?.message).toBe(error.message);
    });
  });

  describe('Create Agent', () => {
    it('should handle optimistic updates', () => {
      const payload: CreateAgentPayload = {
        agent: mockAgent,
        templateId: null
      };
      const action = { 
        type: `${AgentActionTypes.CREATE_AGENT}/pending`,
        payload 
      };
      const state = agentsReducer(initialState, action);
      
      expect(state.agents[mockAgent.id]).toBeDefined();
      expect(state.agents[mockAgent.id].status).toBe(AgentStatus.CREATED);
      expect(state.loadingState).toBe(LoadingState.LOADING);
    });

    it('should handle creation success', () => {
      const payload: CreateAgentPayload = {
        agent: mockAgent,
        templateId: null
      };
      const action = { 
        type: `${AgentActionTypes.CREATE_AGENT}/fulfilled`,
        payload 
      };
      const state = agentsReducer(initialState, action);
      
      expect(state.agents[mockAgent.id]).toEqual(mockAgent);
      expect(state.loadingState).toBe(LoadingState.SUCCESS);
      expect(state.lastUpdated).toBeDefined();
    });

    it('should handle creation failure with rollback', () => {
      const optimisticState = {
        ...initialState,
        agents: { [mockAgent.id]: mockAgent }
      };
      const error = { message: 'Creation failed', code: 'CREATE_ERROR' };
      const action = { 
        type: `${AgentActionTypes.CREATE_AGENT}/rejected`,
        error,
        meta: { arg: { agent: mockAgent } }
      };
      const state = agentsReducer(optimisticState, action);
      
      expect(state.agents[mockAgent.id]).toBeUndefined();
      expect(state.loadingState).toBe(LoadingState.ERROR);
      expect(state.error?.message).toBe(error.message);
    });
  });

  describe('Update Agent', () => {
    const initialStateWithAgent = {
      ...initialState,
      agents: { [mockAgent.id]: mockAgent }
    };

    it('should handle update with optimistic changes', () => {
      const updates = { name: 'Updated Name' };
      const payload: UpdateAgentPayload = {
        id: mockAgent.id,
        updates,
        timestamp: new Date()
      };
      const action = { 
        type: `${AgentActionTypes.UPDATE_AGENT}/pending`,
        payload 
      };
      const state = agentsReducer(initialStateWithAgent, action);
      
      expect(state.agents[mockAgent.id].name).toBe(updates.name);
      expect(state.previousState).toEqual(mockAgent);
      expect(state.loadingState).toBe(LoadingState.LOADING);
    });

    it('should handle update success', () => {
      const updates = { name: 'Updated Name' };
      const payload: UpdateAgentPayload = {
        id: mockAgent.id,
        updates,
        timestamp: new Date()
      };
      const action = { 
        type: `${AgentActionTypes.UPDATE_AGENT}/fulfilled`,
        payload 
      };
      const state = agentsReducer(initialStateWithAgent, action);
      
      expect(state.agents[mockAgent.id].name).toBe(updates.name);
      expect(state.previousState).toBeUndefined();
      expect(state.loadingState).toBe(LoadingState.SUCCESS);
    });

    it('should handle update failure with rollback', () => {
      const stateWithPrevious = {
        ...initialStateWithAgent,
        previousState: mockAgent,
        agents: { 
          [mockAgent.id]: { ...mockAgent, name: 'Updated Name' }
        }
      };
      const error = { message: 'Update failed', code: 'UPDATE_ERROR' };
      const action = { 
        type: `${AgentActionTypes.UPDATE_AGENT}/rejected`,
        error,
        meta: { arg: { id: mockAgent.id } }
      };
      const state = agentsReducer(stateWithPrevious, action);
      
      expect(state.agents[mockAgent.id]).toEqual(mockAgent);
      expect(state.previousState).toBeUndefined();
      expect(state.error?.message).toBe(error.message);
    });
  });

  describe('Template Management', () => {
    it('should handle template fetch success', () => {
      const payload: FetchTemplatesPayload = {
        templates: [mockTemplate],
        category: null
      };
      const action = { 
        type: `${AgentActionTypes.FETCH_TEMPLATES}/fulfilled`,
        payload 
      };
      const state = agentsReducer(initialState, action);
      
      expect(state.templates[mockTemplate.id]).toEqual(mockTemplate);
      expect(state.loadingState).toBe(LoadingState.SUCCESS);
    });

    it('should validate template compatibility', () => {
      const stateWithTemplate = {
        ...initialState,
        templates: { [mockTemplate.id]: mockTemplate }
      };
      const action = {
        type: AgentActionTypes.VALIDATE_TEMPLATE,
        payload: {
          templateId: mockTemplate.id,
          agentType: AgentType.STANDALONE
        }
      };
      const state = agentsReducer(stateWithTemplate, action);
      
      expect(state.templateValidation[mockTemplate.id].isValid).toBe(true);
      expect(state.templateValidation[mockTemplate.id].timestamp).toBeDefined();
    });
  });

  describe('Deployment Status', () => {
    it('should track deployment status updates', () => {
      const payload: DeploymentPayload = {
        agentId: mockAgent.id,
        status: 'DEPLOYING',
        environment: 'development'
      };
      const action = {
        type: AgentActionTypes.UPDATE_DEPLOYMENT_STATUS,
        payload
      };
      const state = agentsReducer(initialState, action);
      
      expect(state.deploymentStatus[mockAgent.id]).toBeDefined();
      expect(state.deploymentStatus[mockAgent.id].development.status).toBe('DEPLOYING');
      expect(state.deploymentStatus[mockAgent.id].development.timestamp).toBeDefined();
    });
  });
});