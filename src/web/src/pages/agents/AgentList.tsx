import React, { useCallback, useEffect, useState, useMemo } from 'react';
import { View, useBreakpointValue } from '@aws-amplify/ui-react'; // v6.0.0
import { useNavigate } from 'react-router-dom'; // v6.0.0
import { withErrorBoundary } from 'react-error-boundary';

// Internal components
import AgentList from '../../components/agents/AgentList';
import PageHeader from '../../components/common/PageHeader';
import Button from '../../components/common/Button';
import { useAgent } from '../../hooks/useAgent';
import { useNotification, NotificationType } from '../../hooks/useNotification';
import { useTheme } from '../../hooks/useTheme';

// Types
import { Agent, AgentStatus, AgentType } from '../../types/agent';
import { LoadingState } from '../../types/common';

/**
 * Enhanced AgentList page component implementing AWS Amplify UI design patterns
 * with Material Design 3.0 principles and WCAG 2.1 Level AA accessibility.
 */
const AgentListPage: React.FC = () => {
  const navigate = useNavigate();
  const { theme } = useTheme();
  const { showNotification } = useNotification();
  const { agents, isLoading, error, createAgent } = useAgent();

  // State for filters and search
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedType, setSelectedType] = useState<AgentType | ''>('');
  const [selectedStatus, setSelectedStatus] = useState<AgentStatus | ''>('');

  // Responsive layout adjustments
  const isMobile = useBreakpointValue({
    base: true,
    small: true,
    medium: false,
    large: false,
    xl: false
  });

  // ARIA live region for dynamic updates
  const [ariaMessage, setAriaMessage] = useState('');

  // Memoized filtered agents
  const filteredAgents = useMemo(() => {
    let result = [...(agents || [])];

    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      result = result.filter(agent => 
        agent.name.toLowerCase().includes(query) ||
        agent.description.toLowerCase().includes(query)
      );
    }

    if (selectedType) {
      result = result.filter(agent => agent.type === selectedType);
    }

    if (selectedStatus) {
      result = result.filter(agent => agent.status === selectedStatus);
    }

    return result;
  }, [agents, searchQuery, selectedType, selectedStatus]);

  // Handle search changes with accessibility announcement
  const handleSearchChange = useCallback((query: string) => {
    setSearchQuery(query);
    setAriaMessage(`Found ${filteredAgents.length} agents matching search criteria`);
  }, [filteredAgents.length]);

  // Handle filter changes with accessibility announcement
  const handleFilterChange = useCallback((type: AgentType | '', status: AgentStatus | '') => {
    setSelectedType(type);
    setSelectedStatus(status);
    setAriaMessage(`Applied filters: ${type || 'all types'}, ${status || 'all statuses'}`);
  }, []);

  // Handle agent selection with navigation
  const handleAgentSelect = useCallback((agent: Agent) => {
    setAriaMessage(`Selected agent: ${agent.name}`);
    navigate(`/agents/${agent.id}`);
  }, [navigate]);

  // Handle create agent navigation
  const handleCreateAgent = useCallback(() => {
    setAriaMessage('Navigating to create agent page');
    navigate('/agents/create');
  }, [navigate]);

  // Error handling effect
  useEffect(() => {
    if (error) {
      showNotification({
        message: error.message || 'Failed to load agents',
        type: NotificationType.ERROR,
        duration: 5000,
        persistent: true
      });
    }
  }, [error, showNotification]);

  // Page header actions
  const headerActions = useMemo(() => [
    <Button
      key="create-agent"
      variant="primary"
      size={isMobile ? 'small' : 'medium'}
      onClick={handleCreateAgent}
      leftIcon={<span aria-hidden="true">+</span>}
      ariaLabel="Create new agent"
      testId="create-agent-button"
    >
      {isMobile ? 'Create' : 'Create Agent'}
    </Button>
  ], [isMobile, handleCreateAgent]);

  return (
    <View
      as="main"
      padding={theme.tokens.space.medium}
      className="agent-list-page"
      data-testid="agent-list-page"
    >
      {/* Accessibility live region */}
      <div
        role="status"
        aria-live="polite"
        className="sr-only"
      >
        {ariaMessage}
      </div>

      {/* Page Header */}
      <PageHeader
        title="Agents"
        subtitle="Create and manage AI agents"
        actions={headerActions}
        loading={isLoading}
      />

      {/* Agent List Component */}
      <AgentList
        agents={filteredAgents}
        onAgentSelect={handleAgentSelect}
        onSearchChange={handleSearchChange}
        onFilterChange={handleFilterChange}
        loadingState={isLoading ? LoadingState.LOADING : LoadingState.IDLE}
        className="agent-list-container"
      />
    </View>
  );
};

// Add display name for debugging
AgentListPage.displayName = 'AgentListPage';

// Wrap with error boundary
const AgentListPageWithErrorBoundary = withErrorBoundary(AgentListPage, {
  fallback: <div>Error loading agent list. Please try again later.</div>,
  onError: (error) => {
    console.error('Agent list error:', error);
  }
});

export default AgentListPageWithErrorBoundary;