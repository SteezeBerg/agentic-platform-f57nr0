import React from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';
import { MemoryRouter, useNavigate } from 'react-router-dom';
import { ThemeProvider } from '@aws-amplify/ui-react';

import AgentListPage from '../../src/pages/agents/AgentList';
import { useAgent } from '../../src/hooks/useAgent';
import { Agent, AgentStatus, AgentType } from '../../src/types/agent';
import { LoadingState } from '../../src/types/common';
import { theme } from '../../src/config/theme';

// Mock hooks
vi.mock('../../src/hooks/useAgent');
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: vi.fn()
  };
});

// Helper function to render component with router and theme
const renderWithRouter = (
  ui: React.ReactElement,
  { route = '/agents' } = {}
) => {
  const navigate = vi.fn();
  (useNavigate as jest.Mock).mockReturnValue(navigate);
  
  return {
    navigate,
    ...render(
      <MemoryRouter initialEntries={[route]}>
        <ThemeProvider theme={theme}>
          {ui}
        </ThemeProvider>
      </MemoryRouter>
    )
  };
};

// Mock agent data generator
const createMockAgent = (overrides = {}): Agent => ({
  id: crypto.randomUUID(),
  name: 'Test Agent',
  description: 'Test Description',
  type: AgentType.STREAMLIT,
  status: AgentStatus.DEPLOYED,
  lastActive: new Date().toISOString(),
  metrics: {
    cpu_usage: 25,
    memory_usage: 40,
    error_rate: 0.1
  },
  ...overrides
});

describe('AgentList Page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Loading States', () => {
    it('should render loading skeleton when fetching agents', () => {
      (useAgent as jest.Mock).mockReturnValue({
        agents: [],
        isLoading: true,
        error: null
      });

      renderWithRouter(<AgentListPage />);

      expect(screen.getByTestId('agent-list-loading')).toBeInTheDocument();
      expect(screen.getByRole('status')).toHaveAttribute('aria-busy', 'true');
    });

    it('should render error state with retry option', async () => {
      const error = new Error('Failed to load agents');
      (useAgent as jest.Mock).mockReturnValue({
        agents: [],
        isLoading: false,
        error
      });

      renderWithRouter(<AgentListPage />);

      expect(screen.getByText(/Failed to load agents/i)).toBeInTheDocument();
      const retryButton = screen.getByRole('button', { name: /retry/i });
      expect(retryButton).toBeInTheDocument();

      await userEvent.click(retryButton);
      expect(useAgent().retryOperation).toHaveBeenCalled();
    });
  });

  describe('Agent List Display', () => {
    const mockAgents = [
      createMockAgent({ name: 'BI Migration Agent', type: AgentType.STREAMLIT }),
      createMockAgent({ name: 'HR Assistant', type: AgentType.SLACK }),
      createMockAgent({ name: 'Data Modeler', type: AgentType.AWS_REACT })
    ];

    beforeEach(() => {
      (useAgent as jest.Mock).mockReturnValue({
        agents: mockAgents,
        isLoading: false,
        error: null
      });
    });

    it('should render list of agents with correct information', () => {
      renderWithRouter(<AgentListPage />);

      mockAgents.forEach(agent => {
        const card = screen.getByTestId(`agent-card-${agent.id}`);
        expect(card).toBeInTheDocument();
        expect(within(card).getByText(agent.name)).toBeInTheDocument();
        expect(within(card).getByText(agent.type)).toBeInTheDocument();
      });
    });

    it('should filter agents based on search input', async () => {
      renderWithRouter(<AgentListPage />);

      const searchInput = screen.getByRole('searchbox');
      await userEvent.type(searchInput, 'BI Migration');

      expect(screen.getByText('BI Migration Agent')).toBeInTheDocument();
      expect(screen.queryByText('HR Assistant')).not.toBeInTheDocument();
    });

    it('should filter agents by type', async () => {
      renderWithRouter(<AgentListPage />);

      const typeSelect = screen.getByLabelText(/filter by type/i);
      await userEvent.selectOptions(typeSelect, AgentType.STREAMLIT);

      expect(screen.getByText('BI Migration Agent')).toBeInTheDocument();
      expect(screen.queryByText('HR Assistant')).not.toBeInTheDocument();
    });
  });

  describe('Navigation and Interactions', () => {
    it('should navigate to create agent page when clicking create button', async () => {
      const { navigate } = renderWithRouter(<AgentListPage />);

      const createButton = screen.getByRole('button', { name: /create agent/i });
      await userEvent.click(createButton);

      expect(navigate).toHaveBeenCalledWith('/agents/create');
    });

    it('should navigate to agent details when clicking an agent card', async () => {
      const mockAgent = createMockAgent();
      (useAgent as jest.Mock).mockReturnValue({
        agents: [mockAgent],
        isLoading: false,
        error: null
      });

      const { navigate } = renderWithRouter(<AgentListPage />);

      const agentCard = screen.getByTestId(`agent-card-${mockAgent.id}`);
      await userEvent.click(agentCard);

      expect(navigate).toHaveBeenCalledWith(`/agents/${mockAgent.id}`);
    });
  });

  describe('Accessibility Features', () => {
    it('should support keyboard navigation', async () => {
      const mockAgent = createMockAgent();
      (useAgent as jest.Mock).mockReturnValue({
        agents: [mockAgent],
        isLoading: false,
        error: null
      });

      renderWithRouter(<AgentListPage />);

      const createButton = screen.getByRole('button', { name: /create agent/i });
      const agentCard = screen.getByTestId(`agent-card-${mockAgent.id}`);

      // Tab navigation
      await userEvent.tab();
      expect(createButton).toHaveFocus();

      await userEvent.tab();
      expect(screen.getByRole('searchbox')).toHaveFocus();

      // Enter key interaction
      await userEvent.tab();
      expect(agentCard).toHaveFocus();
      await userEvent.keyboard('{Enter}');
      expect(useNavigate()).toHaveBeenCalledWith(`/agents/${mockAgent.id}`);
    });

    it('should announce dynamic content changes', async () => {
      renderWithRouter(<AgentListPage />);

      const searchInput = screen.getByRole('searchbox');
      await userEvent.type(searchInput, 'BI');

      const liveRegion = screen.getByRole('status');
      expect(liveRegion).toHaveTextContent(/Found \d+ agents matching search/);
    });
  });

  describe('Responsive Design', () => {
    it('should adjust layout for mobile viewport', () => {
      global.innerWidth = 375;
      global.dispatchEvent(new Event('resize'));

      renderWithRouter(<AgentListPage />);

      const filterSection = screen.getByTestId('agent-list-filters');
      expect(filterSection).toHaveStyle({ flexDirection: 'column' });
    });

    it('should adjust layout for tablet viewport', () => {
      global.innerWidth = 768;
      global.dispatchEvent(new Event('resize'));

      renderWithRouter(<AgentListPage />);

      const agentGrid = screen.getByTestId('agent-grid');
      expect(agentGrid).toHaveStyle({ 
        gridTemplateColumns: 'repeat(2, 1fr)' 
      });
    });

    it('should adjust layout for desktop viewport', () => {
      global.innerWidth = 1440;
      global.dispatchEvent(new Event('resize'));

      renderWithRouter(<AgentListPage />);

      const agentGrid = screen.getByTestId('agent-grid');
      expect(agentGrid).toHaveStyle({ 
        gridTemplateColumns: 'repeat(4, 1fr)' 
      });
    });
  });
});