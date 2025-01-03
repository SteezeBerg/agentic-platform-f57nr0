/**
 * Core TypeScript type definitions and interfaces for the Agent Builder Hub frontend
 * Provides strictly typed base entities, utility types, and common interfaces
 * @version 1.0.0
 */

// Utility Types
/**
 * Utility type for nullable values with strict null checks
 */
export type Nullable<T> = T | null;

/**
 * Utility type for optional values with undefined support
 */
export type Optional<T> = T | undefined;

/**
 * Branded type for UUID strings with validation pattern
 */
export type UUID = string & { readonly __brand: unique symbol };

/**
 * Branded type for ISO 8601 datetime strings with validation
 */
export type ISO8601DateTime = string & { readonly __brand: unique symbol };

/**
 * Utility type for deep readonly objects
 */
export type DeepReadonly<T> = {
  readonly [P in keyof T]: T[P] extends object ? DeepReadonly<T[P]> : T[P];
};

// Enums
/**
 * Enum for sort order options with type safety
 */
export enum SortOrder {
  ASC = 'ASC',
  DESC = 'DESC'
}

/**
 * Enum for component loading states with type guards
 */
export enum LoadingState {
  IDLE = 'IDLE',
  LOADING = 'LOADING',
  SUCCESS = 'SUCCESS',
  ERROR = 'ERROR'
}

/**
 * Enum for standardized metric units
 */
export enum MetricUnit {
  COUNT = 'COUNT',
  BYTES = 'BYTES',
  MILLISECONDS = 'MILLISECONDS',
  PERCENTAGE = 'PERCENTAGE'
}

// Interfaces
/**
 * Base interface for all entity types with versioning and temporal tracking
 */
export interface BaseEntity {
  readonly id: UUID;
  readonly created_at: ISO8601DateTime;
  readonly updated_at: ISO8601DateTime;
  readonly version: number;
}

/**
 * Comprehensive interface for pagination and filtering parameters
 */
export interface PaginationParams {
  page: number;
  limit: number;
  sort_by: string;
  sort_order: SortOrder;
  filters: Record<string, unknown>;
}

/**
 * Generic interface for paginated API responses with readonly data
 */
export interface PaginatedResponse<T> {
  readonly items: readonly T[];
  readonly total: number;
  readonly page: number;
  readonly limit: number;
  readonly total_pages: number;
}

/**
 * Comprehensive interface for API error responses with detailed typing
 */
export interface ErrorResponse {
  readonly code: string;
  readonly message: string;
  readonly details: Record<string, unknown>;
  readonly stack?: string;
  readonly timestamp: ISO8601DateTime;
}

/**
 * Generic interface for type-safe API responses with metadata support
 */
export interface ApiResponse<T> {
  readonly success: boolean;
  readonly data: T;
  readonly error: ErrorResponse | null;
  readonly metadata: Record<string, unknown>;
}

/**
 * Interface for strongly-typed metrics data with validation
 */
export interface MetricsData {
  readonly timestamp: ISO8601DateTime;
  readonly value: number;
  readonly unit: MetricUnit;
  readonly tags: ReadonlyArray<string>;
  readonly metadata: Readonly<Record<string, unknown>>;
}

// Type Guards
/**
 * Type guard for UUID validation
 */
export const isUUID = (value: string): value is UUID => {
  const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return uuidPattern.test(value);
};

/**
 * Type guard for ISO8601DateTime validation
 */
export const isISO8601DateTime = (value: string): value is ISO8601DateTime => {
  const iso8601Pattern = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?Z$/;
  return iso8601Pattern.test(value);
};

/**
 * Type guard for LoadingState validation
 */
export const isLoadingState = (value: string): value is LoadingState => {
  return Object.values(LoadingState).includes(value as LoadingState);
};

/**
 * Type guard for MetricUnit validation
 */
export const isMetricUnit = (value: string): value is MetricUnit => {
  return Object.values(MetricUnit).includes(value as MetricUnit);
};