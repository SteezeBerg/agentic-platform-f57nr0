import React, { useEffect, useCallback, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useInView } from 'react-intersection-observer';
import { useErrorBoundary } from 'react-error-boundary';
import {
  View,
  Heading,
  Text,
  Card,
  Badge,
  Button,
  Flex,
  Grid,
  Loader,
  TabItem,
  Tabs,
  Divider,
  Alert
} from '@aws-amplify/ui-react';
import { Agent, AgentStatus, AgentType } from '../../types/agent';
import ErrorBoundary from '../../components/common/ErrorBoundary';
import { useNotification, NotificationType } from '../../hooks/useNotification';

// Constants for accessibility and UI
const ARIA_LABELS = {
  mainContent: 'Agent details page',
  statusSection: 'Agent status information',
  configSection: 'Agent configuration',
  metricsSection: 'Performance metrics',
  deploymentSection: 'Deployment information',
  backButton: 'Return to agents list',
  editButton: 'Edit agent configuration',
  deleteButton: 'Delete agent',
  deployButton: 'Deploy agent'
};

const STATUS_COLORS = {
  [AgentStatus.CREATED]: 'info',
  [AgentStatus.CONFIGURING]: 'warning',
  [AgentStatus.READY]: 'success',
  [AgentStatus.DEPLOYING]: 'warning',
  [AgentStatus.DEPLOYED]: 'success',
  [AgentStatus.ERROR]: 'error',
  [AgentStatus.ARCHIVED]: 'neutral'
} as const;

interface AgentDetailsProps {
  className?: string;
  ariaLabel?: string;
}

const AgentDetails: React.FC<AgentDetailsProps> = ({
  className,
  ariaLabel = ARIA_LABELS.mainContent
}) => {
  const { agentId } = useParams<{ agentId: string }>();
  const navigate = useNavigate();
  const { showBoundary } = useErrorBoundary();
  const { showNotification } = useNotification();
  const [agent, setAgent] = useState<Agent | null>(null);
  const [loading, setLoading] = useState(true);

  // Intersection observer for metrics section lazy loading
  const { ref: metricsRef, inView: metricsInView } = useInView({
    triggerOnce: true,
    threshold: 0.1
  });

  // Fetch agent details with error handling
  const fetchAgentDetails = useCallback(async () => {
    if (!agentId) return;

    try {
      setLoading(true);
      // API call would go here
      const response = await fetch(`/api/agents/${agentId}`);
      const data = await response.json();
      setAgent(data);
    } catch (error) {
      showBoundary(error);
      showNotification({
        message: 'Failed to load agent details',
        type: NotificationType.ERROR
      });
    } finally {
      setLoading(false);
    }
  }, [agentId, showBoundary, showNotification]);

  useEffect(() => {
    fetchAgentDetails();
  }, [fetchAgentDetails]);

  // Keyboard navigation handlers
  const handleKeyNavigation = useCallback((event: React.KeyboardEvent) => {
    if (event.key === 'Escape') {
      navigate('/agents');
    }
  }, [navigate]);

  if (loading) {
    return (
      <View
        as="section"
        padding="medium"
        aria-label="Loading agent details"
        aria-live="polite"
      >
        <Loader size="large" variation="linear" />
      </View>
    );
  }

  if (!agent) {
    return (
      <Alert
        variation="error"
        heading="Agent Not Found"
        isDismissible={false}
        role="alert"
      >
        The requested agent could not be found.
      </Alert>
    );
  }

  return (
    <ErrorBoundary>
      <View
        as="main"
        className={className}
        aria-label={ariaLabel}
        onKeyDown={handleKeyNavigation}
        padding="medium"
      >
        {/* Header Section */}
        <Flex direction="row" justifyContent="space-between" alignItems="center">
          <Heading
            level={1}
            isTruncated
            maxWidth="70%"
            aria-label={`Agent: ${agent.name}`}
          >
            {agent.name}
          </Heading>
          <Badge variation={STATUS_COLORS[agent.status]}>
            {agent.status}
          </Badge>
        </Flex>

        <Text
          variation="tertiary"
          marginBottom="medium"
          aria-label="Agent description"
        >
          {agent.description}
        </Text>

        {/* Action Buttons */}
        <Flex gap="small" marginBottom="large">
          <Button
            onClick={() => navigate('/agents')}
            aria-label={ARIA_LABELS.backButton}
            variation="link"
          >
            Back
          </Button>
          <Button
            onClick={() => navigate(`/agents/${agentId}/edit`)}
            aria-label={ARIA_LABELS.editButton}
            variation="primary"
          >
            Edit
          </Button>
          <Button
            onClick={() => navigate(`/agents/${agentId}/deploy`)}
            aria-label={ARIA_LABELS.deployButton}
            isDisabled={agent.status !== AgentStatus.READY}
            variation="primary"
          >
            Deploy
          </Button>
        </Flex>

        {/* Main Content Tabs */}
        <Tabs
          defaultIndex={0}
          aria-label="Agent details sections"
          spacing="equal"
        >
          <TabItem
            title="Configuration"
            aria-controls="config-panel"
          >
            <Card aria-labelledby={ARIA_LABELS.configSection}>
              <Grid templateColumns="1fr 1fr" gap="medium">
                <View>
                  <Text variation="strong">Type</Text>
                  <Text>{AgentType[agent.type]}</Text>
                </View>
                <View>
                  <Text variation="strong">Version</Text>
                  <Text>{agent.version}</Text>
                </View>
                {/* Additional configuration details */}
              </Grid>
            </Card>
          </TabItem>

          <TabItem
            title="Metrics"
            aria-controls="metrics-panel"
          >
            <View ref={metricsRef}>
              {metricsInView && (
                <Card aria-labelledby={ARIA_LABELS.metricsSection}>
                  {/* Metrics content loaded when in view */}
                  <Grid templateColumns="1fr 1fr 1fr" gap="medium">
                    {agent.healthStatus.metrics && (
                      <>
                        <View>
                          <Text variation="strong">CPU Usage</Text>
                          <Text>{agent.healthStatus.metrics.cpu_usage}%</Text>
                        </View>
                        <View>
                          <Text variation="strong">Memory Usage</Text>
                          <Text>{agent.healthStatus.metrics.memory_usage}%</Text>
                        </View>
                        <View>
                          <Text variation="strong">Response Time</Text>
                          <Text>{agent.healthStatus.metrics.response_time_ms}ms</Text>
                        </View>
                      </>
                    )}
                  </Grid>
                </Card>
              )}
            </View>
          </TabItem>

          <TabItem
            title="Deployment"
            aria-controls="deployment-panel"
          >
            <Card aria-labelledby={ARIA_LABELS.deploymentSection}>
              {/* Deployment details */}
              <Grid templateColumns="1fr 1fr" gap="medium">
                <View>
                  <Text variation="strong">Environment</Text>
                  <Text>{agent.metadata.environment}</Text>
                </View>
                <View>
                  <Text variation="strong">Last Deployed</Text>
                  <Text>{new Date(agent.updatedAt).toLocaleString()}</Text>
                </View>
              </Grid>
            </Card>
          </TabItem>
        </Tabs>
      </View>
    </ErrorBoundary>
  );
};

export default AgentDetails;