/**
 * TypeScript type definitions and interfaces for deployment-related data structures
 * Provides comprehensive type safety for deployment configurations, status tracking,
 * and metrics monitoring across different environments.
 * @version 1.0.0
 */

import { BaseEntity } from '../types/common';

// Deployment Environment Types
export type DeploymentEnvironment = 'development' | 'staging' | 'production';

// Deployment Target Types
export type DeploymentType = 'ecs' | 'lambda' | 'streamlit' | 'slack' | 'standalone';

// Deployment Status Types
export type DeploymentStatus = 
  | 'pending'
  | 'in_progress'
  | 'completed'
  | 'failed'
  | 'rolling_back'
  | 'rolled_back'
  | 'validating';

// Health Status Types
export type DeploymentHealth = 
  | 'healthy'
  | 'degraded'
  | 'unhealthy'
  | 'critical'
  | 'unknown';

// Deployment Strategy Types
export type DeploymentStrategy = 
  | 'blue_green'
  | 'rolling'
  | 'canary'
  | 'all_at_once';

// Deployment Configuration Interface
export interface DeploymentConfig {
  deployment_type: DeploymentType;
  environment: DeploymentEnvironment;
  strategy: DeploymentStrategy;
  scaling: {
    min_instances: number;
    max_instances: number;
    target_cpu_utilization: number;
  };
  health_check: {
    path: string;
    interval: number;
    timeout: number;
    healthy_threshold: number;
    unhealthy_threshold: number;
  };
  rollback: {
    enabled: boolean;
    automatic: boolean;
    threshold: number;
  };
  environment_variables: Record<string, string>;
  resources: {
    cpu: string;
    memory: string;
    storage?: string;
  };
}

// Deployment Metrics Interface
export interface DeploymentMetrics {
  resource_utilization: {
    cpu_usage: number;
    memory_usage: number;
    storage_usage: number;
  };
  performance: {
    request_count: number;
    error_rate: number;
    latency: {
      p50: number;
      p90: number;
      p99: number;
    };
  };
  availability: {
    uptime: number;
    success_rate: number;
    health_check_success: number;
  };
  costs: {
    hourly_cost: number;
    monthly_projected: number;
  };
}

// Deployment History Interface
export interface DeploymentHistory {
  version: string;
  timestamp: Date;
  status: DeploymentStatus;
  config_snapshot: DeploymentConfig;
}

// Core Deployment Interface
export interface Deployment extends BaseEntity {
  agent_id: string;
  environment: DeploymentEnvironment;
  deployment_type: DeploymentType;
  config: DeploymentConfig;
  status: DeploymentStatus;
  health: DeploymentHealth;
  metrics: DeploymentMetrics;
  history: DeploymentHistory[];
}