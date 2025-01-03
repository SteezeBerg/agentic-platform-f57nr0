import React, { useCallback, useMemo } from 'react';
import { IconButton as AmplifyIconButton } from '@aws-amplify/ui-react'; // v6.0.0
import { ButtonProps } from './Button';
import { Tooltip } from './Tooltip';
import { useTheme } from '../hooks/useTheme';
import { UI_CONSTANTS } from '../../config/constants';

/**
 * Props interface for the IconButton component with comprehensive accessibility support
 * @interface IconButtonProps
 */
export interface IconButtonProps extends Omit<ButtonProps, 'leftIcon' | 'rightIcon'> {
  /** Icon element to display */
  icon: React.ReactNode;
  /** Accessible label for screen readers */
  ariaLabel: string;
  /** Optional tooltip text for enhanced accessibility */
  tooltip?: string;
  /** Size variant affecting button dimensions and icon scale */
  size?: 'small' | 'medium' | 'large';
  /** Visual style variant following design system */
  variant?: 'primary' | 'secondary' | 'tertiary' | 'ghost';
  /** Loading state with automatic disable */
  isLoading?: boolean;
}

/**
 * Get size-specific styles based on WCAG minimum touch target sizes
 */
const getIconButtonSize = (size: IconButtonProps['size']) => {
  const minSize = UI_CONSTANTS.MINIMUM_TARGET_SIZE;

  switch (size) {
    case 'small':
      return {
        width: '32px',
        height: '32px',
        minWidth: `${minSize}px`,
        minHeight: `${minSize}px`,
        padding: '6px',
        fontSize: '1rem',
      };
    case 'large':
      return {
        width: '48px',
        height: '48px',
        minWidth: `${minSize}px`,
        minHeight: `${minSize}px`,
        padding: '12px',
        fontSize: '1.5rem',
      };
    default: // medium
      return {
        width: '40px',
        height: '40px',
        minWidth: `${minSize}px`,
        minHeight: `${minSize}px`,
        padding: '8px',
        fontSize: '1.25rem',
      };
  }
};

/**
 * Accessible icon button component with tooltip support and comprehensive ARIA attributes
 * Implements AWS Amplify UI design patterns with Material Design 3.0 principles
 * @component
 */
export const IconButton = React.memo<IconButtonProps>(({
  icon,
  ariaLabel,
  tooltip,
  size = 'medium',
  variant = 'secondary',
  isLoading = false,
  disabled,
  className,
  onClick,
  testId,
  ...props
}) => {
  const { theme, isDarkMode } = useTheme();

  // Memoize button styles
  const buttonStyles = useMemo(() => ({
    ...getIconButtonSize(size),
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    border: 'none',
    borderRadius: theme.tokens.radii.sm,
    transition: `all ${theme.tokens.transitions?.duration.normal} ${theme.tokens.transitions?.timing.ease}`,
    cursor: disabled || isLoading ? 'not-allowed' : 'pointer',
    opacity: disabled ? '0.5' : '1',
    position: 'relative',
    outline: 'none',
    backgroundColor: 'transparent',
    color: isDarkMode ? theme.tokens.colors.text.primary.dark : theme.tokens.colors.text.primary.light,
    '&:focus-visible': {
      boxShadow: `0 0 0 2px ${theme.tokens.colors.border.focus}`,
      outline: 'none',
    },
    '&:hover:not(:disabled)': {
      backgroundColor: isDarkMode ? 
        'rgba(255, 255, 255, 0.08)' : 
        'rgba(0, 0, 0, 0.04)',
    },
    '@media (prefers-reduced-motion: reduce)': {
      transition: 'none',
    },
  }), [size, theme, disabled, isLoading, isDarkMode]);

  // Handle click with loading state
  const handleClick = useCallback((event: React.MouseEvent<HTMLButtonElement>) => {
    if (isLoading || disabled) return;
    onClick?.(event);
  }, [onClick, isLoading, disabled]);

  const button = (
    <AmplifyIconButton
      variant={variant}
      size={size}
      isLoading={isLoading}
      loadingText={ariaLabel}
      isDisabled={disabled || isLoading}
      onClick={handleClick}
      className={className}
      css={buttonStyles}
      data-testid={testId}
      aria-label={ariaLabel}
      aria-busy={isLoading}
      aria-disabled={disabled || isLoading}
      {...props}
    >
      {icon}
    </AmplifyIconButton>
  );

  return tooltip ? (
    <Tooltip content={tooltip}>
      {button}
    </Tooltip>
  ) : button;
});

IconButton.displayName = 'IconButton';

export default IconButton;