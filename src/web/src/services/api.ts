/**
 * Core API service module providing a centralized Axios client instance with
 * enterprise-grade security, monitoring, and reliability features.
 * @version 1.0.0
 */

import axios, { AxiosInstance, AxiosRequestConfig, AxiosResponse } from 'axios'; // v1.6.0
import circuitBreaker from 'opossum'; // v6.0.0
import rateLimit from 'axios-rate-limit'; // v1.3.0
import { getApiConfig, API_ENDPOINTS } from '../config/api';
import { getToken } from '../utils/auth';
import { ApiResponse } from '../types/common';

// Constants for error handling and configuration
const DEFAULT_ERROR_MESSAGE = 'An unexpected error occurred';
const NETWORK_ERROR_MESSAGE = 'Network error occurred';
const RATE_LIMIT_CONFIG = { maxRequests: 100, perMilliseconds: 1000 };
const CIRCUIT_BREAKER_CONFIG = { timeout: 3000, errorThreshold: 50 };
const RETRY_CONFIG = { retries: 3, backoffFactor: 2 };

// Metrics collector for monitoring API performance
class MetricsCollector {
  private requestStats: Map<string, any> = new Map();
  private errorStats: Map<string, any> = new Map();

  trackRequest(endpoint: string, duration: number, status: number): void {
    const stats = this.requestStats.get(endpoint) || { count: 0, totalDuration: 0, statuses: {} };
    stats.count++;
    stats.totalDuration += duration;
    stats.statuses[status] = (stats.statuses[status] || 0) + 1;
    this.requestStats.set(endpoint, stats);
  }

  trackError(endpoint: string, error: any): void {
    const stats = this.errorStats.get(endpoint) || { count: 0, types: {} };
    stats.count++;
    const errorType = error.name || 'UnknownError';
    stats.types[errorType] = (stats.types[errorType] || 0) + 1;
    this.errorStats.set(endpoint, stats);
  }

  getRequestStats(): Record<string, any> {
    return Object.fromEntries(this.requestStats);
  }

  getErrorStats(): Record<string, any> {
    return Object.fromEntries(this.errorStats);
  }
}

const apiMetrics = new MetricsCollector();

/**
 * Creates and configures an enterprise-grade Axios instance
 */
const createApiClient = (): AxiosInstance => {
  const config = getApiConfig();
  const instance = axios.create(config);

  // Authentication interceptor
  instance.interceptors.request.use(async (config) => {
    const token = await getToken();
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    config.headers['X-Request-ID'] = crypto.randomUUID();
    return config;
  });

  // Request validation interceptor
  instance.interceptors.request.use((config) => {
    if (!config.url) {
      throw new Error('Request URL is required');
    }
    return monitorRequest(config);
  });

  // Rate limiting
  const rateLimitedInstance = rateLimit(instance, RATE_LIMIT_CONFIG);

  // Circuit breaker configuration
  const breaker = new circuitBreaker(async (request: AxiosRequestConfig) => {
    return rateLimitedInstance(request);
  }, CIRCUIT_BREAKER_CONFIG);

  // Response transformation interceptor
  instance.interceptors.response.use(
    (response: AxiosResponse) => {
      const duration = Date.now() - (response.config.metadata?.startTime || 0);
      apiMetrics.trackRequest(response.config.url || '', duration, response.status);
      
      return {
        success: true,
        data: response.data,
        metadata: {
          requestId: response.config.headers['X-Request-ID'],
          timestamp: new Date().toISOString(),
          duration
        }
      };
    },
    (error) => Promise.reject(handleApiError(error))
  );

  return instance;
};

/**
 * Comprehensive error handling with detailed logging and metrics
 */
const handleApiError = (error: any): ApiResponse<null> => {
  const endpoint = error.config?.url || 'unknown';
  apiMetrics.trackError(endpoint, error);

  const errorResponse = {
    success: false,
    data: null,
    error: {
      code: error.response?.status || 500,
      message: error.response?.data?.message || 
               (error.code === 'ECONNABORTED' ? NETWORK_ERROR_MESSAGE : DEFAULT_ERROR_MESSAGE),
      details: error.response?.data || {},
      timestamp: new Date().toISOString(),
      requestId: error.config?.headers?.['X-Request-ID']
    },
    metadata: {
      endpoint,
      method: error.config?.method,
      timestamp: new Date().toISOString()
    }
  };

  console.error('API Error:', {
    endpoint,
    error: errorResponse.error,
    stack: error.stack
  });

  return errorResponse;
};

/**
 * Tracks and monitors API request performance and health
 */
const monitorRequest = async (config: AxiosRequestConfig): Promise<AxiosRequestConfig> => {
  config.metadata = {
    ...config.metadata,
    startTime: Date.now()
  };

  // Add monitoring headers
  config.headers = {
    ...config.headers,
    'X-Client-Version': process.env.REACT_APP_VERSION,
    'X-Request-Start': new Date().toISOString()
  };

  return config;
};

// Create and export the API client instance
export const apiClient = createApiClient();

// Export error handler and metrics for external use
export { handleApiError, apiMetrics as ApiMetrics };