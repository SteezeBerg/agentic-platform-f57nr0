import React, { memo, useCallback, useState } from 'react';
import { Button, ProgressBar, Icon, View, Heading, Text, Alert } from '@aws-amplify/ui-react'; // v6.0.0
import { useTranslation } from 'react-i18next'; // v13.0.0
import winston from 'winston'; // v3.11.0

import { KnowledgeSource, KnowledgeSourceType, KnowledgeSourceStatus } from '../../types/knowledge';
import { useKnowledge } from '../../hooks/useKnowledge';
import ErrorBoundary from '../common/ErrorBoundary';

// Configure logger
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.json(),
  transports: [
    new winston.transports.Console({
      format: winston.format.simple()
    })
  ]
});

// Constants for accessibility and styling
const ARIA_LABELS = {
  sourceList: 'Connected knowledge sources list',
  addSourceButton: 'Add new knowledge source',
  syncButton: 'Synchronize source',
  progressBar: 'Source indexing progress',
  errorAlert: 'Knowledge source error'
};

const STYLES = {
  container: {
    padding: 'var(--amplify-space-medium)',
    backgroundColor: 'var(--amplify-colors-background-secondary)'
  },
  sourceItem: {
    marginBottom: 'var(--amplify-space-small)',
    padding: 'var(--amplify-space-small)',
    borderRadius: 'var(--amplify-radii-small)',
    border: '1px solid var(--amplify-colors-border-primary)'
  },
  progressBar: {
    marginTop: 'var(--amplify-space-small)'
  },
  errorText: {
    color: 'var(--amplify-colors-font-error)'
  }
};

// Props interface with strict typing
interface KnowledgeConnectorProps {
  onSourceAdded?: (source: KnowledgeSource) => void;
  onSourceUpdated?: (source: KnowledgeSource) => void;
  onError?: (error: Error) => void;
  className?: string;
}

// Helper function to format last sync time
const formatLastSync = (date: Date): string => {
  return new Intl.RelativeTimeFormat('en', { numeric: 'auto' }).format(
    Math.round((date.getTime() - Date.now()) / (1000 * 60)),
    'minute'
  );
};

// Status icon mapping for visual feedback
const StatusIcon = ({ status }: { status: KnowledgeSourceStatus }) => {
  switch (status) {
    case KnowledgeSourceStatus.CONNECTED:
      return <Icon ariaLabel="Connected" name="checkmark" color="success" />;
    case KnowledgeSourceStatus.SYNCING:
      return <Icon ariaLabel="Syncing" name="refresh" color="warning" />;
    case KnowledgeSourceStatus.ERROR_CONNECTION:
    case KnowledgeSourceStatus.ERROR_AUTHENTICATION:
    case KnowledgeSourceStatus.ERROR_PERMISSION:
    case KnowledgeSourceStatus.ERROR_SYNC:
      return <Icon ariaLabel="Error" name="warning" color="error" />;
    default:
      return <Icon ariaLabel="Disconnected" name="close" color="neutral" />;
  }
};

const KnowledgeConnector: React.FC<KnowledgeConnectorProps> = memo(({
  onSourceAdded,
  onSourceUpdated,
  onError,
  className
}) => {
  const { t } = useTranslation();
  const { sources, loading, error, progress, addSource, updateSource, syncSource } = useKnowledge();
  const [selectedSourceType, setSelectedSourceType] = useState<KnowledgeSourceType | null>(null);

  // Handle source addition
  const handleAddSource = useCallback(async () => {
    if (!selectedSourceType) return;

    try {
      const result = await addSource({
        name: `New ${selectedSourceType.toLowerCase()} source`,
        source_type: selectedSourceType,
        connection_config: {},
        indexing_strategy: 'INCREMENTAL'
      });

      if (result.error) {
        throw result.error;
      }

      if (result.data && onSourceAdded) {
        onSourceAdded(result.data);
      }

      logger.info('Knowledge source added successfully', {
        sourceType: selectedSourceType
      });
    } catch (err) {
      logger.error('Failed to add knowledge source', {
        error: err,
        sourceType: selectedSourceType
      });
      onError?.(err as Error);
    }
  }, [selectedSourceType, addSource, onSourceAdded, onError]);

  // Handle source sync
  const handleSync = useCallback(async (sourceId: string) => {
    try {
      const result = await syncSource(sourceId);
      if (result.error) {
        throw result.error;
      }

      logger.info('Knowledge source sync initiated', {
        sourceId
      });
    } catch (err) {
      logger.error('Failed to sync knowledge source', {
        error: err,
        sourceId
      });
      onError?.(err as Error);
    }
  }, [syncSource, onError]);

  // Render error state
  if (error) {
    return (
      <Alert variation="error" role="alert">
        <Text style={STYLES.errorText}>
          {t('knowledge.error.loading', 'Failed to load knowledge sources')}
        </Text>
      </Alert>
    );
  }

  return (
    <ErrorBoundary onError={onError}>
      <View 
        as="section"
        style={STYLES.container}
        className={className}
        aria-busy={loading}
      >
        <Heading level={2}>
          {t('knowledge.title', 'Knowledge Sources')}
        </Heading>

        {/* Source List */}
        <View 
          as="ul"
          aria-label={ARIA_LABELS.sourceList}
          role="list"
        >
          {sources.map((source) => (
            <View
              key={source.id}
              as="li"
              style={STYLES.sourceItem}
              role="listitem"
            >
              <View display="flex" alignItems="center" justifyContent="space-between">
                <View>
                  <Text fontWeight="bold">{source.name}</Text>
                  <Text fontSize="small" color="font.tertiary">
                    {t('knowledge.lastSync', 'Last sync: {{time}}', {
                      time: formatLastSync(source.last_sync)
                    })}
                  </Text>
                </View>
                <StatusIcon status={source.status} />
              </View>

              {/* Progress Bar */}
              {source.status === KnowledgeSourceStatus.SYNCING && (
                <ProgressBar
                  label={t('knowledge.syncProgress', 'Sync Progress')}
                  value={progress[source.id] || 0}
                  maxValue={100}
                  style={STYLES.progressBar}
                  aria-label={ARIA_LABELS.progressBar}
                />
              )}

              {/* Error Display */}
              {source.status.startsWith('ERROR_') && source.error_details && (
                <Alert variation="error" marginTop="small">
                  <Text>{source.error_details.message}</Text>
                </Alert>
              )}

              {/* Action Buttons */}
              <View marginTop="small">
                <Button
                  onClick={() => handleSync(source.id)}
                  isDisabled={source.status === KnowledgeSourceStatus.SYNCING}
                  aria-label={ARIA_LABELS.syncButton}
                  size="small"
                >
                  {t('knowledge.sync', 'Sync')}
                </Button>
              </View>
            </View>
          ))}
        </View>

        {/* Add Source Controls */}
        <View marginTop="medium">
          <select
            value={selectedSourceType || ''}
            onChange={(e) => setSelectedSourceType(e.target.value as KnowledgeSourceType)}
            aria-label={t('knowledge.selectSource', 'Select source type')}
          >
            <option value="">{t('knowledge.selectPrompt', 'Select a source type...')}</option>
            {Object.values(KnowledgeSourceType).map((type) => (
              <option key={type} value={type}>
                {t(`knowledge.sourceType.${type.toLowerCase()}`, type)}
              </option>
            ))}
          </select>

          <Button
            onClick={handleAddSource}
            isDisabled={!selectedSourceType}
            marginLeft="small"
            aria-label={ARIA_LABELS.addSourceButton}
          >
            {t('knowledge.addSource', 'Add Source')}
          </Button>
        </View>
      </View>
    </ErrorBoundary>
  );
});

KnowledgeConnector.displayName = 'KnowledgeConnector';

export default KnowledgeConnector;