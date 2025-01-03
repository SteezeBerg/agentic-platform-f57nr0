/**
 * Knowledge service module implementing comprehensive knowledge base management
 * for the Agent Builder Hub frontend with security, monitoring and caching.
 * @version 1.0.0
 */

import axiosRetry from 'axios-retry'; // v3.8.0
import { z } from 'zod'; // v3.22.0
import { 
  KnowledgeSource, 
  CreateKnowledgeSourceRequest,
  UpdateKnowledgeSourceRequest,
  KnowledgeQueryRequest,
  KnowledgeQueryResponse,
  KnowledgeSourceType,
  KnowledgeSourceStatus,
  IndexingStrategy
} from '../types/knowledge';
import { api } from '../utils/api';
import { API_ENDPOINTS } from '../config/api';

// Cache configuration
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes
const CACHE_KEY_PREFIX = 'knowledge_';

// Rate limiting configuration
const RATE_LIMIT_WINDOW = 60 * 1000; // 1 minute
const MAX_REQUESTS_PER_WINDOW = 100;

// Request tracking for rate limiting
let requestCount = 0;
let windowStart = Date.now();

// Configure retry behavior
axiosRetry(api, { 
  retries: 3,
  retryDelay: axiosRetry.exponentialDelay,
  retryCondition: (error) => {
    return axiosRetry.isNetworkOrIdempotentRequestError(error) || 
           error.response?.status === 429;
  }
});

// Validation schemas
const knowledgeSourceSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(100),
  source_type: z.nativeEnum(KnowledgeSourceType),
  connection_config: z.record(z.unknown()),
  status: z.nativeEnum(KnowledgeSourceStatus),
  last_sync: z.date(),
  indexing_strategy: z.nativeEnum(IndexingStrategy),
  metadata: z.object({
    document_count: z.number(),
    total_size_bytes: z.number(),
    performance_metrics: z.object({
      indexing_time_ms: z.number(),
      query_latency_ms: z.number(),
      document_processing_rate: z.number(),
      storage_usage_bytes: z.number()
    })
  })
});

/**
 * Checks if the current request would exceed rate limits
 * @returns boolean indicating if request should be allowed
 */
const checkRateLimit = (): boolean => {
  const now = Date.now();
  if (now - windowStart > RATE_LIMIT_WINDOW) {
    requestCount = 0;
    windowStart = now;
  }
  return requestCount < MAX_REQUESTS_PER_WINDOW;
};

/**
 * Updates request count for rate limiting
 */
const incrementRequestCount = (): void => {
  requestCount++;
};

/**
 * Manages in-memory cache for knowledge sources
 */
class KnowledgeCache {
  private cache: Map<string, { data: any; timestamp: number }> = new Map();

  get(key: string): any | null {
    const entry = this.cache.get(`${CACHE_KEY_PREFIX}${key}`);
    if (!entry) return null;
    if (Date.now() - entry.timestamp > CACHE_TTL) {
      this.cache.delete(`${CACHE_KEY_PREFIX}${key}`);
      return null;
    }
    return entry.data;
  }

  set(key: string, data: any): void {
    this.cache.set(`${CACHE_KEY_PREFIX}${key}`, {
      data,
      timestamp: Date.now()
    });
  }

  invalidate(key: string): void {
    this.cache.delete(`${CACHE_KEY_PREFIX}${key}`);
  }

  invalidateAll(): void {
    this.cache.clear();
  }
}

const cache = new KnowledgeCache();

/**
 * Knowledge service implementation with comprehensive error handling and monitoring
 */
class KnowledgeService {
  /**
   * Retrieves all knowledge sources with caching and rate limiting
   */
  async getKnowledgeSources(): Promise<KnowledgeSource[]> {
    if (!checkRateLimit()) {
      throw new Error('Rate limit exceeded for knowledge source requests');
    }

    const cached = cache.get('sources');
    if (cached) {
      return cached;
    }

    incrementRequestCount();
    const response = await api.get(`${API_ENDPOINTS.KNOWLEDGE}/sources`);
    const sources = response.data.map((source: any) => 
      knowledgeSourceSchema.parse(source)
    );
    
    cache.set('sources', sources);
    return sources;
  }

  /**
   * Retrieves a specific knowledge source by ID
   */
  async getKnowledgeSource(id: string): Promise<KnowledgeSource> {
    if (!checkRateLimit()) {
      throw new Error('Rate limit exceeded for knowledge source requests');
    }

    const cached = cache.get(`source_${id}`);
    if (cached) {
      return cached;
    }

    incrementRequestCount();
    const response = await api.get(`${API_ENDPOINTS.KNOWLEDGE}/sources/${id}`);
    const source = knowledgeSourceSchema.parse(response.data);
    
    cache.set(`source_${id}`, source);
    return source;
  }

  /**
   * Creates a new knowledge source with validation
   */
  async createKnowledgeSource(request: CreateKnowledgeSourceRequest): Promise<KnowledgeSource> {
    if (!checkRateLimit()) {
      throw new Error('Rate limit exceeded for knowledge source creation');
    }

    incrementRequestCount();
    const response = await api.post(
      `${API_ENDPOINTS.KNOWLEDGE}/sources`,
      request
    );
    const source = knowledgeSourceSchema.parse(response.data);
    
    cache.invalidateAll();
    return source;
  }

  /**
   * Updates an existing knowledge source
   */
  async updateKnowledgeSource(
    id: string,
    request: UpdateKnowledgeSourceRequest
  ): Promise<KnowledgeSource> {
    if (!checkRateLimit()) {
      throw new Error('Rate limit exceeded for knowledge source updates');
    }

    incrementRequestCount();
    const response = await api.put(
      `${API_ENDPOINTS.KNOWLEDGE}/sources/${id}`,
      request
    );
    const source = knowledgeSourceSchema.parse(response.data);
    
    cache.invalidate(`source_${id}`);
    cache.invalidate('sources');
    return source;
  }

  /**
   * Deletes a knowledge source
   */
  async deleteKnowledgeSource(id: string): Promise<void> {
    if (!checkRateLimit()) {
      throw new Error('Rate limit exceeded for knowledge source deletion');
    }

    incrementRequestCount();
    await api.delete(`${API_ENDPOINTS.KNOWLEDGE}/sources/${id}`);
    
    cache.invalidate(`source_${id}`);
    cache.invalidate('sources');
  }

  /**
   * Performs a RAG query against knowledge sources
   */
  async queryKnowledge(request: KnowledgeQueryRequest): Promise<KnowledgeQueryResponse> {
    if (!checkRateLimit()) {
      throw new Error('Rate limit exceeded for knowledge queries');
    }

    incrementRequestCount();
    const response = await api.post(
      `${API_ENDPOINTS.KNOWLEDGE}/query`,
      request
    );
    
    return response.data;
  }

  /**
   * Triggers synchronization of a knowledge source
   */
  async syncKnowledgeSource(id: string): Promise<KnowledgeSource> {
    if (!checkRateLimit()) {
      throw new Error('Rate limit exceeded for knowledge source sync');
    }

    incrementRequestCount();
    const response = await api.post(
      `${API_ENDPOINTS.KNOWLEDGE}/sources/${id}/sync`
    );
    const source = knowledgeSourceSchema.parse(response.data);
    
    cache.invalidate(`source_${id}`);
    cache.invalidate('sources');
    return source;
  }
}

// Export singleton instance
export const knowledgeService = new KnowledgeService();