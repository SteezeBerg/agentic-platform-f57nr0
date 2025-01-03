import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { useTheme, Flex, ProgressBar, Text, Heading, Badge } from '@aws-amplify/ui-react';
import { Agent } from '../../types/agent';
import CustomCard from '../common/Card';
import { useAgent } from '../../hooks/useAgent';
import { MetricUnit } from '../../types/common';

interface AgentMetricsProps {
  agentId: string;
  className?: string;
  refreshInterval?: number;
  onMetricAlert?: (metric: string, value: number) => void;
}

const METRIC_THRESHOLDS = {
  cpu_usage: 80, // 80% CPU threshold
  memory_usage: 75, // 75% memory threshold
  error_rate: 5, // 5% error rate threshold
  response_time_ms: 1000 // 1 second response time threshold
};

const formatMetricValue = (value: number, type: string, locale: string = 'en-US'): string => {
  switch (type) {
    case MetricUnit.PERCENTAGE:
      return `${value.toFixed(1)}%`;
    case MetricUnit.MILLISECONDS:
      return `${value.toFixed(0)}ms`;
    case MetricUnit.BYTES:
      return value > 1024 * 1024 
        ? `${(value / (1024 * 1024)).toFixed(2)}MB` 
        : `${(value / 1024).toFixed(2)}KB`;
    case MetricUnit.COUNT:
      return value.toLocaleString(locale);
    default:
      return value.toString();
  }
};

const AgentMetrics: React.FC<AgentMetricsProps> = ({
  agentId,
  className = '',
  refreshInterval = 5000,
  onMetricAlert
}) => {
  const { tokens } = useTheme();
  const { agent, isLoading, error } = useAgent(agentId);
  const [lastUpdate, setLastUpdate] = useState<Date>(new Date());

  // Memoized metric status calculations
  const metricStatuses = useMemo(() => {
    if (!agent?.healthStatus?.metrics) return {};

    return {
      cpu: {
        value: agent.healthStatus.metrics.cpu_usage,
        status: agent.healthStatus.metrics.cpu_usage > METRIC_THRESHOLDS.cpu_usage ? 'error' : 'normal',
        unit: MetricUnit.PERCENTAGE
      },
      memory: {
        value: agent.healthStatus.metrics.memory_usage,
        status: agent.healthStatus.metrics.memory_usage > METRIC_THRESHOLDS.memory_usage ? 'error' : 'normal',
        unit: MetricUnit.PERCENTAGE
      },
      errorRate: {
        value: agent.healthStatus.metrics.error_rate,
        status: agent.healthStatus.metrics.error_rate > METRIC_THRESHOLDS.error_rate ? 'error' : 'normal',
        unit: MetricUnit.PERCENTAGE
      },
      responseTime: {
        value: agent.healthStatus.metrics.response_time_ms,
        status: agent.healthStatus.metrics.response_time_ms > METRIC_THRESHOLDS.response_time_ms ? 'error' : 'normal',
        unit: MetricUnit.MILLISECONDS
      },
      requests: {
        value: agent.healthStatus.metrics.request_count,
        status: 'normal',
        unit: MetricUnit.COUNT
      }
    };
  }, [agent?.healthStatus?.metrics]);

  // Alert handler for metric threshold violations
  const checkMetricAlerts = useCallback(() => {
    if (!onMetricAlert || !agent?.healthStatus?.metrics) return;

    Object.entries(metricStatuses).forEach(([metric, data]) => {
      if (data.status === 'error') {
        onMetricAlert(metric, data.value);
      }
    });
  }, [metricStatuses, onMetricAlert, agent?.healthStatus?.metrics]);

  // Periodic refresh effect
  useEffect(() => {
    const intervalId = setInterval(() => {
      setLastUpdate(new Date());
      checkMetricAlerts();
    }, refreshInterval);

    return () => clearInterval(intervalId);
  }, [refreshInterval, checkMetricAlerts]);

  if (error) {
    return (
      <CustomCard
        elevation={2}
        className={className}
        aria-label="Agent metrics error state"
      >
        <Text color={tokens.colors.red[60]}>
          Error loading metrics: {error.message}
        </Text>
      </CustomCard>
    );
  }

  if (isLoading) {
    return (
      <CustomCard
        elevation={2}
        className={className}
        aria-label="Loading agent metrics"
      >
        <Flex direction="column" gap={tokens.space.medium}>
          <Text>Loading metrics...</Text>
          <ProgressBar
            label="Loading"
            value={undefined}
            isIndeterminate={true}
          />
        </Flex>
      </CustomCard>
    );
  }

  return (
    <CustomCard
      elevation={2}
      className={className}
      aria-label="Agent performance metrics"
    >
      <Flex direction="column" gap={tokens.space.medium}>
        <Flex justifyContent="space-between" alignItems="center">
          <Heading level={3}>Performance Metrics</Heading>
          <Badge variation={agent?.status === 'DEPLOYED' ? 'success' : 'warning'}>
            {agent?.status}
          </Badge>
        </Flex>

        <Flex direction="column" gap={tokens.space.small}>
          {Object.entries(metricStatuses).map(([key, metric]) => (
            <Flex
              key={key}
              direction="column"
              gap={tokens.space.xxs}
              aria-label={`${key} metric`}
            >
              <Flex justifyContent="space-between">
                <Text>{key.charAt(0).toUpperCase() + key.slice(1)}</Text>
                <Text
                  color={metric.status === 'error' ? tokens.colors.red[60] : tokens.colors.green[60]}
                >
                  {formatMetricValue(metric.value, metric.unit)}
                </Text>
              </Flex>
              {metric.unit === MetricUnit.PERCENTAGE && (
                <ProgressBar
                  label={`${key} usage`}
                  value={metric.value}
                  maxValue={100}
                  variation={metric.status === 'error' ? 'error' : 'primary'}
                  aria-valuetext={`${metric.value}%`}
                />
              )}
            </Flex>
          ))}
        </Flex>

        <Text
          fontSize={tokens.fontSizes.xs}
          color={tokens.colors.neutral[60]}
          textAlign="right"
        >
          Last updated: {lastUpdate.toLocaleTimeString()}
        </Text>
      </Flex>
    </CustomCard>
  );
};

export default AgentMetrics;