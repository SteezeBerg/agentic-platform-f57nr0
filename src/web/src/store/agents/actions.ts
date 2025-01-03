/**
 * Redux action creators for managing agent state with enhanced security, monitoring, and validation.
 * Implements comprehensive error handling, performance tracking, and security features.
 * @version 1.0.0
 */

import { createAsyncThunk, createAction } from '@reduxjs/toolkit'; // v2.0.0
import { AgentActionTypes } from './types';
import { AgentService } from '../../services/agent';
import { trace } from '@opentelemetry/api';
import { isUUID } from '../../types/common';
import { hasPermission } from '../../utils/auth';
import { Permission } from '../../types/auth';
import { isValidAgentConfig } from '../../types/agent';

// Initialize tracer for performance monitoring
const tracer = trace.getTracer('agent-actions');

/**
 * Enhanced async thunk to fetch all agents with security and monitoring
 */
export const fetchAgents = createAsyncThunk(
  AgentActionTypes.FETCH_AGENTS,
  async (_, { rejectWithValue }) => {
    const span = tracer.startSpan('fetchAgents');
    
    try {
      // Verify permissions
      const hasViewPermission = await hasPermission(null, Permission.VIEW_METRICS);
      if (!hasViewPermission) {
        throw new Error('Insufficient permissions to view agents');
      }

      // Generate correlation ID
      const correlationId = crypto.randomUUID();
      span.setAttribute('correlationId', correlationId);

      // Execute request with monitoring
      const response = await AgentService.listAgents();
      
      span.setStatus({ code: 0 });
      return response.data;

    } catch (error) {
      span.setStatus({ code: 1, message: error.message });
      return rejectWithValue(error.response?.data || error.message);
    } finally {
      span.end();
    }
  }
);

/**
 * Enhanced async thunk to create a new agent with validation and monitoring
 */
export const createAgent = createAsyncThunk(
  AgentActionTypes.CREATE_AGENT,
  async ({ config, templateId }: { config: any; templateId?: string }, { rejectWithValue }) => {
    const span = tracer.startSpan('createAgent');
    
    try {
      // Verify permissions
      const hasCreatePermission = await hasPermission(null, Permission.CREATE_AGENT);
      if (!hasCreatePermission) {
        throw new Error('Insufficient permissions to create agent');
      }

      // Validate agent configuration
      if (!isValidAgentConfig(config)) {
        throw new Error('Invalid agent configuration');
      }

      // Validate template ID if provided
      if (templateId && !isUUID(templateId)) {
        throw new Error('Invalid template ID format');
      }

      // Generate correlation ID
      const correlationId = crypto.randomUUID();
      span.setAttribute('correlationId', correlationId);

      // Execute request with monitoring
      const response = await AgentService.createAgent(config, templateId);
      
      span.setStatus({ code: 0 });
      return response.data;

    } catch (error) {
      span.setStatus({ code: 1, message: error.message });
      return rejectWithValue(error.response?.data || error.message);
    } finally {
      span.end();
    }
  }
);

/**
 * Enhanced async thunk to update an agent with validation and security
 */
export const updateAgent = createAsyncThunk(
  AgentActionTypes.UPDATE_AGENT,
  async ({ agentId, config }: { agentId: string; config: any }, { rejectWithValue }) => {
    const span = tracer.startSpan('updateAgent');
    
    try {
      // Verify permissions
      const hasEditPermission = await hasPermission(null, Permission.EDIT_AGENT);
      if (!hasEditPermission) {
        throw new Error('Insufficient permissions to update agent');
      }

      // Validate agent ID
      if (!isUUID(agentId)) {
        throw new Error('Invalid agent ID format');
      }

      // Validate configuration
      if (!isValidAgentConfig(config)) {
        throw new Error('Invalid agent configuration');
      }

      // Generate correlation ID
      const correlationId = crypto.randomUUID();
      span.setAttribute('correlationId', correlationId);

      // Execute request with monitoring
      const response = await AgentService.updateAgent(agentId, config);
      
      span.setStatus({ code: 0 });
      return response.data;

    } catch (error) {
      span.setStatus({ code: 1, message: error.message });
      return rejectWithValue(error.response?.data || error.message);
    } finally {
      span.end();
    }
  }
);

/**
 * Enhanced async thunk to delete an agent with security and monitoring
 */
export const deleteAgent = createAsyncThunk(
  AgentActionTypes.DELETE_AGENT,
  async (agentId: string, { rejectWithValue }) => {
    const span = tracer.startSpan('deleteAgent');
    
    try {
      // Verify permissions
      const hasDeletePermission = await hasPermission(null, Permission.DELETE_AGENT);
      if (!hasDeletePermission) {
        throw new Error('Insufficient permissions to delete agent');
      }

      // Validate agent ID
      if (!isUUID(agentId)) {
        throw new Error('Invalid agent ID format');
      }

      // Generate correlation ID
      const correlationId = crypto.randomUUID();
      span.setAttribute('correlationId', correlationId);

      // Execute request with monitoring
      const response = await AgentService.deleteAgent(agentId);
      
      span.setStatus({ code: 0 });
      return agentId;

    } catch (error) {
      span.setStatus({ code: 1, message: error.message });
      return rejectWithValue(error.response?.data || error.message);
    } finally {
      span.end();
    }
  }
);

/**
 * Enhanced synchronous action to select an agent with validation
 */
export const selectAgent = createAction<string>(
  AgentActionTypes.SELECT_AGENT,
  (agentId: string) => {
    // Validate agent ID format
    if (!isUUID(agentId)) {
      throw new Error('Invalid agent ID format');
    }
    return { payload: agentId };
  }
);

/**
 * Enhanced async thunk to fetch agent templates with caching
 */
export const fetchTemplates = createAsyncThunk(
  AgentActionTypes.FETCH_TEMPLATES,
  async (_, { rejectWithValue }) => {
    const span = tracer.startSpan('fetchTemplates');
    
    try {
      // Verify permissions
      const hasViewPermission = await hasPermission(null, Permission.VIEW_METRICS);
      if (!hasViewPermission) {
        throw new Error('Insufficient permissions to view templates');
      }

      // Generate correlation ID
      const correlationId = crypto.randomUUID();
      span.setAttribute('correlationId', correlationId);

      // Execute request with monitoring
      const response = await AgentService.getAgentTemplates();
      
      span.setStatus({ code: 0 });
      return response.data;

    } catch (error) {
      span.setStatus({ code: 1, message: error.message });
      return rejectWithValue(error.response?.data || error.message);
    } finally {
      span.end();
    }
  }
);