import { jest } from '@jest/globals'; // v29.7.0
import MockAdapter from 'axios-mock-adapter'; // v1.22.0
import { render, waitFor } from '@testing-library/react'; // v14.0.0
import { SecurityService } from '@company/security-service'; // v1.0.0
import { MonitoringService } from '@company/monitoring-service'; // v1.0.0

import { 
  AgentService,
  createAgent,
  getAgent,
  updateAgent,
  deleteAgent,
  listAgents,
  getAgentTemplates,
  validateAgentConfig,
  integrateKnowledgeSource,
  deployAgent,
  monitorAgent
} from '../../src/services/agent';
import { apiClient } from '../../src/services/api';
import { API_ENDPOINTS } from '../../src/config/api';
import { Permission, UserRole } from '../../src/types/auth';
import { LoadingState } from '../../src/types/common';

// Test constants
const TEST_AGENTS = {
  STREAMLIT: {
    id: 'test-streamlit-id',
    type: 'STREAMLIT',
    name: 'Test Streamlit Agent',
    description: 'Test agent for Streamlit',
    config: {
      port: 8501,
      theme: 'light'
    },
    status: 'ACTIVE',
    created_at: '2024-02-20T00:00:00Z',
    updated_at: '2024-02-20T00:00:00Z',
    version: 1
  },
  SLACK: {
    id: 'test-slack-id',
    type: 'SLACK',
    name: 'Test Slack Agent',
    description: 'Test agent for Slack',
    config: {
      channel: 'test-channel',
      token: 'test-token'
    },
    status: 'ACTIVE',
    created_at: '2024-02-20T00:00:00Z',
    updated_at: '2024-02-20T00:00:00Z',
    version: 1
  }
} as const;

const TEST_TEMPLATES = {
  BI_MIGRATION: {
    id: 'bi-migration-template',
    name: 'BI Migration Assistant',
    type: 'STREAMLIT',
    description: 'Template for BI migration projects',
    defaultConfig: {
      supportedSources: ['tableau', 'powerbi', 'cognos'],
      targetPlatform: 'sigma'
    }
  }
} as const;

const TEST_KNOWLEDGE_SOURCES = {
  CONFLUENCE: {
    id: 'confluence-source',
    type: 'CONFLUENCE',
    config: {
      baseUrl: 'https://confluence.example.com',
      spaceKey: 'TEST'
    }
  }
} as const;

describe('AgentService', () => {
  let mockAxios: MockAdapter;
  let agentService: AgentService;
  let securityService: jest.Mocked<typeof SecurityService>;
  let monitoringService: jest.Mocked<typeof MonitoringService>;

  beforeEach(() => {
    mockAxios = new MockAdapter(apiClient);
    agentService = new AgentService();
    
    // Mock security service
    securityService = {
      hasPermission: jest.fn().mockResolvedValue(true),
      validateToken: jest.fn().mockResolvedValue(true),
      trackSecurityEvent: jest.fn()
    };

    // Mock monitoring service
    monitoringService = {
      startSpan: jest.fn().mockReturnValue({ end: jest.fn() }),
      trackMetric: jest.fn(),
      trackError: jest.fn()
    };

    // Clear all mocks between tests
    jest.clearAllMocks();
  });

  afterEach(() => {
    mockAxios.reset();
  });

  describe('Agent Creation', () => {
    it('should create a Streamlit agent successfully', async () => {
      const agentConfig = {
        name: 'Test Streamlit Agent',
        type: 'STREAMLIT',
        description: 'Test description',
        configuration: TEST_AGENTS.STREAMLIT.config,
        knowledgeSources: []
      };

      mockAxios.onPost(API_ENDPOINTS.AGENTS).reply(200, {
        success: true,
        data: TEST_AGENTS.STREAMLIT
      });

      const result = await agentService.createAgent(agentConfig);

      expect(result.success).toBe(true);
      expect(result.data).toEqual(TEST_AGENTS.STREAMLIT);
      expect(securityService.hasPermission).toHaveBeenCalledWith(
        null,
        Permission.CREATE_AGENT
      );
    });

    it('should validate agent configuration before creation', async () => {
      const invalidConfig = {
        name: '', // Invalid - empty name
        type: 'INVALID_TYPE',
        description: 'Test',
        configuration: {},
        knowledgeSources: []
      };

      await expect(agentService.createAgent(invalidConfig))
        .rejects
        .toThrow('Missing required fields: name and type are required');
    });

    it('should handle rate limiting during creation', async () => {
      mockAxios.onPost(API_ENDPOINTS.AGENTS).reply(429, {
        success: false,
        error: {
          code: 'RATE_LIMIT_EXCEEDED',
          message: 'Too many requests'
        }
      });

      const config = {
        name: 'Test Agent',
        type: 'STREAMLIT',
        description: 'Test',
        configuration: {},
        knowledgeSources: []
      };

      await expect(agentService.createAgent(config))
        .rejects
        .toThrow('Too many requests');
      
      expect(monitoringService.trackError).toHaveBeenCalled();
    });
  });

  describe('Agent Deployment', () => {
    it('should deploy a Streamlit agent successfully', async () => {
      const deploymentConfig = {
        agentId: TEST_AGENTS.STREAMLIT.id,
        environment: 'production',
        configuration: {
          replicas: 2,
          resources: {
            cpu: '1',
            memory: '2Gi'
          }
        }
      };

      mockAxios.onPost(`${API_ENDPOINTS.AGENTS}/${TEST_AGENTS.STREAMLIT.id}/deploy`)
        .reply(200, {
          success: true,
          data: {
            deploymentId: 'test-deployment-id',
            status: 'DEPLOYED'
          }
        });

      const result = await agentService.deployAgent(deploymentConfig);

      expect(result.success).toBe(true);
      expect(result.data.status).toBe('DEPLOYED');
      expect(securityService.hasPermission).toHaveBeenCalledWith(
        null,
        Permission.DEPLOY_AGENT
      );
    });

    it('should validate deployment configuration', async () => {
      const invalidConfig = {
        agentId: TEST_AGENTS.STREAMLIT.id,
        environment: 'invalid_env',
        configuration: {}
      };

      await expect(agentService.deployAgent(invalidConfig))
        .rejects
        .toThrow('Invalid deployment environment');
    });
  });

  describe('Security Validation', () => {
    it('should enforce permission checks for agent operations', async () => {
      securityService.hasPermission.mockResolvedValueOnce(false);

      const config = {
        name: 'Test Agent',
        type: 'STREAMLIT',
        description: 'Test',
        configuration: {},
        knowledgeSources: []
      };

      await expect(agentService.createAgent(config))
        .rejects
        .toThrow('Insufficient permissions to create agent');
    });

    it('should track security events for sensitive operations', async () => {
      await agentService.deleteAgent(TEST_AGENTS.STREAMLIT.id);

      expect(securityService.trackSecurityEvent).toHaveBeenCalledWith({
        action: 'DELETE_AGENT',
        resourceId: TEST_AGENTS.STREAMLIT.id,
        timestamp: expect.any(String)
      });
    });
  });

  describe('Performance Monitoring', () => {
    it('should track operation metrics', async () => {
      await agentService.getAgent(TEST_AGENTS.STREAMLIT.id);

      expect(monitoringService.trackMetric).toHaveBeenCalledWith(
        'agent.get',
        expect.any(Object)
      );
    });

    it('should handle circuit breaker triggers', async () => {
      mockAxios.onGet(`${API_ENDPOINTS.AGENTS}/${TEST_AGENTS.STREAMLIT.id}`)
        .reply(500)
        .onGet(`${API_ENDPOINTS.AGENTS}/${TEST_AGENTS.STREAMLIT.id}`)
        .reply(500)
        .onGet(`${API_ENDPOINTS.AGENTS}/${TEST_AGENTS.STREAMLIT.id}`)
        .reply(500);

      await expect(agentService.getAgent(TEST_AGENTS.STREAMLIT.id))
        .rejects
        .toThrow('Circuit breaker opened');

      expect(monitoringService.trackError).toHaveBeenCalledWith(
        'circuit_breaker.open',
        expect.any(Object)
      );
    });
  });

  describe('Knowledge Integration', () => {
    it('should integrate knowledge sources successfully', async () => {
      const integrationConfig = {
        agentId: TEST_AGENTS.STREAMLIT.id,
        source: TEST_KNOWLEDGE_SOURCES.CONFLUENCE
      };

      mockAxios.onPost(`${API_ENDPOINTS.AGENTS}/${TEST_AGENTS.STREAMLIT.id}/knowledge`)
        .reply(200, {
          success: true,
          data: {
            integrationId: 'test-integration-id',
            status: 'ACTIVE'
          }
        });

      const result = await agentService.integrateKnowledgeSource(integrationConfig);

      expect(result.success).toBe(true);
      expect(result.data.status).toBe('ACTIVE');
    });

    it('should validate knowledge source limits', async () => {
      const existingSourcesResponse = {
        success: true,
        data: Array(10).fill(TEST_KNOWLEDGE_SOURCES.CONFLUENCE)
      };

      mockAxios.onGet(`${API_ENDPOINTS.AGENTS}/${TEST_AGENTS.STREAMLIT.id}/knowledge`)
        .reply(200, existingSourcesResponse);

      await expect(agentService.integrateKnowledgeSource({
        agentId: TEST_AGENTS.STREAMLIT.id,
        source: TEST_KNOWLEDGE_SOURCES.CONFLUENCE
      })).rejects.toThrow('Maximum of 10 knowledge sources allowed');
    });
  });
});