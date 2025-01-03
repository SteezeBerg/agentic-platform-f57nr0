import React, { useCallback, useEffect, useMemo } from 'react';
import { View, Stepper, useMediaQuery, useTheme } from '@aws-amplify/ui-react'; // v6.0.0
import { motion } from 'framer-motion'; // v10.0.0
import { analytics } from '@segment/analytics-next'; // v1.51.0
import { Breadcrumbs, BreadcrumbsProps } from '../common/Breadcrumbs';
import { Navigation, NavigationProps } from '../common/Navigation';

// Validation state for each step
export enum ValidationState {
  INCOMPLETE = 'INCOMPLETE',
  VALID = 'VALID',
  INVALID = 'INVALID'
}

// Agent creation status
export enum AgentStatus {
  DRAFT = 'DRAFT',
  VALIDATING = 'VALIDATING',
  READY = 'READY',
  ERROR = 'ERROR'
}

// Props interface with strict typing
export interface BuilderNavigationProps {
  currentStep: number;
  totalSteps: number;
  onStepChange: (step: number) => void;
  agentStatus: AgentStatus;
  stepValidation: Record<number, ValidationState>;
  isLoading?: boolean;
}

// Style constants with accessibility support
const STYLES = {
  container: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: 'var(--amplify-space-medium)',
    padding: 'var(--amplify-space-medium)',
    backgroundColor: 'var(--amplify-colors-background-secondary)',
    borderRadius: 'var(--amplify-radii-medium)',
  },
  stepper: {
    width: '100%',
    minHeight: '48px', // WCAG minimum touch target size
  },
  stepLabel: {
    fontSize: 'var(--amplify-font-sizes-small)',
    color: 'var(--amplify-colors-font-secondary)',
    transition: 'color 0.2s ease',
  },
  stepLabelActive: {
    color: 'var(--amplify-colors-font-primary)',
    fontWeight: 'var(--amplify-font-weights-bold)',
  },
  validationIndicator: {
    display: 'inline-block',
    width: '8px',
    height: '8px',
    borderRadius: '50%',
    marginLeft: 'var(--amplify-space-xs)',
  },
};

// Step labels with accessibility descriptions
const STEP_LABELS = [
  { label: 'Template', ariaLabel: 'Select agent template' },
  { label: 'Configuration', ariaLabel: 'Configure agent settings' },
  { label: 'Knowledge', ariaLabel: 'Set up knowledge sources' },
  { label: 'Review', ariaLabel: 'Review and validate agent' },
];

/**
 * BuilderNavigation component provides step-by-step navigation for the agent creation process
 * with enhanced accessibility, validation states, and responsive design.
 */
export const BuilderNavigation: React.FC<BuilderNavigationProps> = React.memo(({
  currentStep,
  totalSteps,
  onStepChange,
  agentStatus,
  stepValidation,
  isLoading = false,
}) => {
  const { tokens } = useTheme();
  const isSmallScreen = useMediaQuery('(max-width: 768px)');

  // Track navigation events
  useEffect(() => {
    analytics.track('Builder Navigation Viewed', {
      currentStep,
      totalSteps,
      agentStatus,
      stepValidation,
    });
  }, [currentStep, totalSteps, agentStatus, stepValidation]);

  // Determine if a step is accessible based on validation state
  const isStepAccessible = useCallback((stepIndex: number): boolean => {
    if (stepIndex === 0) return true;
    if (isLoading) return false;
    if (agentStatus === AgentStatus.ERROR) return false;

    // Check previous step validation
    const previousStepValidation = stepValidation[stepIndex - 1];
    return previousStepValidation === ValidationState.VALID;
  }, [agentStatus, stepValidation, isLoading]);

  // Handle step click with validation
  const handleStepClick = useCallback((stepIndex: number) => {
    if (!isStepAccessible(stepIndex)) {
      analytics.track('Builder Navigation Error', {
        error: 'Step not accessible',
        stepIndex,
        currentStep,
        agentStatus,
      });
      return;
    }

    analytics.track('Builder Step Changed', {
      fromStep: currentStep,
      toStep: stepIndex,
      agentStatus,
    });

    onStepChange(stepIndex);
  }, [currentStep, agentStatus, isStepAccessible, onStepChange]);

  // Generate breadcrumb items
  const breadcrumbItems = useMemo(() => 
    STEP_LABELS.slice(0, currentStep + 1).map((step, index) => ({
      label: step.label,
      onClick: () => handleStepClick(index),
      ariaLabel: step.ariaLabel,
      isActive: index === currentStep,
    })), [currentStep, handleStepClick]);

  // Render step validation indicator
  const renderValidationIndicator = useCallback((stepIndex: number) => {
    const validation = stepValidation[stepIndex];
    if (!validation) return null;

    const colors = {
      [ValidationState.VALID]: tokens.colors.success[60],
      [ValidationState.INVALID]: tokens.colors.error[60],
      [ValidationState.INCOMPLETE]: tokens.colors.neutral[40],
    };

    return (
      <motion.span
        initial={{ scale: 0 }}
        animate={{ scale: 1 }}
        style={{
          ...STYLES.validationIndicator,
          backgroundColor: colors[validation],
        }}
        aria-label={`Step ${validation.toLowerCase()}`}
      />
    );
  }, [stepValidation, tokens]);

  return (
    <View as="nav" style={STYLES.container} role="navigation" aria-label="Agent builder navigation">
      {!isSmallScreen && (
        <Breadcrumbs
          items={breadcrumbItems}
          separator="/"
          aria-label="Builder steps breadcrumb"
        />
      )}

      <Stepper
        currentStep={currentStep}
        totalSteps={totalSteps}
        style={STYLES.stepper}
        aria-label="Agent creation steps"
      >
        {STEP_LABELS.map((step, index) => (
          <Stepper.Step
            key={index}
            onClick={() => handleStepClick(index)}
            aria-label={step.ariaLabel}
            aria-current={currentStep === index ? 'step' : undefined}
            isDisabled={!isStepAccessible(index)}
          >
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.2 }}
              style={{
                ...STYLES.stepLabel,
                ...(currentStep === index && STYLES.stepLabelActive),
              }}
            >
              {step.label}
              {renderValidationIndicator(index)}
            </motion.div>
          </Stepper.Step>
        ))}
      </Stepper>

      {isLoading && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          aria-live="polite"
          role="status"
        >
          Validating step...
        </motion.div>
      )}
    </View>
  );
});

BuilderNavigation.displayName = 'BuilderNavigation';

export default BuilderNavigation;