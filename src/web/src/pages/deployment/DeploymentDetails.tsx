import React, { useEffect, useState, useCallback } from 'react';
import { View, Heading, Text, Flex, Loader, Button, Alert } from '@aws-amplify/ui-react';
// @aws-amplify/ui-react version ^6.0.0
// react version ^18.2.0
import { useParams, useNavigate } from 'react-router-dom';
// react-router-dom version ^6.0.0

import DeploymentCard from '../../components/deployment/DeploymentCard';
import DeploymentMetrics from '../../components/deployment/DeploymentMetrics';
import { useDeployment } from '../../hooks/useDeployment';
import { hasPermission } from '../../utils/auth';
import { Permission } from '../../types/auth';
import { DeploymentEnvironment, DeploymentStatus } from '../../types/deployment';

interface DeploymentDetailsProps {
  refreshInterval?: number;
  showHistory?: boolean;
}

const DeploymentDetails: React.FC<DeploymentDetailsProps> = ({
  refreshInterval = 30000,
  showHistory = false
}) => {
  const { deploymentId } = useParams<{ deploymentId: string }>();
  const navigate = useNavigate();
  const [canManageDeployment, setCanManageDeployment] = useState(false);

  // Get deployment data and actions from custom hook
  const {
    deployment,
    isLoading,
    error,
    metrics,
    updateStatus,
    updateHealth,
    switchVersion,
    refreshDeployments
  } = useDeployment(deploymentId!, deployment?.environment as DeploymentEnvironment);

  // Check user permissions
  useEffect(() => {
    const checkPermissions = async () => {
      const hasManagePermission = await hasPermission(Permission.DEPLOY_AGENT);
      setCanManageDeployment(hasManagePermission);
    };
    checkPermissions();
  }, []);

  // Handle retry action for failed deployments
  const handleRetry = useCallback(async () => {
    if (!deployment || deployment.status !== 'failed') return;

    try {
      await updateStatus('in_progress');
      await refreshDeployments();
    } catch (error) {
      console.error('Retry failed:', error);
    }
  }, [deployment, updateStatus, refreshDeployments]);

  // Handle blue/green deployment switch
  const handleBlueGreenSwitch = useCallback(async () => {
    if (!deployment || !canManageDeployment) return;

    try {
      await switchVersion();
      await refreshDeployments();
    } catch (error) {
      console.error('Blue/green switch failed:', error);
    }
  }, [deployment, canManageDeployment, switchVersion, refreshDeployments]);

  if (isLoading || !deployment) {
    return (
      <View padding="medium">
        <Loader size="large" />
      </View>
    );
  }

  if (error) {
    return (
      <View padding="medium">
        <Alert
          variation="error"
          isDismissible={false}
          hasIcon={true}
          heading="Error loading deployment details"
        >
          {error}
        </Alert>
      </View>
    );
  }

  return (
    <View padding="medium">
      <Flex direction="column" gap="medium">
        {/* Header Section */}
        <Flex justifyContent="space-between" alignItems="center">
          <Heading level={2}>Deployment Details</Heading>
          <Flex gap="small">
            {canManageDeployment && deployment.status === 'failed' && (
              <Button
                variation="primary"
                onClick={handleRetry}
                ariaLabel="Retry failed deployment"
              >
                Retry Deployment
              </Button>
            )}
            {canManageDeployment && deployment.config.strategy === 'blue_green' && (
              <Button
                variation="primary"
                onClick={handleBlueGreenSwitch}
                isDisabled={deployment.status !== 'completed'}
                ariaLabel="Switch blue/green deployment"
              >
                Switch Version
              </Button>
            )}
            <Button
              variation="link"
              onClick={() => navigate('/deployments')}
              ariaLabel="Back to deployments list"
            >
              Back to List
            </Button>
          </Flex>
        </Flex>

        {/* Deployment Card */}
        <DeploymentCard
          deployment={deployment}
          onRetry={handleRetry}
          onError={(error) => console.error('Deployment error:', error)}
          className="deployment-details-card"
        />

        {/* Metrics Section */}
        <View>
          <Heading level={3} marginBottom="medium">
            Performance Metrics
          </Heading>
          <DeploymentMetrics
            deploymentId={deployment.id}
            refreshInterval={refreshInterval}
          />
        </View>

        {/* Environment Information */}
        <View>
          <Heading level={3} marginBottom="medium">
            Environment Details
          </Heading>
          <Flex direction="column" gap="small">
            <Text>
              <strong>Environment:</strong> {deployment.environment}
            </Text>
            <Text>
              <strong>Type:</strong> {deployment.deployment_type}
            </Text>
            <Text>
              <strong>Strategy:</strong> {deployment.config.strategy}
            </Text>
            {deployment.config.strategy === 'blue_green' && (
              <Text>
                <strong>Active Slot:</strong>{' '}
                {deployment.status === 'completed' ? 'Blue' : 'Green'}
              </Text>
            )}
          </Flex>
        </View>

        {/* Health Checks */}
        <View>
          <Heading level={3} marginBottom="medium">
            Health Status
          </Heading>
          <Flex direction="column" gap="small">
            <Text>
              <strong>Current Health:</strong>{' '}
              <span className={`health-status health-${deployment.health}`}>
                {deployment.health}
              </span>
            </Text>
            <Text>
              <strong>Last Health Check:</strong>{' '}
              {new Date(deployment.last_active).toLocaleString()}
            </Text>
          </Flex>
        </View>

        {/* Deployment History */}
        {showHistory && deployment.history && deployment.history.length > 0 && (
          <View>
            <Heading level={3} marginBottom="medium">
              Deployment History
            </Heading>
            <Flex direction="column" gap="small">
              {deployment.history.map((entry, index) => (
                <View
                  key={index}
                  padding="small"
                  backgroundColor={tokens.colors.background.secondary}
                  borderRadius={tokens.radii.medium}
                >
                  <Text>
                    <strong>Version:</strong> {entry.version}
                  </Text>
                  <Text>
                    <strong>Status:</strong> {entry.status}
                  </Text>
                  <Text>
                    <strong>Timestamp:</strong>{' '}
                    {new Date(entry.timestamp).toLocaleString()}
                  </Text>
                </View>
              ))}
            </Flex>
          </View>
        )}
      </Flex>
    </View>
  );
};

export default DeploymentDetails;