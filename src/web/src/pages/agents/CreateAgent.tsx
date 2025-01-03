import React, { useState, useCallback, useEffect } from 'react';
import { View, useTheme, Spinner } from '@aws-amplify/ui-react';
import { useNavigate } from 'react-router-dom';

import { AgentBuilder } from '../../components/builder/AgentBuilder';
import ErrorBoundary from '../../components/common/ErrorBoundary';
import { useAgent } from '../../hooks/useAgent';
import { useNotification } from '../../hooks/useNotification';
import { AgentStatus } from '../../types/agent';
import { LoadingState } from '../../types/common';

/**
 * CreateAgent page component implementing the agent creation interface
 * with step-by-step wizard, accessibility support, and AWS Amplify UI design patterns.
 */
const CreateAgent: React.FC = React.memo(() => {
  const navigate = useNavigate();
  const { theme } = useTheme();
  const { showNotification } = useNotification();
  const { createAgent, isLoading, error } = useAgent();

  // Local state for tracking page loading
  const [pageLoadingState, setPageLoadingState] = useState<LoadingState>(LoadingState.LOADING);

  // Initialize page
  useEffect(() => {
    const initializePage = async () => {
      try {
        // Any initial data loading or setup can go here
        setPageLoadingState(LoadingState.SUCCESS);
      } catch (error) {
        setPageLoadingState(LoadingState.ERROR);
        showNotification({
          message: 'Failed to initialize agent creation page',
          type: 'ERROR'
        });
      }
    };

    initializePage();
  }, [showNotification]);

  // Handle agent save
  const handleSave = useCallback(async (agentConfig: any) => {
    try {
      const agent = await createAgent({
        ...agentConfig,
        status: AgentStatus.CREATED
      });

      showNotification({
        message: 'Agent created successfully',
        type: 'SUCCESS'
      });

      // Navigate to the agent details page
      navigate(`/agents/${agent.id}`);
    } catch (error) {
      showNotification({
        message: error instanceof Error ? error.message : 'Failed to create agent',
        type: 'ERROR'
      });
    }
  }, [createAgent, navigate, showNotification]);

  // Handle cancellation
  const handleCancel = useCallback(() => {
    navigate('/agents');
  }, [navigate]);

  // Styles
  const styles = {
    container: {
      padding: theme.tokens.space.medium,
      backgroundColor: theme.tokens.colors.background.secondary,
      minHeight: '100vh'
    },
    content: {
      maxWidth: '1200px',
      margin: '0 auto',
      backgroundColor: theme.tokens.colors.background.primary,
      borderRadius: theme.tokens.radii.medium,
      boxShadow: theme.tokens.shadows.small,
      padding: theme.tokens.space.large
    },
    loadingContainer: {
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      minHeight: '400px'
    }
  };

  // Render loading state
  if (pageLoadingState === LoadingState.LOADING) {
    return (
      <View style={styles.loadingContainer}>
        <Spinner size="large" />
      </View>
    );
  }

  // Render error state
  if (pageLoadingState === LoadingState.ERROR) {
    return (
      <ErrorBoundary>
        <View>Error loading agent creation page</View>
      </ErrorBoundary>
    );
  }

  return (
    <ErrorBoundary>
      <View
        as="main"
        style={styles.container}
        role="main"
        aria-label="Create Agent Page"
      >
        <View style={styles.content}>
          <AgentBuilder
            onSave={handleSave}
            onCancel={handleCancel}
            isLoading={isLoading}
            error={error}
          />
        </View>
      </View>
    </ErrorBoundary>
  );
});

CreateAgent.displayName = 'CreateAgent';

export default CreateAgent;