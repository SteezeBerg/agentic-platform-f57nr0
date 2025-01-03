import React, { useCallback, useMemo, useState, useEffect } from 'react';
import { 
  Grid, 
  SearchField, 
  SelectField, 
  useTheme, 
  Skeleton,
  View,
  Text 
} from '@aws-amplify/ui-react'; // v6.0.0
import { debounce } from 'lodash'; // v4.17.21
import { Analytics } from '@aws-amplify/analytics'; // v6.0.0

import AgentTemplateCard from './AgentTemplateCard';
import ErrorBoundary from '../common/ErrorBoundary';
import { AgentTemplate, AgentType } from '../../types/agent';
import { UI_CONSTANTS } from '../../config/constants';

// Constants for component behavior
const SEARCH_DEBOUNCE_MS = 300;
const GRID_GAP = '1rem';
const SKELETON_COUNT = 6;

export interface AgentTemplateListProps {
  /** Array of available agent templates */
  templates: AgentTemplate[];
  /** ID of currently selected template */
  selectedTemplateId: string | null;
  /** Callback when template is selected */
  onTemplateSelect: (template: AgentTemplate) => void;
  /** Loading state indicator */
  isLoading: boolean;
  /** Error state for template loading failures */
  error: Error | null;
}

/**
 * A responsive grid of agent templates with advanced filtering and search capabilities.
 * Implements AWS Amplify UI design patterns and WCAG 2.1 Level AA accessibility.
 */
export const AgentTemplateList = React.memo<AgentTemplateListProps>(({
  templates,
  selectedTemplateId,
  onTemplateSelect,
  isLoading,
  error
}) => {
  const { tokens } = useTheme();
  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState<AgentType | 'all'>('all');

  // Track template interactions for analytics
  useEffect(() => {
    Analytics.record({
      name: 'TemplateListView',
      attributes: {
        templateCount: templates.length,
        filterType: typeFilter
      }
    });
  }, [templates.length, typeFilter]);

  // Memoized filter function for templates
  const filteredTemplates = useMemo(() => {
    if (!templates.length) return [];

    return templates.filter(template => {
      const matchesSearch = searchQuery.trim() === '' || 
        template.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        template.description.toLowerCase().includes(searchQuery.toLowerCase());

      const matchesType = typeFilter === 'all' || template.type === typeFilter;

      return matchesSearch && matchesType;
    });
  }, [templates, searchQuery, typeFilter]);

  // Debounced search handler
  const handleSearchChange = useMemo(
    () => debounce((value: string) => {
      setSearchQuery(value);
      Analytics.record({
        name: 'TemplateSearch',
        attributes: { searchQuery: value }
      });
    }, SEARCH_DEBOUNCE_MS),
    []
  );

  // Type filter change handler
  const handleTypeFilterChange = useCallback((value: string) => {
    setTypeFilter(value as AgentType | 'all');
    Analytics.record({
      name: 'TemplateFilter',
      attributes: { filterType: value }
    });
  }, []);

  // Template selection handler with analytics
  const handleTemplateSelect = useCallback((template: AgentTemplate) => {
    onTemplateSelect(template);
    Analytics.record({
      name: 'TemplateSelect',
      attributes: {
        templateId: template.id,
        templateType: template.type
      }
    });
  }, [onTemplateSelect]);

  // Render loading skeletons
  if (isLoading) {
    return (
      <Grid
        templateColumns={{ base: '1fr', small: '1fr 1fr', medium: '1fr 1fr 1fr' }}
        gap={GRID_GAP}
        padding={tokens.space.medium}
      >
        {Array.from({ length: SKELETON_COUNT }).map((_, index) => (
          <Skeleton
            key={`skeleton-${index}`}
            height="320px"
            borderRadius={tokens.radii.medium}
          />
        ))}
      </Grid>
    );
  }

  // Render error state
  if (error) {
    return (
      <View
        padding={tokens.space.medium}
        backgroundColor={tokens.colors.background.error}
        borderRadius={tokens.radii.medium}
        role="alert"
      >
        <Text color={tokens.colors.text.error}>
          {error.message}
        </Text>
      </View>
    );
  }

  return (
    <ErrorBoundary>
      <View
        as="section"
        padding={tokens.space.medium}
        role="region"
        aria-label="Agent templates"
      >
        {/* Search and filter controls */}
        <Grid
          templateColumns={{ base: '1fr', small: '1fr 1fr' }}
          gap={tokens.space.medium}
          marginBottom={tokens.space.large}
        >
          <SearchField
            label="Search templates"
            placeholder="Search by name or description"
            onChange={(e) => handleSearchChange(e.target.value)}
            size="large"
            hasSearchButton={true}
            hasSearchIcon={true}
            aria-controls="template-grid"
          />
          <SelectField
            label="Filter by type"
            value={typeFilter}
            onChange={(e) => handleTypeFilterChange(e.target.value)}
            size="large"
          >
            <option value="all">All Types</option>
            {Object.values(AgentType).map((type) => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
          </SelectField>
        </Grid>

        {/* Template grid with responsive layout */}
        <Grid
          id="template-grid"
          templateColumns={{
            base: '1fr',
            small: '1fr 1fr',
            medium: '1fr 1fr 1fr',
            large: '1fr 1fr 1fr 1fr'
          }}
          gap={GRID_GAP}
          role="list"
          aria-live="polite"
        >
          {filteredTemplates.map((template) => (
            <View
              key={template.id}
              role="listitem"
              minHeight={UI_CONSTANTS.MINIMUM_TARGET_SIZE}
            >
              <AgentTemplateCard
                template={template}
                onSelect={handleTemplateSelect}
                isSelected={template.id === selectedTemplateId}
                testId={`template-card-${template.id}`}
              />
            </View>
          ))}
        </Grid>

        {/* Empty state */}
        {filteredTemplates.length === 0 && (
          <View
            textAlign="center"
            padding={tokens.space.xl}
            color={tokens.colors.text.secondary}
          >
            <Text>
              {searchQuery || typeFilter !== 'all'
                ? 'No templates match your search criteria'
                : 'No templates available'}
            </Text>
          </View>
        )}
      </View>
    </ErrorBoundary>
  );
});

AgentTemplateList.displayName = 'AgentTemplateList';

export default AgentTemplateList;