/**
 * Redux action creators for knowledge base state management
 * Implements secure, monitored CRUD operations with enhanced error handling
 * @version 1.0.0
 */

import { Dispatch } from 'redux'; // v4.2.1
import { ThunkAction } from 'redux-thunk'; // v2.4.2
import rateLimit from 'axios-rate-limit'; // v1.3.0
import { SecurityMonitor } from '@security/monitor'; // v1.0.0
import CircuitBreaker from 'circuit-breaker-js'; // v0.2.3

import { KnowledgeActionTypes } from './types';
import { 
  KnowledgeSource, 
  KnowledgeSourceType, 
  KnowledgeSourceStatus,
  ErrorDetails 
} from '../../types/knowledge';
import { LoadingState, ApiResponse } from '../../types/common';
import { knowledgeService } from '../../services/knowledge';
import { RootState } from '../rootReducer';

// Initialize security monitoring
const securityMonitor = new SecurityMonitor({
  component: 'KnowledgeStore',
  auditLevel: 'HIGH'
});

// Configure rate limiting
const rateLimiter = rateLimit(knowledgeService.axiosInstance, { 
  maxRequests: 100,
  perMilliseconds: 60000
});

// Configure circuit breaker
const breaker = new CircuitBreaker({
  windowDuration: 10000,
  errorThreshold: 50,
  resetTimeout: 30000
});

/**
 * Fetches all knowledge sources with enhanced security and monitoring
 */
export const fetchKnowledgeSources = (): ThunkAction<
  Promise<void>,
  RootState,
  unknown,
  any
> => async (dispatch: Dispatch) => {
  try {
    // Log security audit
    securityMonitor.auditEvent('FETCH_KNOWLEDGE_SOURCES_INITIATED');

    dispatch({ type: KnowledgeActionTypes.FETCH_SOURCES });

    // Execute fetch within circuit breaker
    const response = await breaker.execute(async () => {
      const result = await rateLimiter.get<ApiResponse<KnowledgeSource[]>>('/knowledge/sources');
      return result.data;
    });

    // Transform array to record for normalized state
    const sources = response.data.reduce((acc, source) => ({
      ...acc,
      [source.id]: source
    }), {});

    dispatch({
      type: KnowledgeActionTypes.FETCH_SOURCES_SUCCESS,
      payload: { sources }
    });

    securityMonitor.auditEvent('FETCH_KNOWLEDGE_SOURCES_SUCCESS');
  } catch (error) {
    const errorDetails: ErrorDetails = {
      code: error.code || 'UNKNOWN_ERROR',
      message: error.message,
      timestamp: new Date(),
      context: error.context
    };

    securityMonitor.securityEvent('FETCH_KNOWLEDGE_SOURCES_ERROR', errorDetails);

    dispatch({
      type: KnowledgeActionTypes.FETCH_SOURCES_ERROR,
      payload: { error: errorDetails }
    });
  }
};

/**
 * Adds a new knowledge source with validation and security monitoring
 */
export const addKnowledgeSource = (
  request: CreateKnowledgeSourceRequest
): ThunkAction<Promise<void>, RootState, unknown, any> => async (dispatch: Dispatch) => {
  try {
    // Validate request
    if (!request.name || !request.source_type) {
      throw new Error('Invalid knowledge source request');
    }

    securityMonitor.auditEvent('ADD_KNOWLEDGE_SOURCE_INITIATED', { sourceType: request.source_type });

    // Execute add within circuit breaker
    const response = await breaker.execute(async () => {
      const result = await rateLimiter.post<ApiResponse<KnowledgeSource>>(
        '/knowledge/sources',
        request
      );
      return result.data;
    });

    dispatch({
      type: KnowledgeActionTypes.ADD_SOURCE,
      payload: { source: response.data }
    });

    securityMonitor.auditEvent('ADD_KNOWLEDGE_SOURCE_SUCCESS', { sourceId: response.data.id });
  } catch (error) {
    const errorDetails: ErrorDetails = {
      code: error.code || 'KNOWLEDGE_SOURCE_CREATE_ERROR',
      message: error.message,
      timestamp: new Date(),
      context: { request }
    };

    securityMonitor.securityEvent('ADD_KNOWLEDGE_SOURCE_ERROR', errorDetails);
    throw error;
  }
};

/**
 * Updates an existing knowledge source with validation
 */
export const updateKnowledgeSource = (
  sourceId: string,
  updates: Partial<KnowledgeSource>
): ThunkAction<Promise<void>, RootState, unknown, any> => async (dispatch: Dispatch) => {
  try {
    securityMonitor.auditEvent('UPDATE_KNOWLEDGE_SOURCE_INITIATED', { sourceId });

    const response = await breaker.execute(async () => {
      const result = await rateLimiter.patch<ApiResponse<KnowledgeSource>>(
        `/knowledge/sources/${sourceId}`,
        updates
      );
      return result.data;
    });

    dispatch({
      type: KnowledgeActionTypes.UPDATE_SOURCE,
      payload: { sourceId, updates: response.data }
    });

    securityMonitor.auditEvent('UPDATE_KNOWLEDGE_SOURCE_SUCCESS', { sourceId });
  } catch (error) {
    const errorDetails: ErrorDetails = {
      code: error.code || 'KNOWLEDGE_SOURCE_UPDATE_ERROR',
      message: error.message,
      timestamp: new Date(),
      context: { sourceId, updates }
    };

    securityMonitor.securityEvent('UPDATE_KNOWLEDGE_SOURCE_ERROR', errorDetails);
    throw error;
  }
};

/**
 * Deletes a knowledge source with security validation
 */
export const deleteKnowledgeSource = (
  sourceId: string
): ThunkAction<Promise<void>, RootState, unknown, any> => async (dispatch: Dispatch) => {
  try {
    securityMonitor.auditEvent('DELETE_KNOWLEDGE_SOURCE_INITIATED', { sourceId });

    await breaker.execute(async () => {
      await rateLimiter.delete(`/knowledge/sources/${sourceId}`);
    });

    dispatch({
      type: KnowledgeActionTypes.DELETE_SOURCE,
      payload: { sourceId }
    });

    securityMonitor.auditEvent('DELETE_KNOWLEDGE_SOURCE_SUCCESS', { sourceId });
  } catch (error) {
    const errorDetails: ErrorDetails = {
      code: error.code || 'KNOWLEDGE_SOURCE_DELETE_ERROR',
      message: error.message,
      timestamp: new Date(),
      context: { sourceId }
    };

    securityMonitor.securityEvent('DELETE_KNOWLEDGE_SOURCE_ERROR', errorDetails);
    throw error;
  }
};

/**
 * Updates indexing progress for a knowledge source
 */
export const updateIndexingProgress = (
  sourceId: string,
  progress: number,
  status: string
) => ({
  type: KnowledgeActionTypes.UPDATE_INDEXING_PROGRESS,
  payload: {
    sourceId,
    progress: {
      progress,
      status,
      lastUpdated: new Date()
    }
  }
});

/**
 * Selects a knowledge source for detailed view/edit
 */
export const selectKnowledgeSource = (sourceId: string | null) => ({
  type: KnowledgeActionTypes.SELECT_SOURCE,
  payload: { sourceId }
});

// Types
interface CreateKnowledgeSourceRequest {
  name: string;
  source_type: KnowledgeSourceType;
  connection_config: any;
  indexing_strategy?: string;
}