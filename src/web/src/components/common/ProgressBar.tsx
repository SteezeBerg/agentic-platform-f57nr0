import { useTheme, View } from '@aws-amplify/ui-react';
import styled from '@emotion/styled';
import { LoadingState } from '../../types/common';

/**
 * Props interface for the ProgressBar component
 */
interface ProgressBarProps {
  /** Current progress value (0-100) */
  value: number;
  /** Visual style variant */
  variant?: 'primary' | 'success' | 'warning' | 'error';
  /** Size variant affecting height */
  size?: 'small' | 'medium' | 'large';
  /** Accessible label for screen readers */
  label?: string;
  /** Toggle for displaying percentage value */
  showValue?: boolean;
  /** Enable/disable transition animations */
  animated?: boolean;
}

/**
 * Gets the appropriate theme color based on variant
 */
const getProgressColor = (theme: any, variant?: string) => {
  const colorMap = {
    primary: theme.tokens.colors.brand.primary[80],
    success: theme.tokens.colors.feedback.success,
    warning: theme.tokens.colors.feedback.warning,
    error: theme.tokens.colors.feedback.error,
  };

  return variant && colorMap[variant] ? colorMap[variant] : colorMap.primary;
};

const ProgressBarContainer = styled(View)<{ size?: string }>`
  width: 100%;
  height: ${props => 
    props.size === 'small' ? '4px' : 
    props.size === 'large' ? '12px' : '8px'
  };
  background-color: ${props => props.theme.tokens.colors.background.secondary};
  border-radius: ${props => props.theme.tokens.radii.small};
  overflow: hidden;
  position: relative;
  direction: ${props => props.theme.tokens.direction};

  @media (prefers-reduced-motion: reduce) {
    transition: none;
  }
`;

const ProgressBarFill = styled(View)<{
  value: number;
  variant?: string;
  animated?: boolean;
}>`
  width: ${props => Math.min(Math.max(props.value, 0), 100)}%;
  height: 100%;
  background-color: ${props => getProgressColor(props.theme, props.variant)};
  transition: ${props => props.animated ? 'width 0.3s ease-in-out' : 'none'};
  transform-origin: ${props => 
    props.theme.tokens.direction === 'rtl' ? 'right' : 'left'
  };
`;

const ProgressBarLabel = styled(View)`
  margin-top: ${props => props.theme.tokens.space.xs};
  font-size: ${props => props.theme.tokens.fontSizes.small};
  color: ${props => props.theme.tokens.colors.font.secondary};
  text-align: ${props => props.theme.tokens.direction === 'rtl' ? 'right' : 'left'};
  user-select: none;
`;

/**
 * A highly accessible progress bar component that follows AWS Amplify UI design patterns
 * and Material Design 3.0 principles.
 * 
 * @component
 * @example
 * ```tsx
 * <ProgressBar
 *   value={75}
 *   variant="primary"
 *   size="medium"
 *   label="Loading progress"
 *   showValue
 *   animated
 * />
 * ```
 */
const ProgressBar: React.FC<ProgressBarProps> = ({
  value,
  variant = 'primary',
  size = 'medium',
  label,
  showValue = false,
  animated = true,
}) => {
  const theme = useTheme();
  const normalizedValue = Math.min(Math.max(value, 0), 100);
  const ariaValueText = `${normalizedValue}% complete`;

  return (
    <View>
      <ProgressBarContainer
        size={size}
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={normalizedValue}
        aria-valuetext={ariaValueText}
        aria-label={label}
      >
        <ProgressBarFill
          value={normalizedValue}
          variant={variant}
          animated={animated}
          data-state={normalizedValue === 100 ? LoadingState.SUCCESS : LoadingState.LOADING}
        />
      </ProgressBarContainer>
      {(showValue || label) && (
        <ProgressBarLabel>
          {label && <span>{label}</span>}
          {showValue && (
            <span aria-hidden="true">
              {label && ' - '}
              {normalizedValue}%
            </span>
          )}
        </ProgressBarLabel>
      )}
    </View>
  );
};

export default ProgressBar;