/**
 * Redux selector functions for knowledge base state management
 * Provides memoized, type-safe selectors with comprehensive null checking
 * @version 1.0.0
 */

import { createSelector } from '@reduxjs/toolkit'; // v2.0.0
import { KnowledgeState } from './types';
import { KnowledgeSource } from '../../types/knowledge';

/**
 * Base selector for accessing knowledge state slice with type safety
 */
export const selectKnowledgeState = (state: { knowledge: KnowledgeState }): KnowledgeState => state.knowledge;

/**
 * Memoized selector for retrieving sorted array of knowledge sources
 * Converts sources object to array and sorts by name
 */
export const selectKnowledgeSources = createSelector(
  [selectKnowledgeState],
  (knowledgeState): KnowledgeSource[] => {
    const sources = Object.values(knowledgeState.sources);
    return sources.sort((a, b) => {
      // Primary sort by name
      const nameCompare = a.name.localeCompare(b.name);
      if (nameCompare !== 0) return nameCompare;
      
      // Secondary sort by last sync timestamp
      return b.last_sync.getTime() - a.last_sync.getTime();
    });
  }
);

/**
 * Enhanced selector for currently selected knowledge source with strict null checking
 * Returns null if no source is selected or if selected source doesn't exist
 */
export const selectSelectedKnowledgeSource = createSelector(
  [selectKnowledgeState],
  (knowledgeState): KnowledgeSource | null => {
    const { selectedSourceId, sources } = knowledgeState;
    if (!selectedSourceId) return null;
    return sources[selectedSourceId] || null;
  }
);

/**
 * Type-safe selector for retrieving current knowledge loading state
 */
export const selectKnowledgeLoadingState = createSelector(
  [selectKnowledgeState],
  (knowledgeState) => knowledgeState.loadingState
);

/**
 * Enhanced selector for retrieving detailed indexing progress with status tracking
 * Returns a record of source IDs mapped to their indexing progress information
 */
export const selectKnowledgeIndexingProgress = createSelector(
  [selectKnowledgeState],
  (knowledgeState) => knowledgeState.indexingProgress
);

/**
 * Memoized selector for retrieving active knowledge sources (CONNECTED status)
 */
export const selectActiveKnowledgeSources = createSelector(
  [selectKnowledgeSources],
  (sources): KnowledgeSource[] => 
    sources.filter(source => source.status === 'CONNECTED')
);

/**
 * Enhanced selector for retrieving knowledge sources with error states
 */
export const selectErroredKnowledgeSources = createSelector(
  [selectKnowledgeSources],
  (sources): KnowledgeSource[] =>
    sources.filter(source => 
      source.status.startsWith('ERROR_')
    )
);

/**
 * Memoized selector for retrieving knowledge sources currently syncing
 */
export const selectSyncingKnowledgeSources = createSelector(
  [selectKnowledgeSources],
  (sources): KnowledgeSource[] =>
    sources.filter(source => source.status === 'SYNCING')
);

/**
 * Type-safe selector for retrieving any error state in the knowledge slice
 */
export const selectKnowledgeError = createSelector(
  [selectKnowledgeState],
  (knowledgeState) => knowledgeState.error
);

/**
 * Enhanced selector for retrieving sync status information for all sources
 */
export const selectKnowledgeSyncStatus = createSelector(
  [selectKnowledgeState],
  (knowledgeState) => knowledgeState.syncStatus
);

/**
 * Memoized selector for retrieving sources grouped by type
 */
export const selectKnowledgeSourcesByType = createSelector(
  [selectKnowledgeSources],
  (sources) => {
    return sources.reduce((grouped, source) => {
      const type = source.source_type;
      return {
        ...grouped,
        [type]: [...(grouped[type] || []), source]
      };
    }, {} as Record<string, KnowledgeSource[]>);
  }
);