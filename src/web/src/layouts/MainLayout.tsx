import React, { useState, useCallback, useEffect, useRef } from 'react';
import { View, Grid, useBreakpointValue } from '@aws-amplify/ui-react'; // v6.0.0
import Header from '../components/common/Header';
import Sidebar from '../components/common/Sidebar';
import { useTheme } from '../hooks/useTheme';
import ErrorBoundary from '../components/common/ErrorBoundary';

// Constants for layout configuration
const LAYOUT_STYLES = {
  container: {
    minHeight: '100vh',
    display: 'flex',
    flexDirection: 'column' as const,
    backgroundColor: 'var(--amplify-colors-background-secondary)',
    transition: 'background-color 0.2s ease',
  },
  content: {
    flex: 1,
    width: '100%',
    maxWidth: '1440px',
    margin: '0 auto',
    padding: 'var(--amplify-space-large)',
    transition: 'margin-left 0.3s ease-in-out',
  },
  contentWithSidebar: {
    marginLeft: '280px', // Matches sidebar width
  },
};

// ARIA labels for accessibility
const ARIA_LABELS = {
  mainContent: 'Main content area',
  navigation: 'Main navigation',
  skipLink: 'Skip to main content',
};

/**
 * Props interface for the MainLayout component
 */
export interface MainLayoutProps {
  children: React.ReactNode;
  className?: string;
}

/**
 * Main layout component that provides the primary application structure
 * Implements AWS Amplify UI design patterns with Material Design 3.0 principles
 */
const MainLayout: React.FC<MainLayoutProps> = ({ children, className }) => {
  const { theme, isDarkMode } = useTheme();
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const mainContentRef = useRef<HTMLDivElement>(null);
  
  // Responsive layout configuration
  const isMobile = useBreakpointValue({
    base: true,    // Mobile: < 768px
    md: false,     // Tablet: >= 768px
  });

  const isTablet = useBreakpointValue({
    base: true,    // Mobile/Tablet: < 1024px
    lg: false,     // Desktop: >= 1024px
  });

  // Handle sidebar toggle
  const handleSidebarToggle = useCallback(() => {
    setIsSidebarOpen(prev => !prev);
  }, []);

  // Handle keyboard navigation
  const handleKeyDown = useCallback((event: KeyboardEvent) => {
    // Skip to main content
    if (event.key === 'Tab' && event.shiftKey && event.altKey) {
      event.preventDefault();
      mainContentRef.current?.focus();
    }
  }, []);

  // Set up keyboard event listeners
  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  // Automatically close sidebar on mobile when route changes
  useEffect(() => {
    if (isMobile && isSidebarOpen) {
      setIsSidebarOpen(false);
    }
  }, [isMobile, location.pathname]);

  // Compute dynamic styles
  const contentStyles = {
    ...LAYOUT_STYLES.content,
    ...(isSidebarOpen && !isMobile && LAYOUT_STYLES.contentWithSidebar),
  };

  return (
    <ErrorBoundary>
      <View
        as="div"
        style={LAYOUT_STYLES.container}
        className={className}
        data-theme={isDarkMode ? 'dark' : 'light'}
      >
        {/* Skip link for keyboard navigation */}
        <a
          href="#main-content"
          className="skip-link"
          style={{
            position: 'absolute',
            top: -40,
            left: 0,
            padding: '8px',
            zIndex: 9999,
            backgroundColor: theme.tokens.colors.background.primary,
            ':focus': {
              top: 0,
            },
          }}
        >
          {ARIA_LABELS.skipLink}
        </a>

        {/* Header */}
        <Header
          testId="main-header"
          className="main-header"
        />

        {/* Main layout grid */}
        <Grid
          templateColumns={isMobile ? '1fr' : '280px 1fr'}
          gap="0"
          flex="1"
        >
          {/* Sidebar */}
          <Sidebar
            isOpen={isSidebarOpen}
            onClose={handleSidebarToggle}
            reducedMotion={false}
          />

          {/* Main content */}
          <View
            ref={mainContentRef}
            as="main"
            id="main-content"
            style={contentStyles}
            tabIndex={-1}
            role="main"
            aria-label={ARIA_LABELS.mainContent}
          >
            {children}
          </View>
        </Grid>
      </View>
    </ErrorBoundary>
  );
};

MainLayout.displayName = 'MainLayout';

export type { MainLayoutProps };
export default MainLayout;