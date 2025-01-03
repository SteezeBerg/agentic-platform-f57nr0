import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Collection, SearchField, SelectField, Flex, Loader, useTheme } from '@aws-amplify/ui-react'; // ^6.0.0
import AgentCard from './AgentCard';
import { Agent, AgentType, AgentStatus } from '../../types/agent';
import { LoadingState } from '../../types/common';

export interface AgentListProps {
  /** Callback function when an agent is selected */
  onAgentSelect: (agent: Agent) => void;
  /** Optional CSS class name for custom styling */
  className?: string;
  /** Optional initial filter values */
  initialFilters?: {
    type?: AgentType;
    status?: AgentStatus;
  };
  /** List of agents to display */
  agents: Agent[];
  /** Loading state for the agent list */
  loadingState?: LoadingState;
}

/**
 * A responsive grid component that displays a filterable list of agents
 * Implements AWS Amplify UI design patterns and Material Design 3.0 principles
 * Ensures WCAG 2.1 Level AA compliance with comprehensive accessibility support
 */
export const AgentList: React.FC<AgentListProps> = React.memo(({
  onAgentSelect,
  className = '',
  initialFilters = {},
  agents,
  loadingState = LoadingState.IDLE
}) => {
  const { tokens } = useTheme();
  const [filteredAgents, setFilteredAgents] = useState<Agent[]>(agents);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedType, setSelectedType] = useState<AgentType | ''>(initialFilters.type || '');
  const [selectedStatus, setSelectedStatus] = useState<AgentStatus | ''>(initialFilters.status || '');

  // Memoized type and status options
  const typeOptions = useMemo(() => 
    ['', ...Object.values(AgentType)].map(type => ({
      label: type || 'All Types',
      value: type
    })), []
  );

  const statusOptions = useMemo(() => 
    ['', ...Object.values(AgentStatus)].map(status => ({
      label: status || 'All Statuses',
      value: status
    })), []
  );

  // Debounced search handler
  const handleSearch = useCallback((query: string) => {
    const trimmedQuery = query.trim().toLowerCase();
    setSearchQuery(trimmedQuery);
  }, []);

  // Filter handler
  const handleFilter = useCallback((type: AgentType | '', status: AgentStatus | '') => {
    setSelectedType(type);
    setSelectedStatus(status);
  }, []);

  // Apply filters and search
  useEffect(() => {
    let result = [...agents];

    if (searchQuery) {
      result = result.filter(agent => 
        agent.name.toLowerCase().includes(searchQuery) ||
        agent.description.toLowerCase().includes(searchQuery)
      );
    }

    if (selectedType) {
      result = result.filter(agent => agent.type === selectedType);
    }

    if (selectedStatus) {
      result = result.filter(agent => agent.status === selectedStatus);
    }

    setFilteredAgents(result);
  }, [agents, searchQuery, selectedType, selectedStatus]);

  // Responsive grid breakpoints
  const breakpoints = {
    base: 1,
    small: 1,
    medium: 2,
    large: 3,
    xl: 4
  };

  return (
    <Flex
      direction="column"
      gap={tokens.space.medium}
      className={`agent-list ${className}`}
      role="region"
      aria-label="Agent list"
      aria-busy={loadingState === LoadingState.LOADING}
    >
      {/* Filters Section */}
      <Flex
        direction={{ base: 'column', medium: 'row' }}
        gap={tokens.space.small}
        alignItems="flex-start"
        padding={tokens.space.medium}
        backgroundColor={tokens.colors.background.secondary}
        borderRadius={tokens.radii.medium}
      >
        <SearchField
          label="Search agents"
          placeholder="Search by name or description"
          onChange={e => handleSearch(e.target.value)}
          size="small"
          flex={1}
          aria-controls="agent-grid"
        />
        <SelectField
          label="Filter by type"
          value={selectedType}
          onChange={e => handleFilter(e.target.value as AgentType, selectedStatus)}
          options={typeOptions}
          size="small"
          flex={{ base: 1, medium: 'initial' }}
        />
        <SelectField
          label="Filter by status"
          value={selectedStatus}
          onChange={e => handleFilter(selectedType, e.target.value as AgentStatus)}
          options={statusOptions}
          size="small"
          flex={{ base: 1, medium: 'initial' }}
        />
      </Flex>

      {/* Loading State */}
      {loadingState === LoadingState.LOADING && (
        <Flex justifyContent="center" padding={tokens.space.large}>
          <Loader size="large" />
        </Flex>
      )}

      {/* Empty State */}
      {filteredAgents.length === 0 && loadingState !== LoadingState.LOADING && (
        <Flex
          direction="column"
          alignItems="center"
          padding={tokens.space.xl}
          gap={tokens.space.medium}
        >
          <Text
            fontSize={tokens.fontSizes.large}
            color={tokens.colors.font.secondary}
          >
            No agents found
          </Text>
          <Text color={tokens.colors.font.tertiary}>
            Try adjusting your search or filters
          </Text>
        </Flex>
      )}

      {/* Agent Grid */}
      <Collection
        id="agent-grid"
        items={filteredAgents}
        type="grid"
        gap={tokens.space.medium}
        padding={tokens.space.small}
        templateColumns={{
          base: 'repeat(1, 1fr)',
          small: 'repeat(1, 1fr)',
          medium: 'repeat(2, 1fr)',
          large: 'repeat(3, 1fr)',
          xl: 'repeat(4, 1fr)'
        }}
      >
        {(agent: Agent) => (
          <AgentCard
            key={agent.id}
            agent={agent}
            onClick={() => onAgentSelect(agent)}
            testId={`agent-card-${agent.id}`}
          />
        )}
      </Collection>
    </Flex>
  );
});

AgentList.displayName = 'AgentList';

export default AgentList;