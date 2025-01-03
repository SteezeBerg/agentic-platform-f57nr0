/**
 * Enterprise-grade service module for agent-related API operations.
 * Implements comprehensive error handling, monitoring, caching, and security features.
 * @version 1.0.0
 */

import { AxiosResponse } from 'axios'; // v1.6.0
import CircuitBreaker from 'opossum'; // v6.0.0
import retry from 'axios-retry'; // v3.8.0
import Cache from 'node-cache'; // v5.1.2
import { trace, Span } from '@opentelemetry/api'; // v1.4.0

import { apiClient, handleApiError } from './api';
import { API_ENDPOINTS } from '../config/api';
import { UUID, ApiResponse, LoadingState } from '../types/common';
import { Permission } from '../types/auth';
import { hasPermission } from '../utils/auth';

// Constants for service configuration
const CIRCUIT_BREAKER_OPTIONS = {
  timeout: 3000,
  errorThresholdPercentage: 50,
  resetTimeout: 30000
} as const;

const CACHE_OPTIONS = {
  ttl: 300000, // 5 minutes
  maxSize: 1000
} as const;

const RATE_LIMIT_OPTIONS = {
  maxRequests: 100,
  perWindow: 60000 // 1 minute
} as const;

// Types for agent operations
export interface AgentConfig {
  name: string;
  description: string;
  type: 'STREAMLIT' | 'SLACK' | 'REACT' | 'STANDALONE';
  configuration: Record<string, unknown>;
  knowledgeSources: string[];
}

export interface Agent {
  id: UUID;
  config: AgentConfig;
  status: 'DRAFT' | 'ACTIVE' | 'DEPLOYED' | 'ERROR';
  created_at: string;
  updated_at: string;
  version: number;
}

export interface CreateOptions {
  validateOnly?: boolean;
  dryRun?: boolean;
}

/**
 * Enterprise service class for agent management with resilience patterns
 */
export class AgentService {
  private readonly circuitBreaker: CircuitBreaker;
  private readonly cache: Cache;
  private readonly tracer = trace.getTracer('agent-service');
  private loadingState: LoadingState = LoadingState.IDLE;

  constructor() {
    // Initialize circuit breaker
    this.circuitBreaker = new CircuitBreaker(this.executeRequest.bind(this), CIRCUIT_BREAKER_OPTIONS);
    
    // Initialize cache
    this.cache = new Cache(CACHE_OPTIONS);
    
    // Configure retry strategy
    retry(apiClient, {
      retries: 3,
      retryDelay: retry.exponentialDelay,
      retryCondition: (error) => retry.isNetworkOrIdempotentRequestError(error)
    });

    // Circuit breaker event handlers
    this.circuitBreaker.on('open', () => {
      console.error('Circuit breaker opened - agent service experiencing issues');
    });
    
    this.circuitBreaker.on('halfOpen', () => {
      console.info('Circuit breaker attempting to recover');
    });
  }

  /**
   * Creates a new agent with comprehensive validation and optimistic updates
   */
  public async createAgent(
    config: AgentConfig,
    templateId?: string,
    options: CreateOptions = {}
  ): Promise<ApiResponse<Agent>> {
    const span = this.tracer.startSpan('createAgent');
    
    try {
      // Permission check
      const hasCreatePermission = await hasPermission(null, Permission.CREATE_AGENT);
      if (!hasCreatePermission) {
        throw new Error('Insufficient permissions to create agent');
      }

      // Validate configuration
      await this.validateConfig(config);

      // Generate request ID for tracing
      const requestId = crypto.randomUUID();

      // Check cache for identical configurations
      const cacheKey = this.generateCacheKey(config);
      const cachedResponse = this.cache.get<ApiResponse<Agent>>(cacheKey);
      if (cachedResponse && !options.validateOnly) {
        span.setAttribute('cache.hit', true);
        return cachedResponse;
      }

      // Prepare request payload
      const payload = {
        config,
        templateId,
        options,
        requestId
      };

      // Execute request with circuit breaker
      this.loadingState = LoadingState.LOADING;
      const response = await this.circuitBreaker.fire(async () => {
        return apiClient.post<ApiResponse<Agent>>(
          API_ENDPOINTS.AGENTS,
          payload,
          {
            headers: {
              'X-Request-ID': requestId
            }
          }
        );
      });

      // Cache successful response
      if (response.data.success) {
        this.cache.set(cacheKey, response.data);
      }

      this.loadingState = LoadingState.SUCCESS;
      span.setStatus({ code: 0 });
      return response.data;

    } catch (error) {
      this.loadingState = LoadingState.ERROR;
      span.setStatus({ code: 1, message: error.message });
      return handleApiError(error);
    } finally {
      span.end();
    }
  }

  /**
   * Retrieves an agent by ID with caching and monitoring
   */
  public async getAgent(id: UUID): Promise<ApiResponse<Agent>> {
    const span = this.tracer.startSpan('getAgent');
    
    try {
      // Check cache first
      const cacheKey = `agent:${id}`;
      const cachedAgent = this.cache.get<ApiResponse<Agent>>(cacheKey);
      if (cachedAgent) {
        span.setAttribute('cache.hit', true);
        return cachedAgent;
      }

      // Execute request with circuit breaker
      const response = await this.circuitBreaker.fire(async () => {
        return apiClient.get<ApiResponse<Agent>>(`${API_ENDPOINTS.AGENTS}/${id}`);
      });

      // Cache successful response
      if (response.data.success) {
        this.cache.set(cacheKey, response.data);
      }

      span.setStatus({ code: 0 });
      return response.data;

    } catch (error) {
      span.setStatus({ code: 1, message: error.message });
      return handleApiError(error);
    } finally {
      span.end();
    }
  }

  /**
   * Updates an existing agent with optimistic updates and validation
   */
  public async updateAgent(
    id: UUID,
    config: Partial<AgentConfig>
  ): Promise<ApiResponse<Agent>> {
    const span = this.tracer.startSpan('updateAgent');
    
    try {
      // Permission check
      const hasEditPermission = await hasPermission(null, Permission.EDIT_AGENT);
      if (!hasEditPermission) {
        throw new Error('Insufficient permissions to update agent');
      }

      // Validate partial configuration
      if (config) {
        await this.validateConfig(config as AgentConfig, true);
      }

      // Execute request with circuit breaker
      const response = await this.circuitBreaker.fire(async () => {
        return apiClient.put<ApiResponse<Agent>>(
          `${API_ENDPOINTS.AGENTS}/${id}`,
          { config }
        );
      });

      // Invalidate cache on successful update
      if (response.data.success) {
        this.cache.del(`agent:${id}`);
      }

      span.setStatus({ code: 0 });
      return response.data;

    } catch (error) {
      span.setStatus({ code: 1, message: error.message });
      return handleApiError(error);
    } finally {
      span.end();
    }
  }

  /**
   * Deletes an agent with proper cleanup and cache invalidation
   */
  public async deleteAgent(id: UUID): Promise<ApiResponse<void>> {
    const span = this.tracer.startSpan('deleteAgent');
    
    try {
      // Permission check
      const hasDeletePermission = await hasPermission(null, Permission.DELETE_AGENT);
      if (!hasDeletePermission) {
        throw new Error('Insufficient permissions to delete agent');
      }

      // Execute request with circuit breaker
      const response = await this.circuitBreaker.fire(async () => {
        return apiClient.delete<ApiResponse<void>>(`${API_ENDPOINTS.AGENTS}/${id}`);
      });

      // Invalidate cache on successful deletion
      if (response.data.success) {
        this.cache.del(`agent:${id}`);
      }

      span.setStatus({ code: 0 });
      return response.data;

    } catch (error) {
      span.setStatus({ code: 1, message: error.message });
      return handleApiError(error);
    } finally {
      span.end();
    }
  }

  /**
   * Validates agent configuration against schema and business rules
   */
  private async validateConfig(
    config: AgentConfig,
    isPartial: boolean = false
  ): Promise<boolean> {
    const span = this.tracer.startSpan('validateConfig');
    
    try {
      if (!isPartial) {
        // Required fields validation
        if (!config.name || !config.type) {
          throw new Error('Missing required fields: name and type are required');
        }

        // Name length validation
        if (config.name.length < 3 || config.name.length > 100) {
          throw new Error('Name must be between 3 and 100 characters');
        }
      }

      // Type validation
      if (config.type && !['STREAMLIT', 'SLACK', 'REACT', 'STANDALONE'].includes(config.type)) {
        throw new Error('Invalid agent type');
      }

      // Knowledge sources validation
      if (config.knowledgeSources?.length > 10) {
        throw new Error('Maximum of 10 knowledge sources allowed');
      }

      span.setStatus({ code: 0 });
      return true;

    } catch (error) {
      span.setStatus({ code: 1, message: error.message });
      throw error;
    } finally {
      span.end();
    }
  }

  /**
   * Generates a cache key for agent configurations
   */
  private generateCacheKey(config: AgentConfig): string {
    return `agent:config:${JSON.stringify(config)}`;
  }

  /**
   * Executes an API request with proper error handling and monitoring
   */
  private async executeRequest<T>(
    request: () => Promise<AxiosResponse<T>>
  ): Promise<AxiosResponse<T>> {
    const span = this.tracer.startSpan('executeRequest');
    
    try {
      const response = await request();
      span.setStatus({ code: 0 });
      return response;
    } catch (error) {
      span.setStatus({ code: 1, message: error.message });
      throw error;
    } finally {
      span.end();
    }
  }

  /**
   * Returns the current loading state of the service
   */
  public getLoadingState(): LoadingState {
    return this.loadingState;
  }
}

// Export singleton instance
export const agentService = new AgentService();