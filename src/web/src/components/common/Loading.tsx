import React, { memo, useCallback, useEffect, useRef } from 'react';
import { Loader, useTheme } from '@aws-amplify/ui-react';
import { css } from '@emotion/react';
import { LoadingState } from '../../types/common';

/**
 * Props interface for the Loading component with comprehensive customization options
 * @interface LoadingProps
 */
interface LoadingProps {
  /** Controls the size of the loading indicator */
  size?: 'small' | 'medium' | 'large';
  /** Enables full-screen overlay with backdrop blur */
  overlay?: boolean;
  /** Loading message with ARIA support */
  text?: string;
  /** Theme-aware custom color */
  color?: string;
  /** Loading timeout in milliseconds */
  timeout?: number;
}

/**
 * Converts size prop to pixel values for loader with theme scaling
 * @param size - The size prop value
 * @returns Theme-scaled pixel value for loader size
 */
const getLoaderSize = (size?: 'small' | 'medium' | 'large'): number => {
  const { tokens } = useTheme();
  const scale = parseFloat(tokens.space.medium.value);

  switch (size) {
    case 'small':
      return 24 * scale;
    case 'large':
      return 48 * scale;
    case 'medium':
    default:
      return 32 * scale;
  }
};

/**
 * A reusable loading component that implements AWS Amplify UI design patterns
 * with Material Design 3.0 principles. Provides visual feedback during async
 * operations with customizable appearance and accessibility features.
 * 
 * @component
 * @example
 * ```tsx
 * <Loading size="medium" overlay text="Loading data..." />
 * ```
 */
const Loading: React.FC<LoadingProps> = memo(({
  size = 'medium',
  overlay = false,
  text,
  color,
  timeout
}) => {
  const { tokens } = useTheme();
  const timeoutRef = useRef<NodeJS.Timeout>();

  // Handle loading timeout if specified
  useEffect(() => {
    if (timeout) {
      timeoutRef.current = setTimeout(() => {
        console.warn(`Loading timeout reached after ${timeout}ms`);
      }, timeout);
    }

    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, [timeout]);

  // Memoize styles to prevent unnecessary recalculations
  const containerStyles = useCallback(() => css`
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: ${tokens.space.medium.value};
    transition: all 0.2s ease-in-out;

    @media (prefers-reduced-motion) {
      transition: none;
    }
  `, [tokens]);

  const overlayStyles = useCallback(() => css`
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background-color: rgba(${tokens.colors.background.primary.value}, 0.8);
    backdrop-filter: blur(4px);
    z-index: ${tokens.zIndices.overlay};
    transition: opacity 0.2s ease-in-out;

    @media (prefers-reduced-motion) {
      transition: none;
    }
  `, [tokens]);

  const loaderSize = getLoaderSize(size);

  return (
    <div
      role="alert"
      aria-busy="true"
      aria-live="polite"
      css={[containerStyles(), overlay && overlayStyles()]}
      data-testid="loading-component"
    >
      <Loader
        size={loaderSize}
        variation="linear"
        filledColor={color || tokens.colors.brand.primary.value}
        hasIcon={true}
        ariaLabel={text || 'Loading content'}
        data-loading-state={LoadingState.LOADING}
      />
      {text && (
        <span
          css={css`
            color: ${tokens.colors.font.primary};
            font-size: ${tokens.fontSizes.medium};
            font-weight: ${tokens.fontWeights.normal};
          `}
        >
          {text}
        </span>
      )}
    </div>
  );
});

Loading.displayName = 'Loading';

export type { LoadingProps };
export default Loading;