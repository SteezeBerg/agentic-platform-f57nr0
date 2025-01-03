import React, { useState, useCallback, useEffect, useMemo } from 'react';
import { View, Heading, Alert } from '@aws-amplify/ui-react'; // v6.0.0
import { Analytics } from '@aws-amplify/analytics'; // v6.0.0
import { BuilderNavigation, ValidationState, AgentStatus } from './BuilderNavigation';
import ErrorBoundary from '../common/ErrorBoundary';
import { Button } from '../common/Button';
import { Loading } from '../common/Loading';
import { useNotification, NotificationType } from '../../hooks/useNotification';
import { useTheme } from '../../hooks/useTheme';
import { AGENT_CONSTANTS, ERROR_MESSAGES } from '../../config/constants';

// Step management constants
const TOTAL_STEPS = 4;
const STEP_LABELS = ['Template', 'Configuration', 'Knowledge', 'Review'];

// Interface for agent configuration
interface AgentConfig {
  name: string;
  description: string;
  template: string;
  knowledgeSources: string[];
  configuration: Record<string, any>;
}

// Props interface with strict typing
interface AgentBuilderProps {
  agentId?: string;
  onSave: (agent: AgentConfig) => Promise<void>;
  onError: (error: Error) => void;
  analyticsEnabled?: boolean;
}

/**
 * Enhanced agent creation interface with comprehensive validation,
 * accessibility support, and error handling.
 */
const AgentBuilder: React.FC<AgentBuilderProps> = React.memo(({
  agentId,
  onSave,
  onError,
  analyticsEnabled = true
}) => {
  const { theme } = useTheme();
  const { showNotification } = useNotification();
  const [currentStep, setCurrentStep] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [agentStatus, setAgentStatus] = useState(AgentStatus.DRAFT);
  const [stepValidation, setStepValidation] = useState<Record<number, ValidationState>>({});
  const [agentConfig, setAgentConfig] = useState<AgentConfig>({
    name: '',
    description: '',
    template: '',
    knowledgeSources: [],
    configuration: {}
  });

  // Track builder usage with analytics
  useEffect(() => {
    if (analyticsEnabled) {
      Analytics.record({
        name: 'AgentBuilderView',
        attributes: {
          agentId: agentId || 'new',
          step: currentStep
        }
      });
    }
  }, [agentId, currentStep, analyticsEnabled]);

  // Validate current step configuration
  const validateStep = useCallback(async (step: number): Promise<boolean> => {
    try {
      setIsLoading(true);
      let isValid = false;

      switch (step) {
        case 0: // Template validation
          isValid = !!agentConfig.template;
          break;
        case 1: // Configuration validation
          isValid = !!agentConfig.name && 
                   agentConfig.name.length <= AGENT_CONSTANTS.MAX_NAME_LENGTH &&
                   !!agentConfig.description &&
                   agentConfig.description.length <= AGENT_CONSTANTS.MAX_DESCRIPTION_LENGTH;
          break;
        case 2: // Knowledge source validation
          isValid = agentConfig.knowledgeSources.length > 0 &&
                   agentConfig.knowledgeSources.length <= AGENT_CONSTANTS.MAX_KNOWLEDGE_SOURCES;
          break;
        case 3: // Final review
          isValid = Object.values(stepValidation).every(
            state => state === ValidationState.VALID
          );
          break;
        default:
          isValid = false;
      }

      setStepValidation(prev => ({
        ...prev,
        [step]: isValid ? ValidationState.VALID : ValidationState.INVALID
      }));

      return isValid;
    } catch (error) {
      console.error('Step validation error:', error);
      return false;
    } finally {
      setIsLoading(false);
    }
  }, [agentConfig, stepValidation]);

  // Handle step navigation with validation
  const handleStepChange = useCallback(async (newStep: number) => {
    if (newStep < 0 || newStep >= TOTAL_STEPS) return;

    const isCurrentStepValid = await validateStep(currentStep);
    if (newStep > currentStep && !isCurrentStepValid) {
      showNotification({
        message: ERROR_MESSAGES.VALIDATION_ERROR,
        type: NotificationType.ERROR
      });
      return;
    }

    setCurrentStep(newStep);
  }, [currentStep, validateStep, showNotification]);

  // Handle agent save with validation
  const handleSave = useCallback(async () => {
    try {
      setIsLoading(true);
      setAgentStatus(AgentStatus.VALIDATING);

      // Validate all steps
      const isValid = await Promise.all(
        Array.from({ length: TOTAL_STEPS }, (_, i) => validateStep(i))
      ).then(results => results.every(Boolean));

      if (!isValid) {
        throw new Error(ERROR_MESSAGES.VALIDATION_ERROR);
      }

      await onSave(agentConfig);
      setAgentStatus(AgentStatus.READY);

      showNotification({
        message: 'Agent saved successfully',
        type: NotificationType.SUCCESS
      });
    } catch (error) {
      setAgentStatus(AgentStatus.ERROR);
      onError(error instanceof Error ? error : new Error('Failed to save agent'));
      
      showNotification({
        message: error instanceof Error ? error.message : ERROR_MESSAGES.GENERIC_ERROR,
        type: NotificationType.ERROR
      });
    } finally {
      setIsLoading(false);
    }
  }, [agentConfig, onSave, onError, showNotification, validateStep]);

  // Memoized styles
  const styles = useMemo(() => ({
    container: {
      padding: theme.tokens.space.medium,
      backgroundColor: theme.tokens.colors.background.secondary,
      borderRadius: theme.tokens.radii.medium,
      minHeight: '600px'
    },
    content: {
      marginTop: theme.tokens.space.large,
      marginBottom: theme.tokens.space.large
    },
    actions: {
      display: 'flex',
      justifyContent: 'flex-end',
      gap: theme.tokens.space.medium,
      marginTop: theme.tokens.space.large
    }
  }), [theme]);

  return (
    <ErrorBoundary onError={onError}>
      <View
        as="main"
        style={styles.container}
        role="main"
        aria-label="Agent Builder Interface"
      >
        <BuilderNavigation
          currentStep={currentStep}
          totalSteps={TOTAL_STEPS}
          onStepChange={handleStepChange}
          agentStatus={agentStatus}
          stepValidation={stepValidation}
          isLoading={isLoading}
        />

        <View style={styles.content}>
          <Heading
            level={2}
            aria-label={`Step ${currentStep + 1}: ${STEP_LABELS[currentStep]}`}
          >
            {STEP_LABELS[currentStep]}
          </Heading>

          {agentStatus === AgentStatus.ERROR && (
            <Alert
              variation="error"
              isDismissible={true}
              hasIcon={true}
              heading="Error"
            >
              {ERROR_MESSAGES.GENERIC_ERROR}
            </Alert>
          )}

          {/* Step content components would be rendered here */}

          <View style={styles.actions}>
            <Button
              variant="secondary"
              onClick={() => handleStepChange(currentStep - 1)}
              disabled={currentStep === 0 || isLoading}
              ariaLabel="Previous step"
            >
              Back
            </Button>
            {currentStep < TOTAL_STEPS - 1 ? (
              <Button
                variant="primary"
                onClick={() => handleStepChange(currentStep + 1)}
                disabled={isLoading}
                ariaLabel="Next step"
              >
                Next
              </Button>
            ) : (
              <Button
                variant="primary"
                onClick={handleSave}
                isLoading={isLoading}
                disabled={agentStatus === AgentStatus.ERROR}
                ariaLabel="Save agent configuration"
              >
                Save Agent
              </Button>
            )}
          </View>
        </View>

        {isLoading && (
          <Loading
            overlay
            text="Processing..."
            size="medium"
          />
        )}
      </View>
    </ErrorBoundary>
  );
});

AgentBuilder.displayName = 'AgentBuilder';

export type { AgentBuilderProps, AgentConfig };
export default AgentBuilder;