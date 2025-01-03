/**
 * TypeScript type definitions for the agents slice of the Redux store
 * Provides comprehensive type safety for agent management, template handling, and state tracking
 * @version 1.0.0
 */

import { PayloadAction } from '@reduxjs/toolkit';
import { Agent, AgentTemplate } from '../../types/agent';
import { LoadingState } from '../../types/common';

/**
 * Feature key for the agents slice of the Redux store
 */
export const AGENTS_FEATURE_KEY = 'agents' as const;

/**
 * Interface defining the shape of the agents slice state with strict immutability
 */
export interface AgentsState {
  readonly agents: Record<string, Agent>;
  readonly templates: Record<string, AgentTemplate>;
  readonly selectedAgentId: string | null;
  readonly loadingState: LoadingState;
  readonly error: string | null;
  readonly lastUpdated: Date | null;
}

/**
 * Comprehensive enum of all possible agent action types
 */
export enum AgentActionTypes {
  FETCH_AGENTS = 'agents/fetchAgents',
  CREATE_AGENT = 'agents/createAgent',
  UPDATE_AGENT = 'agents/updateAgent',
  DELETE_AGENT = 'agents/deleteAgent',
  SELECT_AGENT = 'agents/selectAgent',
  FETCH_TEMPLATES = 'agents/fetchTemplates',
  DEPLOY_AGENT = 'agents/deployAgent',
  VALIDATE_AGENT = 'agents/validateAgent'
}

/**
 * Immutable payload type for fetch agents action with timestamp tracking
 */
export interface FetchAgentsPayload {
  readonly agents: Agent[];
  readonly timestamp: Date;
}

/**
 * Immutable payload type for create agent action with template support
 */
export interface CreateAgentPayload {
  readonly agent: Agent;
  readonly templateId: string | null;
}

/**
 * Immutable payload type for update agent action with partial updates
 */
export interface UpdateAgentPayload {
  readonly id: string;
  readonly updates: Partial<Agent>;
  readonly timestamp: Date;
}

/**
 * Immutable payload type for delete agent action
 */
export interface DeleteAgentPayload {
  readonly id: string;
}

/**
 * Immutable payload type for select agent action
 */
export interface SelectAgentPayload {
  readonly id: string;
}

/**
 * Immutable payload type for fetch templates action with category filtering
 */
export interface FetchTemplatesPayload {
  readonly templates: AgentTemplate[];
  readonly category: string | null;
}

/**
 * Immutable payload type for agent deployment action with environment configuration
 */
export interface DeployAgentPayload {
  readonly id: string;
  readonly environment: string;
  readonly config: Record<string, unknown>;
}

/**
 * Type-safe action creators with payload validation
 */
export type FetchAgentsAction = PayloadAction<FetchAgentsPayload>;
export type CreateAgentAction = PayloadAction<CreateAgentPayload>;
export type UpdateAgentAction = PayloadAction<UpdateAgentPayload>;
export type DeleteAgentAction = PayloadAction<DeleteAgentPayload>;
export type SelectAgentAction = PayloadAction<SelectAgentPayload>;
export type FetchTemplatesAction = PayloadAction<FetchTemplatesPayload>;
export type DeployAgentAction = PayloadAction<DeployAgentPayload>;

/**
 * Union type of all possible agent actions for reducer type safety
 */
export type AgentActions =
  | FetchAgentsAction
  | CreateAgentAction
  | UpdateAgentAction
  | DeleteAgentAction
  | SelectAgentAction
  | FetchTemplatesAction
  | DeployAgentAction;