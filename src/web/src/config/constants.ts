/**
 * Core application constants and configuration values for the Agent Builder Hub frontend.
 * @version 1.0.0
 */

// Environment type definition
export type Environment = 'development' | 'staging' | 'production';

// Core interfaces
export interface AppConfig {
  APP_NAME: string;
  APP_VERSION: string;
  BUILD_ENV: Environment;
}

export interface AgentConstants {
  MAX_NAME_LENGTH: number;
  MAX_DESCRIPTION_LENGTH: number;
  MAX_KNOWLEDGE_SOURCES: number;
  SUPPORTED_FILE_TYPES: ReadonlyArray<string>;
}

export interface UIConstants {
  TOAST_DURATION: number;
  MODAL_TRANSITION_MS: number;
  TABLE_PAGE_SIZES: ReadonlyArray<number>;
  FOCUS_VISIBLE_OUTLINE: string;
  MINIMUM_TARGET_SIZE: number;
}

export interface ErrorMessages {
  GENERIC_ERROR: string;
  VALIDATION_ERROR: string;
  NETWORK_ERROR: string;
  KNOWLEDGE_SOURCE_LIMIT: string;
}

// Core application configuration
export const APP_CONFIG: Readonly<AppConfig> = {
  APP_NAME: 'Agent Builder Hub',
  APP_VERSION: '1.0.0',
  BUILD_ENV: (process.env.REACT_APP_ENV || 'development') as Environment,
} as const;

// Agent-related constants
export const AGENT_CONSTANTS: Readonly<AgentConstants> = {
  MAX_NAME_LENGTH: 100,
  MAX_DESCRIPTION_LENGTH: 500,
  MAX_KNOWLEDGE_SOURCES: 10,
  SUPPORTED_FILE_TYPES: ['.pdf', '.doc', '.docx', '.txt', '.md'],
} as const;

// UI configuration constants
export const UI_CONSTANTS: Readonly<UIConstants> = {
  TOAST_DURATION: 5000,
  MODAL_TRANSITION_MS: 300,
  TABLE_PAGE_SIZES: [10, 25, 50, 100],
  // WCAG 2.1 Level AA compliant focus outline
  FOCUS_VISIBLE_OUTLINE: '2px solid #0066CC',
  // WCAG 2.1 Level AA minimum touch target size (44x44 pixels)
  MINIMUM_TARGET_SIZE: 44,
} as const;

// Standardized error messages
export const ERROR_MESSAGES: Readonly<ErrorMessages> = {
  GENERIC_ERROR: 'An unexpected error occurred. Please try again.',
  VALIDATION_ERROR: 'Please check your input and try again.',
  NETWORK_ERROR: 'Unable to connect to the server. Please check your connection.',
  KNOWLEDGE_SOURCE_LIMIT: 'Maximum number of knowledge sources reached (10). Please remove existing sources before adding new ones.',
} as const;

// Ensure all exports are immutable
Object.freeze(APP_CONFIG);
Object.freeze(AGENT_CONSTANTS);
Object.freeze(UI_CONSTANTS);
Object.freeze(ERROR_MESSAGES);