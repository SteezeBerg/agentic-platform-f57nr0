import React from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import { BrowserRouter } from 'react-router-dom';
import { axe } from '@axe-core/react';

import AgentBuilder from '../../../src/components/builder/AgentBuilder';
import { createAgent } from '../../../src/store/agents/actions';
import { agentSelectors } from '../../../src/store/agents/selectors';
import { LoadingState } from '../../../types/common';
import { AgentStatus } from '../../../types/agent';

// Mock dependencies
jest.mock('../../../src/store/agents/actions');
jest.mock('../../../src/store/agents/selectors');

// Test data
const mockTemplates = [
  {
    id: 'template-1',
    name: 'BI Migration Agent',
    description: 'Template for BI migration automation',
    type: 'streamlit',
    defaultConfig: {
      capabilities: ['report_analysis', 'data_migration'],
      knowledgeSourceIds: []
    }
  }
];

const mockAgentConfig = {
  name: 'Test Agent',
  description: 'Test Description',
  type: 'streamlit',
  configuration: {
    memory: 2048,
    timeout: 300
  },
  knowledgeSources: ['source-1']
};

// Helper function to render with providers
const renderWithProviders = (
  ui: React.ReactElement,
  {
    initialState = {},
    store = configureStore({
      reducer: {
        agents: (state = initialState) => state
      }
    }),
    ...renderOptions
  } = {}
) => {
  return {
    ...render(
      <Provider store={store}>
        <BrowserRouter>
          {ui}
        </BrowserRouter>
      </Provider>,
      renderOptions
    ),
    store
  };
};

describe('AgentBuilder Component', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (agentSelectors.selectAgentTemplates as jest.Mock).mockReturnValue(mockTemplates);
  });

  describe('Component Rendering', () => {
    it('should render initial step with template selection', () => {
      renderWithProviders(<AgentBuilder onSave={jest.fn()} onError={jest.fn()} />);
      
      expect(screen.getByText('Template')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Next step' })).toBeDisabled();
    });

    it('should display progress indicator with current step', () => {
      renderWithProviders(<AgentBuilder onSave={jest.fn()} onError={jest.fn()} />);
      
      const stepper = screen.getByRole('navigation', { name: 'Agent creation steps' });
      expect(stepper).toBeInTheDocument();
      expect(within(stepper).getByText('Template')).toHaveAttribute('aria-current', 'step');
    });

    it('should meet WCAG 2.1 Level AA requirements', async () => {
      const { container } = renderWithProviders(
        <AgentBuilder onSave={jest.fn()} onError={jest.fn()} />
      );
      
      const results = await axe(container);
      expect(results).toHaveNoViolations();
    });

    it('should support keyboard navigation', () => {
      renderWithProviders(<AgentBuilder onSave={jest.fn()} onError={jest.fn()} />);
      
      const nextButton = screen.getByRole('button', { name: 'Next step' });
      fireEvent.keyDown(nextButton, { key: 'Tab' });
      expect(document.activeElement).not.toBe(nextButton);
    });
  });

  describe('Navigation and State Management', () => {
    it('should enable next step when current step is valid', async () => {
      renderWithProviders(<AgentBuilder onSave={jest.fn()} onError={jest.fn()} />);
      
      // Select a template
      const template = screen.getByText('BI Migration Agent');
      await userEvent.click(template);
      
      expect(screen.getByRole('button', { name: 'Next step' })).toBeEnabled();
    });

    it('should prevent navigation when step is incomplete', async () => {
      renderWithProviders(<AgentBuilder onSave={jest.fn()} onError={jest.fn()} />);
      
      const nextButton = screen.getByRole('button', { name: 'Next step' });
      await userEvent.click(nextButton);
      
      expect(screen.getByText('Please check your input and try again.')).toBeInTheDocument();
    });

    it('should persist step data during navigation', async () => {
      const { store } = renderWithProviders(
        <AgentBuilder onSave={jest.fn()} onError={jest.fn()} />
      );

      // Complete template step
      await userEvent.click(screen.getByText('BI Migration Agent'));
      await userEvent.click(screen.getByRole('button', { name: 'Next step' }));

      // Verify data persistence
      expect(store.getState().agents.selectedTemplate).toBe('template-1');
    });
  });

  describe('Template Selection and Validation', () => {
    it('should load and display available templates', () => {
      renderWithProviders(<AgentBuilder onSave={jest.fn()} onError={jest.fn()} />);
      
      expect(screen.getByText('BI Migration Agent')).toBeInTheDocument();
      expect(screen.getByText('Template for BI migration automation')).toBeInTheDocument();
    });

    it('should handle template loading errors', () => {
      (agentSelectors.selectAgentTemplates as jest.Mock).mockImplementation(() => {
        throw new Error('Failed to load templates');
      });

      renderWithProviders(<AgentBuilder onSave={jest.fn()} onError={jest.fn()} />);
      
      expect(screen.getByText('An unexpected error occurred')).toBeInTheDocument();
    });
  });

  describe('Configuration Management', () => {
    it('should validate configuration format', async () => {
      renderWithProviders(<AgentBuilder onSave={jest.fn()} onError={jest.fn()} />);
      
      // Navigate to configuration step
      await userEvent.click(screen.getByText('BI Migration Agent'));
      await userEvent.click(screen.getByRole('button', { name: 'Next step' }));

      // Submit invalid config
      await userEvent.click(screen.getByRole('button', { name: 'Next step' }));
      
      expect(screen.getByText('Please check your input and try again.')).toBeInTheDocument();
    });

    it('should show validation errors for invalid config', async () => {
      renderWithProviders(<AgentBuilder onSave={jest.fn()} onError={jest.fn()} />);
      
      // Navigate to configuration step
      await userEvent.click(screen.getByText('BI Migration Agent'));
      await userEvent.click(screen.getByRole('button', { name: 'Next step' }));

      // Submit empty form
      await userEvent.click(screen.getByRole('button', { name: 'Next step' }));
      
      expect(screen.getByText('Name is required')).toBeInTheDocument();
    });
  });

  describe('Error Handling and Recovery', () => {
    it('should handle API errors gracefully', async () => {
      const onError = jest.fn();
      (createAgent as jest.Mock).mockRejectedValue(new Error('API Error'));

      renderWithProviders(
        <AgentBuilder onSave={jest.fn()} onError={onError} />
      );

      // Complete form and submit
      await userEvent.click(screen.getByText('BI Migration Agent'));
      await userEvent.click(screen.getByRole('button', { name: 'Save agent configuration' }));

      expect(onError).toHaveBeenCalled();
      expect(screen.getByText('An unexpected error occurred')).toBeInTheDocument();
    });

    it('should preserve user input during errors', async () => {
      renderWithProviders(<AgentBuilder onSave={jest.fn()} onError={jest.fn()} />);
      
      // Fill form
      await userEvent.type(screen.getByLabelText('Name'), 'Test Agent');
      
      // Trigger error
      await userEvent.click(screen.getByRole('button', { name: 'Next step' }));
      
      expect(screen.getByLabelText('Name')).toHaveValue('Test Agent');
    });
  });
});