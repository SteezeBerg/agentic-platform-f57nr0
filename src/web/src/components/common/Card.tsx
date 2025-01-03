import React from 'react';
import { Card, CardProps, useTheme } from '@aws-amplify/ui-react';

// Material Design elevation values in pixels
const ELEVATION_MAP = {
  1: '0 1px 3px rgba(0,0,0,0.12), 0 1px 2px rgba(0,0,0,0.24)',
  2: '0 3px 6px rgba(0,0,0,0.15), 0 2px 4px rgba(0,0,0,0.12)',
  3: '0 10px 20px rgba(0,0,0,0.15), 0 3px 6px rgba(0,0,0,0.10)',
  4: '0 15px 25px rgba(0,0,0,0.15), 0 5px 10px rgba(0,0,0,0.05)',
  5: '0 20px 40px rgba(0,0,0,0.2)'
};

export interface CustomCardProps extends CardProps {
  /**
   * Card elevation level (1-5) following Material Design principles
   * @default 1
   */
  elevation?: 1 | 2 | 3 | 4 | 5;
  
  /**
   * Flag to disable default padding for custom content layouts
   * @default false
   */
  noPadding?: boolean;
  
  /**
   * Visual variant following Material Design 3.0 card styles
   * @default 'elevated'
   */
  variant?: 'outlined' | 'filled' | 'elevated';
  
  /**
   * Additional CSS classes for custom styling integration
   */
  className?: string;
}

/**
 * Enhanced card component with AWS Amplify UI integration, theme support,
 * and accessibility features following WCAG 2.1 Level AA guidelines.
 */
const CustomCard: React.FC<CustomCardProps> = ({
  children,
  elevation = 1,
  noPadding = false,
  variant = 'elevated',
  className = '',
  ...props
}) => {
  const { tokens } = useTheme();

  // Calculate base styles including RTL support
  const baseStyles = {
    padding: noPadding ? 0 : tokens.space.medium,
    borderRadius: tokens.radii.medium,
    backgroundColor: tokens.colors.background.primary,
    transition: 'box-shadow 0.3s ease-in-out',
    direction: 'inherit', // Supports RTL layouts
  };

  // Apply variant-specific styling
  const variantStyles = {
    outlined: {
      border: `1px solid ${tokens.colors.border.primary}`,
      boxShadow: 'none',
    },
    filled: {
      backgroundColor: tokens.colors.background.secondary,
      border: 'none',
      boxShadow: 'none',
    },
    elevated: {
      border: 'none',
      boxShadow: ELEVATION_MAP[elevation],
    },
  };

  // Merge styles based on variant
  const combinedStyles = {
    ...baseStyles,
    ...variantStyles[variant],
  };

  // Accessibility attributes
  const a11yProps = {
    role: 'region',
    tabIndex: 0,
    'aria-label': props['aria-label'] || 'Content card',
  };

  return (
    <Card
      {...props}
      {...a11yProps}
      className={`amplify-card ${className}`}
      style={combinedStyles}
      onKeyDown={(e) => {
        // Keyboard navigation support
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          const clickableElement = e.currentTarget.querySelector('button, a, [role="button"]');
          if (clickableElement instanceof HTMLElement) {
            clickableElement.click();
          }
        }
      }}
    >
      {children}
    </Card>
  );
};

export default CustomCard;