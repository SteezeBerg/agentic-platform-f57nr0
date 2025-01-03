import React, { Component, ErrorInfo } from 'react'; // v18.2.0
import { View, Heading, Text, Button, Alert } from '@aws-amplify/ui-react'; // v6.0.0
import { ErrorLogger } from '@aws-logging/error-logger'; // v1.0.0
import { showNotification, NotificationType } from '../../hooks/useNotification';

// Constants for error handling and accessibility
const DEFAULT_ERROR_MESSAGE = 'An unexpected error occurred. Please try again later.';

const ERROR_STYLES = {
  container: {
    padding: 'var(--amplify-space-large)',
    textAlign: 'center' as const,
    backgroundColor: 'var(--amplify-colors-background-error)',
    borderRadius: 'var(--amplify-radii-medium)',
    margin: 'var(--amplify-space-medium)'
  },
  heading: {
    color: 'var(--amplify-colors-font-error)',
    marginBottom: 'var(--amplify-space-medium)',
    fontSize: 'var(--amplify-font-sizes-xl)'
  },
  text: {
    color: 'var(--amplify-colors-font-error)',
    marginBottom: 'var(--amplify-space-large)',
    fontSize: 'var(--amplify-font-sizes-medium)'
  },
  button: {
    marginTop: 'var(--amplify-space-medium)'
  }
};

const ARIA_LABELS = {
  errorContainer: 'Error message container',
  errorHeading: 'Error occurred',
  retryButton: 'Retry action'
};

// Props interface with strict typing
interface ErrorBoundaryProps {
  children: React.ReactNode;
  fallback?: React.ReactNode;
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
}

// State interface for error tracking
interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

/**
 * ErrorBoundary component that catches JavaScript errors anywhere in the child
 * component tree and displays a fallback UI with accessibility support.
 * 
 * @implements {React.Component<ErrorBoundaryProps, ErrorBoundaryState>}
 */
class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  private logger: ErrorLogger;

  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null
    };
    this.handleRetry = this.handleRetry.bind(this);
    this.logger = new ErrorLogger({
      service: 'agent-builder-hub',
      component: 'ErrorBoundary'
    });
  }

  /**
   * Static method to update state when an error occurs
   */
  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return {
      hasError: true,
      error,
      errorInfo: null
    };
  }

  /**
   * Lifecycle method called after an error has been caught
   * Handles error logging and notification
   */
  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    // Log error with context
    this.logger.logError({
      error,
      errorInfo,
      severity: 'ERROR',
      context: {
        component: this.constructor.name,
        stack: error.stack
      }
    });

    // Update state with error details
    this.setState({
      error,
      errorInfo
    });

    // Show error notification
    showNotification({
      message: error.message || DEFAULT_ERROR_MESSAGE,
      type: NotificationType.ERROR,
      persistent: true,
      priority: 2
    });

    // Call optional error callback
    if (this.props.onError) {
      this.props.onError(error, errorInfo);
    }
  }

  /**
   * Handles retry attempt when error occurs
   */
  private handleRetry(): void {
    this.logger.logInfo({
      message: 'Retry attempt initiated',
      context: {
        component: this.constructor.name
      }
    });

    this.setState({
      hasError: false,
      error: null,
      errorInfo: null
    });

    showNotification({
      message: 'Retrying...',
      type: NotificationType.INFO
    });
  }

  /**
   * Renders either the error UI or the children
   */
  render(): React.ReactNode {
    const { hasError, error } = this.state;
    const { children, fallback } = this.props;

    if (hasError) {
      // Return custom fallback if provided
      if (fallback) {
        return fallback;
      }

      // Default error UI with accessibility support
      return (
        <View
          as="section"
          style={ERROR_STYLES.container}
          aria-label={ARIA_LABELS.errorContainer}
          role="alert"
          aria-live="assertive"
        >
          <Alert variation="error">
            <Heading
              level={2}
              style={ERROR_STYLES.heading}
              aria-label={ARIA_LABELS.errorHeading}
            >
              Something went wrong
            </Heading>
            <Text style={ERROR_STYLES.text}>
              {error?.message || DEFAULT_ERROR_MESSAGE}
            </Text>
            <Button
              onClick={this.handleRetry}
              style={ERROR_STYLES.button}
              aria-label={ARIA_LABELS.retryButton}
              variation="primary"
            >
              Try Again
            </Button>
          </Alert>
        </View>
      );
    }

    // Render children when no error
    return children;
  }
}

export default ErrorBoundary;