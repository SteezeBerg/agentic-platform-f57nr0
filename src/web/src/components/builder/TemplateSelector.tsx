/**
 * Enhanced template selection component for agent creation wizard
 * Implements AWS Amplify UI design patterns with Material Design 3.0 principles
 * @version 1.0.0
 */

import React, { useState, useCallback, useMemo } from 'react';
import {
  Grid,
  SearchField,
  SelectField,
  Card,
  Flex,
  Text,
  Badge,
  Image,
  Heading,
  useBreakpointValue,
  View,
  Button,
  Loader,
  Alert,
} from '@aws-amplify/ui-react';
import { useDebounce } from 'use-debounce';
import { AgentTemplate, AgentType } from '../../types/agent';

// Constants for responsive design
const GRID_COLUMNS = {
  base: 1,
  medium: 2,
  large: 4,
};

const GRID_GAP = {
  base: '16px',
  large: '24px',
};

interface TemplateSelectorProps {
  templates: AgentTemplate[];
  selectedTemplateId: string | null;
  onTemplateSelect: (template: AgentTemplate) => void;
  isLoading: boolean;
  error: Error | null;
}

interface FilterState {
  searchText: string;
  selectedType: AgentType | null;
  selectedTags: string[];
}

/**
 * Filters and sorts templates based on search criteria and filters
 */
const filterTemplates = (
  templates: AgentTemplate[],
  { searchText, selectedType, selectedTags }: FilterState
): AgentTemplate[] => {
  return templates.filter(template => {
    const matchesSearch = !searchText || [
      template.name,
      template.description,
      ...(template.metadata.tags || []),
    ].some(text => 
      text.toLowerCase().includes(searchText.toLowerCase())
    );

    const matchesType = !selectedType || template.type === selectedType;
    
    const matchesTags = selectedTags.length === 0 || 
      selectedTags.every(tag => template.metadata.tags?.includes(tag));

    return matchesSearch && matchesType && matchesTags;
  }).sort((a, b) => a.name.localeCompare(b.name));
};

/**
 * Enhanced template selector component with accessibility and responsive design
 */
export const TemplateSelector: React.FC<TemplateSelectorProps> = React.memo(({
  templates,
  selectedTemplateId,
  onTemplateSelect,
  isLoading,
  error
}) => {
  // State management
  const [filterState, setFilterState] = useState<FilterState>({
    searchText: '',
    selectedType: null,
    selectedTags: [],
  });

  // Debounce search input
  const [debouncedSearch] = useDebounce(filterState.searchText, 300);

  // Responsive columns calculation
  const columns = useBreakpointValue(GRID_COLUMNS);
  const gap = useBreakpointValue(GRID_GAP);

  // Memoized unique tags from all templates
  const availableTags = useMemo(() => {
    const tagSet = new Set<string>();
    templates.forEach(template => {
      template.metadata.tags?.forEach(tag => tagSet.add(tag));
    });
    return Array.from(tagSet).sort();
  }, [templates]);

  // Filter handlers
  const handleSearchChange = useCallback((value: string) => {
    setFilterState(prev => ({ ...prev, searchText: value }));
  }, []);

  const handleTypeChange = useCallback((value: string) => {
    setFilterState(prev => ({
      ...prev,
      selectedType: value ? (value as AgentType) : null
    }));
  }, []);

  const handleTagToggle = useCallback((tag: string) => {
    setFilterState(prev => ({
      ...prev,
      selectedTags: prev.selectedTags.includes(tag)
        ? prev.selectedTags.filter(t => t !== tag)
        : [...prev.selectedTags, tag]
    }));
  }, []);

  // Memoized filtered templates
  const filteredTemplates = useMemo(() => 
    filterTemplates(templates, {
      ...filterState,
      searchText: debouncedSearch
    }),
    [templates, filterState, debouncedSearch]
  );

  if (error) {
    return (
      <Alert
        variation="error"
        heading="Error loading templates"
        isDismissible={false}
      >
        {error.message}
      </Alert>
    );
  }

  return (
    <View
      as="section"
      role="region"
      aria-label="Template Selection"
      padding="1rem"
    >
      <Flex direction="column" gap="1rem">
        {/* Search and Filters */}
        <Flex
          direction={{ base: 'column', medium: 'row' }}
          gap="1rem"
          alignItems="flex-start"
        >
          <SearchField
            label="Search templates"
            placeholder="Search by name, description, or tags"
            onChange={e => handleSearchChange(e.target.value)}
            value={filterState.searchText}
            size="large"
            hasSearchButton
            hasSearchIcon
            flex={1}
          />
          
          <SelectField
            label="Filter by type"
            placeholder="All types"
            onChange={e => handleTypeChange(e.target.value)}
            value={filterState.selectedType || ''}
          >
            <option value="">All types</option>
            {Object.values(AgentType).map(type => (
              <option key={type} value={type}>
                {type.replace('_', ' ')}
              </option>
            ))}
          </SelectField>
        </Flex>

        {/* Tag filters */}
        <Flex gap="0.5rem" wrap="wrap">
          {availableTags.map(tag => (
            <Badge
              key={tag}
              onClick={() => handleTagToggle(tag)}
              variation={filterState.selectedTags.includes(tag) ? 'primary' : 'default'}
              style={{ cursor: 'pointer' }}
            >
              {tag}
            </Badge>
          ))}
        </Flex>

        {/* Template Grid */}
        {isLoading ? (
          <Flex justifyContent="center" padding="2rem">
            <Loader size="large" />
          </Flex>
        ) : (
          <Grid
            templateColumns={`repeat(${columns}, 1fr)`}
            gap={gap}
            padding="1rem 0"
          >
            {filteredTemplates.map(template => (
              <Card
                key={template.id}
                variation="elevated"
                padding="1rem"
                onClick={() => onTemplateSelect(template)}
                className={selectedTemplateId === template.id ? 'selected' : ''}
                tabIndex={0}
                onKeyPress={e => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    onTemplateSelect(template);
                  }
                }}
              >
                <Flex direction="column" gap="1rem">
                  {template.imageUrl && (
                    <Image
                      src={template.imageUrl}
                      alt={`${template.name} template`}
                      objectFit="cover"
                      width="100%"
                      height="200px"
                    />
                  )}
                  
                  <Heading level={3}>{template.name}</Heading>
                  <Text>{template.description}</Text>
                  
                  <Flex gap="0.5rem" wrap="wrap">
                    <Badge variation="info">{template.type}</Badge>
                    {template.metadata.tags?.map(tag => (
                      <Badge key={tag}>{tag}</Badge>
                    ))}
                  </Flex>

                  <Button
                    variation="primary"
                    isFullWidth
                    onClick={() => onTemplateSelect(template)}
                  >
                    Select Template
                  </Button>
                </Flex>
              </Card>
            ))}
          </Grid>
        )}

        {/* Empty state */}
        {!isLoading && filteredTemplates.length === 0 && (
          <Flex
            direction="column"
            alignItems="center"
            padding="2rem"
            gap="1rem"
          >
            <Heading level={4}>No templates found</Heading>
            <Text>Try adjusting your search criteria or filters</Text>
          </Flex>
        )}
      </Flex>
    </View>
  );
});

TemplateSelector.displayName = 'TemplateSelector';

export type { TemplateSelectorProps };