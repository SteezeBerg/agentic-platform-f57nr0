import React from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ThemeProvider } from '@aws-amplify/ui-react';
import axe from '@axe-core/react';

import DeploymentDashboard from '../../../../src/components/deployment/DeploymentDashboard';
import { DeploymentEnvironment, DeploymentStatus, DeploymentHealth } from '../../../../src/types/deployment';
import useWebSocket from '../../../../src/hooks/useWebSocket';

// Mock dependencies
vi.mock('../../../../src/hooks/useWebSocket');
vi.mock('@tanstack/react-query', async () => {
  const actual = await vi.importActual('@tanstack/react-query');
  return {
    ...actual,
    useQuery: vi.fn()
  };
});

// Helper function to render component with providers
const renderWithProviders = (ui: React.ReactNode, theme = 'light') => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false
      }
    }
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <ThemeProvider theme={{ name: theme }}>
        {ui}
      </ThemeProvider>
    </QueryClientProvider>
  );
};

// Mock deployment data generator
const mockDeploymentData = (environment: DeploymentEnvironment, count = 3) => {
  return Array.from({ length: count }, (_, i) => ({
    id: `deployment-${i}`,
    agent_id: `agent-${i}`,
    environment,
    status: i % 2 === 0 ? 'completed' : 'in_progress' as DeploymentStatus,
    health: i % 2 === 0 ? 'healthy' : 'degraded' as DeploymentHealth,
    last_active: new Date().toISOString(),
    metrics: {
      resource_utilization: {
        cpu_usage: 75 + i,
        memory_usage: 60 + i,
        storage_usage: 45 + i
      },
      performance: {
        request_count: 1000 + i * 100,
        error_rate: 0.5 + i * 0.1,
        latency: {
          p50: 100 + i * 10,
          p90: 200 + i * 10,
          p99: 300 + i * 10
        }
      },
      availability: {
        uptime: 99.9,
        success_rate: 99.5,
        health_check_success: 100
      },
      costs: {
        hourly_cost: 0.5,
        monthly_projected: 360
      }
    }
  }));
};

// Mock WebSocket setup
const setupWebSocketMock = (initialMetrics: any) => {
  const mockWs = {
    subscribe: vi.fn(),
    state: {
      connected: true,
      error: null
    },
    metrics: initialMetrics
  };
  (useWebSocket as jest.Mock).mockReturnValue(mockWs);
  return mockWs;
};

describe('DeploymentDashboard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders deployment list with correct status and health indicators', async () => {
    const mockDeployments = mockDeploymentData('production');
    vi.mocked(useQuery).mockReturnValue({
      data: mockDeployments,
      isLoading: false,
      error: null,
      refetch: vi.fn()
    });

    renderWithProviders(
      <DeploymentDashboard selectedEnvironment="production" />
    );

    // Verify deployments are rendered
    await waitFor(() => {
      mockDeployments.forEach(deployment => {
        expect(screen.getByText(deployment.agent_id)).toBeInTheDocument();
        expect(screen.getByText(deployment.status)).toBeInTheDocument();
        expect(screen.getByText(deployment.health)).toBeInTheDocument();
      });
    });

    // Verify metrics display
    mockDeployments.forEach(deployment => {
      const metrics = deployment.metrics.resource_utilization;
      expect(screen.getByText(`${metrics.cpu_usage}%`)).toBeInTheDocument();
      expect(screen.getByText(`${metrics.memory_usage}%`)).toBeInTheDocument();
    });
  });

  it('handles environment filtering and updates', async () => {
    const mockDeployments = mockDeploymentData('production');
    const onEnvironmentChange = vi.fn();
    
    vi.mocked(useQuery).mockReturnValue({
      data: mockDeployments,
      isLoading: false,
      error: null,
      refetch: vi.fn()
    });

    renderWithProviders(
      <DeploymentDashboard 
        selectedEnvironment="production"
        onEnvironmentChange={onEnvironmentChange}
      />
    );

    // Change environment
    const envSelect = screen.getByLabelText('Environment');
    await userEvent.selectOptions(envSelect, 'staging');

    expect(onEnvironmentChange).toHaveBeenCalledWith('staging');
    expect(envSelect).toHaveValue('staging');
  });

  it('updates metrics in real-time via WebSocket', async () => {
    const mockDeployments = mockDeploymentData('production');
    const mockWs = setupWebSocketMock({
      messagesSent: 0,
      messagesReceived: 0
    });

    vi.mocked(useQuery).mockReturnValue({
      data: mockDeployments,
      isLoading: false,
      error: null,
      refetch: vi.fn()
    });

    renderWithProviders(
      <DeploymentDashboard 
        selectedEnvironment="production"
        refreshInterval={1000}
      />
    );

    // Verify WebSocket subscription
    expect(mockWs.subscribe).toHaveBeenCalled();

    // Simulate metric update
    const updatedMetrics = {
      deployment_id: mockDeployments[0].id,
      metrics: {
        resource_utilization: {
          cpu_usage: 85,
          memory_usage: 70
        }
      }
    };

    // Trigger metric update
    const subscription = mockWs.subscribe.mock.calls[0][1];
    subscription(updatedMetrics);

    // Verify metrics update
    await waitFor(() => {
      expect(screen.getByText('85%')).toBeInTheDocument();
      expect(screen.getByText('70%')).toBeInTheDocument();
    });
  });

  it('maintains accessibility compliance', async () => {
    const mockDeployments = mockDeploymentData('production');
    vi.mocked(useQuery).mockReturnValue({
      data: mockDeployments,
      isLoading: false,
      error: null,
      refetch: vi.fn()
    });

    const { container } = renderWithProviders(
      <DeploymentDashboard selectedEnvironment="production" />
    );

    // Run accessibility tests
    const results = await axe(container);
    expect(results).toHaveNoViolations();

    // Verify keyboard navigation
    const envSelect = screen.getByLabelText('Environment');
    envSelect.focus();
    expect(document.activeElement).toBe(envSelect);

    // Verify ARIA attributes
    expect(screen.getByRole('region')).toHaveAttribute('aria-label', 'Deployment Dashboard');
    expect(envSelect).toHaveAttribute('aria-label', 'Select environment');
  });

  it('handles loading and error states appropriately', async () => {
    // Test loading state
    vi.mocked(useQuery).mockReturnValue({
      data: undefined,
      isLoading: true,
      error: null,
      refetch: vi.fn()
    });

    renderWithProviders(
      <DeploymentDashboard selectedEnvironment="production" />
    );

    expect(screen.getByRole('alert')).toHaveTextContent(/loading/i);

    // Test error state
    vi.mocked(useQuery).mockReturnValue({
      data: undefined,
      isLoading: false,
      error: new Error('Failed to fetch deployments'),
      refetch: vi.fn()
    });

    renderWithProviders(
      <DeploymentDashboard selectedEnvironment="production" />
    );

    expect(screen.getByRole('alert')).toHaveTextContent(/failed to fetch deployments/i);
    expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument();
  });
});