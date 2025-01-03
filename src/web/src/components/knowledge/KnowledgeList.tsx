import React, { useMemo, useCallback, useEffect } from 'react';
import { Collection, Loader, Alert, useTheme } from '@aws-amplify/ui-react';
// @aws-amplify/ui-react version ^6.0.0
// react version ^18.2.0
import { useVirtualizer } from '@tanstack/react-virtual';
// @tanstack/react-virtual version ^3.0.0

import KnowledgeCard from './KnowledgeCard';
import { KnowledgeSource, KnowledgeSourceType, KnowledgeSourceStatus } from '../../types/knowledge';
import { useKnowledge } from '../../hooks/useKnowledge';

export interface KnowledgeListProps {
  /** Optional filter text for filtering knowledge sources */
  filter?: string;
  /** Optional field to sort knowledge sources by */
  sortBy?: keyof KnowledgeSource;
  /** Optional sort direction */
  sortDirection?: 'asc' | 'desc';
  /** Optional filter for source types */
  typeFilter?: KnowledgeSourceType[];
  /** Optional filter for source statuses */
  statusFilter?: KnowledgeSourceStatus[];
}

/**
 * Enhanced function to filter knowledge sources based on multiple criteria
 */
const filterSources = (
  sources: KnowledgeSource[],
  filter?: string,
  typeFilter?: KnowledgeSourceType[],
  statusFilter?: KnowledgeSourceStatus[]
): KnowledgeSource[] => {
  return sources.filter(source => {
    const matchesText = !filter || 
      source.name.toLowerCase().includes(filter.toLowerCase()) ||
      source.source_type.toLowerCase().includes(filter.toLowerCase());
    
    const matchesType = !typeFilter?.length || 
      typeFilter.includes(source.source_type);
    
    const matchesStatus = !statusFilter?.length || 
      statusFilter.includes(source.status);

    return matchesText && matchesType && matchesStatus;
  });
};

/**
 * Enhanced function to sort knowledge sources with multiple fields support
 */
const sortSources = (
  sources: KnowledgeSource[],
  sortBy?: keyof KnowledgeSource,
  sortDirection: 'asc' | 'desc' = 'asc'
): KnowledgeSource[] => {
  if (!sortBy) return sources;

  const sortedSources = [...sources].sort((a, b) => {
    const aValue = a[sortBy];
    const bValue = b[sortBy];

    if (aValue instanceof Date && bValue instanceof Date) {
      return aValue.getTime() - bValue.getTime();
    }

    if (typeof aValue === 'string' && typeof bValue === 'string') {
      return aValue.localeCompare(bValue);
    }

    return String(aValue).localeCompare(String(bValue));
  });

  return sortDirection === 'desc' ? sortedSources.reverse() : sortedSources;
};

/**
 * Enhanced component for displaying and managing a list of knowledge sources
 * with advanced features and accessibility support
 */
export const KnowledgeList: React.FC<KnowledgeListProps> = ({
  filter,
  sortBy,
  sortDirection = 'asc',
  typeFilter,
  statusFilter
}) => {
  const { tokens } = useTheme();
  const {
    sources,
    loading,
    error,
    progress,
    updateSource,
    deleteSource,
    syncSource,
    refreshSources
  } = useKnowledge();

  // Automatic refresh on mount and cleanup
  useEffect(() => {
    refreshSources();
    const interval = setInterval(refreshSources, 30000); // Refresh every 30 seconds
    return () => clearInterval(interval);
  }, [refreshSources]);

  // Process and sort sources
  const processedSources = useMemo(() => {
    const filteredSources = filterSources(sources, filter, typeFilter, statusFilter);
    return sortSources(filteredSources, sortBy, sortDirection);
  }, [sources, filter, typeFilter, statusFilter, sortBy, sortDirection]);

  // Virtual list configuration for performance
  const parentRef = React.useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({
    count: processedSources.length,
    getScrollElement: () => parentRef.current,
    estimateSize: useCallback(() => 200, []), // Estimated card height
    overscan: 5
  });

  // Event handlers with error handling
  const handleEdit = useCallback(async (source: KnowledgeSource) => {
    try {
      await updateSource(source.id, {
        name: source.name,
        connection_config: source.connection_config
      });
    } catch (err) {
      console.error('Failed to update source:', err);
    }
  }, [updateSource]);

  const handleDelete = useCallback(async (source: KnowledgeSource) => {
    try {
      await deleteSource(source.id);
    } catch (err) {
      console.error('Failed to delete source:', err);
    }
  }, [deleteSource]);

  const handleSync = useCallback(async (source: KnowledgeSource) => {
    try {
      await syncSource(source.id);
    } catch (err) {
      console.error('Failed to sync source:', err);
    }
  }, [syncSource]);

  // Loading state
  if (loading) {
    return (
      <Loader
        size="large"
        variation="linear"
        ariaLabel="Loading knowledge sources"
      />
    );
  }

  // Error state
  if (error) {
    return (
      <Alert
        variation="error"
        isDismissible={false}
        hasIcon={true}
        heading="Error loading knowledge sources"
      >
        {error}
      </Alert>
    );
  }

  return (
    <div
      ref={parentRef}
      style={{
        height: '100%',
        overflow: 'auto'
      }}
      role="region"
      aria-label="Knowledge sources list"
    >
      <Collection
        items={virtualizer.getVirtualItems()}
        type="grid"
        gap={tokens.space.medium}
        padding={tokens.space.medium}
        templateColumns={{
          base: '1fr',
          small: '1fr 1fr',
          medium: '1fr 1fr 1fr',
          large: '1fr 1fr 1fr 1fr'
        }}
      >
        {(virtualRow) => {
          const source = processedSources[virtualRow.index];
          return (
            <div
              key={source.id}
              style={{
                height: virtualRow.size,
                transform: `translateY(${virtualRow.start}px)`
              }}
            >
              <KnowledgeCard
                source={source}
                onEdit={handleEdit}
                onDelete={handleDelete}
                onSync={handleSync}
                loading={progress[source.id] !== undefined}
              />
            </div>
          );
        }}
      </Collection>
    </div>
  );
};

KnowledgeList.displayName = 'KnowledgeList';

export default KnowledgeList;