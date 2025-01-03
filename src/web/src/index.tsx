import React, { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Provider } from 'react-redux';
import { ThemeProvider } from '@aws-amplify/ui-react';
import { Amplify, Analytics } from 'aws-amplify';
import { ErrorBoundary } from 'react-error-boundary';

import App from './App';
import { store } from './store/store';
import { amplifyConfig } from './config/amplify';
import { APP_CONFIG } from './config/constants';

// Initialize Amplify with secure configuration
const initializeAmplify = (): void => {
  try {
    Amplify.configure(amplifyConfig);
    
    // Configure analytics with security and privacy settings
    Analytics.configure({
      disabled: process.env.NODE_ENV === 'development',
      autoSessionTracking: true,
      platform: 'web',
      appId: APP_CONFIG.APP_NAME,
      appVersion: APP_CONFIG.APP_VERSION,
      telemetry: false, // Disable telemetry for privacy
      endpoint: process.env.REACT_APP_ANALYTICS_ENDPOINT
    });
  } catch (error) {
    console.error('Failed to initialize Amplify:', error);
  }
};

// Initialize performance monitoring
const initializePerformance = (): void => {
  if (process.env.NODE_ENV === 'production') {
    // Configure performance monitoring
    Analytics.record({
      name: 'APP_INITIALIZED',
      attributes: {
        timestamp: new Date().toISOString(),
        version: APP_CONFIG.APP_VERSION
      }
    });
  }
};

// Error fallback component with accessibility support
const ErrorFallback = ({ error }: { error: Error }): JSX.Element => (
  <div
    role="alert"
    aria-live="assertive"
    style={{
      padding: '20px',
      margin: '20px',
      border: '1px solid #ff0000',
      borderRadius: '4px',
      backgroundColor: '#fff5f5'
    }}
  >
    <h2>Application Error</h2>
    <pre style={{ whiteSpace: 'pre-wrap' }}>{error.message}</pre>
  </div>
);

// Initialize application
const renderApp = (): void => {
  // Initialize required services
  initializeAmplify();
  initializePerformance();

  // Get root element with accessibility attributes
  const rootElement = document.getElementById('root');
  if (!rootElement) {
    throw new Error('Root element not found');
  }

  // Set accessibility attributes
  rootElement.setAttribute('role', 'application');
  rootElement.setAttribute('aria-label', 'Agent Builder Hub');

  // Create React root with concurrent features
  const root = createRoot(rootElement);

  // Render application with providers and error boundary
  root.render(
    <StrictMode>
      <ErrorBoundary
        FallbackComponent={ErrorFallback}
        onError={(error) => {
          Analytics.record({
            name: 'APP_ERROR',
            attributes: {
              error: error.message,
              stack: error.stack,
              timestamp: new Date().toISOString()
            }
          });
        }}
      >
        <Provider store={store}>
          <ThemeProvider
            theme={{
              name: 'agent-builder-hub-theme',
              overrides: {
                tokens: {
                  colors: {
                    background: {
                      primary: 'var(--amplify-colors-background-primary)',
                      secondary: 'var(--amplify-colors-background-secondary)'
                    },
                    font: {
                      primary: 'var(--amplify-colors-font-primary)',
                      secondary: 'var(--amplify-colors-font-secondary)'
                    }
                  }
                }
              }
            }}
          >
            <App />
          </ThemeProvider>
        </Provider>
      </ErrorBoundary>
    </StrictMode>
  );
};

// Handle initial render with error catching
try {
  renderApp();
} catch (error) {
  console.error('Failed to render application:', error);
  // Render minimal error UI if app fails to initialize
  const rootElement = document.getElementById('root');
  if (rootElement) {
    const root = createRoot(rootElement);
    root.render(<ErrorFallback error={error as Error} />);
  }
}