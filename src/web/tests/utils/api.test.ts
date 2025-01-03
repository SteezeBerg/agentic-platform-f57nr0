import { describe, test, expect, beforeEach, afterEach, jest } from '@jest/globals';
import MockAdapter from 'axios-mock-adapter';
import axios from 'axios';

import { 
  get, 
  post, 
  put, 
  delete as deleteRequest, 
  setAuthToken, 
  resetCircuitBreaker 
} from '../../src/utils/api';
import { 
  ApiResponse, 
  ErrorResponse, 
  SecurityMetrics, 
  CircuitBreakerState 
} from '../../src/types/common';
import { API_ENDPOINTS, SECURITY_CONFIG } from '../../src/config/api';

// Mock setup
const mockAxios = new MockAdapter(axios);
const mockSecurityMonitor = {
  trackMetric: jest.fn(),
  trackError: jest.fn(),
  startSpan: jest.fn(() => ({ end: jest.fn() }))
};

// Test data
const TEST_ENDPOINT = API_ENDPOINTS.AGENTS;
const TEST_AUTH_TOKEN = 'test-jwt-token';
const TEST_AGENT_DATA = {
  id: '123',
  name: 'Test Agent',
  status: 'active'
};

describe('API Utility', () => {
  beforeEach(() => {
    mockAxios.reset();
    jest.clearAllMocks();
    resetCircuitBreaker();
    setAuthToken(TEST_AUTH_TOKEN);
  });

  afterEach(() => {
    mockAxios.reset();
    jest.clearAllMocks();
  });

  describe('HTTP Methods', () => {
    test('GET request should handle successful response', async () => {
      const expectedResponse: ApiResponse<typeof TEST_AGENT_DATA> = {
        success: true,
        data: TEST_AGENT_DATA,
        error: null,
        metadata: { requestId: '123' }
      };

      mockAxios.onGet(`${TEST_ENDPOINT}/123`).reply(200, expectedResponse);

      const response = await get<typeof TEST_AGENT_DATA>(`${TEST_ENDPOINT}/123`);
      expect(response).toEqual(expectedResponse);
      expect(mockSecurityMonitor.trackMetric).toHaveBeenCalledWith('api.request.success', expect.any(Object));
    });

    test('POST request should send data correctly', async () => {
      mockAxios.onPost(TEST_ENDPOINT).reply((config) => {
        expect(JSON.parse(config.data)).toEqual(TEST_AGENT_DATA);
        expect(config.headers?.Authorization).toBe(`Bearer ${TEST_AUTH_TOKEN}`);
        return [201, { success: true, data: TEST_AGENT_DATA }];
      });

      await post<typeof TEST_AGENT_DATA>(TEST_ENDPOINT, TEST_AGENT_DATA);
    });

    test('PUT request should update data correctly', async () => {
      const updatedData = { ...TEST_AGENT_DATA, name: 'Updated Agent' };
      
      mockAxios.onPut(`${TEST_ENDPOINT}/123`).reply((config) => {
        expect(JSON.parse(config.data)).toEqual(updatedData);
        return [200, { success: true, data: updatedData }];
      });

      await put<typeof TEST_AGENT_DATA>(`${TEST_ENDPOINT}/123`, updatedData);
    });

    test('DELETE request should handle successful deletion', async () => {
      mockAxios.onDelete(`${TEST_ENDPOINT}/123`).reply(204);

      await deleteRequest(`${TEST_ENDPOINT}/123`);
      expect(mockSecurityMonitor.trackMetric).toHaveBeenCalledWith('api.request.success', expect.any(Object));
    });
  });

  describe('Error Handling', () => {
    test('should handle network errors', async () => {
      mockAxios.onGet(TEST_ENDPOINT).networkError();

      await expect(get(TEST_ENDPOINT)).rejects.toMatchObject({
        code: 'NETWORK_ERROR',
        message: expect.any(String)
      });
      expect(mockSecurityMonitor.trackError).toHaveBeenCalled();
    });

    test('should handle timeout errors', async () => {
      mockAxios.onGet(TEST_ENDPOINT).timeout();

      await expect(get(TEST_ENDPOINT)).rejects.toMatchObject({
        code: 'TIMEOUT',
        message: expect.any(String)
      });
    });

    test('should handle validation errors', async () => {
      const errorResponse: ErrorResponse = {
        code: 'VALIDATION_ERROR',
        message: 'Invalid input',
        details: { field: 'name' },
        timestamp: new Date().toISOString()
      };

      mockAxios.onPost(TEST_ENDPOINT).reply(400, errorResponse);

      await expect(post(TEST_ENDPOINT, {})).rejects.toMatchObject(errorResponse);
    });
  });

  describe('Authentication Flow', () => {
    test('should include authentication token in requests', async () => {
      mockAxios.onGet(TEST_ENDPOINT).reply((config) => {
        expect(config.headers?.Authorization).toBe(`Bearer ${TEST_AUTH_TOKEN}`);
        return [200, { success: true, data: [] }];
      });

      await get(TEST_ENDPOINT);
    });

    test('should handle unauthorized errors', async () => {
      mockAxios.onGet(TEST_ENDPOINT).reply(401, {
        code: 'UNAUTHORIZED',
        message: 'Invalid token'
      });

      await expect(get(TEST_ENDPOINT)).rejects.toMatchObject({
        code: 'UNAUTHORIZED'
      });
      expect(mockSecurityMonitor.trackError).toHaveBeenCalledWith('api.request.error', expect.any(Object));
    });

    test('should handle token refresh', async () => {
      const newToken = 'new-test-token';
      mockAxios
        .onGet(TEST_ENDPOINT)
        .replyOnce(401)
        .onGet(TEST_ENDPOINT)
        .reply((config) => {
          expect(config.headers?.Authorization).toBe(`Bearer ${newToken}`);
          return [200, { success: true, data: [] }];
        });

      setAuthToken(newToken);
      await get(TEST_ENDPOINT);
    });
  });

  describe('Security Monitoring', () => {
    test('should track successful requests', async () => {
      mockAxios.onGet(TEST_ENDPOINT).reply(200, { success: true, data: [] });

      await get(TEST_ENDPOINT);
      expect(mockSecurityMonitor.trackMetric).toHaveBeenCalledWith('api.request.success', expect.any(Object));
    });

    test('should track failed requests', async () => {
      mockAxios.onGet(TEST_ENDPOINT).reply(500);

      await expect(get(TEST_ENDPOINT)).rejects.toThrow();
      expect(mockSecurityMonitor.trackError).toHaveBeenCalledWith('api.request.error', expect.any(Object));
    });

    test('should track security-related errors', async () => {
      mockAxios.onGet(TEST_ENDPOINT).reply(403, {
        code: 'FORBIDDEN',
        message: 'Insufficient permissions'
      });

      await expect(get(TEST_ENDPOINT)).rejects.toThrow();
      expect(mockSecurityMonitor.trackError).toHaveBeenCalledWith('api.request.error', expect.any(Object));
    });
  });

  describe('Resilience Patterns', () => {
    test('should handle circuit breaker triggering', async () => {
      mockAxios.onGet(TEST_ENDPOINT).reply(500);

      for (let i = 0; i < 5; i++) {
        await expect(get(TEST_ENDPOINT)).rejects.toThrow();
      }

      expect(mockSecurityMonitor.trackMetric).toHaveBeenCalledWith('circuit.breaker.open', expect.any(Object));
    });

    test('should respect rate limiting', async () => {
      const requests = Array(10).fill(null).map(() => get(TEST_ENDPOINT));
      mockAxios.onGet(TEST_ENDPOINT).reply(200, { success: true, data: [] });

      await expect(Promise.all(requests)).rejects.toThrow(/rate limit exceeded/i);
    });

    test('should handle retry mechanism', async () => {
      mockAxios
        .onGet(TEST_ENDPOINT)
        .replyOnce(500)
        .onGet(TEST_ENDPOINT)
        .replyOnce(500)
        .onGet(TEST_ENDPOINT)
        .reply(200, { success: true, data: [] });

      const response = await get(TEST_ENDPOINT);
      expect(response.success).toBe(true);
      expect(mockSecurityMonitor.trackMetric).toHaveBeenCalledTimes(3);
    });

    test('should handle timeout with circuit breaker', async () => {
      mockAxios.onGet(TEST_ENDPOINT).timeout();

      await expect(get(TEST_ENDPOINT)).rejects.toThrow();
      expect(mockSecurityMonitor.trackError).toHaveBeenCalledWith('api.request.error', expect.any(Object));
    });
  });
});