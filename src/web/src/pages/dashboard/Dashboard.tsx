import React, { useEffect, useCallback, useMemo } from 'react';
import { 
  View, 
  Grid, 
  Heading, 
  useTheme, 
  Skeleton,
  Alert
} from '@aws-amplify/ui-react';
import { useQuery } from '@tanstack/react-query';
import { css } from '@emotion/react';

import Layout from '../../components/common/Layout';
import AgentMetrics from '../../components/agents/AgentMetrics';
import DeploymentDashboard from '../../components/deployment/DeploymentDashboard';
import KnowledgeMetrics from '../../components/knowledge/KnowledgeMetrics';
import ErrorBoundary from '../../components/common/ErrorBoundary';
import { useAuth } from '../../hooks/useAuth';
import { LoadingState } from '../../types/common';

export interface DashboardProps {
  className?: string;
  refreshInterval?: number;
}

const Dashboard: React.FC<DashboardProps> = ({
  className,
  refreshInterval = 30000
}) => {
  const { tokens } = useTheme();
  const { user, validateAccess } = useAuth();

  // Memoized styles
  const dashboardStyles = useMemo(() => css`
    display: flex;
    flex-direction: column;
    gap: ${tokens.space.large};
    padding: ${tokens.space.medium};
    max-width: 1440px;
    margin: 0 auto;
    width: 100%;

    @media (max-width: ${tokens.breakpoints.medium}) {
      padding: ${tokens.space.small};
      gap: ${tokens.space.medium};
    }

    @media (prefers-reduced-motion: reduce) {
      * {
        transition: none !important;
      }
    }
  `, [tokens]);

  const gridStyles = useMemo(() => css`
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
    gap: ${tokens.space.medium};
    width: 100%;
  `, [tokens]);

  // Fetch system overview metrics
  const { data: systemMetrics, isLoading, error } = useQuery(
    ['systemMetrics'],
    async () => {
      // Implementation would fetch aggregated system metrics
      return {};
    },
    {
      refetchInterval: refreshInterval,
      staleTime: refreshInterval / 2
    }
  );

  // Handle metric alerts
  const handleMetricAlert = useCallback((metric: string, value: number) => {
    console.warn(`Metric alert: ${metric} = ${value}`);
  }, []);

  // Verify user permissions
  useEffect(() => {
    const checkPermissions = async () => {
      const hasViewAccess = await validateAccess(['VIEW_METRICS']);
      if (!hasViewAccess) {
        throw new Error('Insufficient permissions to view dashboard');
      }
    };
    checkPermissions();
  }, [validateAccess]);

  return (
    <Layout>
      <ErrorBoundary>
        <View
          as="main"
          css={dashboardStyles}
          className={className}
          role="main"
          aria-label="Dashboard Overview"
        >
          <Heading
            level={1}
            fontWeight={tokens.fontWeights.bold}
            fontSize={tokens.fontSizes.xxl}
          >
            Agent Builder Hub Dashboard
          </Heading>

          {error && (
            <Alert
              variation="error"
              isDismissible
              hasIcon
              heading="Error loading dashboard"
            >
              {error instanceof Error ? error.message : 'An error occurred'}
            </Alert>
          )}

          <Grid css={gridStyles}>
            {isLoading ? (
              <>
                <Skeleton height="200px" width="100%" />
                <Skeleton height="200px" width="100%" />
                <Skeleton height="200px" width="100%" />
              </>
            ) : (
              <>
                <AgentMetrics
                  agentId={user?.id}
                  refreshInterval={refreshInterval}
                  onMetricAlert={handleMetricAlert}
                  data-testid="agent-metrics"
                />

                <DeploymentDashboard
                  refreshInterval={refreshInterval}
                  data-testid="deployment-dashboard"
                />

                <KnowledgeMetrics
                  refreshInterval={refreshInterval}
                  onError={handleMetricAlert}
                  data-testid="knowledge-metrics"
                />
              </>
            )}
          </Grid>

          <View
            as="footer"
            fontSize={tokens.fontSizes.small}
            color={tokens.colors.font.secondary}
            textAlign="right"
            padding={tokens.space.small}
          >
            Last updated: {new Date().toLocaleString()}
          </View>
        </View>
      </ErrorBoundary>
    </Layout>
  );
};

Dashboard.displayName = 'Dashboard';

export default React.memo(Dashboard);