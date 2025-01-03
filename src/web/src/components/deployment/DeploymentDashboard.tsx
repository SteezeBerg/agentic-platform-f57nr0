import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Card,
  Heading,
  SelectField,
  useTheme,
  ErrorBoundary,
  Alert,
  useBreakpointValue
} from '@aws-amplify/ui-react';
import { useQuery } from '@tanstack/react-query';
import { css } from '@emotion/react';

import { Deployment, DeploymentEnvironment } from '../../types/deployment';
import DeploymentList from './DeploymentList';
import DeploymentMetrics from './DeploymentMetrics';
import { LoadingState } from '../../types/common';
import { hasPermission } from '../../utils/auth';
import { apiClient } from '../../utils/api';
import { API_ENDPOINTS } from '../../config/api';

interface DeploymentDashboardProps {
  selectedEnvironment?: DeploymentEnvironment;
  onEnvironmentChange?: (env: DeploymentEnvironment) => void;
  refreshInterval?: number;
}

const DeploymentDashboard: React.FC<DeploymentDashboardProps> = ({
  selectedEnvironment = 'production',
  onEnvironmentChange,
  refreshInterval = 30000
}) => {
  const { tokens } = useTheme();
  const [loadingState, setLoadingState] = useState<LoadingState>(LoadingState.IDLE);
  const [error, setError] = useState<Error | null>(null);

  // Responsive layout adjustments
  const isCompact = useBreakpointValue({
    base: true,
    medium: false
  });

  // Styles with theme integration
  const dashboardStyles = useMemo(() => css`
    display: flex;
    flex-direction: column;
    gap: ${tokens.space.medium};
    padding: ${tokens.space.medium};

    @media (prefers-reduced-motion: reduce) {
      * {
        transition: none !important;
      }
    }
  `, [tokens]);

  const headerStyles = useMemo(() => css`
    display: flex;
    justify-content: space-between;
    align-items: center;
    flex-wrap: wrap;
    gap: ${tokens.space.medium};

    @media (max-width: ${tokens.breakpoints.medium}) {
      flex-direction: column;
      align-items: stretch;
    }
  `, [tokens]);

  // Fetch deployments with real-time updates
  const { data: deployments, isLoading, error: queryError, refetch } = useQuery<Deployment[]>(
    ['deployments', selectedEnvironment],
    async () => {
      const response = await apiClient.get<Deployment[]>(
        `${API_ENDPOINTS.DEPLOYMENTS}?environment=${selectedEnvironment}`
      );
      return response.data;
    },
    {
      refetchInterval: refreshInterval,
      onError: (error) => {
        setError(error as Error);
        setLoadingState(LoadingState.ERROR);
      }
    }
  );

  // Handle environment change
  const handleEnvironmentChange = useCallback((event: React.ChangeEvent<HTMLSelectElement>) => {
    const newEnvironment = event.target.value as DeploymentEnvironment;
    onEnvironmentChange?.(newEnvironment);
  }, [onEnvironmentChange]);

  // Handle deployment retry
  const handleRetryDeployment = useCallback(async (deploymentId: string) => {
    try {
      setLoadingState(LoadingState.LOADING);
      await apiClient.post(`${API_ENDPOINTS.DEPLOYMENTS}/${deploymentId}/retry`);
      await refetch();
      setLoadingState(LoadingState.SUCCESS);
    } catch (error) {
      setError(error as Error);
      setLoadingState(LoadingState.ERROR);
    }
  }, [refetch]);

  // Handle deployment details view
  const handleViewDetails = useCallback(async (deploymentId: string) => {
    try {
      const hasViewPermission = await hasPermission('VIEW_METRICS');
      if (!hasViewPermission) {
        throw new Error('Insufficient permissions to view deployment details');
      }
      // Navigate to deployment details (implementation depends on routing solution)
      console.log('Viewing deployment details:', deploymentId);
    } catch (error) {
      setError(error as Error);
    }
  }, []);

  return (
    <ErrorBoundary fallback={<Alert variation="error">Failed to load deployment dashboard</Alert>}>
      <View
        css={dashboardStyles}
        as="main"
        role="region"
        aria-label="Deployment Dashboard"
      >
        <View css={headerStyles}>
          <Heading
            level={2}
            fontWeight={tokens.fontWeights.semibold}
          >
            Active Deployments
          </Heading>
          <SelectField
            label="Environment"
            value={selectedEnvironment}
            onChange={handleEnvironmentChange}
            options={[
              { label: 'Development', value: 'development' },
              { label: 'Staging', value: 'staging' },
              { label: 'Production', value: 'production' }
            ]}
            aria-label="Select environment"
          />
        </View>

        {error && (
          <Alert
            variation="error"
            isDismissible
            hasIcon
            heading="Error loading deployments"
            onDismiss={() => setError(null)}
          >
            {error.message}
          </Alert>
        )}

        <Card>
          <DeploymentList
            deployments={deployments || []}
            loading={isLoading}
            onViewDetails={handleViewDetails}
            onRetry={handleRetryDeployment}
            defaultView={isCompact ? 'card' : 'grid'}
          />
        </Card>

        {deployments?.map((deployment) => (
          <Card key={deployment.id}>
            <DeploymentMetrics
              deploymentId={deployment.id}
              refreshInterval={refreshInterval}
            />
          </Card>
        ))}
      </View>
    </ErrorBoundary>
  );
};

DeploymentDashboard.displayName = 'DeploymentDashboard';

export default React.memo(DeploymentDashboard);