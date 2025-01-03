/**
 * Centralized export file for common UI components implementing AWS Amplify UI design patterns
 * with Material Design 3.0 principles. Provides type-safe exports of reusable components
 * and their interfaces for use across the Agent Builder Hub application.
 * @version 1.0.0
 */

// Component exports with AWS Amplify UI v6.0.0 integration
export { default as Button } from './Button';
export type { ButtonProps } from './Button';

export { default as Card } from './Card';
export type { CustomCardProps } from './Card';

export { default as Loading } from './Loading';
export type { LoadingProps } from './Loading';

export { default as Tooltip } from './Tooltip';
export type { TooltipProps } from './Tooltip';

/**
 * Re-export common types and interfaces used across components
 * for centralized type management and consistency
 */
export type {
  LoadingState,
  MetricUnit,
  ApiResponse,
  ErrorResponse,
  PaginatedResponse,
  PaginationParams
} from '../../types/common';

/**
 * Re-export theme-related utilities and constants
 * for consistent styling and accessibility support
 */
export { theme, components } from '../../config/theme';
export { lightTheme } from '../../assets/themes/light';
export { darkTheme } from '../../assets/themes/dark';
export { useTheme } from '../../hooks/useTheme';

/**
 * Re-export UI constants for component configuration
 * and accessibility compliance
 */
export {
  UI_CONSTANTS,
  ERROR_MESSAGES,
  AGENT_CONSTANTS
} from '../../config/constants';

/**
 * Re-export storage service for component state persistence
 * with type safety and encryption support
 */
export {
  StorageService,
  type StorageOptions
} from '../../utils/storage';