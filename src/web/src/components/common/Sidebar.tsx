import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, useBreakpointValue, useFocusTrap } from '@aws-amplify/ui-react'; // v6.0.0
import { Navigation, NavigationProps } from './Navigation';
import { useTheme } from '../../hooks/useTheme';

// Constants for accessibility and responsive design
const SIDEBAR_STYLES = {
  base: {
    position: 'fixed' as const,
    height: '100vh',
    backgroundColor: 'var(--amplify-colors-background-primary)',
    transition: 'transform 0.3s ease-in-out, width 0.3s ease-in-out',
    zIndex: 1200,
    boxShadow: 'var(--amplify-shadows-medium)',
    display: 'flex',
    flexDirection: 'column' as const,
    overflow: 'hidden',
  },
  desktop: {
    width: '280px',
    transform: 'translateX(0)',
  },
  tablet: {
    width: '280px',
    transform: 'translateX(-100%)',
  },
  mobile: {
    width: '100%',
    maxWidth: '320px',
    transform: 'translateX(-100%)',
  },
  backdrop: {
    position: 'fixed' as const,
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    zIndex: 1100,
    opacity: 0,
    visibility: 'hidden',
    transition: 'opacity 0.3s ease-in-out, visibility 0.3s ease-in-out',
  },
  backdropVisible: {
    opacity: 1,
    visibility: 'visible',
  },
};

// Interface for Sidebar props
export interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
  className?: string;
  reducedMotion?: boolean;
}

// Custom hook for handling swipe gestures
const useSwipeGesture = (onClose: () => void) => {
  const touchStartX = useRef<number>(0);
  const touchMoveX = useRef<number>(0);
  const swipeThreshold = 100;

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
    touchMoveX.current = e.touches[0].clientX;
  }, []);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    touchMoveX.current = e.touches[0].clientX;
  }, []);

  const handleTouchEnd = useCallback(() => {
    const swipeDistance = touchMoveX.current - touchStartX.current;
    if (swipeDistance < -swipeThreshold) {
      onClose();
    }
  }, [onClose]);

  return {
    handleTouchStart,
    handleTouchMove,
    handleTouchEnd,
  };
};

/**
 * Responsive sidebar component with accessibility features and gesture support
 */
export const Sidebar = React.memo<SidebarProps>(({
  isOpen,
  onClose,
  className,
  reducedMotion = false,
}) => {
  const { theme, isDarkMode } = useTheme();
  const [isMounted, setIsMounted] = useState(false);
  const sidebarRef = useRef<HTMLDivElement>(null);
  const { trapFocus, releaseFocus } = useFocusTrap();

  // Responsive breakpoint handling
  const isMobile = useBreakpointValue({
    base: true,
    md: false,
  });

  // Swipe gesture handling for mobile
  const swipeHandlers = useSwipeGesture(onClose);

  // Focus trap management
  useEffect(() => {
    if (isOpen && isMobile) {
      trapFocus(sidebarRef.current);
    } else {
      releaseFocus();
    }
    return () => releaseFocus();
  }, [isOpen, isMobile, trapFocus, releaseFocus]);

  // Handle keyboard events
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && isOpen) {
        onClose();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // Mount animation handling
  useEffect(() => {
    setIsMounted(true);
  }, []);

  // Compute dynamic styles
  const sidebarStyles = {
    ...SIDEBAR_STYLES.base,
    ...(isMobile ? SIDEBAR_STYLES.mobile : SIDEBAR_STYLES.desktop),
    transform: isOpen ? 'translateX(0)' : 'translateX(-100%)',
    transition: reducedMotion ? 'none' : SIDEBAR_STYLES.base.transition,
  };

  const backdropStyles = {
    ...SIDEBAR_STYLES.backdrop,
    ...(isOpen && SIDEBAR_STYLES.backdropVisible),
    transition: reducedMotion ? 'none' : SIDEBAR_STYLES.backdrop.transition,
  };

  return (
    <>
      {/* Backdrop for mobile */}
      {isMobile && (
        <View
          as="div"
          style={backdropStyles}
          onClick={onClose}
          aria-hidden="true"
          data-testid="sidebar-backdrop"
        />
      )}

      {/* Sidebar content */}
      <View
        ref={sidebarRef}
        as="aside"
        style={sidebarStyles}
        className={className}
        role="complementary"
        aria-label="Navigation sidebar"
        aria-expanded={isOpen}
        aria-hidden={!isOpen}
        aria-modal={isMobile}
        data-testid="sidebar"
        {...(isMobile && {
          ...swipeHandlers,
          tabIndex: -1,
        })}
      >
        <Navigation
          isMobile={isMobile}
          isOpen={isOpen}
          onToggle={onClose}
          className={`sidebar-navigation ${isMounted ? 'mounted' : ''}`}
        />
      </View>
    </>
  );
});

Sidebar.displayName = 'Sidebar';

export default Sidebar;