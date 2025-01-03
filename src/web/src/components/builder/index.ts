/**
 * Centralized barrel file for Agent Builder Hub components
 * Provides error-handled, performance-monitored, and accessibility-compliant exports
 * @version 1.0.0
 */

// External imports with version tracking
import invariant from 'tiny-invariant'; // v1.3.1
import { Analytics } from '@aws-amplify/analytics'; // v6.0.0
import { withPerformanceMonitor } from '@performance-monitor/react'; // v1.0.0

// Internal imports
import ErrorBoundary from '../common/ErrorBoundary';
import { LoadingState } from '../../types/common';

// Environment configuration
const isDevelopment = process.env.NODE_ENV === 'development';
const isMonitoringEnabled = process.env.REACT_APP_ENABLE_MONITORING === 'true';

/**
 * Validates component availability at runtime
 */
const validateComponentAvailability = (components: Record<string, React.ComponentType>): void => {
  try {
    Object.entries(components).forEach(([name, component]) => {
      invariant(component, `Required component ${name} is not available`);
    });
  } catch (error) {
    Analytics.record({
      name: 'ComponentValidationError',
      attributes: {
        error: error instanceof Error ? error.message : 'Unknown error',
        components: Object.keys(components).join(',')
      }
    });
    throw error;
  }
};

/**
 * HOC for error boundary wrapping with analytics
 */
export const withErrorBoundary = <P extends object>(
  WrappedComponent: React.ComponentType<P>,
  componentName: string
): React.ComponentType<P> => {
  return function WithErrorBoundaryWrapper(props: P) {
    return (
      <ErrorBoundary
        onError={(error, errorInfo) => {
          Analytics.record({
            name: 'ComponentError',
            attributes: {
              component: componentName,
              error: error.message,
              info: errorInfo.componentStack
            }
          });
        }}
      >
        <WrappedComponent {...props} />
      </ErrorBoundary>
    );
  };
};

/**
 * HOC for performance monitoring
 */
export const withPerformanceTracking = <P extends object>(
  WrappedComponent: React.ComponentType<P>,
  componentName: string
): React.ComponentType<P> => {
  if (!isMonitoringEnabled) {
    return WrappedComponent;
  }

  return withPerformanceMonitor(WrappedComponent, {
    componentName,
    onRenderComplete: (metrics) => {
      Analytics.record({
        name: 'ComponentPerformance',
        attributes: {
          component: componentName,
          renderTime: metrics.renderTime,
          mountTime: metrics.mountTime
        }
      });
    }
  });
};

/**
 * Enhanced builder components with error handling and performance monitoring
 */
export namespace BuilderComponents {
  // Import component types lazily to avoid circular dependencies
  const components = {
    BuilderNavigation: () => import('./BuilderNavigation').then(m => m.default),
    AgentBuilder: () => import('./AgentBuilder').then(m => m.default),
    ConfigEditor: () => import('./ConfigEditor').then(m => m.default),
    KnowledgeConnector: () => import('./KnowledgeConnector').then(m => m.default),
    TemplateSelector: () => import('./TemplateSelector').then(m => m.default),
    TestConsole: () => import('./TestConsole').then(m => m.default)
  };

  // Validate component availability in development
  if (isDevelopment) {
    Promise.all(
      Object.entries(components).map(async ([name, loader]) => {
        try {
          const component = await loader();
          validateComponentAvailability({ [name]: component });
        } catch (error) {
          console.error(`Failed to load component ${name}:`, error);
        }
      })
    );
  }

  // Export enhanced components
  export const BuilderNavigation = withErrorBoundary(
    withPerformanceTracking(
      React.lazy(components.BuilderNavigation),
      'BuilderNavigation'
    ),
    'BuilderNavigation'
  );

  export const AgentBuilder = withErrorBoundary(
    withPerformanceTracking(
      React.lazy(components.AgentBuilder),
      'AgentBuilder'
    ),
    'AgentBuilder'
  );

  export const ConfigEditor = withErrorBoundary(
    withPerformanceTracking(
      React.lazy(components.ConfigEditor),
      'ConfigEditor'
    ),
    'ConfigEditor'
  );

  export const KnowledgeConnector = withErrorBoundary(
    withPerformanceTracking(
      React.lazy(components.KnowledgeConnector),
      'KnowledgeConnector'
    ),
    'KnowledgeConnector'
  );

  export const TemplateSelector = withErrorBoundary(
    withPerformanceTracking(
      React.lazy(components.TemplateSelector),
      'TemplateSelector'
    ),
    'TemplateSelector'
  );

  export const TestConsole = withErrorBoundary(
    withPerformanceTracking(
      React.lazy(components.TestConsole),
      'TestConsole'
    ),
    'TestConsole'
  );
}

// Default export for convenient importing
export default BuilderComponents;