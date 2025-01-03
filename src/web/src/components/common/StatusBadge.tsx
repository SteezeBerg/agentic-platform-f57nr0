import { memo, useCallback } from 'react';
import { View, Text } from '@aws-amplify/ui-react';
// @aws-amplify/ui-react version ^6.0.0
// react version ^18.2.0

type StatusVariant = 'success' | 'warning' | 'error' | 'info' | 'default';
type StatusSize = 'small' | 'medium' | 'large';

export interface StatusBadgeProps {
  /** Status text to display within the badge */
  status: string;
  /** Visual variant determining color scheme and semantic meaning */
  variant?: StatusVariant;
  /** Size variant affecting padding and typography scale */
  size?: StatusSize;
  /** Optional CSS class name for custom styling and composition */
  className?: string;
  /** Custom aria-label for screen readers, falls back to status text */
  ariaLabel?: string;
}

const useVariantStyles = (variant: StatusVariant = 'default') => {
  return useCallback(() => {
    const variantStyles = {
      success: {
        backgroundColor: 'tokens.colors.success.10',
        color: 'tokens.colors.success.80',
        ':hover': { backgroundColor: 'tokens.colors.success.20' },
        ':focus-visible': {
          backgroundColor: 'tokens.colors.success.30',
          outline: '2px solid tokens.colors.success.60',
          outlineOffset: '2px'
        }
      },
      warning: {
        backgroundColor: 'tokens.colors.warning.10',
        color: 'tokens.colors.warning.80',
        ':hover': { backgroundColor: 'tokens.colors.warning.20' },
        ':focus-visible': {
          backgroundColor: 'tokens.colors.warning.30',
          outline: '2px solid tokens.colors.warning.60',
          outlineOffset: '2px'
        }
      },
      error: {
        backgroundColor: 'tokens.colors.error.10',
        color: 'tokens.colors.error.80',
        ':hover': { backgroundColor: 'tokens.colors.error.20' },
        ':focus-visible': {
          backgroundColor: 'tokens.colors.error.30',
          outline: '2px solid tokens.colors.error.60',
          outlineOffset: '2px'
        }
      },
      info: {
        backgroundColor: 'tokens.colors.info.10',
        color: 'tokens.colors.info.80',
        ':hover': { backgroundColor: 'tokens.colors.info.20' },
        ':focus-visible': {
          backgroundColor: 'tokens.colors.info.30',
          outline: '2px solid tokens.colors.info.60',
          outlineOffset: '2px'
        }
      },
      default: {
        backgroundColor: 'tokens.colors.neutral.10',
        color: 'tokens.colors.neutral.80',
        ':hover': { backgroundColor: 'tokens.colors.neutral.20' },
        ':focus-visible': {
          backgroundColor: 'tokens.colors.neutral.30',
          outline: '2px solid tokens.colors.neutral.60',
          outlineOffset: '2px'
        }
      }
    };

    return variantStyles[variant];
  }, [variant]);
};

const useSizeStyles = (size: StatusSize = 'medium') => {
  return useCallback(() => {
    const sizeStyles = {
      small: {
        padding: 'tokens.space.xs tokens.space.sm',
        fontSize: 'tokens.fontSizes.xs',
        lineHeight: 'tokens.lineHeights.sm',
        borderRadius: 'tokens.radii.xs'
      },
      medium: {
        padding: 'tokens.space.sm tokens.space.md',
        fontSize: 'tokens.fontSizes.sm',
        lineHeight: 'tokens.lineHeights.md',
        borderRadius: 'tokens.radii.sm'
      },
      large: {
        padding: 'tokens.space.md tokens.space.lg',
        fontSize: 'tokens.fontSizes.md',
        lineHeight: 'tokens.lineHeights.lg',
        borderRadius: 'tokens.radii.md'
      }
    };

    return sizeStyles[size];
  }, [size]);
};

export const StatusBadge = memo<StatusBadgeProps>(({
  status,
  variant = 'default',
  size = 'medium',
  className,
  ariaLabel
}) => {
  const variantStyles = useVariantStyles(variant);
  const sizeStyles = useSizeStyles(size);

  return (
    <View
      as="span"
      className={className}
      role="status"
      aria-label={ariaLabel || status}
      aria-live="polite"
      tabIndex={0}
      display="inline-flex"
      alignItems="center"
      justifyContent="center"
      fontWeight="tokens.fontWeights.medium"
      transition="all 0.2s ease"
      cursor="default"
      userSelect="none"
      {...variantStyles()}
      {...sizeStyles()}
    >
      <Text
        as="span"
        color="inherit"
        fontWeight="inherit"
        fontSize="inherit"
        lineHeight="inherit"
      >
        {status}
      </Text>
    </View>
  );
});

StatusBadge.displayName = 'StatusBadge';

export default StatusBadge;