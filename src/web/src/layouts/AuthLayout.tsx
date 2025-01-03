import React, { useEffect, useRef } from 'react';
import { View, useTheme, ThemeProvider, ColorMode } from '@aws-amplify/ui-react'; // v6.0.0
import { Navigate, useLocation } from 'react-router-dom'; // v6.4.0
import { useAuth } from '../../hooks/useAuth';
import ErrorBoundary from '../../components/common/ErrorBoundary';

// Constants for accessibility and styling
const ARIA_LABELS = {
  mainContent: 'Authentication page content',
  loadingMessage: 'Loading authentication state',
  errorMessage: 'Authentication error occurred'
};

const AUTH_STYLES = {
  container: {
    minHeight: '100vh',
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'var(--amplify-colors-background-secondary)',
    transition: 'background-color 0.2s ease',
    padding: 'var(--amplify-space-xl)',
    position: 'relative' as const,
    isolation: 'isolate'
  },
  content: {
    width: '100%',
    maxWidth: '480px',
    backgroundColor: 'var(--amplify-colors-background-primary)',
    borderRadius: 'var(--amplify-radii-medium)',
    boxShadow: 'var(--amplify-shadows-medium)',
    padding: 'var(--amplify-space-xl)',
    position: 'relative' as const,
    isolation: 'isolate'
  },
  logo: {
    marginBottom: 'var(--amplify-space-xl)',
    textAlign: 'center' as const
  },
  loadingOverlay: {
    position: 'absolute' as const,
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(255, 255, 255, 0.8)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1
  }
};

// Props interface with strict typing
interface AuthLayoutProps {
  children: React.ReactNode;
  showLogo?: boolean;
  maxWidth?: string;
}

/**
 * Enhanced authentication layout component with comprehensive accessibility
 * and security features for the Agent Builder Hub application.
 */
const AuthLayout: React.FC<AuthLayoutProps> = ({
  children,
  showLogo = true,
  maxWidth
}) => {
  const { isAuthenticated, isLoading, authError } = useAuth();
  const location = useLocation();
  const { colorMode } = useTheme();
  const contentRef = useRef<HTMLDivElement>(null);

  // Handle keyboard navigation and focus management
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Tab') {
        const focusableElements = contentRef.current?.querySelectorAll(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        );

        if (focusableElements && focusableElements.length > 0) {
          const firstElement = focusableElements[0] as HTMLElement;
          const lastElement = focusableElements[focusableElements.length - 1] as HTMLElement;

          if (event.shiftKey && document.activeElement === firstElement) {
            event.preventDefault();
            lastElement.focus();
          } else if (!event.shiftKey && document.activeElement === lastElement) {
            event.preventDefault();
            firstElement.focus();
          }
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Redirect authenticated users
  if (isAuthenticated) {
    return <Navigate to="/dashboard" state={{ from: location }} replace />;
  }

  return (
    <ErrorBoundary>
      <ThemeProvider colorMode={colorMode as ColorMode}>
        <View
          as="main"
          style={{
            ...AUTH_STYLES.container,
            backgroundColor: colorMode === 'dark' 
              ? 'var(--amplify-colors-background-secondary-dark)'
              : 'var(--amplify-colors-background-secondary)'
          }}
          role="main"
          aria-label={ARIA_LABELS.mainContent}
        >
          <View
            ref={contentRef}
            style={{
              ...AUTH_STYLES.content,
              maxWidth: maxWidth || AUTH_STYLES.content.maxWidth,
              backgroundColor: colorMode === 'dark'
                ? 'var(--amplify-colors-background-primary-dark)'
                : 'var(--amplify-colors-background-primary)'
            }}
            data-testid="auth-content"
          >
            {showLogo && (
              <View style={AUTH_STYLES.logo}>
                <img
                  src="/logo.svg"
                  alt="Agent Builder Hub"
                  height={40}
                  width="auto"
                />
              </View>
            )}

            {isLoading && (
              <View
                style={AUTH_STYLES.loadingOverlay}
                aria-live="polite"
                aria-busy={true}
                aria-label={ARIA_LABELS.loadingMessage}
              >
                <div className="amplify-loader" />
              </View>
            )}

            {authError && (
              <View
                role="alert"
                aria-live="assertive"
                aria-label={ARIA_LABELS.errorMessage}
                style={{
                  color: 'var(--amplify-colors-font-error)',
                  marginBottom: 'var(--amplify-space-medium)'
                }}
              >
                {authError.message}
              </View>
            )}

            {children}
          </View>
        </View>
      </ThemeProvider>
    </ErrorBoundary>
  );
};

export default AuthLayout;