/// <reference types="vite/client" />

/**
 * Type definitions for Vite environment variables used in the Agent Builder Hub
 * @version 5.0.0
 */

/**
 * Environment variable interface for the Agent Builder Hub application
 * Defines strictly typed configuration for API endpoints and AWS Cognito settings
 */
interface ImportMetaEnv {
  /** Base URL for the Agent Builder Hub API */
  readonly VITE_API_URL: string;

  /** AWS Cognito User Pool ID for authentication */
  readonly VITE_COGNITO_USER_POOL_ID: string;

  /** AWS Cognito Client ID for application authentication */
  readonly VITE_COGNITO_CLIENT_ID: string;

  /** AWS Region for Cognito services */
  readonly VITE_COGNITO_REGION: string;

  /** WebSocket endpoint URL for real-time agent communication */
  readonly VITE_WEBSOCKET_URL: string;
}

/**
 * Augments the Vite ImportMeta interface to include typed environment variables
 * Ensures type safety when accessing environment configuration throughout the application
 */
interface ImportMeta {
  /** Typed environment variable access */
  readonly env: ImportMetaEnv;
}