/**
 * Redux reducer for the agents slice of the Agent Builder Hub
 * Implements comprehensive state management with strict type safety, optimistic updates, and enhanced error handling
 * @version 1.0.0
 */

import { createReducer, PayloadAction } from '@reduxjs/toolkit';
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
} from './types';
import { LoadingState } from '../../types/common';
import { AgentStatus } from '../../types/agent';

/**
 * Initial state with strict type safety and immutability
 */
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

/**
 * Enhanced reducer with comprehensive error handling and optimistic updates
 */
export const agentsReducer = createReducer(initialState, (builder) => {
  builder
    // Fetch Agents
    .addCase(AgentActionTypes.FETCH_AGENTS + '/pending', (state) => {
      state.loadingState = LoadingState.LOADING;
      state.error = null;
    })
    .addCase(AgentActionTypes.FETCH_AGENTS + '/fulfilled', (state, action: PayloadAction<FetchAgentsPayload>) => {
      const { agents, timestamp } = action.payload;
      state.agents = agents.reduce((acc, agent) => ({
        ...acc,
        [agent.id]: agent
      }), {});
      state.lastUpdated = timestamp;
      state.loadingState = LoadingState.SUCCESS;
    })
    .addCase(AgentActionTypes.FETCH_AGENTS + '/rejected', (state, action) => {
      state.loadingState = LoadingState.ERROR;
      state.error = {
        message: action.error.message || 'Failed to fetch agents',
        code: action.error.code || 'FETCH_ERROR',
        timestamp: new Date().toISOString()
      };
    })

    // Create Agent
    .addCase(AgentActionTypes.CREATE_AGENT + '/pending', (state, action: PayloadAction<CreateAgentPayload>) => {
      const { agent } = action.payload;
      // Optimistic update
      state.agents[agent.id] = {
        ...agent,
        status: AgentStatus.CREATED
      };
      state.loadingState = LoadingState.LOADING;
    })
    .addCase(AgentActionTypes.CREATE_AGENT + '/fulfilled', (state, action: PayloadAction<CreateAgentPayload>) => {
      const { agent } = action.payload;
      state.agents[agent.id] = agent;
      state.loadingState = LoadingState.SUCCESS;
      state.lastUpdated = new Date();
    })
    .addCase(AgentActionTypes.CREATE_AGENT + '/rejected', (state, action) => {
      // Rollback optimistic update
      const { agent } = action.meta.arg;
      delete state.agents[agent.id];
      state.loadingState = LoadingState.ERROR;
      state.error = {
        message: action.error.message || 'Failed to create agent',
        code: action.error.code || 'CREATE_ERROR',
        timestamp: new Date().toISOString()
      };
    })

    // Update Agent
    .addCase(AgentActionTypes.UPDATE_AGENT + '/pending', (state, action: PayloadAction<UpdateAgentPayload>) => {
      const { id, updates } = action.payload;
      // Store previous state for rollback
      state.previousState = { ...state.agents[id] };
      // Optimistic update
      state.agents[id] = {
        ...state.agents[id],
        ...updates,
        updatedAt: new Date().toISOString()
      };
      state.loadingState = LoadingState.LOADING;
    })
    .addCase(AgentActionTypes.UPDATE_AGENT + '/fulfilled', (state, action: PayloadAction<UpdateAgentPayload>) => {
      const { id, updates, timestamp } = action.payload;
      state.agents[id] = {
        ...state.agents[id],
        ...updates,
        updatedAt: timestamp
      };
      state.loadingState = LoadingState.SUCCESS;
      state.lastUpdated = new Date();
      delete state.previousState;
    })
    .addCase(AgentActionTypes.UPDATE_AGENT + '/rejected', (state, action) => {
      // Rollback to previous state
      const { id } = action.meta.arg;
      if (state.previousState) {
        state.agents[id] = state.previousState;
      }
      state.loadingState = LoadingState.ERROR;
      state.error = {
        message: action.error.message || 'Failed to update agent',
        code: action.error.code || 'UPDATE_ERROR',
        timestamp: new Date().toISOString()
      };
      delete state.previousState;
    })

    // Delete Agent
    .addCase(AgentActionTypes.DELETE_AGENT + '/pending', (state, action: PayloadAction<DeleteAgentPayload>) => {
      const { id } = action.payload;
      // Store for potential rollback
      state.deletedAgent = state.agents[id];
      // Optimistic delete
      delete state.agents[id];
      if (state.selectedAgentId === id) {
        state.selectedAgentId = null;
      }
      state.loadingState = LoadingState.LOADING;
    })
    .addCase(AgentActionTypes.DELETE_AGENT + '/fulfilled', (state) => {
      state.loadingState = LoadingState.SUCCESS;
      state.lastUpdated = new Date();
      delete state.deletedAgent;
    })
    .addCase(AgentActionTypes.DELETE_AGENT + '/rejected', (state, action) => {
      // Restore deleted agent
      if (state.deletedAgent) {
        state.agents[state.deletedAgent.id] = state.deletedAgent;
      }
      state.loadingState = LoadingState.ERROR;
      state.error = {
        message: action.error.message || 'Failed to delete agent',
        code: action.error.code || 'DELETE_ERROR',
        timestamp: new Date().toISOString()
      };
      delete state.deletedAgent;
    })

    // Select Agent
    .addCase(AgentActionTypes.SELECT_AGENT, (state, action: PayloadAction<SelectAgentPayload>) => {
      const { id } = action.payload;
      if (id === null || state.agents[id]) {
        state.selectedAgentId = id;
        state.error = null;
      } else {
        state.error = {
          message: 'Invalid agent selection',
          code: 'INVALID_SELECTION',
          timestamp: new Date().toISOString()
        };
      }
    })

    // Fetch Templates
    .addCase(AgentActionTypes.FETCH_TEMPLATES + '/pending', (state) => {
      state.loadingState = LoadingState.LOADING;
      state.error = null;
    })
    .addCase(AgentActionTypes.FETCH_TEMPLATES + '/fulfilled', (state, action: PayloadAction<FetchTemplatesPayload>) => {
      const { templates } = action.payload;
      state.templates = templates.reduce((acc, template) => ({
        ...acc,
        [template.id]: template
      }), {});
      state.loadingState = LoadingState.SUCCESS;
    })
    .addCase(AgentActionTypes.FETCH_TEMPLATES + '/rejected', (state, action) => {
      state.loadingState = LoadingState.ERROR;
      state.error = {
        message: action.error.message || 'Failed to fetch templates',
        code: action.error.code || 'TEMPLATE_ERROR',
        timestamp: new Date().toISOString()
      };
    })

    // Update Deployment Status
    .addCase(AgentActionTypes.UPDATE_DEPLOYMENT_STATUS, (state, action: PayloadAction<DeploymentPayload>) => {
      const { agentId, status, environment } = action.payload;
      state.deploymentStatus[agentId] = {
        ...state.deploymentStatus[agentId],
        [environment]: {
          status,
          timestamp: new Date().toISOString()
        }
      };
    })

    // Validate Template
    .addCase(AgentActionTypes.VALIDATE_TEMPLATE, (state, action: PayloadAction<ValidateTemplatePayload>) => {
      const { templateId, agentType } = action.payload;
      state.templateValidation[templateId] = {
        isValid: state.templates[templateId]?.type === agentType,
        timestamp: new Date().toISOString()
      };
    });
});

export default agentsReducer;