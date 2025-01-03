import React, { useCallback, useEffect, useState } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { View, Heading, Alert } from '@aws-amplify/ui-react';
import { useAnalytics } from '@aws-amplify/analytics';
import { AgentBuilder } from '../../components/builder/AgentBuilder';
import { useAgent } from '../../hooks/useAgent';
import { PageHeader } from '../../components/common/PageHeader';
import { Loading } from '../../components/common/Loading';
import { useNotification, NotificationType } from '../../hooks/useNotification';
import { Agent, AgentStatus } from '../../types/agent';
import { LoadingState } from '../../types/common';
import { Button } from '../../components/common/Button';

/**
 * Enhanced page component for editing existing agents with comprehensive
 * error handling, state management, and accessibility features.
 */
const EditAgent: React.FC = React.memo(() => {
  const { agentId } = useParams<{ agentId: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const analytics = useAnalytics();
  const { showNotification } = useNotification();

  // Agent state management with optimistic updates
  const {
    agent,
    isLoading,
    error,
    updateAgent,
    rollbackChanges,
    validateTemplate
  } = useAgent(agentId, {
    enableOptimisticUpdates: true,
    monitorPerformance: true
  });

  // Track unsaved changes
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [validationState, setValidationState] = useState<LoadingState>(LoadingState.IDLE);

  // Track edit session
  useEffect(() => {
    analytics.record({
      name: 'AgentEditView',
      attributes: {
        agentId,
        source: location.state?.source || 'direct'
      }
    });

    // Prompt for unsaved changes
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (hasUnsavedChanges) {
        e.preventDefault();
        e.returnValue = '';
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [agentId, analytics, hasUnsavedChanges, location.state]);

  // Handle agent updates
  const handleSave = useCallback(async (updatedAgent: Agent) => {
    try {
      setValidationState(LoadingState.LOADING);

      // Validate changes
      const isValid = await validateTemplate({
        ...updatedAgent,
        status: AgentStatus.CONFIGURING
      });

      if (!isValid) {
        throw new Error('Invalid agent configuration');
      }

      // Attempt update
      await updateAgent(updatedAgent);

      setHasUnsavedChanges(false);
      setValidationState(LoadingState.SUCCESS);

      showNotification({
        message: 'Agent updated successfully',
        type: NotificationType.SUCCESS
      });

      // Track successful update
      analytics.record({
        name: 'AgentUpdateSuccess',
        attributes: {
          agentId,
          changes: Object.keys(updatedAgent).join(',')
        }
      });

      navigate('/agents');
    } catch (error) {
      setValidationState(LoadingState.ERROR);
      
      showNotification({
        message: error instanceof Error ? error.message : 'Failed to update agent',
        type: NotificationType.ERROR,
        persistent: true
      });

      // Track update failure
      analytics.record({
        name: 'AgentUpdateError',
        attributes: {
          agentId,
          error: error instanceof Error ? error.message : 'Unknown error'
        }
      });
    }
  }, [agentId, analytics, navigate, showNotification, updateAgent, validateTemplate]);

  // Handle cancellation with changes
  const handleCancel = useCallback(() => {
    if (hasUnsavedChanges) {
      if (window.confirm('You have unsaved changes. Are you sure you want to cancel?')) {
        rollbackChanges();
        navigate('/agents');
      }
    } else {
      navigate('/agents');
    }
  }, [hasUnsavedChanges, navigate, rollbackChanges]);

  // Render loading state
  if (isLoading) {
    return (
      <Loading
        size="large"
        text="Loading agent configuration..."
        overlay={true}
      />
    );
  }

  // Render error state
  if (error || !agent) {
    return (
      <View padding="medium">
        <Alert
          variation="error"
          isDismissible={true}
          hasIcon={true}
          heading="Error Loading Agent"
        >
          {error?.message || 'Failed to load agent configuration'}
        </Alert>
        <Button
          variant="primary"
          onClick={() => navigate('/agents')}
          ariaLabel="Return to agents list"
        >
          Return to Agents
        </Button>
      </View>
    );
  }

  return (
    <View
      as="main"
      padding="medium"
      role="main"
      aria-label="Edit agent configuration"
    >
      <PageHeader
        title={`Edit Agent: ${agent.name}`}
        actions={[
          <Button
            key="cancel"
            variant="secondary"
            onClick={handleCancel}
            ariaLabel="Cancel editing"
          >
            Cancel
          </Button>,
          <Button
            key="save"
            variant="primary"
            onClick={() => handleSave(agent)}
            isLoading={validationState === LoadingState.LOADING}
            disabled={!hasUnsavedChanges || validationState === LoadingState.LOADING}
            ariaLabel="Save agent changes"
          >
            Save Changes
          </Button>
        ]}
      />

      <AgentBuilder
        agentId={agentId}
        onSave={handleSave}
        onChange={() => setHasUnsavedChanges(true)}
        onError={(error) => {
          showNotification({
            message: error.message,
            type: NotificationType.ERROR
          });
        }}
      />
    </View>
  );
});

EditAgent.displayName = 'EditAgent';

export default EditAgent;