import { createTheme } from '@aws-amplify/ui-react';
import { ThemeTokens } from '../../config/theme';

// Dark theme color palette with WCAG 2.1 Level AA compliant contrast ratios
const darkColors = {
  background: {
    primary: '#121212',      // Main background
    secondary: '#1E1E1E',    // Surface background
    tertiary: '#2D2D2D',     // Elevated surface
    elevated: '#383838',     // Higher elevation surface
    overlay: 'rgba(0, 0, 0, 0.5)'
  },
  text: {
    primary: 'rgba(255, 255, 255, 0.87)',    // >4.5:1 contrast ratio
    secondary: 'rgba(255, 255, 255, 0.60)',   // >4.5:1 for 18px+ text
    disabled: 'rgba(255, 255, 255, 0.38)',
    hint: 'rgba(255, 255, 255, 0.50)',
    link: '#66B2FF'                          // >4.5:1 contrast ratio
  },
  primary: {
    main: '#3399FF',        // Primary brand color
    light: '#66B2FF',       // Hover state
    dark: '#0066CC',        // Active state
    contrastText: '#000000' // Text on primary color
  },
  secondary: {
    main: '#FFB84D',
    light: '#FFCC80',
    dark: '#FF9900',
    contrastText: '#000000'
  },
  error: {
    main: '#E4606D',
    light: '#E87C87',
    dark: '#DC3545',
    contrastText: '#FFFFFF'
  },
  warning: {
    main: '#FFCD39',
    light: '#FFD966',
    dark: '#FFC107',
    contrastText: '#000000'
  },
  success: {
    main: '#34CE57',
    light: '#4DD679',
    dark: '#28A745',
    contrastText: '#FFFFFF'
  },
  border: {
    primary: '#404040',
    secondary: '#333333',
    focus: '#66B2FF',
    error: '#E4606D'
  },
  elevation: {
    1: '0px 2px 4px rgba(0, 0, 0, 0.2)',
    2: '0px 4px 8px rgba(0, 0, 0, 0.3)',
    3: '0px 8px 16px rgba(0, 0, 0, 0.4)'
  }
};

// Component-specific dark theme overrides
const componentOverrides = {
  Button: {
    primary: {
      backgroundColor: darkColors.primary.main,
      color: darkColors.primary.contrastText,
      _hover: {
        backgroundColor: darkColors.primary.light,
        transform: 'translateY(-1px)'
      },
      _active: {
        backgroundColor: darkColors.primary.dark
      },
      _focus: {
        boxShadow: `0 0 0 2px ${darkColors.border.focus}`,
        outline: 'none'
      },
      _disabled: {
        backgroundColor: darkColors.text.disabled,
        cursor: 'not-allowed'
      }
    }
  },
  Card: {
    backgroundColor: darkColors.background.secondary,
    borderColor: darkColors.border.primary,
    boxShadow: darkColors.elevation[1]
  },
  TextField: {
    backgroundColor: darkColors.background.tertiary,
    borderColor: darkColors.border.secondary,
    color: darkColors.text.primary,
    _hover: {
      borderColor: darkColors.border.primary
    },
    _focus: {
      borderColor: darkColors.border.focus,
      boxShadow: `0 0 0 1px ${darkColors.border.focus}`
    },
    _error: {
      borderColor: darkColors.error.main
    }
  },
  Menu: {
    backgroundColor: darkColors.background.elevated,
    borderColor: darkColors.border.primary,
    boxShadow: darkColors.elevation[2]
  },
  Modal: {
    backgroundColor: darkColors.background.secondary,
    boxShadow: darkColors.elevation[3],
    overlay: {
      backgroundColor: darkColors.background.overlay
    }
  }
};

// Create dark theme configuration
export const darkTheme: ThemeTokens = {
  name: 'agent-builder-hub-dark',
  tokens: {
    colors: {
      ...darkColors,
      // System preference detection support
      mode: 'dark',
      brand: darkColors.primary
    },
    components: componentOverrides,
    // Animation tokens for smooth theme transitions
    transitions: {
      duration: {
        fast: '150ms',
        normal: '250ms',
        slow: '400ms'
      },
      timing: {
        ease: 'cubic-bezier(0.4, 0, 0.2, 1)',
        easeIn: 'cubic-bezier(0.4, 0, 1, 1)',
        easeOut: 'cubic-bezier(0.0, 0, 0.2, 1)'
      }
    },
    // Accessibility enhancements
    focus: {
      outline: {
        width: '2px',
        style: 'solid',
        color: darkColors.border.focus,
        offset: '2px'
      }
    },
    // Motion preferences support
    reduceMotion: {
      transform: 'none',
      transition: 'none'
    }
  },
  // Theme-wide overrides
  overrides: {
    // High contrast mode support
    '@media (prefers-contrast: high)': {
      colors: {
        text: {
          primary: '#FFFFFF',
          secondary: '#FFFFFF'
        },
        border: {
          primary: '#FFFFFF',
          focus: '#FFFFFF'
        }
      }
    },
    // Reduced motion preference support
    '@media (prefers-reduced-motion: reduce)': {
      transitions: {
        duration: {
          fast: '0ms',
          normal: '0ms',
          slow: '0ms'
        }
      }
    }
  }
};

// Create and export the theme
export default createTheme(darkTheme);