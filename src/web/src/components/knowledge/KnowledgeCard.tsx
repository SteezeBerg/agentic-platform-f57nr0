import React, { memo, useMemo, useCallback } from 'react';
import { View, Text, Icon, useTheme } from '@aws-amplify/ui-react';
// @aws-amplify/ui-react version ^6.0.0
// react version ^18.2.0

import { KnowledgeSource, KnowledgeSourceStatus } from '../../types/knowledge';
import CustomCard from '../common/Card';
import StatusBadge from '../common/StatusBadge';

export interface KnowledgeCardProps {
  /** Knowledge source data to display */
  source: KnowledgeSource;
  /** Optional callback when edit action is triggered */
  onEdit?: (source: KnowledgeSource) => void;
  /** Optional callback when delete action is triggered */
  onDelete?: (source: KnowledgeSource) => void;
  /** Optional async callback when sync action is triggered */
  onSync?: (source: KnowledgeSource) => Promise<void>;
  /** Loading state for sync operations */
  loading?: boolean;
}

/**
 * Maps knowledge source status to appropriate StatusBadge variant
 */
const useStatusVariant = (status: KnowledgeSourceStatus) => {
  return useMemo(() => {
    switch (status) {
      case KnowledgeSourceStatus.CONNECTED:
        return 'success';
      case KnowledgeSourceStatus.SYNCING:
        return 'info';
      case KnowledgeSourceStatus.DISCONNECTED:
        return 'warning';
      case KnowledgeSourceStatus.ERROR_CONNECTION:
      case KnowledgeSourceStatus.ERROR_AUTHENTICATION:
      case KnowledgeSourceStatus.ERROR_PERMISSION:
      case KnowledgeSourceStatus.ERROR_SYNC:
        return 'error';
      default:
        return 'default';
    }
  }, [status]);
};

/**
 * Formats last sync date with localization and relative time
 */
const useFormattedLastSync = (date: Date) => {
  return useMemo(() => {
    const now = new Date();
    const diffMinutes = Math.floor((now.getTime() - date.getTime()) / (1000 * 60));

    if (diffMinutes < 60) {
      return `${diffMinutes} minutes ago`;
    }

    const diffHours = Math.floor(diffMinutes / 60);
    if (diffHours < 24) {
      return `${diffHours} hours ago`;
    }

    return date.toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  }, [date]);
};

/**
 * Enhanced card component displaying knowledge source information
 * with accessibility and theme support
 */
export const KnowledgeCard = memo<KnowledgeCardProps>(({
  source,
  onEdit,
  onDelete,
  onSync,
  loading = false
}) => {
  const { tokens } = useTheme();
  const statusVariant = useStatusVariant(source.status);
  const lastSyncText = useFormattedLastSync(source.last_sync);

  const handleSync = useCallback(async () => {
    if (onSync && !loading) {
      await onSync(source);
    }
  }, [onSync, source, loading]);

  const handleEdit = useCallback(() => {
    if (onEdit) {
      onEdit(source);
    }
  }, [onEdit, source]);

  const handleDelete = useCallback(() => {
    if (onDelete) {
      onDelete(source);
    }
  }, [onDelete, source]);

  return (
    <CustomCard
      elevation={2}
      variant="elevated"
      className="knowledge-source-card"
      aria-label={`Knowledge source: ${source.name}`}
      role="article"
      aria-busy={loading}
    >
      <View padding={tokens.space.medium}>
        {/* Header Section */}
        <View
          display="flex"
          justifyContent="space-between"
          alignItems="center"
          marginBottom={tokens.space.small}
        >
          <Text
            as="h3"
            fontSize={tokens.fontSizes.large}
            fontWeight={tokens.fontWeights.semibold}
            color={tokens.colors.font.primary}
          >
            {source.name}
          </Text>
          <StatusBadge
            status={source.status}
            variant={statusVariant}
            size="medium"
            ariaLabel={`Source status: ${source.status}`}
          />
        </View>

        {/* Content Section */}
        <View marginBottom={tokens.space.medium}>
          <Text
            color={tokens.colors.font.secondary}
            fontSize={tokens.fontSizes.medium}
            marginBottom={tokens.space.xs}
          >
            Type: {source.source_type}
          </Text>
          <Text
            color={tokens.colors.font.tertiary}
            fontSize={tokens.fontSizes.small}
          >
            Last sync: {lastSyncText}
          </Text>
          
          {/* Error Message Display */}
          {source.metadata.last_error && (
            <View
              backgroundColor={tokens.colors.error[10]}
              padding={tokens.space.small}
              borderRadius={tokens.radii.small}
              marginTop={tokens.space.small}
              role="alert"
            >
              <Text
                color={tokens.colors.error[80]}
                fontSize={tokens.fontSizes.small}
              >
                {source.metadata.last_error.message}
              </Text>
            </View>
          )}
        </View>

        {/* Actions Section */}
        <View
          display="flex"
          justifyContent="flex-end"
          gap={tokens.space.small}
        >
          {onSync && (
            <View
              as="button"
              onClick={handleSync}
              disabled={loading}
              padding={tokens.space.xs}
              borderRadius={tokens.radii.small}
              backgroundColor={tokens.colors.primary[10]}
              color={tokens.colors.primary[80]}
              cursor="pointer"
              aria-label="Sync knowledge source"
              _hover={{ backgroundColor: tokens.colors.primary[20] }}
              _disabled={{ 
                opacity: 0.5, 
                cursor: 'not-allowed',
                backgroundColor: tokens.colors.neutral[10]
              }}
            >
              <Icon
                ariaLabel="Sync"
                pathData="M12 4V1L8 5l4 4V6c3.31 0 6 2.69 6 6 0 1.01-.25 1.97-.7 2.8l1.46 1.46C19.54 15.03 20 13.57 20 12c0-4.42-3.58-8-8-8zm0 14c-3.31 0-6-2.69-6-6 0-1.01.25-1.97.7-2.8L5.24 7.74C4.46 8.97 4 10.43 4 12c0 4.42 3.58 8 8 8v3l4-4-4-4v3z"
              />
            </View>
          )}
          
          {onEdit && (
            <View
              as="button"
              onClick={handleEdit}
              padding={tokens.space.xs}
              borderRadius={tokens.radii.small}
              backgroundColor={tokens.colors.neutral[10]}
              color={tokens.colors.neutral[80]}
              cursor="pointer"
              aria-label="Edit knowledge source"
              _hover={{ backgroundColor: tokens.colors.neutral[20] }}
            >
              <Icon
                ariaLabel="Edit"
                pathData="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"
              />
            </View>
          )}
          
          {onDelete && (
            <View
              as="button"
              onClick={handleDelete}
              padding={tokens.space.xs}
              borderRadius={tokens.radii.small}
              backgroundColor={tokens.colors.error[10]}
              color={tokens.colors.error[80]}
              cursor="pointer"
              aria-label="Delete knowledge source"
              _hover={{ backgroundColor: tokens.colors.error[20] }}
            >
              <Icon
                ariaLabel="Delete"
                pathData="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"
              />
            </View>
          )}
        </View>
      </View>
    </CustomCard>
  );
});

KnowledgeCard.displayName = 'KnowledgeCard';

export default KnowledgeCard;