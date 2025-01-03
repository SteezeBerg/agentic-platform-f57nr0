/**
 * Redux state management type definitions for knowledge base functionality
 * Provides comprehensive type safety for managing knowledge sources and RAG capabilities
 * @version 1.0.0
 */

import { Action } from 'redux'; // v4.2.1
import { KnowledgeSource } from '../../types/knowledge';
import { LoadingState } from '../../types/common';

/**
 * Comprehensive action types for knowledge store management
 */
export enum KnowledgeActionTypes {
  FETCH_SOURCES = '@knowledge/FETCH_SOURCES',
  FETCH_SOURCES_SUCCESS = '@knowledge/FETCH_SOURCES_SUCCESS',
  FETCH_SOURCES_ERROR = '@knowledge/FETCH_SOURCES_ERROR',
  ADD_SOURCE = '@knowledge/ADD_SOURCE',
  UPDATE_SOURCE = '@knowledge/UPDATE_SOURCE',
  DELETE_SOURCE = '@knowledge/DELETE_SOURCE',
  SELECT_SOURCE = '@knowledge/SELECT_SOURCE',
  UPDATE_INDEXING_PROGRESS = '@knowledge/UPDATE_INDEXING_PROGRESS',
  UPDATE_SYNC_STATUS = '@knowledge/UPDATE_SYNC_STATUS'
}

/**
 * Interface for detailed error tracking with enhanced context
 */
export interface KnowledgeError {
  readonly message: string;
  readonly code: string;
  readonly details?: Record<string, unknown>;
}

/**
 * Interface for tracking indexing progress of knowledge sources
 */
export interface IndexingProgressEntry {
  readonly progress: number;
  readonly status: string;
  readonly lastUpdated: Date;
}

/**
 * Interface for tracking synchronization status of knowledge sources
 */
export interface SyncStatusEntry {
  readonly lastSync: Date;
  readonly nextSync: Date;
  readonly status: string;
}

/**
 * Comprehensive state interface for knowledge store with strict null checking
 */
export interface KnowledgeState {
  readonly sources: Record<string, KnowledgeSource>;
  readonly selectedSourceId: string | null;
  readonly loadingState: LoadingState;
  readonly error: KnowledgeError | null;
  readonly indexingProgress: Record<string, IndexingProgressEntry>;
  readonly syncStatus: Record<string, SyncStatusEntry>;
}

/**
 * Action interfaces for type-safe knowledge store operations
 */
export interface FetchSourcesAction extends Action<KnowledgeActionTypes.FETCH_SOURCES> {}

export interface FetchSourcesSuccessAction extends Action<KnowledgeActionTypes.FETCH_SOURCES_SUCCESS> {
  readonly payload: {
    readonly sources: Record<string, KnowledgeSource>;
  };
}

export interface FetchSourcesErrorAction extends Action<KnowledgeActionTypes.FETCH_SOURCES_ERROR> {
  readonly payload: {
    readonly error: KnowledgeError;
  };
}

export interface AddSourceAction extends Action<KnowledgeActionTypes.ADD_SOURCE> {
  readonly payload: {
    readonly source: KnowledgeSource;
  };
}

export interface UpdateSourceAction extends Action<KnowledgeActionTypes.UPDATE_SOURCE> {
  readonly payload: {
    readonly sourceId: string;
    readonly updates: Partial<KnowledgeSource>;
  };
}

export interface DeleteSourceAction extends Action<KnowledgeActionTypes.DELETE_SOURCE> {
  readonly payload: {
    readonly sourceId: string;
  };
}

export interface SelectSourceAction extends Action<KnowledgeActionTypes.SELECT_SOURCE> {
  readonly payload: {
    readonly sourceId: string | null;
  };
}

export interface UpdateIndexingProgressAction extends Action<KnowledgeActionTypes.UPDATE_INDEXING_PROGRESS> {
  readonly payload: {
    readonly sourceId: string;
    readonly progress: IndexingProgressEntry;
  };
}

export interface UpdateSyncStatusAction extends Action<KnowledgeActionTypes.UPDATE_SYNC_STATUS> {
  readonly payload: {
    readonly sourceId: string;
    readonly syncStatus: SyncStatusEntry;
  };
}

/**
 * Union type of all knowledge store actions for type-safe reducers
 */
export type KnowledgeAction =
  | FetchSourcesAction
  | FetchSourcesSuccessAction
  | FetchSourcesErrorAction
  | AddSourceAction
  | UpdateSourceAction
  | DeleteSourceAction
  | SelectSourceAction
  | UpdateIndexingProgressAction
  | UpdateSyncStatusAction;