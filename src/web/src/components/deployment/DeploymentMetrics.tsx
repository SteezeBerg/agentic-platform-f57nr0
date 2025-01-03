import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Card, Text, useTheme, Skeleton, Alert } from '@aws-amplify/ui-react';
import { debounce } from 'lodash'; // v4.17.21
import styled from '@emotion/styled';
import { DeploymentMetrics as DeploymentMetricsType } from '../../types/deployment';
import ProgressBar from '../common/ProgressBar';
import { getDeploymentMetrics } from '../../services/deployment';

// Styled components with accessibility and responsive design
const MetricsContainer = styled(View)`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
  gap: 1rem;
  padding: 1rem;

  @media (max-width: 768px) {
    grid-template-columns: 1fr;
  }

  @media (prefers-reduced-motion) {
    * {
      transition: none !important;
    }
  }
`;

const MetricCard = styled(Card)`
  padding: 1rem;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  position: relative;
  min-height: 120px;

  [data-mode='dark'] & {
    background-color: var(--amplify-colors-neutral-90);
  }
`;

const MetricLabel = styled(Text)`
  font-weight: 500;
  color: var(--amplify-colors-font-secondary);
  font-size: var(--amplify-font-sizes-small);
`;

const MetricValue = styled(Text)`
  font-size: var(--amplify-font-sizes-large);
  font-weight: 600;
  margin-top: 0.25rem;
`;

interface DeploymentMetricsProps {
  deploymentId: string;
  refreshInterval?: number;
}

// Metric thresholds for different severity levels
const METRIC_THRESHOLDS = {
  cpu_usage: { warning: 70, error: 90 },
  memory_usage: { warning: 75, error: 85 },
  error_rate: { warning: 2, error: 5 },
  latency: { warning: 1000, error: 2000 },
  request_count: { warning: 1000, error: 5000 }
};

// Custom hook for metrics polling with error handling
const useMetricsPolling = (deploymentId: string, refreshInterval: number = 30000) => {
  const [metrics, setMetrics] = useState<DeploymentMetricsType | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const fetchMetrics = useCallback(async () => {
    try {
      const data = await getDeploymentMetrics(deploymentId);
      setMetrics(data);
      setError(null);
    } catch (err) {
      setError(err as Error);
      console.error('Failed to fetch deployment metrics:', err);
    } finally {
      setIsLoading(false);
    }
  }, [deploymentId]);

  // Debounce fetch function to prevent excessive calls
  const debouncedFetch = useMemo(
    () => debounce(fetchMetrics, 500),
    [fetchMetrics]
  );

  useEffect(() => {
    debouncedFetch();
    const interval = setInterval(debouncedFetch, refreshInterval);

    return () => {
      clearInterval(interval);
      debouncedFetch.cancel();
    };
  }, [debouncedFetch, refreshInterval]);

  return { metrics, error, isLoading };
};

// Determine progress bar variant based on metric value
const getMetricVariant = (value: number, metricType: keyof typeof METRIC_THRESHOLDS) => {
  const thresholds = METRIC_THRESHOLDS[metricType];
  if (value >= thresholds.error) return 'error';
  if (value >= thresholds.warning) return 'warning';
  return 'success';
};

const DeploymentMetrics: React.FC<DeploymentMetricsProps> = ({
  deploymentId,
  refreshInterval = 30000
}) => {
  const { metrics, error, isLoading } = useMetricsPolling(deploymentId, refreshInterval);
  const theme = useTheme();

  if (error) {
    return (
      <Alert
        variation="error"
        isDismissible={false}
        hasIcon={true}
        heading="Failed to load metrics"
      >
        {error.message}
      </Alert>
    );
  }

  return (
    <MetricsContainer>
      {/* CPU Usage Metric */}
      <MetricCard>
        {isLoading ? (
          <Skeleton height="120px" />
        ) : (
          <>
            <MetricLabel>CPU Usage</MetricLabel>
            <MetricValue>{metrics?.resource_utilization.cpu_usage.toFixed(1)}%</MetricValue>
            <ProgressBar
              value={metrics?.resource_utilization.cpu_usage || 0}
              variant={getMetricVariant(metrics?.resource_utilization.cpu_usage || 0, 'cpu_usage')}
              label="CPU utilization"
              showValue
              animated
            />
          </>
        )}
      </MetricCard>

      {/* Memory Usage Metric */}
      <MetricCard>
        {isLoading ? (
          <Skeleton height="120px" />
        ) : (
          <>
            <MetricLabel>Memory Usage</MetricLabel>
            <MetricValue>{metrics?.resource_utilization.memory_usage.toFixed(1)}%</MetricValue>
            <ProgressBar
              value={metrics?.resource_utilization.memory_usage || 0}
              variant={getMetricVariant(metrics?.resource_utilization.memory_usage || 0, 'memory_usage')}
              label="Memory utilization"
              showValue
              animated
            />
          </>
        )}
      </MetricCard>

      {/* Request Count Metric */}
      <MetricCard>
        {isLoading ? (
          <Skeleton height="120px" />
        ) : (
          <>
            <MetricLabel>Request Count</MetricLabel>
            <MetricValue>{metrics?.performance.request_count.toLocaleString()}</MetricValue>
            <ProgressBar
              value={(metrics?.performance.request_count || 0) / 50}
              variant={getMetricVariant(metrics?.performance.request_count || 0, 'request_count')}
              label="Request volume"
              showValue={false}
              animated
            />
          </>
        )}
      </MetricCard>

      {/* Error Rate Metric */}
      <MetricCard>
        {isLoading ? (
          <Skeleton height="120px" />
        ) : (
          <>
            <MetricLabel>Error Rate</MetricLabel>
            <MetricValue>{metrics?.performance.error_rate.toFixed(2)}%</MetricValue>
            <ProgressBar
              value={metrics?.performance.error_rate || 0}
              variant={getMetricVariant(metrics?.performance.error_rate || 0, 'error_rate')}
              label="Error rate"
              showValue
              animated
            />
          </>
        )}
      </MetricCard>

      {/* Latency Metric */}
      <MetricCard>
        {isLoading ? (
          <Skeleton height="120px" />
        ) : (
          <>
            <MetricLabel>Average Latency</MetricLabel>
            <MetricValue>{metrics?.performance.latency.p50.toFixed(0)}ms</MetricValue>
            <ProgressBar
              value={(metrics?.performance.latency.p50 || 0) / 20}
              variant={getMetricVariant(metrics?.performance.latency.p50 || 0, 'latency')}
              label="Response time"
              showValue={false}
              animated
            />
          </>
        )}
      </MetricCard>
    </MetricsContainer>
  );
};

export default DeploymentMetrics;