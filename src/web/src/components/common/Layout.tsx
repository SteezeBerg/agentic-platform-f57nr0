import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Grid, useMediaQuery, useTheme as useAmplifyTheme } from '@aws-amplify/ui-react'; // v6.0.0
import { ErrorBoundary } from 'react-error-boundary'; // v4.0.11
import { Header, HeaderProps } from './Header';
import { Sidebar } from './Sidebar';
import { useTheme } from '../../hooks/useTheme';

// Constants for layout configuration
const LAYOUT_STYLES = {
  container: {
    minHeight: '100vh',
    display: 'grid',
    gridTemplateRows: 'auto 1fr',
    backgroundColor: 'var(--amplify-colors-background-secondary)',
    transition: 'background-color 0.2s ease',
  },
  main: {
    display: 'grid',
    gridTemplateColumns: 'auto 1fr',
    position: 'relative' as const,
    isolation: 'isolate',
  },
  content: {
    padding: 'var(--amplify-space-large)',
    width: '100%',
    maxWidth: '1440px',
    margin: '0 auto',
    transition: 'margin-left 0.3s ease-in-out',
  },
};

// ARIA labels for accessibility
const ARIA_LABELS = {
  mainContent: 'Main content area',
  navigation: 'Main navigation',
  skipLink: 'Skip to main content',
};

// Interface for Layout component props
export interface LayoutProps {
  children: React.ReactNode;
  className?: string;
  showSidebar?: boolean;
  initialFocus?: string;
}

/**
 * Base layout component that provides the foundational structure for the Agent Builder Hub interface.
 * Implements responsive layout patterns, accessibility features, and theme integration.
 */
const Layout: React.FC<LayoutProps> = ({
  children,
  className,
  showSidebar = true,
  initialFocus,
}) => {
  const { theme, isDarkMode } = useTheme();
  const amplifyTheme = useAmplifyTheme();
  const mainContentRef = useRef<HTMLDivElement>(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(showSidebar);
  const [isReducedMotion, setIsReducedMotion] = useState(false);

  // Responsive breakpoints
  const isMobile = useMediaQuery('(max-width: 768px)');
  const isTablet = useMediaQuery('(min-width: 769px) and (max-width: 1024px)');
  const isDesktop = useMediaQuery('(min-width: 1025px)');

  // Handle responsive layout behavior
  const handleResponsiveLayout = useCallback(() => {
    if (isMobile) {
      setIsSidebarOpen(false);
    } else if (isDesktop) {
      setIsSidebarOpen(true);
    }
  }, [isMobile, isDesktop]);

  // Handle sidebar toggle
  const handleSidebarToggle = useCallback(() => {
    setIsSidebarOpen(prev => !prev);
  }, []);

  // Check for reduced motion preference
  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    setIsReducedMotion(mediaQuery.matches);

    const handleMotionPreference = (e: MediaQueryListEvent) => {
      setIsReducedMotion(e.matches);
    };

    mediaQuery.addEventListener('change', handleMotionPreference);
    return () => mediaQuery.removeEventListener('change', handleMotionPreference);
  }, []);

  // Handle initial focus
  useEffect(() => {
    if (initialFocus && mainContentRef.current) {
      const focusElement = mainContentRef.current.querySelector(initialFocus);
      if (focusElement instanceof HTMLElement) {
        focusElement.focus();
      }
    }
  }, [initialFocus]);

  // Update layout on responsive changes
  useEffect(() => {
    handleResponsiveLayout();
  }, [handleResponsiveLayout]);

  // Compute dynamic styles
  const containerStyles = {
    ...LAYOUT_STYLES.container,
    backgroundColor: isDarkMode 
      ? theme.tokens.colors.background.secondary.dark 
      : theme.tokens.colors.background.secondary.light,
  };

  const contentStyles = {
    ...LAYOUT_STYLES.content,
    marginLeft: isSidebarOpen && !isMobile ? '280px' : '0',
    transition: isReducedMotion ? 'none' : LAYOUT_STYLES.content.transition,
  };

  return (
    <ErrorBoundary>
      {/* Skip Link for keyboard navigation */}
      <a
        href="#main-content"
        className="skip-link"
        style={{
          position: 'absolute',
          top: '-40px',
          left: 0,
          padding: '8px',
          zIndex: 1000,
          backgroundColor: theme.tokens.colors.background.primary,
          ':focus': {
            top: 0,
          },
        }}
      >
        {ARIA_LABELS.skipLink}
      </a>

      <View
        as="div"
        style={containerStyles}
        className={className}
        data-testid="layout-container"
      >
        {/* Header */}
        <Header
          testId="layout-header"
          onMenuClick={handleSidebarToggle}
          isSidebarOpen={isSidebarOpen}
        />

        {/* Main Content Area */}
        <Grid as="main" style={LAYOUT_STYLES.main}>
          {/* Sidebar */}
          <Sidebar
            isOpen={isSidebarOpen}
            onClose={handleSidebarToggle}
            reducedMotion={isReducedMotion}
          />

          {/* Main Content */}
          <View
            ref={mainContentRef}
            id="main-content"
            as="div"
            style={contentStyles}
            role="main"
            aria-label={ARIA_LABELS.mainContent}
            tabIndex={-1}
          >
            {children}
          </View>
        </Grid>
      </View>
    </ErrorBoundary>
  );
};

Layout.displayName = 'Layout';

export type { LayoutProps };
export default Layout;