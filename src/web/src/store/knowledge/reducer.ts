/**
 * Redux reducer for managing knowledge base state in the Agent Builder Hub
 * Implements comprehensive state management for knowledge sources, indexing progress, and RAG capabilities
 * @version 1.0.0
 */

import { Reducer } from 'redux'; // v4.2.1
import { produce } from 'immer'; // v10.0.2
import {
  KnowledgeState,
  KnowledgeAction,
  KnowledgeActionTypes,
  KnowledgeError,
  IndexingProgressEntry,
  SyncStatusEntry
} from './types';
import { LoadingState } from '../../types/common';

/**
 * Initial state with comprehensive error and progress tracking
 */
const initialState: KnowledgeState = {
  sources: {},
  selectedSourceId: null,
  loadingState: LoadingState.IDLE,
  error: null,
  indexingProgress: {},
  syncStatus: {}
};

/**
 * Redux reducer for knowledge base state management
 * Implements immutable state updates with enhanced error handling and progress tracking
 */
const knowledgeReducer: Reducer<KnowledgeState, KnowledgeAction> = (
  state = initialState,
  action
): KnowledgeState => {
  return produce(state, draft => {
    switch (action.type) {
      case KnowledgeActionTypes.FETCH_SOURCES:
        draft.loadingState = LoadingState.LOADING;
        draft.error = null;
        break;

      case KnowledgeActionTypes.FETCH_SOURCES_SUCCESS:
        draft.sources = action.payload.sources;
        draft.loadingState = LoadingState.SUCCESS;
        draft.error = null;
        break;

      case KnowledgeActionTypes.FETCH_SOURCES_ERROR:
        draft.loadingState = LoadingState.ERROR;
        draft.error = {
          message: action.payload.error.message,
          code: action.payload.error.code,
          details: action.payload.error.details
        };
        break;

      case KnowledgeActionTypes.ADD_SOURCE:
        const { source } = action.payload;
        draft.sources[source.id] = source;
        draft.indexingProgress[source.id] = {
          progress: 0,
          status: 'initialized',
          lastUpdated: new Date()
        };
        draft.syncStatus[source.id] = {
          lastSync: new Date(),
          nextSync: new Date(Date.now() + 3600000), // Default to 1 hour
          status: 'pending'
        };
        break;

      case KnowledgeActionTypes.UPDATE_SOURCE:
        const { sourceId, updates } = action.payload;
        if (draft.sources[sourceId]) {
          draft.sources[sourceId] = {
            ...draft.sources[sourceId],
            ...updates,
            updated_at: new Date().toISOString()
          };
        }
        break;

      case KnowledgeActionTypes.DELETE_SOURCE:
        const idToDelete = action.payload.sourceId;
        delete draft.sources[idToDelete];
        delete draft.indexingProgress[idToDelete];
        delete draft.syncStatus[idToDelete];
        if (draft.selectedSourceId === idToDelete) {
          draft.selectedSourceId = null;
        }
        break;

      case KnowledgeActionTypes.SELECT_SOURCE:
        draft.selectedSourceId = action.payload.sourceId;
        break;

      case KnowledgeActionTypes.UPDATE_INDEXING_PROGRESS:
        const { sourceId: progressSourceId, progress } = action.payload;
        if (draft.sources[progressSourceId]) {
          draft.indexingProgress[progressSourceId] = {
            ...progress,
            lastUpdated: new Date()
          };
        }
        break;

      case KnowledgeActionTypes.UPDATE_SYNC_STATUS:
        const { sourceId: syncSourceId, syncStatus } = action.payload;
        if (draft.sources[syncSourceId]) {
          draft.syncStatus[syncSourceId] = {
            ...syncStatus,
            lastSync: new Date(syncStatus.lastSync),
            nextSync: new Date(syncStatus.nextSync)
          };
        }
        break;

      default:
        // Return draft unchanged for unknown actions
        break;
    }
  });
};

export default knowledgeReducer;