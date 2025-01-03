/**
 * API configuration and endpoint definitions for the Agent Builder Hub frontend.
 * Provides centralized configuration for all API communication with enhanced
 * security, monitoring, and error handling capabilities.
 * @version 1.0.0
 */

import { AxiosRequestConfig } from 'axios'; // v1.6.0
import { APP_CONFIG } from './constants';

// API version and core configuration constants
const API_VERSION = 'v1';
const REQUEST_TIMEOUT = 30000; // 30 seconds default timeout
const MAX_RETRIES = 3;
const RETRY_DELAY = 1000; // Base delay for exponential backoff
const RATE_LIMIT_THRESHOLD = 100; // Requests per minute
const CIRCUIT_BREAKER_THRESHOLD = 0.5; // 50% error rate threshold

/**
 * Core API endpoint definitions for all service endpoints.
 * Centralized configuration ensures consistent endpoint usage across the application.
 */
export const API_ENDPOINTS = {
  AGENTS: '/agents',
  DEPLOYMENTS: '/deployments',
  KNOWLEDGE: '/knowledge',
  TEMPLATES: '/templates',
  METRICS: '/metrics',
  HEALTH: '/health',
} as const;

/**
 * Returns enhanced API configuration object for Axios client initialization.
 * Includes security headers, monitoring, and error handling configuration.
 */
export function getApiConfig(): AxiosRequestConfig {
  // Validate required environment variables
  if (!process.env.REACT_APP_API_URL) {
    throw new Error('API URL environment variable is not configured');
  }

  // Construct base API URL with version
  const baseURL = `${process.env.REACT_APP_API_URL}/api/${API_VERSION}`;
  
  // Get AWS region for service discovery
  const awsRegion = process.env.REACT_APP_AWS_REGION || 'us-east-1';

  return {
    baseURL,
    timeout: parseInt(process.env.REACT_APP_API_TIMEOUT as string, 10) || REQUEST_TIMEOUT,
    
    // Security headers
    headers: {
      'X-App-Version': APP_CONFIG.APP_VERSION,
      'X-Api-Version': API_VERSION,
      'X-Request-ID': '', // Will be set per request
      'X-AWS-Region': awsRegion,
      'Content-Security-Policy': "default-src 'self'",
      'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
      'X-XSS-Protection': '1; mode=block',
    },

    // Request/response validation
    validateStatus: (status: number) => status >= 200 && status < 500,

    // Retry configuration with exponential backoff
    retry: {
      maxRetries: MAX_RETRIES,
      retryDelay: (retryCount: number) => {
        return Math.min(RETRY_DELAY * Math.pow(2, retryCount), 10000);
      },
      retryCondition: (error: any) => {
        return error.response?.status >= 500 || !error.response;
      },
    },

    // Rate limiting configuration
    rateLimit: {
      maxRequests: process.env.REACT_APP_RATE_LIMIT_THRESHOLD 
        ? parseInt(process.env.REACT_APP_RATE_LIMIT_THRESHOLD, 10) 
        : RATE_LIMIT_THRESHOLD,
      perMilliseconds: 60000, // 1 minute window
    },

    // Circuit breaker configuration
    circuitBreaker: {
      threshold: CIRCUIT_BREAKER_THRESHOLD,
      windowSize: 60000, // 1 minute monitoring window
      minimumRequests: 5, // Minimum requests before triggering
    },

    // Performance monitoring
    monitoring: process.env.REACT_APP_ENABLE_MONITORING === 'true' ? {
      enabled: true,
      metricsEndpoint: API_ENDPOINTS.METRICS,
      sampleRate: 0.1, // Sample 10% of requests for performance metrics
      customMetrics: {
        responseTime: true,
        requestSize: true,
        responseSize: true,
        cacheHits: true,
      },
    } : undefined,

    // Error transformation
    transformError: (error: any) => ({
      status: error.response?.status || 500,
      code: error.code || 'UNKNOWN_ERROR',
      message: error.response?.data?.message || error.message,
      timestamp: new Date().toISOString(),
      requestId: error.config?.headers?.['X-Request-ID'],
    }),
  };
}

// Type definitions for API response structures
export interface ApiResponse<T = any> {
  data: T;
  metadata: {
    requestId: string;
    timestamp: string;
    version: string;
  };
}

export interface ApiError {
  status: number;
  code: string;
  message: string;
  timestamp: string;
  requestId: string;
}

// Freeze API endpoints to prevent modification
Object.freeze(API_ENDPOINTS);