/**
 * Barrel export file for knowledge-related components in the Agent Builder Hub.
 * Centralizes exports of knowledge base management components including knowledge source cards,
 * lists, metrics, and source connectors.
 * @version 1.0.0
 */

// Core knowledge base management components
export { default as KnowledgeBase } from './KnowledgeBase';
export { default as KnowledgeCard } from './KnowledgeCard';
export { default as KnowledgeList } from './KnowledgeList';
export { default as KnowledgeMetrics } from './KnowledgeMetrics';
export { default as SourceConnector } from './SourceConnector';

// Export component types for external usage
export type { KnowledgeCardProps } from './KnowledgeCard';
export type { KnowledgeListProps } from './KnowledgeList';
export type { KnowledgeMetricsProps } from './KnowledgeMetrics';
export type { SourceConnectorProps } from './SourceConnector';

// Re-export knowledge-related types used by components
export {
  KnowledgeSourceType,
  KnowledgeSourceStatus,
  IndexingStrategy,
  type KnowledgeSource,
  type KnowledgeSourceConfig,
  type KnowledgeSourceMetadata,
  type ErrorDetails,
  type PerformanceMetrics
} from '../../types/knowledge';