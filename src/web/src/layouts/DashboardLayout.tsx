import React, { useCallback, useEffect, useState } from 'react';
import { View, Grid, useBreakpointValue, useTheme } from '@aws-amplify/ui-react'; // v6.0.0
import { Navigate, useLocation, useNavigate } from 'react-router-dom'; // v6.0.0
import { Layout } from '../components/common/Layout';
import { Header } from '../components/common/Header';
import { Sidebar } from '../components/common/Sidebar';
import { useAuth } from '../hooks/useAuth';
import ErrorBoundary from '../components/common/ErrorBoundary';

// Constants for layout configuration
const LAYOUT_STYLES = {
  container: {
    minHeight: '100vh',
    display: 'grid',
    gridTemplateRows: 'auto 1fr',
    backgroundColor: 'var(--amplify-colors-background-secondary)',
    transition: 'background-color 0.2s ease',
  },
  content: {
    display: 'grid',
    gridTemplateColumns: 'auto 1fr',
    position: 'relative' as const,
    isolation: 'isolate',
  },
  main: {
    padding: 'var(--amplify-space-large)',
    width: '100%',
    maxWidth: '1440px',
    margin: '0 auto',
    transition: 'margin-left 0.3s ease-in-out',
  },
};

// ARIA labels for accessibility
const ARIA_LABELS = {
  dashboard: 'Dashboard layout',
  mainContent: 'Main content area',
  navigation: 'Main navigation',
  skipLink: 'Skip to main content',
};

// Props interface with strict typing
export interface DashboardLayoutProps {
  children: React.ReactNode;
  className?: string;
  requireAuth?: boolean;
}

/**
 * Enterprise-grade dashboard layout component with comprehensive security,
 * accessibility, and responsive features.
 */
const DashboardLayout: React.FC<DashboardLayoutProps> = ({
  children,
  className,
  requireAuth = true,
}) => {
  const { isAuthenticated, user } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const amplifyTheme = useTheme();
  
  // Responsive state management
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [isReducedMotion, setIsReducedMotion] = useState(false);
  
  // Responsive breakpoints
  const isMobile = useBreakpointValue({
    base: true,
    md: false,
  });

  // Handle authentication redirection
  const handleAuthRedirect = useCallback(() => {
    if (requireAuth && !isAuthenticated) {
      navigate('/login', { 
        state: { from: location },
        replace: true 
      });
    }
  }, [requireAuth, isAuthenticated, navigate, location]);

  // Handle sidebar toggle with accessibility
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

  // Handle authentication check
  useEffect(() => {
    handleAuthRedirect();
  }, [handleAuthRedirect]);

  // Compute dynamic styles
  const contentStyles = {
    ...LAYOUT_STYLES.main,
    marginLeft: isSidebarOpen && !isMobile ? '280px' : '0',
    transition: isReducedMotion ? 'none' : 'margin-left 0.3s ease-in-out',
  };

  // Handle unauthorized access
  if (requireAuth && !isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return (
    <ErrorBoundary>
      <Layout className={className}>
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
            backgroundColor: amplifyTheme.tokens.colors.background.primary,
            ':focus': {
              top: 0,
            },
          }}
        >
          {ARIA_LABELS.skipLink}
        </a>

        {/* Main Layout Structure */}
        <View
          as="div"
          style={LAYOUT_STYLES.container}
          data-testid="dashboard-layout"
          role="main"
          aria-label={ARIA_LABELS.dashboard}
        >
          {/* Header */}
          <Header
            onMenuClick={handleSidebarToggle}
            isSidebarOpen={isSidebarOpen}
          />

          {/* Content Area */}
          <Grid as="main" style={LAYOUT_STYLES.content}>
            {/* Sidebar */}
            <Sidebar
              isOpen={isSidebarOpen}
              onClose={handleSidebarToggle}
              reducedMotion={isReducedMotion}
            />

            {/* Main Content */}
            <View
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
      </Layout>
    </ErrorBoundary>
  );
};

DashboardLayout.displayName = 'DashboardLayout';

export type { DashboardLayoutProps };
export default DashboardLayout;