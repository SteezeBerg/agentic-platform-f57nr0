import { createTheme, Theme, ThemeTokens, ComponentTokens } from '@aws-amplify/ui-react';

// Breakpoint configuration aligned with design specifications
const breakpoints = {
  values: {
    xs: '0px',
    sm: '320px',
    md: '768px',
    lg: '1024px',
    xl: '1440px'
  }
};

// Typography system with WCAG 2.1 Level AA compliance
const typography = {
  fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif",
  fontSize: {
    xs: '0.75rem',    // 12px
    sm: '0.875rem',   // 14px
    md: '1rem',       // 16px - Base size for WCAG compliance
    lg: '1.125rem',   // 18px
    xl: '1.25rem',    // 20px
    display: '2rem'   // 32px
  },
  fontWeight: {
    light: '300',
    regular: '400',
    medium: '500',
    semibold: '600',
    bold: '700'
  },
  lineHeight: {
    tight: '1.2',
    normal: '1.5',    // Optimal readability for main content
    relaxed: '1.75'
  }
};

// Spacing system for consistent component layout
const spacing = {
  xs: '0.25rem',   // 4px
  sm: '0.5rem',    // 8px
  md: '1rem',      // 16px
  lg: '1.5rem',    // 24px
  xl: '2rem',      // 32px
  '2xl': '3rem'    // 48px
};

// Color tokens with WCAG 2.1 Level AA contrast ratios
const colors = {
  primary: {
    light: '#0066FF',   // Base primary color
    dark: '#409CFF',    // Adjusted for dark mode contrast
    contrast: '#FFFFFF' // Text color on primary background
  },
  secondary: {
    light: '#666666',
    dark: '#A0A0A0',
    contrast: '#FFFFFF'
  },
  background: {
    light: '#FFFFFF',
    dark: '#121212',
    contrast: '#000000'
  },
  surface: {
    light: '#F5F5F5',
    dark: '#1E1E1E',
    contrast: '#000000'
  },
  error: {
    light: '#D32F2F',
    dark: '#EF5350',
    contrast: '#FFFFFF'
  },
  warning: {
    light: '#ED6C02',
    dark: '#FF9800',
    contrast: '#000000'
  },
  success: {
    light: '#2E7D32',
    dark: '#4CAF50',
    contrast: '#FFFFFF'
  },
  text: {
    primary: {
      light: 'rgba(0, 0, 0, 0.87)',
      dark: 'rgba(255, 255, 255, 0.87)'
    },
    secondary: {
      light: 'rgba(0, 0, 0, 0.6)',
      dark: 'rgba(255, 255, 255, 0.6)'
    },
    disabled: {
      light: 'rgba(0, 0, 0, 0.38)',
      dark: 'rgba(255, 255, 255, 0.38)'
    }
  }
};

// Animation tokens for consistent motion design
const animation = {
  duration: {
    fast: '150ms',
    normal: '250ms',
    slow: '400ms'
  },
  easing: {
    easeInOut: 'cubic-bezier(0.4, 0, 0.2, 1)',
    easeOut: 'cubic-bezier(0.0, 0, 0.2, 1)',
    easeIn: 'cubic-bezier(0.4, 0, 1, 1)'
  }
};

// Component-specific tokens with accessibility enhancements
const components: ComponentTokens = {
  button: {
    primary: {
      backgroundColor: colors.primary.light,
      color: colors.primary.contrast,
      _hover: {
        backgroundColor: colors.primary.dark,
        transform: 'translateY(-1px)'
      },
      _focus: {
        boxShadow: `0 0 0 2px ${colors.primary.light}`,
        outline: 'none'
      },
      _disabled: {
        backgroundColor: colors.text.disabled.light,
        cursor: 'not-allowed'
      }
    }
  },
  card: {
    backgroundColor: colors.surface.light,
    borderRadius: spacing.sm,
    boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
    padding: spacing.lg
  },
  input: {
    borderColor: colors.text.secondary.light,
    borderRadius: spacing.xs,
    _focus: {
      borderColor: colors.primary.light,
      boxShadow: `0 0 0 1px ${colors.primary.light}`,
      outline: 'none'
    },
    _error: {
      borderColor: colors.error.light
    }
  },
  heading: {
    color: colors.text.primary.light,
    fontWeight: typography.fontWeight.semibold,
    lineHeight: typography.lineHeight.tight
  }
};

// Create base theme with comprehensive configuration
const createBaseTheme = (): ThemeTokens => ({
  name: 'agent-builder-hub-theme',
  tokens: {
    breakpoints,
    colors,
    typography,
    space: spacing,
    components,
    animation,
    borderWidths: {
      small: '1px',
      medium: '2px',
      large: '4px'
    },
    radii: {
      xs: '2px',
      sm: '4px',
      md: '8px',
      lg: '16px',
      xl: '24px'
    },
    shadows: {
      small: '0 1px 2px rgba(0,0,0,0.1)',
      medium: '0 2px 4px rgba(0,0,0,0.1)',
      large: '0 4px 8px rgba(0,0,0,0.1)'
    },
    zIndices: {
      base: 0,
      dropdown: 1000,
      sticky: 1100,
      modal: 1300,
      tooltip: 1400
    }
  }
});

// Export theme configuration
export const theme = createTheme(createBaseTheme());

// Export component-specific tokens for direct access
export { components };