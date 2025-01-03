import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { View, Heading, SearchField, SelectField, ToggleButton, useTheme } from '@aws-amplify/ui-react';
// @aws-amplify/ui-react version ^6.0.0
import { useDebounce } from 'use-debounce';
// use-debounce version ^9.0.0

import KnowledgeList from '../../components/knowledge/KnowledgeList';
import ErrorBoundary from '../../components/common/ErrorBoundary';
import { useKnowledge } from '../../hooks/useKnowledge';
import { KnowledgeSourceType, KnowledgeSourceStatus } from '../../types/knowledge';
import { useNotification, NotificationType } from '../../hooks/useNotification';

interface KnowledgeListPageState {
  filter: string;
  sourceTypeFilter: KnowledgeSourceType[];
  statusFilter: KnowledgeSourceStatus[];
  sortBy: string;
  sortDirection: 'asc' | 'desc';
  viewType: 'grid' | 'list';
}

/**
 * Enhanced page component for displaying and managing knowledge sources
 * with advanced filtering, sorting, and responsive layout capabilities
 */
const KnowledgeListPage: React.FC = () => {
  const { tokens } = useTheme();
  const { showNotification } = useNotification();
  
  // State management
  const [state, setState] = useState<KnowledgeListPageState>({
    filter: '',
    sourceTypeFilter: [],
    statusFilter: [],
    sortBy: 'name',
    sortDirection: 'asc',
    viewType: 'grid'
  });

  // Debounced filter for performance
  const [debouncedFilter] = useDebounce(state.filter, 300);

  // Knowledge hook integration
  const {
    sources,
    loading,
    error,
    progress,
    refreshSources,
    syncSource,
    deleteSource
  } = useKnowledge();

  // URL params synchronization
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const urlFilter = params.get('filter') || '';
    const urlSortBy = params.get('sortBy') || 'name';
    const urlSortDirection = params.get('sortDirection') as 'asc' | 'desc' || 'asc';
    
    setState(prev => ({
      ...prev,
      filter: urlFilter,
      sortBy: urlSortBy,
      sortDirection: urlSortDirection
    }));
  }, []);

  // Update URL when filters change
  useEffect(() => {
    const params = new URLSearchParams();
    if (state.filter) params.set('filter', state.filter);
    if (state.sortBy) params.set('sortBy', state.sortBy);
    if (state.sortDirection) params.set('sortDirection', state.sortDirection);
    
    window.history.replaceState(
      {},
      '',
      `${window.location.pathname}?${params.toString()}`
    );
  }, [state.filter, state.sortBy, state.sortDirection]);

  // Handlers
  const handleFilterChange = useCallback((value: string) => {
    setState(prev => ({ ...prev, filter: value }));
  }, []);

  const handleTypeFilterChange = useCallback((types: KnowledgeSourceType[]) => {
    setState(prev => ({ ...prev, sourceTypeFilter: types }));
  }, []);

  const handleStatusFilterChange = useCallback((statuses: KnowledgeSourceStatus[]) => {
    setState(prev => ({ ...prev, statusFilter: statuses }));
  }, []);

  const handleSortChange = useCallback((field: string) => {
    setState(prev => ({
      ...prev,
      sortBy: field,
      sortDirection: prev.sortBy === field && prev.sortDirection === 'asc' ? 'desc' : 'asc'
    }));
  }, []);

  const handleViewTypeChange = useCallback(() => {
    setState(prev => ({
      ...prev,
      viewType: prev.viewType === 'grid' ? 'list' : 'grid'
    }));
  }, []);

  const handleRefresh = useCallback(async () => {
    try {
      await refreshSources();
      showNotification({
        message: 'Knowledge sources refreshed successfully',
        type: NotificationType.SUCCESS
      });
    } catch (err) {
      showNotification({
        message: 'Failed to refresh knowledge sources',
        type: NotificationType.ERROR
      });
    }
  }, [refreshSources, showNotification]);

  // Memoized source type options
  const sourceTypeOptions = useMemo(() => 
    Object.values(KnowledgeSourceType).map(type => ({
      label: type.replace('_', ' ').toLowerCase(),
      value: type
    })), []
  );

  // Memoized status options
  const statusOptions = useMemo(() => 
    Object.values(KnowledgeSourceStatus).map(status => ({
      label: status.replace('_', ' ').toLowerCase(),
      value: status
    })), []
  );

  return (
    <ErrorBoundary>
      <View
        as="main"
        padding={tokens.space.large}
        backgroundColor={tokens.colors.background.secondary}
      >
        {/* Header Section */}
        <View
          as="header"
          marginBottom={tokens.space.large}
          display="flex"
          justifyContent="space-between"
          alignItems="center"
        >
          <Heading
            level={1}
            color={tokens.colors.font.primary}
            fontSize={tokens.fontSizes.xxxl}
          >
            Knowledge Sources
          </Heading>
        </View>

        {/* Controls Section */}
        <View
          display="flex"
          flexDirection={{ base: 'column', medium: 'row' }}
          gap={tokens.space.medium}
          marginBottom={tokens.space.large}
        >
          <SearchField
            label="Search sources"
            value={state.filter}
            onChange={e => handleFilterChange(e.target.value)}
            placeholder="Search by name or type..."
            size="large"
            hasSearchButton={true}
            hasSearchIcon={true}
          />

          <SelectField
            label="Source Type"
            value={state.sourceTypeFilter}
            onChange={e => handleTypeFilterChange(e.target.value as KnowledgeSourceType[])}
            placeholder="Filter by type"
            size="large"
            multiple
          >
            {sourceTypeOptions.map(option => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </SelectField>

          <SelectField
            label="Status"
            value={state.statusFilter}
            onChange={e => handleStatusFilterChange(e.target.value as KnowledgeSourceStatus[])}
            placeholder="Filter by status"
            size="large"
            multiple
          >
            {statusOptions.map(option => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </SelectField>

          <ToggleButton
            isPressed={state.viewType === 'list'}
            onChange={handleViewTypeChange}
            aria-label="Toggle view type"
          >
            {state.viewType === 'grid' ? 'Switch to List' : 'Switch to Grid'}
          </ToggleButton>
        </View>

        {/* Knowledge List Component */}
        <KnowledgeList
          filter={debouncedFilter}
          typeFilter={state.sourceTypeFilter}
          statusFilter={state.statusFilter}
          sortBy={state.sortBy}
          sortDirection={state.sortDirection}
          onRefresh={handleRefresh}
        />
      </View>
    </ErrorBoundary>
  );
};

KnowledgeListPage.displayName = 'KnowledgeListPage';

export default KnowledgeListPage;