import { createTheme } from '@aws-amplify/ui-react'; // ^6.0.0
import { css } from '@emotion/react'; // ^11.11.0
import { darkTheme } from '../themes/dark';
import { lightTheme } from '../themes/light';
import { theme } from '../../config/theme';

// Global styles with accessibility and responsive design support
export const globalStyles = {
  body: {
    margin: 0,
    padding: 0,
    fontFamily: "Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
    WebkitFontSmoothing: 'antialiased',
    MozOsxFontSmoothing: 'grayscale',
    // Smooth theme transitions with reduced motion support
    transition: 'background-color 0.3s ease-in-out',
    '@media (prefers-reduced-motion: reduce)': {
      transition: 'none'
    }
  },
  html: {
    boxSizing: 'border-box',
    // Responsive typography scaling
    fontSize: '16px',
    '@media (min-width: 768px)': {
      fontSize: '18px'
    },
    '@media (min-width: 1440px)': {
      fontSize: '20px'
    }
  },
  '*': {
    boxSizing: 'inherit'
  },
  // Focus management for keyboard navigation
  ':focus-visible': {
    outline: '2px solid var(--amplify-colors-blue-60)',
    outlineOffset: '2px'
  },
  // High contrast mode support
  '@media (prefers-contrast: high)': {
    ':focus-visible': {
      outline: '3px solid currentColor'
    }
  }
};

// Create theme configurations with accessibility enhancements
const createThemes = () => {
  // Base theme with shared tokens
  const baseTheme = theme.tokens;

  // Create light theme
  const light = createTheme({
    name: 'agent-builder-hub-light',
    tokens: {
      ...baseTheme,
      ...lightTheme.tokens,
      // Accessibility enhancements
      focus: {
        outline: {
          width: '2px',
          style: 'solid',
          color: 'var(--amplify-colors-blue-60)',
          offset: '2px'
        }
      }
    }
  });

  // Create dark theme
  const dark = createTheme({
    name: 'agent-builder-hub-dark',
    tokens: {
      ...baseTheme,
      ...darkTheme.tokens,
      // Ensure sufficient contrast in dark mode
      colors: {
        ...darkTheme.tokens.colors,
        text: {
          primary: 'rgba(255, 255, 255, 0.87)',
          secondary: 'rgba(255, 255, 255, 0.60)'
        }
      }
    }
  });

  // Create high contrast theme
  const highContrast = createTheme({
    name: 'agent-builder-hub-high-contrast',
    tokens: {
      ...baseTheme,
      colors: {
        background: {
          primary: '#FFFFFF',
          secondary: '#000000'
        },
        text: {
          primary: '#000000',
          secondary: '#000000'
        },
        border: {
          primary: '#000000',
          focus: '#000000'
        }
      },
      // Enhanced focus indicators
      focus: {
        outline: {
          width: '3px',
          style: 'solid',
          color: '#000000',
          offset: '3px'
        }
      }
    }
  });

  return { light, dark, highContrast };
};

// Export theme configurations
export const themes = createThemes();

// Export CSS helper for styled components
export const createStyledComponent = (styles: any) => css(styles);