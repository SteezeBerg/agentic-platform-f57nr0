/**
 * Redux selector functions for the agents slice of the store
 * Provides memoized access to agent data, templates, deployment states, and health monitoring
 * @version 1.0.0
 */

import { createSelector } from '@reduxjs/toolkit'; // ^2.0.0
import type { RootState } from '../rootReducer';
import type { AgentsState } from './types';
import type { Agent, AgentTemplate, AgentStatus, AgentHealthStatus } from '../../types/agent';
import type { DeploymentStatus } from '../../types/deployment';

/**
 * Base selector to access the agents slice of the store
 */
export const selectAgentsState = (state: RootState): AgentsState => state.agents;

/**
 * Memoized selector to get all agents as an array
 */
export const selectAllAgents = createSelector(
  selectAgentsState,
  (state: AgentsState): Agent[] => Object.values(state.agents)
);

/**
 * Memoized selector to get the currently selected agent
 */
export const selectSelectedAgent = createSelector(
  selectAgentsState,
  (state: AgentsState): Agent | null => 
    state.selectedAgentId ? state.agents[state.selectedAgentId] : null
);

/**
 * Memoized selector to get all available templates
 */
export const selectAllTemplates = createSelector(
  selectAgentsState,
  (state: AgentsState): AgentTemplate[] => Object.values(state.templates)
);

/**
 * Factory selector to get deployment status for a specific agent
 */
export const selectAgentDeploymentStatus = (agentId: string) => createSelector(
  selectAgentsState,
  (state: AgentsState): DeploymentStatus | undefined => 
    state.deploymentStatus[agentId]?.status
);

/**
 * Factory selector to get error state for a specific agent
 */
export const selectAgentErrors = (agentId: string) => createSelector(
  selectAgentsState,
  (state: AgentsState) => state.errors[agentId] || null
);

/**
 * Memoized selector to get agents filtered by status
 */
export const selectAgentsByStatus = createSelector(
  selectAllAgents,
  (_: AgentsState, status: AgentStatus) => status,
  (agents: Agent[], status: AgentStatus): Agent[] =>
    agents.filter(agent => agent.status === status)
);

/**
 * Memoized selector to get agents with critical health status
 */
export const selectCriticalHealthAgents = createSelector(
  selectAllAgents,
  (agents: Agent[]): Agent[] =>
    agents.filter(agent => agent.healthStatus.status === 'unhealthy')
);

/**
 * Factory selector to validate template compatibility for an agent
 */
export const selectTemplateValidation = (agentId: string, templateId: string) => createSelector(
  selectAgentsState,
  (state: AgentsState) => {
    const agent = state.agents[agentId];
    const template = state.templates[templateId];
    
    if (!agent || !template) {
      return { isValid: false, errors: ['Agent or template not found'] };
    }

    const errors: string[] = [];
    
    // Validate type compatibility
    if (agent.type !== template.type) {
      errors.push(`Template type ${template.type} is incompatible with agent type ${agent.type}`);
    }

    // Validate capability requirements
    const missingCapabilities = template.defaultConfig.capabilities.filter(
      cap => !agent.config.capabilities.includes(cap)
    );
    if (missingCapabilities.length > 0) {
      errors.push(`Missing required capabilities: ${missingCapabilities.join(', ')}`);
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }
);

/**
 * Memoized selector to get loading state
 */
export const selectAgentsLoadingState = createSelector(
  selectAgentsState,
  (state: AgentsState) => state.loadingState
);

/**
 * Memoized selector to get agents with pending deployments
 */
export const selectPendingDeployments = createSelector(
  selectAllAgents,
  selectAgentsState,
  (agents: Agent[], state: AgentsState): Agent[] =>
    agents.filter(agent => 
      state.deploymentStatus[agent.id]?.status === 'pending' ||
      state.deploymentStatus[agent.id]?.status === 'in_progress'
    )
);

/**
 * Memoized selector to get agent health metrics
 */
export const selectAgentHealthMetrics = createSelector(
  selectAllAgents,
  (agents: Agent[]): Record<string, AgentHealthStatus> =>
    agents.reduce((acc, agent) => ({
      ...acc,
      [agent.id]: agent.healthStatus
    }), {})
);

/**
 * Factory selector to get filtered agents based on search criteria
 */
export const selectFilteredAgents = (searchTerm: string) => createSelector(
  selectAllAgents,
  (agents: Agent[]): Agent[] =>
    agents.filter(agent => 
      agent.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      agent.description.toLowerCase().includes(searchTerm.toLowerCase())
    )
);

/**
 * Memoized selector to get template categories
 */
export const selectTemplateCategories = createSelector(
  selectAllTemplates,
  (templates: AgentTemplate[]): string[] =>
    Array.from(new Set(templates.map(template => template.metadata.category || 'Uncategorized')))
);