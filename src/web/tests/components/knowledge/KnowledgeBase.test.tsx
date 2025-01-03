import React from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import { axe } from 'jest-axe';
import KnowledgeBase from '../../src/components/knowledge/KnowledgeBase';
import { KnowledgeSourceType, KnowledgeSourceStatus } from '../../src/types/knowledge';
import { LoadingState } from '../../src/types/common';
import { ERROR_MESSAGES } from '../../src/config/constants';

// Mock the useKnowledge hook
jest.mock('../../src/hooks/useKnowledge', () => ({
  useKnowledge: jest.fn()
}));

// Sample test data
const sampleSources = [
  {
    id: 'confluence-1',
    name: 'Engineering Wiki',
    type: KnowledgeSourceType.CONFLUENCE,
    status: KnowledgeSourceStatus.CONNECTED,
    lastSync: '2024-02-20T14:30:00Z',
    metadata: {
      documentCount: 1250,
      syncStatus: 'completed',
      errorRate: 0.001
    }
  },
  {
    id: 'docebo-1',
    name: 'Training Portal',
    type: KnowledgeSourceType.DOCEBO,
    status: KnowledgeSourceStatus.SYNCING,
    lastSync: '2024-02-20T14:00:00Z',
    metadata: {
      documentCount: 350,
      syncStatus: 'in_progress',
      errorRate: 0
    }
  }
];

// Helper function to render component with providers
const renderWithProviders = (ui: React.ReactElement, preloadedState = {}) => {
  const store = configureStore({
    reducer: {
      knowledge: (state = preloadedState) => state
    }
  });

  return {
    ...render(
      <Provider store={store}>
        {ui}
      </Provider>
    ),
    store
  };
};

describe('KnowledgeBase Component', () => {
  // Reset mocks before each test
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Loading States', () => {
    it('renders loading state correctly', () => {
      const mockUseKnowledge = require('../../src/hooks/useKnowledge').useKnowledge;
      mockUseKnowledge.mockReturnValue({
        loading: LoadingState.LOADING,
        sources: [],
        error: null
      });

      renderWithProviders(<KnowledgeBase />);

      expect(screen.getByRole('progressbar')).toBeInTheDocument();
      expect(screen.getByText(/loading/i)).toBeInTheDocument();
    });

    it('renders error state correctly', () => {
      const mockUseKnowledge = require('../../src/hooks/useKnowledge').useKnowledge;
      mockUseKnowledge.mockReturnValue({
        loading: LoadingState.ERROR,
        sources: [],
        error: new Error(ERROR_MESSAGES.GENERIC_ERROR)
      });

      const onError = jest.fn();
      renderWithProviders(<KnowledgeBase onError={onError} />);

      expect(screen.getByRole('alert')).toBeInTheDocument();
      expect(screen.getByText(ERROR_MESSAGES.GENERIC_ERROR)).toBeInTheDocument();
      expect(onError).toHaveBeenCalled();
    });
  });

  describe('Knowledge Source Management', () => {
    it('displays knowledge sources correctly', () => {
      const mockUseKnowledge = require('../../src/hooks/useKnowledge').useKnowledge;
      mockUseKnowledge.mockReturnValue({
        loading: LoadingState.IDLE,
        sources: sampleSources,
        error: null
      });

      renderWithProviders(<KnowledgeBase />);

      sampleSources.forEach(source => {
        expect(screen.getByText(source.name)).toBeInTheDocument();
        expect(screen.getByText(source.type)).toBeInTheDocument();
      });
    });

    it('handles source filtering correctly', async () => {
      const mockUseKnowledge = require('../../src/hooks/useKnowledge').useKnowledge;
      mockUseKnowledge.mockReturnValue({
        loading: LoadingState.IDLE,
        sources: sampleSources,
        error: null
      });

      renderWithProviders(<KnowledgeBase />);

      const searchInput = screen.getByRole('searchbox');
      await userEvent.type(searchInput, 'Engineering');

      expect(screen.getByText('Engineering Wiki')).toBeInTheDocument();
      expect(screen.queryByText('Training Portal')).not.toBeInTheDocument();
    });

    it('handles source type filtering correctly', async () => {
      const mockUseKnowledge = require('../../src/hooks/useKnowledge').useKnowledge;
      mockUseKnowledge.mockReturnValue({
        loading: LoadingState.IDLE,
        sources: sampleSources,
        error: null
      });

      renderWithProviders(<KnowledgeBase />);

      const confluenceButton = screen.getByRole('button', { name: /confluence/i });
      await userEvent.click(confluenceButton);

      expect(screen.getByText('Engineering Wiki')).toBeInTheDocument();
      expect(screen.queryByText('Training Portal')).not.toBeInTheDocument();
    });
  });

  describe('Knowledge Source Operations', () => {
    it('handles source refresh correctly', async () => {
      const mockUseKnowledge = require('../../src/hooks/useKnowledge').useKnowledge;
      const refreshSources = jest.fn();
      mockUseKnowledge.mockReturnValue({
        loading: LoadingState.IDLE,
        sources: sampleSources,
        error: null,
        refreshSources
      });

      renderWithProviders(<KnowledgeBase />);

      const refreshButton = screen.getByRole('button', { name: /refresh/i });
      await userEvent.click(refreshButton);

      expect(refreshSources).toHaveBeenCalled();
    });

    it('handles source sync correctly', async () => {
      const mockUseKnowledge = require('../../src/hooks/useKnowledge').useKnowledge;
      const syncSource = jest.fn();
      mockUseKnowledge.mockReturnValue({
        loading: LoadingState.IDLE,
        sources: sampleSources,
        error: null,
        syncSource
      });

      renderWithProviders(<KnowledgeBase />);

      const syncButtons = screen.getAllByRole('button', { name: /sync/i });
      await userEvent.click(syncButtons[0]);

      expect(syncSource).toHaveBeenCalledWith(sampleSources[0].id);
    });
  });

  describe('Accessibility', () => {
    it('meets WCAG 2.1 Level AA requirements', async () => {
      const mockUseKnowledge = require('../../src/hooks/useKnowledge').useKnowledge;
      mockUseKnowledge.mockReturnValue({
        loading: LoadingState.IDLE,
        sources: sampleSources,
        error: null
      });

      const { container } = renderWithProviders(<KnowledgeBase />);
      const results = await axe(container);
      expect(results).toHaveNoViolations();
    });

    it('supports keyboard navigation', async () => {
      const mockUseKnowledge = require('../../src/hooks/useKnowledge').useKnowledge;
      mockUseKnowledge.mockReturnValue({
        loading: LoadingState.IDLE,
        sources: sampleSources,
        error: null
      });

      renderWithProviders(<KnowledgeBase />);

      const firstInteractive = screen.getByRole('searchbox');
      firstInteractive.focus();
      expect(document.activeElement).toBe(firstInteractive);

      fireEvent.keyDown(document.activeElement!, { key: 'Tab' });
      expect(document.activeElement).toBe(screen.getByRole('button', { name: /refresh/i }));
    });

    it('provides appropriate ARIA labels', () => {
      const mockUseKnowledge = require('../../src/hooks/useKnowledge').useKnowledge;
      mockUseKnowledge.mockReturnValue({
        loading: LoadingState.IDLE,
        sources: sampleSources,
        error: null
      });

      renderWithProviders(<KnowledgeBase />);

      expect(screen.getByRole('searchbox')).toHaveAttribute('aria-label');
      expect(screen.getByRole('button', { name: /refresh/i })).toHaveAttribute('aria-label');
      expect(screen.getByRole('region')).toHaveAttribute('aria-label');
    });
  });

  describe('Error Handling', () => {
    it('handles network errors gracefully', async () => {
      const mockUseKnowledge = require('../../src/hooks/useKnowledge').useKnowledge;
      const error = new Error('Network error');
      mockUseKnowledge.mockReturnValue({
        loading: LoadingState.ERROR,
        sources: [],
        error
      });

      const onError = jest.fn();
      renderWithProviders(<KnowledgeBase onError={onError} />);

      expect(screen.getByRole('alert')).toBeInTheDocument();
      expect(onError).toHaveBeenCalledWith(error);
    });

    it('displays error boundaries correctly', () => {
      const mockUseKnowledge = require('../../src/hooks/useKnowledge').useKnowledge;
      mockUseKnowledge.mockImplementation(() => {
        throw new Error('Component error');
      });

      const onError = jest.fn();
      renderWithProviders(<KnowledgeBase onError={onError} />);

      expect(screen.getByRole('alert')).toBeInTheDocument();
      expect(screen.getByText(/error/i)).toBeInTheDocument();
    });
  });
});