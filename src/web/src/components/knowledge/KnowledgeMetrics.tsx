import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, useTheme, Flex, Heading } from '@aws-amplify/ui-react';
import styled from '@emotion/styled';
import { KnowledgeSource, KnowledgeSourceType, KnowledgeSourceStatus } from '../../types/knowledge';
import Card from '../common/Card';
import ProgressBar from '../common/ProgressBar';
import { knowledgeService } from '../../services/knowledge';
import { UI_CONSTANTS, ERROR_MESSAGES } from '../../config/constants';
import { LoadingState, MetricUnit } from '../../types/common';

// Component props interface
interface KnowledgeMetricsProps {
  className?: string;
  refreshInterval?: number;
  onError?: (error: Error) => void;
  healthThreshold?: number;
}

// Styled components
const MetricsGrid = styled(View)`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
  gap: ${props => props.theme.tokens.space.medium};
  width: 100%;
`;

const MetricCard = styled(Card)`
  min-height: 150px;
`;

const StatusIndicator = styled(View)<{ status: KnowledgeSourceStatus }>`
  width: 12px;
  height: 12px;
  border-radius: 50%;
  background-color: ${props => {
    switch (props.status) {
      case KnowledgeSourceStatus.CONNECTED:
        return props.theme.tokens.colors.feedback.success;
      case KnowledgeSourceStatus.SYNCING:
        return props.theme.tokens.colors.feedback.info;
      case KnowledgeSourceStatus.ERROR_CONNECTION:
      case KnowledgeSourceStatus.ERROR_AUTHENTICATION:
      case KnowledgeSourceStatus.ERROR_PERMISSION:
      case KnowledgeSourceStatus.ERROR_SYNC:
        return props.theme.tokens.colors.feedback.error;
      default:
        return props.theme.tokens.colors.feedback.warning;
    }
  }};
`;

// Custom hook for managing knowledge metrics
const useKnowledgeMetrics = (
  refreshInterval: number = 30000,
  healthThreshold: number = 80
) => {
  const [sources, setSources] = useState<KnowledgeSource[]>([]);
  const [loadingState, setLoadingState] = useState<LoadingState>(LoadingState.IDLE);
  const [error, setError] = useState<Error | null>(null);

  const fetchMetrics = useCallback(async () => {
    try {
      setLoadingState(LoadingState.LOADING);
      const knowledgeSources = await knowledgeService.getKnowledgeSources();
      setSources(knowledgeSources);
      setLoadingState(LoadingState.SUCCESS);
    } catch (err) {
      setError(err as Error);
      setLoadingState(LoadingState.ERROR);
    }
  }, []);

  useEffect(() => {
    fetchMetrics();
    const interval = setInterval(fetchMetrics, refreshInterval);
    return () => clearInterval(interval);
  }, [fetchMetrics, refreshInterval]);

  return { sources, loadingState, error, refresh: fetchMetrics };
};

// Calculate comprehensive metrics from sources
const calculateSourceMetrics = (sources: KnowledgeSource[], healthThreshold: number) => {
  const totalSources = sources.length;
  const connectedSources = sources.filter(s => s.status === KnowledgeSourceStatus.CONNECTED).length;
  const syncingSources = sources.filter(s => s.status === KnowledgeSourceStatus.SYNCING).length;
  const errorSources = sources.filter(s => 
    s.status.startsWith('ERROR_')
  ).length;

  const sourcesByType = sources.reduce((acc, source) => {
    acc[source.source_type] = (acc[source.source_type] || 0) + 1;
    return acc;
  }, {} as Record<KnowledgeSourceType, number>);

  const totalDocuments = sources.reduce((sum, source) => 
    sum + source.metadata.document_count, 0
  );

  const averageQueryLatency = sources.reduce((sum, source) => 
    sum + source.metadata.performance_metrics.query_latency_ms, 0
  ) / totalSources;

  const systemHealth = ((connectedSources / totalSources) * 100);
  const healthStatus = systemHealth >= healthThreshold ? 'healthy' : 'degraded';

  return {
    totalSources,
    connectedSources,
    syncingSources,
    errorSources,
    sourcesByType,
    totalDocuments,
    averageQueryLatency,
    systemHealth,
    healthStatus
  };
};

const KnowledgeMetrics: React.FC<KnowledgeMetricsProps> = ({
  className,
  refreshInterval = 30000,
  onError,
  healthThreshold = 80
}) => {
  const { tokens } = useTheme();
  const { sources, loadingState, error, refresh } = useKnowledgeMetrics(refreshInterval, healthThreshold);

  useEffect(() => {
    if (error && onError) {
      onError(error);
    }
  }, [error, onError]);

  if (loadingState === LoadingState.ERROR) {
    return (
      <Card variant="filled" className={className}>
        <Text color={tokens.colors.font.error}>
          {ERROR_MESSAGES.GENERIC_ERROR}
        </Text>
      </Card>
    );
  }

  const metrics = calculateSourceMetrics(sources, healthThreshold);

  return (
    <View className={className}>
      <Heading level={2} margin={tokens.space.medium}>
        Knowledge Base Metrics
      </Heading>
      
      <MetricsGrid>
        {/* System Health Card */}
        <MetricCard>
          <Heading level={3}>System Health</Heading>
          <ProgressBar
            value={metrics.systemHealth}
            variant={metrics.healthStatus === 'healthy' ? 'success' : 'warning'}
            label="Overall Health"
            showValue
            animated
          />
          <Flex justifyContent="space-between" marginTop={tokens.space.medium}>
            <Text>Active Sources: {metrics.connectedSources}</Text>
            <Text>Total Sources: {metrics.totalSources}</Text>
          </Flex>
        </MetricCard>

        {/* Source Status Card */}
        <MetricCard>
          <Heading level={3}>Source Status</Heading>
          <Flex direction="column" gap={tokens.space.small}>
            {Object.entries(KnowledgeSourceStatus).map(([key, status]) => {
              const count = sources.filter(s => s.status === status).length;
              return (
                <Flex key={key} alignItems="center" gap={tokens.space.xs}>
                  <StatusIndicator status={status} />
                  <Text>{key}: {count}</Text>
                </Flex>
              );
            })}
          </Flex>
        </MetricCard>

        {/* Performance Metrics Card */}
        <MetricCard>
          <Heading level={3}>Performance</Heading>
          <Flex direction="column" gap={tokens.space.small}>
            <Text>
              Average Query Latency: {metrics.averageQueryLatency.toFixed(2)}ms
            </Text>
            <Text>
              Total Documents: {metrics.totalDocuments.toLocaleString()}
            </Text>
            <Text>
              Processing Rate: {sources.reduce((sum, source) => 
                sum + source.metadata.performance_metrics.document_processing_rate, 0
              ).toFixed(2)}/s
            </Text>
          </Flex>
        </MetricCard>

        {/* Source Distribution Card */}
        <MetricCard>
          <Heading level={3}>Source Distribution</Heading>
          <Flex direction="column" gap={tokens.space.small}>
            {Object.entries(metrics.sourcesByType).map(([type, count]) => (
              <Flex key={type} justifyContent="space-between">
                <Text>{type}:</Text>
                <Text>{count}</Text>
              </Flex>
            ))}
          </Flex>
        </MetricCard>
      </MetricsGrid>

      <Text
        fontSize={tokens.fontSizes.small}
        color={tokens.colors.font.secondary}
        marginTop={tokens.space.large}
      >
        Last updated: {new Date().toLocaleString()}
      </Text>
    </View>
  );
};

export default KnowledgeMetrics;