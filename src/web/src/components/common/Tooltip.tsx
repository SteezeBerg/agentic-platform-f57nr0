import React, { useState, useCallback, useRef, useEffect } from 'react';
import { styled } from '@aws-amplify/ui-react'; // v6.0.0
import { tokens } from '../../config/theme';

interface TooltipProps {
  content: string | React.ReactNode;
  position?: 'top' | 'right' | 'bottom' | 'left';
  delay?: number;
  disabled?: boolean;
  ariaLabel?: string;
  className?: string;
  children: React.ReactNode;
}

const TooltipContainer = styled('div', {
  position: 'relative',
  display: 'inline-block',
  cursor: 'pointer',
});

const TooltipContent = styled('div', {
  position: 'absolute',
  zIndex: 1400, // Using theme z-index for tooltips
  padding: tokens.space.sm,
  borderRadius: tokens.radii.sm,
  backgroundColor: tokens.colors.background.dark,
  color: tokens.colors.text.primary.dark,
  fontSize: tokens.typography.fontSize.sm,
  lineHeight: tokens.typography.lineHeight.normal,
  boxShadow: tokens.shadows.medium,
  maxWidth: '200px',
  wordWrap: 'break-word',
  transition: `opacity ${tokens.animation.duration.normal} ${tokens.animation.easing.easeInOut}, transform ${tokens.animation.duration.normal} ${tokens.animation.easing.easeInOut}`,
  pointerEvents: 'none',
  userSelect: 'none',
  opacity: 0,
  transform: 'scale(0.95)',
  '&[data-show="true"]': {
    opacity: 1,
    transform: 'scale(1)',
  },
});

const calculatePosition = (
  position: TooltipProps['position'],
  triggerRect: DOMRect,
  tooltipRect: DOMRect
) => {
  const spacing = 8; // Base spacing from trigger element
  let styles = {};

  switch (position) {
    case 'top':
      styles = {
        bottom: `${triggerRect.height + spacing}px`,
        left: '50%',
        transform: 'translateX(-50%)',
      };
      break;
    case 'right':
      styles = {
        left: `${triggerRect.width + spacing}px`,
        top: '50%',
        transform: 'translateY(-50%)',
      };
      break;
    case 'bottom':
      styles = {
        top: `${triggerRect.height + spacing}px`,
        left: '50%',
        transform: 'translateX(-50%)',
      };
      break;
    case 'left':
      styles = {
        right: `${triggerRect.width + spacing}px`,
        top: '50%',
        transform: 'translateY(-50%)',
      };
      break;
  }

  return styles;
};

const Tooltip = React.memo<TooltipProps>(({
  content,
  position = 'top',
  delay = 200,
  disabled = false,
  ariaLabel,
  className,
  children
}) => {
  const [isVisible, setIsVisible] = useState(false);
  const triggerRef = useRef<HTMLDivElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const timeoutRef = useRef<NodeJS.Timeout>();

  const showTooltip = useCallback(() => {
    if (disabled) return;
    timeoutRef.current = setTimeout(() => setIsVisible(true), delay);
  }, [delay, disabled]);

  const hideTooltip = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    setIsVisible(false);
  }, []);

  const handleKeyboardEvents = useCallback((event: KeyboardEvent) => {
    if (event.key === 'Escape' && isVisible) {
      hideTooltip();
    }
  }, [hideTooltip, isVisible]);

  useEffect(() => {
    document.addEventListener('keydown', handleKeyboardEvents);
    return () => {
      document.removeEventListener('keydown', handleKeyboardEvents);
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, [handleKeyboardEvents]);

  const handleFocus = useCallback(() => {
    showTooltip();
  }, [showTooltip]);

  const handleBlur = useCallback(() => {
    hideTooltip();
  }, [hideTooltip]);

  const tooltipId = `tooltip-${Math.random().toString(36).substr(2, 9)}`;

  return (
    <TooltipContainer
      ref={triggerRef}
      className={className}
      onMouseEnter={showTooltip}
      onMouseLeave={hideTooltip}
      onFocus={handleFocus}
      onBlur={handleBlur}
      aria-describedby={isVisible ? tooltipId : undefined}
      role="tooltip"
    >
      {children}
      <TooltipContent
        ref={tooltipRef}
        id={tooltipId}
        role="tooltip"
        aria-hidden={!isVisible}
        data-show={isVisible}
        style={triggerRef.current && tooltipRef.current ? 
          calculatePosition(position, triggerRef.current.getBoundingClientRect(), tooltipRef.current.getBoundingClientRect()) : 
          undefined
        }
        aria-label={ariaLabel}
      >
        {content}
      </TooltipContent>
    </TooltipContainer>
  );
});

Tooltip.displayName = 'Tooltip';

export default Tooltip;