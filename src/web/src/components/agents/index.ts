/**
 * Barrel file for agent-related components
 * Provides centralized exports for all agent UI components following AWS Amplify UI architecture
 * Implements strict type safety and optimized loading patterns
 * @version 1.0.0
 */

// Component exports with their associated types
export { default as AgentCard } from './AgentCard';
export type { AgentCardProps } from './AgentCard';

export { default as AgentStatus } from './AgentStatus';
export type { AgentStatusProps } from './AgentStatus';

export { default as AgentList } from './AgentList';
export type { AgentListProps } from './AgentList';

// Re-export relevant agent types for convenience
export {
  AgentType,
  AgentStatus as AgentStatusEnum,
  AgentCapability,
  type Agent,
  type AgentConfig,
  type AgentTemplate,
  type AgentHealthStatus,
  type AgentDeploymentConfig
} from '../../types/agent';