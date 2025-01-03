import React, { useCallback, useEffect, useMemo } from 'react';
import { View, useBreakpointValue, useTheme } from '@aws-amplify/ui-react'; // v6.0.0
import { useMediaQuery } from '@react-hook/media-query'; // v1.1.1
import { ErrorBoundary } from 'react-error-boundary'; // v4.0.0
import { Sidebar } from '../common/Sidebar';
import { BuilderNavigation } from './BuilderNavigation';
import { useAgent } from '../../hooks/useAgent';
import { AgentStatus } from '../../types/agent';
import { ValidationState } from './BuilderNavigation';

// Style constants with accessibility support
const STYLES = {
  container: {
    display: 'flex',
    flexDirection: 'column' as const,
    height: '100%',
    backgroundColor: 'var(--amplify-colors-background-primary)',
    transition: 'width 0.2s ease-in-out',
  },
  content: {
    flex: 1,
    padding: 'var(--amplify-space-medium)',
    overflowY: 'auto' as const,
  },
  divider: {
    height: '1px',
    backgroundColor: 'var(--amplify-colors-border-primary)',
    margin: 'var(--amplify-space-small) 0',
  },
};

// ARIA labels for accessibility
const ARIA_LABELS = {
  sidebar: 'Agent builder sidebar',
  navigation: 'Agent builder steps navigation',
  content: 'Sidebar content area',
};

export interface BuilderSidebarProps {
  isOpen: boolean;
  onClose: () => void;
  currentStep: number;
  totalSteps: number;
  onStepChange: (step: number) => void;
  className?: string;
  testId?: string;
}

/**
 * BuilderSidebar component provides step-by-step navigation and configuration options
 * during the agent creation process with comprehensive accessibility features.
 */
export const BuilderSidebar = React.memo<BuilderSidebarProps>(({
  isOpen,
  onClose,
  currentStep,
  totalSteps,
  onStepChange,
  className,
  testId = 'builder-sidebar',
}) => {
  const { theme } = useTheme();
  const isSmallScreen = useMediaQuery('(max-width: 768px)');
  const sidebarWidth = useBreakpointValue({
    base: '100%',
    sm: '320px',
    md: '280px',
  });

  // Get agent state from hook
  const { agent, isLoading, error } = useAgent();

  // Compute validation state for each step
  const stepValidation = useMemo(() => {
    if (!agent) return {};

    return {
      0: agent.templateId ? ValidationState.VALID : ValidationState.INCOMPLETE,
      1: agent.config ? ValidationState.VALID : ValidationState.INCOMPLETE,
      2: agent.config?.knowledgeSourceIds?.length > 0 
        ? ValidationState.VALID 
        : ValidationState.INCOMPLETE,
      3: agent.status === AgentStatus.READY 
        ? ValidationState.VALID 
        : ValidationState.INCOMPLETE,
    };
  }, [agent]);

  // Handle keyboard navigation
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && isOpen) {
        onClose();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // Handle step changes with validation
  const handleStepChange = useCallback((step: number) => {
    if (isLoading) return;
    if (step < currentStep || stepValidation[step - 1] === ValidationState.VALID) {
      onStepChange(step);
    }
  }, [currentStep, isLoading, onStepChange, stepValidation]);

  return (
    <ErrorBoundary fallback={<div>Error loading sidebar</div>}>
      <Sidebar
        isOpen={isOpen}
        onClose={onClose}
        className={className}
        testId={testId}
      >
        <View
          as="div"
          style={{
            ...STYLES.container,
            width: sidebarWidth,
          }}
          role="complementary"
          aria-label={ARIA_LABELS.sidebar}
        >
          <BuilderNavigation
            currentStep={currentStep}
            totalSteps={totalSteps}
            onStepChange={handleStepChange}
            agentStatus={agent?.status || AgentStatus.CREATED}
            stepValidation={stepValidation}
            isLoading={isLoading}
          />

          <div style={STYLES.divider} role="separator" />

          <View
            as="div"
            style={STYLES.content}
            aria-label={ARIA_LABELS.content}
          >
            {error && (
              <View
                as="div"
                role="alert"
                style={{
                  color: theme.tokens.colors.error[60],
                  padding: theme.tokens.space.small,
                }}
              >
                {error.message}
              </View>
            )}

            {/* Additional sidebar content can be rendered here */}
          </View>
        </View>
      </Sidebar>
    </ErrorBoundary>
  );
});

BuilderSidebar.displayName = 'BuilderSidebar';

export default BuilderSidebar;