import React, { useCallback, useMemo } from 'react';
import { Button as AmplifyButton } from '@aws-amplify/ui-react'; // v6.0.0
import { useId } from 'react';
import { Loading, LoadingProps } from './Loading';
import { Tooltip } from './Tooltip';
import { LoadingState } from '../../types/common';
import { useTheme } from '../../hooks/useTheme';
import { UI_CONSTANTS } from '../../config/constants';

/**
 * Enhanced props interface for the Button component with comprehensive accessibility support
 */
export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  /** Visual style variant of the button */
  variant?: 'primary' | 'secondary' | 'tertiary' | 'link';
  /** Size variant of the button */
  size?: 'small' | 'medium' | 'large';
  /** Loading state of the button */
  isLoading?: boolean;
  /** Whether button should take full width */
  isFullWidth?: boolean;
  /** Optional tooltip text with ARIA support */
  tooltip?: string;
  /** Optional icon to show before text */
  leftIcon?: React.ReactNode;
  /** Optional icon to show after text */
  rightIcon?: React.ReactNode;
  /** Accessible label for screen readers */
  ariaLabel?: string;
  /** Test ID for component testing */
  testId?: string;
}

/**
 * Get size-specific styles based on WCAG minimum touch target sizes
 */
const getSizeStyles = (size: ButtonProps['size']) => {
  const minSize = UI_CONSTANTS.MINIMUM_TARGET_SIZE;

  switch (size) {
    case 'small':
      return {
        height: '32px',
        padding: '0 12px',
        fontSize: '0.875rem',
        minWidth: `${minSize}px`,
      };
    case 'large':
      return {
        height: '48px',
        padding: '0 24px',
        fontSize: '1.125rem',
        minWidth: `${minSize}px`,
      };
    default: // medium
      return {
        height: '40px',
        padding: '0 16px',
        fontSize: '1rem',
        minWidth: `${minSize}px`,
      };
  }
};

/**
 * Enhanced button component with comprehensive accessibility and user experience features
 */
export const Button = React.memo<ButtonProps>(({
  variant = 'primary',
  size = 'medium',
  isLoading = false,
  isFullWidth = false,
  tooltip,
  leftIcon,
  rightIcon,
  ariaLabel,
  testId,
  children,
  disabled,
  className,
  onClick,
  ...props
}) => {
  const { theme, isDarkMode } = useTheme();
  const buttonId = useId();
  const tooltipId = useId();

  // Memoize button styles
  const buttonStyles = useMemo(() => ({
    ...getSizeStyles(size),
    width: isFullWidth ? '100%' : 'auto',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '8px',
    border: 'none',
    borderRadius: theme.tokens.radii.sm,
    fontWeight: theme.tokens.fontWeights.medium,
    transition: `all ${theme.tokens.transitions?.duration.normal} ${theme.tokens.transitions?.timing.ease}`,
    cursor: disabled || isLoading ? 'not-allowed' : 'pointer',
    opacity: disabled ? '0.5' : '1',
    position: 'relative',
    outline: 'none',
    '&:focus-visible': {
      boxShadow: `0 0 0 2px ${theme.tokens.colors.border.focus}`,
    },
    '@media (prefers-reduced-motion: reduce)': {
      transition: 'none',
    },
  }), [size, isFullWidth, theme, disabled, isLoading]);

  // Handle click with loading state
  const handleClick = useCallback((event: React.MouseEvent<HTMLButtonElement>) => {
    if (isLoading || disabled) return;
    onClick?.(event);
  }, [onClick, isLoading, disabled]);

  // Loading indicator configuration
  const loadingProps: LoadingProps = {
    size: 'small',
    color: variant === 'primary' ? theme.tokens.colors.text.inverse : theme.tokens.colors.text.primary,
  };

  const button = (
    <AmplifyButton
      id={buttonId}
      variant={variant}
      size={size}
      isLoading={isLoading}
      loadingText="Loading..."
      isDisabled={disabled || isLoading}
      onClick={handleClick}
      className={className}
      css={buttonStyles}
      data-testid={testId}
      aria-busy={isLoading}
      aria-disabled={disabled || isLoading}
      aria-label={ariaLabel}
      aria-describedby={tooltip ? tooltipId : undefined}
      {...props}
    >
      {isLoading && <Loading {...loadingProps} data-loading-state={LoadingState.LOADING} />}
      {!isLoading && leftIcon && <span className="button-icon-left">{leftIcon}</span>}
      <span className="button-text">{children}</span>
      {!isLoading && rightIcon && <span className="button-icon-right">{rightIcon}</span>}
    </AmplifyButton>
  );

  return tooltip ? (
    <Tooltip content={tooltip} id={tooltipId}>
      {button}
    </Tooltip>
  ) : button;
});

Button.displayName = 'Button';

export default Button;