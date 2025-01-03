/**
 * Enhanced custom React hook for managing knowledge sources and RAG capabilities
 * Provides unified interface for knowledge source operations with progress tracking and error handling
 * @version 1.0.0
 */

import { useEffect, useCallback, useMemo, useState, useRef } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import debounce from 'lodash/debounce';
import {
  KnowledgeSource,
  KnowledgeSourceType,
  KnowledgeSourceStatus,
  KnowledgeQueryRequest,
  KnowledgeQueryResult,
  ErrorDetails,
  IndexingStrategy,
  KnowledgeSourceConfig
} from '../types/knowledge';
import { Nullable, UUID, LoadingState } from '../types/common';
import { withErrorBoundary } from '../decorators/withErrorBoundary';
import { withPerformanceTracking } from '../decorators/withPerformanceTracking';

interface CreateKnowledgeSourceRequest {
  name: string;
  source_type: KnowledgeSourceType;
  connection_config: KnowledgeSourceConfig;
  indexing_strategy: IndexingStrategy;
}

interface UpdateKnowledgeSourceRequest {
  name?: string;
  connection_config?: Partial<KnowledgeSourceConfig>;
  indexing_strategy?: IndexingStrategy;
}

interface Result<T, E = ErrorDetails> {
  data?: T;
  error?: E;
}

/**
 * Enhanced custom hook for managing knowledge sources with comprehensive error handling
 * and progress tracking capabilities
 */
@withErrorBoundary
@withPerformanceTracking('useKnowledge')
export function useKnowledge() {
  const dispatch = useDispatch();
  const wsRef = useRef<WebSocket | null>(null);
  
  // Redux selectors
  const sources = useSelector((state) => state.knowledge.sources);
  const loading = useSelector((state) => state.knowledge.loading === LoadingState.LOADING);
  const error = useSelector((state) => state.knowledge.error);
  
  // Local state for progress tracking
  const [progress, setProgress] = useState<Record<string, number>>({});

  // WebSocket setup for real-time updates
  useEffect(() => {
    const setupWebSocket = () => {
      const ws = new WebSocket(process.env.REACT_APP_WS_URL as string);
      
      ws.onmessage = (event) => {
        const data = JSON.parse(event.data);
        if (data.type === 'INDEXING_PROGRESS') {
          setProgress((prev) => ({
            ...prev,
            [data.sourceId]: data.progress
          }));
        }
      };

      ws.onerror = (error) => {
        console.error('WebSocket error:', error);
      };

      wsRef.current = ws;
    };

    setupWebSocket();
    return () => wsRef.current?.close();
  }, []);

  // Initial sources fetch with retry logic
  useEffect(() => {
    const fetchSources = async (retries = 3) => {
      try {
        dispatch({ type: 'FETCH_KNOWLEDGE_SOURCES_REQUEST' });
        const response = await fetch('/api/knowledge/sources');
        const data = await response.json();
        dispatch({ type: 'FETCH_KNOWLEDGE_SOURCES_SUCCESS', payload: data });
      } catch (error) {
        if (retries > 0) {
          setTimeout(() => fetchSources(retries - 1), 1000);
        } else {
          dispatch({ 
            type: 'FETCH_KNOWLEDGE_SOURCES_ERROR', 
            payload: error as ErrorDetails 
          });
        }
      }
    };

    fetchSources();
  }, [dispatch]);

  // Memoized callback functions
  const addSource = useCallback(async (
    request: CreateKnowledgeSourceRequest
  ): Promise<Result<KnowledgeSource>> => {
    try {
      const response = await fetch('/api/knowledge/sources', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(request)
      });
      const data = await response.json();
      dispatch({ type: 'ADD_KNOWLEDGE_SOURCE', payload: data });
      return { data };
    } catch (error) {
      return { error: error as ErrorDetails };
    }
  }, [dispatch]);

  const updateSource = useCallback(async (
    id: UUID,
    request: UpdateKnowledgeSourceRequest
  ): Promise<Result<KnowledgeSource>> => {
    try {
      const response = await fetch(`/api/knowledge/sources/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(request)
      });
      const data = await response.json();
      dispatch({ type: 'UPDATE_KNOWLEDGE_SOURCE', payload: data });
      return { data };
    } catch (error) {
      return { error: error as ErrorDetails };
    }
  }, [dispatch]);

  const deleteSource = useCallback(async (
    id: UUID
  ): Promise<Result<void>> => {
    try {
      await fetch(`/api/knowledge/sources/${id}`, { method: 'DELETE' });
      dispatch({ type: 'DELETE_KNOWLEDGE_SOURCE', payload: id });
      return {};
    } catch (error) {
      return { error: error as ErrorDetails };
    }
  }, [dispatch]);

  const queryKnowledge = useCallback(async (
    request: KnowledgeQueryRequest
  ): Promise<Result<KnowledgeQueryResult>> => {
    try {
      const response = await fetch('/api/knowledge/query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(request)
      });
      return { data: await response.json() };
    } catch (error) {
      return { error: error as ErrorDetails };
    }
  }, []);

  const syncSource = useCallback(async (
    id: UUID
  ): Promise<Result<void>> => {
    try {
      await fetch(`/api/knowledge/sources/${id}/sync`, { method: 'POST' });
      return {};
    } catch (error) {
      return { error: error as ErrorDetails };
    }
  }, []);

  // Debounced refresh function
  const debouncedRefresh = useMemo(
    () => debounce(async () => {
      try {
        const response = await fetch('/api/knowledge/sources');
        const data = await response.json();
        dispatch({ type: 'REFRESH_KNOWLEDGE_SOURCES', payload: data });
        return {};
      } catch (error) {
        return { error: error as ErrorDetails };
      }
    }, 1000),
    [dispatch]
  );

  return {
    sources,
    loading,
    error,
    progress,
    addSource,
    updateSource,
    deleteSource,
    queryKnowledge,
    syncSource,
    refreshSources: debouncedRefresh
  };
}