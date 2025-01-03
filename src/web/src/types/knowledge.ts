/**
 * TypeScript type definitions and interfaces for knowledge base management
 * Provides comprehensive types for enterprise knowledge integration and RAG capabilities
 * @version 1.0.0
 */

import { BaseEntity } from './common';

// Enums
/**
 * Strongly typed enumeration of supported knowledge source types
 */
export enum KnowledgeSourceType {
  CONFLUENCE = 'CONFLUENCE',
  DOCEBO = 'DOCEBO',
  INTERNAL_REPO = 'INTERNAL_REPO',
  PROCESS_DOCS = 'PROCESS_DOCS',
  TRAINING_MATERIALS = 'TRAINING_MATERIALS'
}

/**
 * Enhanced enumeration of knowledge source sync statuses
 */
export enum KnowledgeSourceStatus {
  CONNECTED = 'CONNECTED',
  SYNCING = 'SYNCING',
  ERROR_CONNECTION = 'ERROR_CONNECTION',
  ERROR_AUTHENTICATION = 'ERROR_AUTHENTICATION',
  ERROR_PERMISSION = 'ERROR_PERMISSION',
  ERROR_SYNC = 'ERROR_SYNC',
  DISCONNECTED = 'DISCONNECTED'
}

/**
 * Enumeration of knowledge source indexing strategies
 */
export enum IndexingStrategy {
  INCREMENTAL = 'INCREMENTAL',
  FULL_REFRESH = 'FULL_REFRESH',
  DIFFERENTIAL = 'DIFFERENTIAL'
}

// Interfaces
/**
 * Interface for detailed error information
 */
export interface ErrorDetails {
  readonly code: string;
  readonly message: string;
  readonly timestamp: Date;
  readonly context?: Record<string, unknown>;
}

/**
 * Interface for performance metrics tracking
 */
export interface PerformanceMetrics {
  readonly indexing_time_ms: number;
  readonly query_latency_ms: number;
  readonly document_processing_rate: number;
  readonly storage_usage_bytes: number;
}

/**
 * Interface for advanced query configuration
 */
export interface QueryOptions {
  readonly similarity_threshold?: number;
  readonly context_window?: number;
  readonly include_metadata?: boolean;
  readonly max_tokens?: number;
}

/**
 * Interface for Confluence-specific configuration
 */
export interface ConfluenceConfig {
  readonly baseUrl: string;
  readonly apiToken: string;
  readonly spaces: readonly string[];
  readonly include_attachments?: boolean;
  readonly sync_interval_minutes?: number;
}

/**
 * Interface for Docebo-specific configuration
 */
export interface DoceboConfig {
  readonly apiUrl: string;
  readonly clientId: string;
  readonly clientSecret: string;
  readonly courses: readonly string[];
}

/**
 * Interface for internal repository configuration
 */
export interface InternalRepoConfig {
  readonly repoUrl: string;
  readonly branch: string;
  readonly accessToken: string;
  readonly file_patterns: readonly string[];
}

/**
 * Interface for process documentation configuration
 */
export interface ProcessDocsConfig {
  readonly basePath: string;
  readonly include_patterns: readonly string[];
  readonly exclude_patterns: readonly string[];
}

/**
 * Interface for training materials configuration
 */
export interface TrainingMaterialsConfig {
  readonly sourceUrl: string;
  readonly apiKey: string;
  readonly categories: readonly string[];
}

/**
 * Union type of source-specific configurations
 */
export type KnowledgeSourceConfig =
  | ConfluenceConfig
  | DoceboConfig
  | InternalRepoConfig
  | ProcessDocsConfig
  | TrainingMaterialsConfig;

/**
 * Interface for extended source metadata
 */
export interface KnowledgeSourceMetadata {
  readonly document_count: number;
  readonly total_size_bytes: number;
  readonly last_error?: ErrorDetails;
  readonly performance_metrics: PerformanceMetrics;
  readonly custom_metadata?: Record<string, unknown>;
}

/**
 * Enhanced interface representing a knowledge source
 */
export interface KnowledgeSource extends BaseEntity {
  readonly name: string;
  readonly source_type: KnowledgeSourceType;
  readonly connection_config: KnowledgeSourceConfig;
  readonly status: KnowledgeSourceStatus;
  readonly last_sync: Date;
  readonly indexing_strategy: IndexingStrategy;
  readonly metadata: KnowledgeSourceMetadata;
}

/**
 * Enhanced interface for RAG query requests
 */
export interface KnowledgeQueryRequest {
  readonly query: string;
  readonly source_ids?: readonly string[];
  readonly max_results?: number;
  readonly query_options?: QueryOptions;
}

/**
 * Interface for query result metadata
 */
export interface QueryResultMetadata {
  readonly confidence_score: number;
  readonly source_document: string;
  readonly context_window: string;
  readonly processing_time_ms: number;
}

/**
 * Interface for knowledge query results
 */
export interface KnowledgeQueryResult {
  readonly content: string;
  readonly metadata: QueryResultMetadata;
  readonly source: KnowledgeSource;
  readonly timestamp: Date;
}

/**
 * Type guard for KnowledgeSourceType validation
 */
export const isKnowledgeSourceType = (value: string): value is KnowledgeSourceType => {
  return Object.values(KnowledgeSourceType).includes(value as KnowledgeSourceType);
};

/**
 * Type guard for KnowledgeSourceStatus validation
 */
export const isKnowledgeSourceStatus = (value: string): value is KnowledgeSourceStatus => {
  return Object.values(KnowledgeSourceStatus).includes(value as KnowledgeSourceStatus);
};

/**
 * Type guard for IndexingStrategy validation
 */
export const isIndexingStrategy = (value: string): value is IndexingStrategy => {
  return Object.values(IndexingStrategy).includes(value as IndexingStrategy);
};