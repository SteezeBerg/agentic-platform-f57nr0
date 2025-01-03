import React, { memo, useCallback, useMemo } from 'react';
import { View, Text, Flex, useTheme } from '@aws-amplify/ui-react';
// @aws-amplify/ui-react version ^6.0.0
// react version ^18.2.0

import { Deployment } from '../../types/deployment';
import CustomCard from '../common/Card';
import StatusBadge from '../common/StatusBadge';

export interface DeploymentCardProps {
  deployment: Deployment;
  onViewDetails?: (deploymentId: string) => void;
  onRetry?: (deploymentId: string) => void;
  onError?: (error: DeploymentError) => void;
  className?: string;
  theme?: ThemeType;
}

const getStatusVariant = (status: DeploymentStatus): string => {
  const statusMap: Record<DeploymentStatus, string> = {
    completed: 'success',
    failed: 'error',
    in_progress: 'info',
    pending: 'warning',
    rolling_back: 'error',
    rolled_back: 'warning',
    validating: 'info'
  };
  return statusMap[status] || 'default';
};

const getHealthVariant = (health: DeploymentHealth): string => {
  const healthMap: Record<DeploymentHealth, string> = {
    healthy: 'success',
    degraded: 'warning',
    unhealthy: 'error',
    critical: 'error',
    unknown: 'default'
  };
  return healthMap[health] || 'default';
};

const formatLastActive = (lastActive: Date): string => {
  const now = new Date();
  const diffInMinutes = Math.floor((now.getTime() - lastActive.getTime()) / 60000);

  if (diffInMinutes < 60) {
    return `${diffInMinutes} mins ago`;
  } else if (diffInMinutes < 1440) {
    const hours = Math.floor(diffInMinutes / 60);
    return `${hours} hours ago`;
  }
  return lastActive.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
};

export const DeploymentCard = memo<DeploymentCardProps>(({
  deployment,
  onViewDetails,
  onRetry,
  onError,
  className
}) => {
  const { tokens } = useTheme();

  const handleViewDetails = useCallback(() => {
    onViewDetails?.(deployment.id);
  }, [deployment.id, onViewDetails]);

  const handleRetry = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    if (deployment.status === 'failed') {
      onRetry?.(deployment.id);
    }
  }, [deployment.id, deployment.status, onRetry]);

  const metrics = useMemo(() => {
    const { cpu_usage, memory_usage } = deployment.metrics.resource_utilization;
    const { error_rate, success_rate } = deployment.metrics.performance;
    
    return {
      cpu: Math.round(cpu_usage * 100),
      memory: Math.round(memory_usage * 100),
      errors: Math.round(error_rate * 100),
      success: Math.round(success_rate * 100)
    };
  }, [deployment.metrics]);

  return (
    <CustomCard
      elevation={2}
      variant="elevated"
      className={className}
      onClick={handleViewDetails}
      role="article"
      aria-labelledby={`deployment-title-${deployment.id}`}
      aria-describedby={`deployment-metrics-${deployment.id}`}
    >
      <Flex direction="column" gap={tokens.space.medium}>
        <Flex
          justifyContent="space-between"
          alignItems="center"
          gap={tokens.space.small}
        >
          <Text
            id={`deployment-title-${deployment.id}`}
            fontSize={tokens.fontSizes.large}
            fontWeight={tokens.fontWeights.semibold}
          >
            {deployment.agent_id}
          </Text>
          <Flex gap={tokens.space.xs}>
            <StatusBadge
              status={deployment.status}
              variant={getStatusVariant(deployment.status)}
              size="small"
              ariaLabel={`Deployment status: ${deployment.status}`}
            />
            <StatusBadge
              status={deployment.health}
              variant={getHealthVariant(deployment.health)}
              size="small"
              ariaLabel={`Health status: ${deployment.health}`}
            />
          </Flex>
        </Flex>

        <Flex
          id={`deployment-metrics-${deployment.id}`}
          direction="column"
          gap={tokens.space.small}
        >
          <Flex justifyContent="space-between" alignItems="center">
            <Text color={tokens.colors.neutral[80]}>CPU Usage</Text>
            <Text fontWeight={tokens.fontWeights.medium}>{metrics.cpu}%</Text>
          </Flex>
          <Flex justifyContent="space-between" alignItems="center">
            <Text color={tokens.colors.neutral[80]}>Memory Usage</Text>
            <Text fontWeight={tokens.fontWeights.medium}>{metrics.memory}%</Text>
          </Flex>
          <Flex justifyContent="space-between" alignItems="center">
            <Text color={tokens.colors.neutral[80]}>Success Rate</Text>
            <Text fontWeight={tokens.fontWeights.medium}>{metrics.success}%</Text>
          </Flex>
        </Flex>

        <Flex
          justifyContent="space-between"
          alignItems="center"
          borderTop={`1px solid ${tokens.colors.border.primary}`}
          paddingTop={tokens.space.small}
        >
          <Text
            color={tokens.colors.neutral[60]}
            fontSize={tokens.fontSizes.small}
          >
            Last Active: {formatLastActive(deployment.last_active)}
          </Text>
          {deployment.status === 'failed' && (
            <View
              as="button"
              onClick={handleRetry}
              padding={tokens.space.xs}
              backgroundColor={tokens.colors.primary[20]}
              color={tokens.colors.primary[80]}
              borderRadius={tokens.radii.small}
              cursor="pointer"
              aria-label="Retry deployment"
              _hover={{ backgroundColor: tokens.colors.primary[30] }}
              _focus={{
                outline: `2px solid ${tokens.colors.primary[60]}`,
                outlineOffset: '2px'
              }}
            >
              Retry
            </View>
          )}
        </Flex>
      </Flex>
    </CustomCard>
  );
});

DeploymentCard.displayName = 'DeploymentCard';

export default DeploymentCard;