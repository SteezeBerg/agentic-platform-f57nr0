import React, { Suspense, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { ThemeProvider, View, defaultTheme } from '@aws-amplify/ui-react'; // v6.0.0
import { Analytics } from 'aws-amplify'; // v6.0.0
import { ErrorBoundary } from 'react-error-boundary';
import MainLayout from './layouts/MainLayout';
import AuthLayout from './layouts/AuthLayout';
import Loading from './components/common/Loading';
import { useAuth } from './hooks/useAuth';
import { useTheme } from './hooks/useTheme';
import routes from './config/routes';
import { initializeAuth } from './config/auth';
import { APP_CONFIG } from './config/constants';

// Constants for accessibility and analytics
const ARIA_LABELS = {
  app: 'Agent Builder Hub Application',
  loading: 'Loading application',
  error: 'Application error occurred'
};

const ANALYTICS_EVENTS = {
  APP_LOADED: 'APP_LOADED',
  APP_ERROR: 'APP_ERROR',
  ROUTE_CHANGE: 'ROUTE_CHANGE'
};

/**
 * Root application component implementing AWS Amplify UI design patterns
 * with comprehensive security, accessibility, and analytics features.
 */
const App: React.FC = () => {
  const { theme, isDarkMode } = useTheme();
  const { isAuthenticated, isLoading: authLoading } = useAuth();

  // Initialize authentication and analytics
  useEffect(() => {
    const initializeApp = async () => {
      try {
        await initializeAuth();
        
        // Configure analytics
        Analytics.configure({
          disabled: process.env.NODE_ENV === 'development',
          autoSessionTracking: true,
          platform: 'web',
          appId: APP_CONFIG.APP_NAME,
          appVersion: APP_CONFIG.APP_VERSION
        });

        // Track app initialization
        Analytics.record({
          name: ANALYTICS_EVENTS.APP_LOADED,
          attributes: {
            theme: isDarkMode ? 'dark' : 'light',
            version: APP_CONFIG.APP_VERSION
          }
        });
      } catch (error) {
        console.error('App initialization failed:', error);
        Analytics.record({
          name: ANALYTICS_EVENTS.APP_ERROR,
          attributes: {
            error: error instanceof Error ? error.message : 'Unknown error',
            context: 'initialization'
          }
        });
      }
    };

    initializeApp();
  }, [isDarkMode]);

  // Error boundary fallback component
  const ErrorFallback = ({ error, resetErrorBoundary }: any) => (
    <View
      as="div"
      padding="2rem"
      textAlign="center"
      backgroundColor="background.error"
      role="alert"
      aria-label={ARIA_LABELS.error}
    >
      <h1>Something went wrong</h1>
      <pre>{error.message}</pre>
      <button onClick={resetErrorBoundary}>Try again</button>
    </View>
  );

  // Loading component with accessibility support
  const LoadingFallback = () => (
    <Loading
      size="large"
      overlay={true}
      text="Loading application..."
      aria-label={ARIA_LABELS.loading}
    />
  );

  return (
    <ErrorBoundary
      FallbackComponent={ErrorFallback}
      onError={(error) => {
        Analytics.record({
          name: ANALYTICS_EVENTS.APP_ERROR,
          attributes: {
            error: error.message,
            context: 'runtime'
          }
        });
      }}
    >
      <ThemeProvider
        theme={theme || defaultTheme}
        colorMode={isDarkMode ? 'dark' : 'light'}
      >
        <View
          as="div"
          className="app-root"
          backgroundColor={theme.tokens.colors.background.primary}
          color={theme.tokens.colors.font.primary}
          minHeight="100vh"
          role="application"
          aria-label={ARIA_LABELS.app}
        >
          <BrowserRouter>
            <Suspense fallback={<LoadingFallback />}>
              <Routes>
                {routes.map((route) => {
                  const RouteComponent = route.element;
                  
                  return (
                    <Route
                      key={route.path}
                      path={route.path}
                      element={
                        route.requiresAuth ? (
                          isAuthenticated ? (
                            <MainLayout>
                              {RouteComponent}
                            </MainLayout>
                          ) : (
                            <Navigate
                              to="/login"
                              state={{ from: route.path }}
                              replace
                            />
                          )
                        ) : (
                          <AuthLayout>
                            {RouteComponent}
                          </AuthLayout>
                        )
                      }
                    />
                  );
                })}
              </Routes>
            </Suspense>
          </BrowserRouter>
        </View>
      </ThemeProvider>
    </ErrorBoundary>
  );
};

App.displayName = 'App';

export default App;