/**
 * Typography System for Agent Builder Hub
 * Implements AWS Amplify UI design patterns and Material Design 3.0 principles
 * Ensures WCAG 2.1 Level AA compliance for accessibility
 * @version 1.0.0
 */

/**
 * Font family definitions with comprehensive fallback stacks
 * Primary: Inter - Modern, clean interface font optimized for screens
 * Secondary: Roboto - Material Design's standard typeface
 * Monospace: Roboto Mono - Consistent width for code and technical content
 */
export const fontFamilies = {
  /**
   * Primary font stack for main interface elements
   * Fallbacks ensure consistent rendering across all platforms
   */
  primary: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, 'Open Sans', 'Helvetica Neue', sans-serif",

  /**
   * Secondary font stack for supporting content
   * Maintains visual hierarchy while ensuring readability
   */
  secondary: "'Roboto', -apple-system, BlinkMacSystemFont, 'Segoe UI', Oxygen, Ubuntu, Cantarell, 'Open Sans', 'Helvetica Neue', sans-serif",

  /**
   * Monospace font stack for code displays and technical content
   * Optimized for readability in development contexts
   */
  monospace: "'Roboto Mono', 'SF Mono', 'Consolas', 'Monaco', 'Courier New', monospace"
} as const;

/**
 * Standardized font weights following Material Design principles
 * Ensures consistent visual hierarchy and accessibility
 * Values align with CSS font-weight specifications
 */
export const fontWeights = {
  /**
   * Regular weight (400) for body text and general content
   * Provides optimal readability for extended reading
   */
  regular: 400,

  /**
   * Medium weight (500) for semi-emphasized content
   * Suitable for subheadings and important interface elements
   */
  medium: 500,

  /**
   * Semibold weight (600) for stronger emphasis
   * Used for section headers and key interactive elements
   */
  semibold: 600,

  /**
   * Bold weight (700) for maximum emphasis
   * Reserved for primary headings and critical UI elements
   */
  bold: 700
} as const;