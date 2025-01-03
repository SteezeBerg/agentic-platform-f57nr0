/**
 * @fileoverview Central index file for image assets used in Agent Builder Hub
 * Implements AWS Amplify UI design patterns and Material Design 3.0 principles
 * @version 1.0.0
 */

/**
 * Company and product logo variants for different display contexts and themes
 */
export const LogoImages = {
  LOGO_FULL: './logo/logo-full.svg',
  LOGO_ICON: './logo/logo-icon.svg',
  LOGO_DARK: './logo/logo-dark.svg',
  LOGO_LIGHT: './logo/logo-light.svg'
} as const;

/**
 * Background images for different application sections with theme support
 */
export const BackgroundImages = {
  AUTH_BG: './backgrounds/auth-bg.svg',
  DASHBOARD_BG: './backgrounds/dashboard-bg.svg',
  BUILDER_BG: './backgrounds/builder-bg.svg'
} as const;

/**
 * Placeholder images for various content types when actual content is unavailable
 */
export const PlaceholderImages = {
  AGENT_PLACEHOLDER: './placeholders/agent.svg',
  USER_PLACEHOLDER: './placeholders/user.svg',
  TEMPLATE_PLACEHOLDER: './placeholders/template.svg'
} as const;

/**
 * Illustrations for various application states and feedback scenarios
 */
export const IllustrationImages = {
  EMPTY_STATE: './illustrations/empty.svg',
  ERROR_STATE: './illustrations/error.svg',
  SUCCESS_STATE: './illustrations/success.svg'
} as const;

/**
 * Navigation and action icons following Material Design 3.0 principles
 */
export const IconImages = {
  MENU_ICON: './icons/menu.svg',
  CREATE_ICON: './icons/create.svg',
  CLOSE_ICON: './icons/close.svg',
  SETTINGS_ICON: './icons/settings.svg',
  HELP_ICON: './icons/help.svg'
} as const;

// Type definitions for image paths
export type LogoImagePath = typeof LogoImages[keyof typeof LogoImages];
export type BackgroundImagePath = typeof BackgroundImages[keyof typeof BackgroundImages];
export type PlaceholderImagePath = typeof PlaceholderImages[keyof typeof PlaceholderImages];
export type IllustrationImagePath = typeof IllustrationImages[keyof typeof IllustrationImages];
export type IconImagePath = typeof IconImages[keyof typeof IconImages];

// Aggregate type for all image paths
export type ImagePath = 
  | LogoImagePath 
  | BackgroundImagePath 
  | PlaceholderImagePath 
  | IllustrationImagePath 
  | IconImagePath;