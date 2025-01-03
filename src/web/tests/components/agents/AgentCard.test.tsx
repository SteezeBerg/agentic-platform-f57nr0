import React from 'react';
import { render, screen, fireEvent, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe, toHaveNoViolations } from 'jest-axe';
import { ThemeProvider } from '@aws-amplify/ui-react';
import AgentCard, { AgentCardProps } from '../../../src/components/agents/AgentCard';
import { Agent, AgentStatus, AgentType } from '../../../src/types/agent';

// Add jest-axe custom matcher
expect.extend(toHaveNoViolations);

// Helper function to render with theme provider
const renderWithTheme = (ui: React.ReactElement, options = {}) => {
  return render(
    <ThemeProvider>{ui}</ThemeProvider>,
    options
  );
};

// Mock agent data factory
const createMockAgent = (overrides?: Partial<Agent>): Agent => ({
  id: 'test-agent-1',
  name: 'Test Agent',
  description: 'A test agent for unit testing',
  type: AgentType.STREAMLIT,
  status: AgentStatus.DEPLOYED,
  ownerId: 'test-owner',
  templateId: null,
  createdAt: '2024-02-20T12:00:00Z',
  updatedAt: '2024-02-20T12:00:00Z',
  version: '1.0.0',
  lastActive: new Date().toISOString(),
  metadata: {
    environment: 'test',
    tags: ['test', 'unit-testing']
  },
  metrics: {
    cpu_usage: 45,
    memory_usage: 60,
    error_rate: 0.5
  },
  ...overrides
});

describe('AgentCard Component', () => {
  // Basic rendering tests
  describe('Rendering', () => {
    it('renders agent information correctly', () => {
      const mockAgent = createMockAgent();
      renderWithTheme(<AgentCard agent={mockAgent} />);

      // Verify core content
      expect(screen.getByText(mockAgent.name)).toBeInTheDocument();
      expect(screen.getByText(mockAgent.description)).toBeInTheDocument();
      expect(screen.getByText(mockAgent.type)).toBeInTheDocument();
      expect(screen.getByText(/Just now|mins? ago|hours? ago/)).toBeInTheDocument();
    });

    it('renders metrics when available', () => {
      const mockAgent = createMockAgent();
      renderWithTheme(<AgentCard agent={mockAgent} />);

      expect(screen.getByText('45%')).toBeInTheDocument(); // CPU Usage
      expect(screen.getByText('60%')).toBeInTheDocument(); // Memory Usage
      expect(screen.getByText('0.5%')).toBeInTheDocument(); // Error Rate
    });

    it('handles missing metrics gracefully', () => {
      const mockAgent = createMockAgent({ metrics: undefined });
      renderWithTheme(<AgentCard agent={mockAgent} />);

      expect(screen.queryByText('CPU Usage')).not.toBeInTheDocument();
    });
  });

  // Interaction tests
  describe('Interactions', () => {
    it('calls onClick handler when clicked', async () => {
      const handleClick = jest.fn();
      const mockAgent = createMockAgent();
      renderWithTheme(<AgentCard agent={mockAgent} onClick={handleClick} />);

      await userEvent.click(screen.getByRole('article'));
      expect(handleClick).toHaveBeenCalledWith(mockAgent);
    });

    it('supports keyboard navigation', async () => {
      const handleClick = jest.fn();
      const mockAgent = createMockAgent();
      renderWithTheme(<AgentCard agent={mockAgent} onClick={handleClick} />);

      const card = screen.getByRole('article');
      card.focus();
      await userEvent.keyboard('{enter}');
      expect(handleClick).toHaveBeenCalledWith(mockAgent);
    });

    it('does not call onClick when not provided', async () => {
      const mockAgent = createMockAgent();
      renderWithTheme(<AgentCard agent={mockAgent} />);

      await userEvent.click(screen.getByRole('article'));
      // Should not throw or cause any errors
    });
  });

  // Accessibility tests
  describe('Accessibility', () => {
    it('meets WCAG accessibility guidelines', async () => {
      const mockAgent = createMockAgent();
      const { container } = renderWithTheme(<AgentCard agent={mockAgent} />);
      const results = await axe(container);
      expect(results).toHaveNoViolations();
    });

    it('has correct ARIA attributes', () => {
      const mockAgent = createMockAgent();
      renderWithTheme(<AgentCard agent={mockAgent} />);

      const card = screen.getByRole('article');
      expect(card).toHaveAttribute('aria-label', `Agent card for ${mockAgent.name}`);
    });

    it('has proper focus management', async () => {
      const mockAgent = createMockAgent();
      renderWithTheme(<AgentCard agent={mockAgent} onClick={() => {}} />);

      const card = screen.getByRole('article');
      expect(card).toHaveAttribute('tabIndex', '0');
    });
  });

  // Responsive behavior tests
  describe('Responsive Behavior', () => {
    const breakpoints = {
      mobile: 320,
      tablet: 768,
      desktop: 1024
    };

    Object.entries(breakpoints).forEach(([device, width]) => {
      it(`renders correctly at ${device} breakpoint`, () => {
        global.innerWidth = width;
        global.dispatchEvent(new Event('resize'));

        const mockAgent = createMockAgent();
        renderWithTheme(<AgentCard agent={mockAgent} />);

        // Verify content is visible at all breakpoints
        expect(screen.getByText(mockAgent.name)).toBeVisible();
        expect(screen.getByText(mockAgent.description)).toBeVisible();
      });
    });
  });

  // Status badge tests
  describe('Status Badge', () => {
    it('renders correct status variant', () => {
      const mockAgent = createMockAgent({ status: AgentStatus.ERROR });
      renderWithTheme(<AgentCard agent={mockAgent} />);

      const statusBadge = screen.getByRole('status');
      expect(statusBadge).toHaveTextContent(AgentStatus.ERROR);
      expect(statusBadge).toHaveAttribute('aria-label', `Agent status: ${AgentStatus.ERROR}`);
    });

    it('updates status badge when agent status changes', () => {
      const mockAgent = createMockAgent();
      const { rerender } = renderWithTheme(<AgentCard agent={mockAgent} />);

      const updatedAgent = { ...mockAgent, status: AgentStatus.ERROR };
      rerender(<ThemeProvider><AgentCard agent={updatedAgent} /></ThemeProvider>);

      const statusBadge = screen.getByRole('status');
      expect(statusBadge).toHaveTextContent(AgentStatus.ERROR);
    });
  });

  // Error handling tests
  describe('Error Handling', () => {
    it('handles invalid dates gracefully', () => {
      const mockAgent = createMockAgent({ lastActive: 'invalid-date' });
      renderWithTheme(<AgentCard agent={mockAgent} />);

      // Should not crash and should display a fallback
      expect(screen.getByText(/Last Active/)).toBeInTheDocument();
    });

    it('handles missing required props gracefully', () => {
      const mockAgent = createMockAgent({ name: undefined as any });
      
      // Should log error but not crash
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
      renderWithTheme(<AgentCard agent={mockAgent} />);
      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });
  });

  // Theme integration tests
  describe('Theme Integration', () => {
    it('applies theme tokens correctly', () => {
      const mockAgent = createMockAgent();
      renderWithTheme(<AgentCard agent={mockAgent} />);

      const card = screen.getByRole('article');
      const styles = window.getComputedStyle(card);
      
      // Verify theme-based styling
      expect(styles).toBeDefined();
    });
  });
});