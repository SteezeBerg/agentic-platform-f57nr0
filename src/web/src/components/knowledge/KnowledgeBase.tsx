import React, { useState, useCallback, useEffect } from 'react';
import { 
  View, 
  Heading, 
  Tabs, 
  TabItem, 
  SearchField, 
  Button, 
  Alert,
  useTheme 
} from '@aws-amplify/ui-react';
// @aws-amplify/ui-react version ^6.0.0
import { debounce } from 'lodash';
// lodash version ^4.17.21

import KnowledgeList from './KnowledgeList';
import KnowledgeMetrics from './KnowledgeMetrics';
import ErrorBoundary from '../common/ErrorBoundary';
import { useKnowledge } from '../../hooks/useKnowledge';
import { KnowledgeSourceType, KnowledgeSourceStatus } from '../../types/knowledge';
import { LoadingState } from '../../types/common';
import { ERROR_MESSAGES } from '../../config/constants';

// Props interface with security configuration
interface KnowledgeBaseProps {
  className?: string;
  onError?: (error: Error) => void;
  securityConfig?: {
    maxSources?: number;
    allowedSourceTypes?: KnowledgeSourceType[];
    refreshInterval?: number;
  };
}

// Component implementation
const KnowledgeBase: React.FC<KnowledgeBaseProps> = ({
  className,
  onError,
  securityConfig = {
    maxSources: 10,
    refreshInterval: 30000
  }
}) => {
  const { tokens } = useTheme();
  const [searchFilter, setSearchFilter] = useState<string>('');
  const [activeTab, setActiveTab] = useState<string>('sources');
  const [selectedTypes, setSelectedTypes] = useState<KnowledgeSourceType[]>([]);
  const [selectedStatuses, setSelectedStatuses] = useState<KnowledgeSourceStatus[]>([]);

  // Initialize knowledge management hook
  const {
    sources,
    loading,
    error,
    progress,
    addSource,
    updateSource,
    deleteSource,
    syncSource,
    refreshSources
  } = useKnowledge();

  // Handle errors
  useEffect(() => {
    if (error && onError) {
      onError(error);
    }
  }, [error, onError]);

  // Debounced search handler
  const handleSearch = useCallback(
    debounce((value: string) => {
      // Sanitize input
      const sanitizedValue = value.replace(/[<>]/g, '').trim();
      setSearchFilter(sanitizedValue);
    }, 300),
    []
  );

  // Source type filter handler
  const handleTypeFilter = useCallback((type: KnowledgeSourceType) => {
    setSelectedTypes(prev => 
      prev.includes(type)
        ? prev.filter(t => t !== type)
        : [...prev, type]
    );
  }, []);

  // Status filter handler
  const handleStatusFilter = useCallback((status: KnowledgeSourceStatus) => {
    setSelectedStatuses(prev =>
      prev.includes(status)
        ? prev.filter(s => s !== status)
        : [...prev, status]
    );
  }, []);

  // Sync handler with security checks
  const handleSync = useCallback(async (sourceId: string) => {
    try {
      await syncSource(sourceId);
      await refreshSources();
    } catch (err) {
      console.error('Sync failed:', err);
      if (onError) {
        onError(err as Error);
      }
    }
  }, [syncSource, refreshSources, onError]);

  // Render error state
  if (error) {
    return (
      <Alert
        variation="error"
        isDismissible={false}
        hasIcon={true}
        heading="Error loading knowledge base"
      >
        {ERROR_MESSAGES.GENERIC_ERROR}
      </Alert>
    );
  }

  return (
    <ErrorBoundary
      onError={onError}
      fallback={
        <Alert variation="error">
          {ERROR_MESSAGES.GENERIC_ERROR}
        </Alert>
      }
    >
      <View className={className}>
        <Heading
          level={2}
          padding={tokens.space.medium}
        >
          Knowledge Base Management
        </Heading>

        <Tabs
          defaultValue={activeTab}
          onChange={value => setActiveTab(value)}
          spacing={tokens.space.medium}
        >
          <TabItem
            title="Knowledge Sources"
            value="sources"
          >
            <View padding={tokens.space.medium}>
              {/* Search and Filter Controls */}
              <View
                display="flex"
                justifyContent="space-between"
                alignItems="center"
                marginBottom={tokens.space.medium}
              >
                <SearchField
                  label="Search sources"
                  onChange={e => handleSearch(e.target.value)}
                  placeholder="Search by name or type..."
                  size="large"
                  hasSearchButton={true}
                  hasSearchIcon={true}
                />
                
                <Button
                  onClick={refreshSources}
                  isLoading={loading === LoadingState.LOADING}
                  loadingText="Refreshing..."
                  aria-label="Refresh knowledge sources"
                >
                  Refresh
                </Button>
              </View>

              {/* Filter Chips */}
              <View
                display="flex"
                gap={tokens.space.small}
                marginBottom={tokens.space.medium}
              >
                {Object.values(KnowledgeSourceType).map(type => (
                  <Button
                    key={type}
                    onClick={() => handleTypeFilter(type)}
                    variation={selectedTypes.includes(type) ? 'primary' : 'default'}
                    size="small"
                  >
                    {type}
                  </Button>
                ))}
              </View>

              {/* Knowledge Source List */}
              <KnowledgeList
                filter={searchFilter}
                typeFilter={selectedTypes}
                statusFilter={selectedStatuses}
                sortBy="last_sync"
                sortDirection="desc"
              />
            </View>
          </TabItem>

          <TabItem
            title="Metrics & Health"
            value="metrics"
          >
            <KnowledgeMetrics
              refreshInterval={securityConfig.refreshInterval}
              onError={onError}
              healthThreshold={80}
            />
          </TabItem>
        </Tabs>
      </View>
    </ErrorBoundary>
  );
};

KnowledgeBase.displayName = 'KnowledgeBase';

export default KnowledgeBase;