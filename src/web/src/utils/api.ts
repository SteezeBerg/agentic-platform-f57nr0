/**
 * Enterprise-grade HTTP request handling utility for the Agent Builder Hub frontend.
 * Implements secure, resilient, and monitored API communication with comprehensive error management.
 * @version 1.0.0
 */

import axios, { AxiosError, AxiosInstance, AxiosRequestConfig } from 'axios'; // v1.6.0
import circuitBreaker from 'opossum'; // v6.0.0
import rateLimit from 'axios-rate-limit'; // v1.3.0
import { SecurityMonitor } from '@security/monitor'; // v1.0.0
import { Logger } from 'winston'; // v3.10.0

import { ApiResponse, PaginatedResponse, ErrorResponse } from '../types/common';
import { getApiConfig, API_ENDPOINTS } from '../config/api';
import { getCurrentUser } from '../utils/auth';

// Initialize security monitoring and logging
const securityMonitor = new SecurityMonitor({
  component: 'ApiClient',
  alertThreshold: 5
});

const logger = new Logger({
  level: 'info',
  component: 'ApiClient'
});

/**
 * Creates and configures an Axios instance with enhanced security and resilience features
 */
const createAxiosInstance = (): AxiosInstance => {
  const config = getApiConfig();
  const instance = axios.create(config);

  // Request interceptor for authentication and security headers
  instance.interceptors.request.use(async (config) => {
    const user = await getCurrentUser();
    if (user) {
      config.headers.Authorization = `Bearer ${user.token}`;
    }
    config.headers['X-Request-ID'] = crypto.randomUUID();
    return config;
  });

  // Response interceptor for error handling and monitoring
  instance.interceptors.response.use(
    (response) => {
      securityMonitor.trackMetric('api.request.success', {
        endpoint: response.config.url,
        method: response.config.method,
        status: response.status
      });
      return response;
    },
    (error: AxiosError) => {
      return handleApiError(error);
    }
  );

  // Apply rate limiting protection
  const rateLimitedInstance = rateLimit(instance, {
    maxRequests: 100,
    perMilliseconds: 60000,
    maxRPS: 10
  });

  return rateLimitedInstance;
};

/**
 * Enhanced error handler with comprehensive logging and monitoring
 */
const handleApiError = (error: AxiosError): Promise<ErrorResponse> => {
  const errorResponse: ErrorResponse = {
    code: error.code || 'UNKNOWN_ERROR',
    message: error.message || 'An unexpected error occurred',
    details: {},
    timestamp: new Date().toISOString()
  };

  if (error.response) {
    errorResponse.details = {
      status: error.response.status,
      data: error.response.data,
      headers: error.response.headers
    };
  }

  // Log error details
  logger.error('API request failed', {
    error: errorResponse,
    request: {
      url: error.config?.url,
      method: error.config?.method,
      headers: error.config?.headers
    }
  });

  // Track security-related errors
  securityMonitor.trackError('api.request.error', {
    error: errorResponse,
    endpoint: error.config?.url,
    method: error.config?.method
  });

  return Promise.reject(errorResponse);
};

/**
 * Enhanced API client with security, monitoring, and resilience features
 */
class ApiClient {
  private axiosInstance: AxiosInstance;
  private breaker: any;

  constructor() {
    this.axiosInstance = createAxiosInstance();
    
    // Configure circuit breaker
    this.breaker = new circuitBreaker(this.request.bind(this), {
      timeout: 30000,
      errorThresholdPercentage: 50,
      resetTimeout: 30000
    });

    // Circuit breaker event monitoring
    this.breaker.on('open', () => {
      logger.warn('Circuit breaker opened');
      securityMonitor.trackEvent('circuit.breaker.open');
    });
  }

  /**
   * Generic request method with full monitoring and protection
   */
  private async request<T>(config: AxiosRequestConfig): Promise<ApiResponse<T>> {
    try {
      const response = await this.axiosInstance.request<ApiResponse<T>>(config);
      return response.data;
    } catch (error) {
      throw await handleApiError(error as AxiosError);
    }
  }

  /**
   * GET request with type safety and monitoring
   */
  async get<T>(url: string, config?: AxiosRequestConfig): Promise<ApiResponse<T>> {
    return this.breaker.fire({ ...config, method: 'GET', url });
  }

  /**
   * POST request with type safety and monitoring
   */
  async post<T>(url: string, data?: any, config?: AxiosRequestConfig): Promise<ApiResponse<T>> {
    return this.breaker.fire({ ...config, method: 'POST', url, data });
  }

  /**
   * PUT request with type safety and monitoring
   */
  async put<T>(url: string, data?: any, config?: AxiosRequestConfig): Promise<ApiResponse<T>> {
    return this.breaker.fire({ ...config, method: 'PUT', url, data });
  }

  /**
   * DELETE request with type safety and monitoring
   */
  async delete<T>(url: string, config?: AxiosRequestConfig): Promise<ApiResponse<T>> {
    return this.breaker.fire({ ...config, method: 'DELETE', url });
  }

  /**
   * Paginated GET request with type safety
   */
  async getPaginated<T>(url: string, config?: AxiosRequestConfig): Promise<PaginatedResponse<T>> {
    const response = await this.get<PaginatedResponse<T>>(url, config);
    return response.data;
  }
}

// Export singleton instance
export const apiClient = new ApiClient();