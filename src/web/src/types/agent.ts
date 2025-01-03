/**
 * Core TypeScript type definitions for agent-related interfaces, enums and types
 * Provides comprehensive type safety and validation for agent creation, configuration, and deployment
 * @version 1.0.0
 */

import { KnowledgeSource } from './knowledge';
import { UUID, ISO8601DateTime, BaseEntity } from './common';

// Enums
/**
 * Strongly typed enumeration of supported agent deployment types
 */
export enum AgentType {
  STREAMLIT = 'STREAMLIT',
  SLACK = 'SLACK',
  AWS_REACT = 'AWS_REACT',
  STANDALONE = 'STANDALONE'
}

/**
 * Enhanced enumeration of possible agent states
 */
export enum AgentStatus {
  CREATED = 'CREATED',
  CONFIGURING = 'CONFIGURING',
  READY = 'READY',
  DEPLOYING = 'DEPLOYING',
  DEPLOYED = 'DEPLOYED',
  ERROR = 'ERROR',
  ARCHIVED = 'ARCHIVED'
}

/**
 * Enumeration of supported agent capabilities
 */
export enum AgentCapability {
  RAG = 'RAG',
  MULTI_MODEL = 'MULTI_MODEL',
  CONTEXT_AWARE = 'CONTEXT_AWARE'
}

// Interfaces
/**
 * Interface for agent health monitoring data
 */
export interface AgentHealthStatus {
  readonly status: 'healthy' | 'degraded' | 'unhealthy';
  readonly lastPing: ISO8601DateTime;
  readonly metrics: {
    readonly cpu_usage: number;
    readonly memory_usage: number;
    readonly request_count: number;
    readonly error_rate: number;
    readonly response_time_ms: number;
  };
  readonly errors?: ReadonlyArray<{
    readonly code: string;
    readonly message: string;
    readonly timestamp: ISO8601DateTime;
  }>;
}

/**
 * Interface for platform-specific deployment configurations
 */
export interface AgentDeploymentConfig {
  readonly environment: 'development' | 'staging' | 'production';
  readonly resources: {
    readonly cpu: number;
    readonly memory: number;
    readonly storage?: number;
  };
  readonly scaling?: {
    readonly min_instances: number;
    readonly max_instances: number;
    readonly target_cpu_utilization?: number;
  };
  readonly networking?: {
    readonly vpc_id?: string;
    readonly subnet_ids?: string[];
    readonly security_group_ids?: string[];
  };
  readonly platform_specific?: Record<string, unknown>;
}

/**
 * Interface for agent configuration options
 */
export interface AgentConfig {
  readonly capabilities: ReadonlyArray<AgentCapability>;
  readonly knowledgeSourceIds: ReadonlyArray<UUID>;
  readonly settings: Readonly<{
    readonly model_settings?: {
      readonly temperature?: number;
      readonly max_tokens?: number;
      readonly top_p?: number;
    };
    readonly rag_settings?: {
      readonly chunk_size?: number;
      readonly chunk_overlap?: number;
      readonly similarity_threshold?: number;
    };
    readonly custom_settings?: Record<string, unknown>;
  }>;
  readonly version: string;
  readonly deploymentConfig: AgentDeploymentConfig;
}

/**
 * Interface for agent template definitions
 */
export interface AgentTemplate extends BaseEntity {
  readonly name: string;
  readonly description: string;
  readonly type: AgentType;
  readonly defaultConfig: AgentConfig;
  readonly version: string;
  readonly metadata: Readonly<{
    readonly category?: string;
    readonly tags?: string[];
    readonly complexity?: 'basic' | 'intermediate' | 'advanced';
    readonly estimated_setup_time_minutes?: number;
    readonly custom_metadata?: Record<string, unknown>;
  }>;
}

/**
 * Core interface for agent data structure
 */
export interface Agent extends BaseEntity {
  readonly name: string;
  readonly description: string;
  readonly type: AgentType;
  readonly config: AgentConfig;
  readonly status: AgentStatus;
  readonly ownerId: UUID;
  readonly templateId: UUID | null;
  readonly createdAt: ISO8601DateTime;
  readonly updatedAt: ISO8601DateTime;
  readonly version: string;
  readonly metadata: Readonly<{
    readonly environment: string;
    readonly tags?: string[];
    readonly custom_metadata?: Record<string, unknown>;
  }>;
  readonly healthStatus: AgentHealthStatus;
}

// Type Guards
/**
 * Type guard for AgentType validation
 */
export const isAgentType = (value: string): value is AgentType => {
  return Object.values(AgentType).includes(value as AgentType);
};

/**
 * Type guard for AgentStatus validation
 */
export const isAgentStatus = (value: string): value is AgentStatus => {
  return Object.values(AgentStatus).includes(value as AgentStatus);
};

/**
 * Type guard for AgentCapability validation
 */
export const isAgentCapability = (value: string): value is AgentCapability => {
  return Object.values(AgentCapability).includes(value as AgentCapability);
};

/**
 * Type guard for validating complete Agent configuration
 */
export const isValidAgentConfig = (config: unknown): config is AgentConfig => {
  const agentConfig = config as AgentConfig;
  return (
    Array.isArray(agentConfig?.capabilities) &&
    Array.isArray(agentConfig?.knowledgeSourceIds) &&
    typeof agentConfig?.version === 'string' &&
    typeof agentConfig?.deploymentConfig === 'object'
  );
};