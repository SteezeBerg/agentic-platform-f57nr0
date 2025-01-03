import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  View,
  Heading,
  Tabs,
  TabItem,
  Button,
  Alert,
  Card,
  Badge,
  Text,
  Flex,
  Loader,
  useTheme
} from '@aws-amplify/ui-react';
import { Chart } from 'chart.js/auto';

import { KnowledgeBase } from '../../components/knowledge/KnowledgeBase';
import { useKnowledge } from '../../hooks/useKnowledge';
import ErrorBoundary from '../../components/common/ErrorBoundary';
import { useNotification } from '../../hooks/useNotification';
import { KnowledgeSourceStatus, KnowledgeSourceType } from '../../types/knowledge';

interface KnowledgeDetailsProps {
  className?: string;
}

interface KnowledgeMetrics {
  queries_per_day: number;
  average_response_time: number;
  success_rate: number;
  last_sync_duration: number;
}

const KnowledgeDetails: React.FC<KnowledgeDetailsProps> = ({ className }) => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { tokens } = useTheme();
  const { showNotification } = useNotification();

  // State management
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('details');
  const [metrics, setMetrics] = useState<KnowledgeMetrics | null>(null);
  const [metricsChart, setMetricsChart] = useState<Chart | null>(null);

  // Hook initialization
  const {
    sources,
    loading: sourcesLoading,
    error: sourcesError,
    updateSource,
    deleteSource,
    syncSource,
    getSourceMetrics
  } = useKnowledge();

  // Get current source details
  const source = useMemo(() => 
    sources.find(s => s.id === id),
    [sources, id]
  );

  // Initialize metrics chart
  useEffect(() => {
    if (metrics && !metricsChart) {
      const ctx = document.getElementById('metricsChart') as HTMLCanvasElement;
      if (ctx) {
        const chart = new Chart(ctx, {
          type: 'line',
          data: {
            labels: ['24h', '48h', '72h'],
            datasets: [{
              label: 'Queries per Day',
              data: [metrics.queries_per_day],
              borderColor: tokens.colors.brand.primary[60],
              tension: 0.4
            }]
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
              legend: {
                position: 'bottom'
              }
            }
          }
        });
        setMetricsChart(chart);
      }
    }
    return () => {
      metricsChart?.destroy();
    };
  }, [metrics, metricsChart, tokens.colors.brand.primary]);

  // Fetch metrics data
  const fetchMetrics = useCallback(async () => {
    if (!id) return;
    try {
      const data = await getSourceMetrics(id);
      setMetrics(data);
    } catch (error) {
      showNotification({
        message: 'Failed to load metrics',
        type: 'error'
      });
    }
  }, [id, getSourceMetrics, showNotification]);

  // Initial data fetch
  useEffect(() => {
    fetchMetrics();
    const interval = setInterval(fetchMetrics, 30000);
    return () => clearInterval(interval);
  }, [fetchMetrics]);

  // Handle sync action
  const handleSync = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      await syncSource(id);
      showNotification({
        message: 'Knowledge source sync initiated',
        type: 'success'
      });
    } catch (error) {
      showNotification({
        message: 'Failed to sync knowledge source',
        type: 'error'
      });
    } finally {
      setLoading(false);
    }
  }, [id, syncSource, showNotification]);

  // Handle delete action
  const handleDelete = useCallback(async () => {
    if (!id || !window.confirm('Are you sure you want to delete this knowledge source?')) return;
    setLoading(true);
    try {
      await deleteSource(id);
      showNotification({
        message: 'Knowledge source deleted successfully',
        type: 'success'
      });
      navigate('/knowledge');
    } catch (error) {
      showNotification({
        message: 'Failed to delete knowledge source',
        type: 'error'
      });
    } finally {
      setLoading(false);
    }
  }, [id, deleteSource, navigate, showNotification]);

  if (sourcesLoading) {
    return <Loader size="large" />;
  }

  if (sourcesError || !source) {
    return (
      <Alert variation="error">
        {sourcesError || 'Knowledge source not found'}
      </Alert>
    );
  }

  return (
    <ErrorBoundary>
      <View className={className} padding={tokens.space.medium}>
        {/* Header Section */}
        <Flex justifyContent="space-between" alignItems="center" marginBottom={tokens.space.large}>
          <View>
            <Heading level={2}>{source.name}</Heading>
            <Flex alignItems="center" gap={tokens.space.small}>
              <Badge variation={source.status === KnowledgeSourceStatus.CONNECTED ? 'success' : 'warning'}>
                {source.status}
              </Badge>
              <Text color={tokens.colors.font.secondary}>
                Last sync: {new Date(source.last_sync).toLocaleString()}
              </Text>
            </Flex>
          </View>
          <Flex gap={tokens.space.small}>
            <Button
              onClick={handleSync}
              isLoading={loading}
              loadingText="Syncing..."
              variation="primary"
            >
              Sync Now
            </Button>
            <Button
              onClick={handleDelete}
              isLoading={loading}
              variation="destructive"
            >
              Delete
            </Button>
          </Flex>
        </Flex>

        {/* Content Tabs */}
        <Tabs
          currentIndex={activeTab === 'details' ? 0 : activeTab === 'metrics' ? 1 : 2}
          onChange={index => setActiveTab(index === 0 ? 'details' : index === 1 ? 'metrics' : 'history')}
        >
          <TabItem title="Details">
            <Card>
              <Flex direction="column" gap={tokens.space.medium}>
                <View>
                  <Text fontWeight={tokens.fontWeights.bold}>Source Type</Text>
                  <Text>{source.source_type}</Text>
                </View>
                <View>
                  <Text fontWeight={tokens.fontWeights.bold}>Configuration</Text>
                  <pre style={{ 
                    backgroundColor: tokens.colors.background.secondary,
                    padding: tokens.space.small,
                    borderRadius: tokens.radii.small,
                    overflow: 'auto'
                  }}>
                    {JSON.stringify(source.connection_config, null, 2)}
                  </pre>
                </View>
                <View>
                  <Text fontWeight={tokens.fontWeights.bold}>Indexing Strategy</Text>
                  <Text>{source.indexing_strategy}</Text>
                </View>
              </Flex>
            </Card>
          </TabItem>

          <TabItem title="Metrics">
            <Card>
              <Flex direction="column" gap={tokens.space.large}>
                <View height="300px">
                  <canvas id="metricsChart" />
                </View>
                {metrics && (
                  <Flex gap={tokens.space.large} wrap="wrap">
                    <View flex="1">
                      <Text fontWeight={tokens.fontWeights.bold}>Queries per Day</Text>
                      <Text>{metrics.queries_per_day}</Text>
                    </View>
                    <View flex="1">
                      <Text fontWeight={tokens.fontWeights.bold}>Average Response Time</Text>
                      <Text>{metrics.average_response_time}ms</Text>
                    </View>
                    <View flex="1">
                      <Text fontWeight={tokens.fontWeights.bold}>Success Rate</Text>
                      <Text>{metrics.success_rate}%</Text>
                    </View>
                    <View flex="1">
                      <Text fontWeight={tokens.fontWeights.bold}>Last Sync Duration</Text>
                      <Text>{metrics.last_sync_duration}s</Text>
                    </View>
                  </Flex>
                )}
              </Flex>
            </Card>
          </TabItem>

          <TabItem title="Sync History">
            <Card>
              {source.metadata.last_error ? (
                <Alert variation="error">
                  Last Error: {source.metadata.last_error.message}
                </Alert>
              ) : null}
              <View>
                <Text fontWeight={tokens.fontWeights.bold}>Document Count</Text>
                <Text>{source.metadata.document_count}</Text>
              </View>
              <View>
                <Text fontWeight={tokens.fontWeights.bold}>Total Size</Text>
                <Text>{(source.metadata.total_size_bytes / 1024 / 1024).toFixed(2)} MB</Text>
              </View>
            </Card>
          </TabItem>
        </Tabs>
      </View>
    </ErrorBoundary>
  );
};

export default KnowledgeDetails;