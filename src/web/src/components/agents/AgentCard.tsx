import React, { useCallback, useMemo } from 'react';
import { View, Text, Icon, useTheme } from '@aws-amplify/ui-react'; // ^6.0.0
import { Agent, AgentStatus } from '../../types/agent';
import CustomCard from '../common/Card';
import StatusBadge from '../common/StatusBadge';

export interface AgentCardProps {
  /** Agent data to display in the card */
  agent: Agent;
  /** Optional click handler for card interaction */
  onClick?: (agent: Agent) => void;
  /** Optional CSS class name for custom styling */
  className?: string;
  /** Optional test ID for automated testing */
  testId?: string;
}

/**
 * Maps agent status to appropriate StatusBadge variant
 */
const getStatusVariant = (status: AgentStatus): 'success' | 'error' | 'info' | 'warning' | 'default' => {
  switch (status) {
    case AgentStatus.DEPLOYED:
      return 'success';
    case AgentStatus.ERROR:
      return 'error';
    case AgentStatus.DEPLOYING:
      return 'info';
    case AgentStatus.CONFIGURING:
    case AgentStatus.READY:
      return 'warning';
    default:
      return 'default';
  }
};

/**
 * Formats the last active timestamp in a human-readable format
 */
const formatLastActive = (lastActive: Date): string => {
  const now = new Date();
  const diffInMinutes = Math.floor((now.getTime() - lastActive.getTime()) / (1000 * 60));

  if (diffInMinutes < 1) return 'Just now';
  if (diffInMinutes < 60) return `${diffInMinutes} mins ago`;
  
  const diffInHours = Math.floor(diffInMinutes / 60);
  if (diffInHours < 24) return `${diffInHours} ${diffInHours === 1 ? 'hour' : 'hours'} ago`;
  
  const diffInDays = Math.floor(diffInHours / 24);
  return `${diffInDays} ${diffInDays === 1 ? 'day' : 'days'} ago`;
};

/**
 * A reusable card component for displaying agent information with AWS Amplify UI design patterns
 * and Material Design 3.0 principles. Ensures WCAG 2.1 Level AA compliance.
 */
export const AgentCard: React.FC<AgentCardProps> = ({
  agent,
  onClick,
  className = '',
  testId = 'agent-card',
}) => {
  const { tokens } = useTheme();

  // Memoize status variant to prevent unnecessary recalculations
  const statusVariant = useMemo(() => getStatusVariant(agent.status), [agent.status]);

  // Memoize click handler to prevent unnecessary recreations
  const handleClick = useCallback(() => {
    if (onClick) {
      onClick(agent);
    }
  }, [onClick, agent]);

  // Memoize last active formatting
  const lastActiveFormatted = useMemo(() => 
    formatLastActive(new Date(agent.lastActive)), 
    [agent.lastActive]
  );

  return (
    <CustomCard
      elevation={2}
      variant="elevated"
      className={`agent-card ${className}`}
      onClick={onClick ? handleClick : undefined}
      data-testid={testId}
      role="article"
      aria-label={`Agent card for ${agent.name}`}
      tabIndex={onClick ? 0 : -1}
    >
      <View
        as="div"
        padding={tokens.space.medium}
        display="flex"
        flexDirection="column"
        gap={tokens.space.small}
      >
        {/* Header Section */}
        <View
          as="header"
          display="flex"
          justifyContent="space-between"
          alignItems="center"
        >
          <Text
            as="h3"
            fontSize={tokens.fontSizes.large}
            fontWeight={tokens.fontWeights.semibold}
            color={tokens.colors.font.primary}
            id={`agent-name-${agent.id}`}
          >
            {agent.name}
          </Text>
          <StatusBadge
            status={agent.status}
            variant={statusVariant}
            size="small"
            ariaLabel={`Agent status: ${agent.status}`}
          />
        </View>

        {/* Description Section */}
        <Text
          as="p"
          fontSize={tokens.fontSizes.medium}
          color={tokens.colors.font.secondary}
          id={`agent-description-${agent.id}`}
        >
          {agent.description}
        </Text>

        {/* Metrics Section */}
        <View
          as="div"
          display="flex"
          gap={tokens.space.medium}
          padding={`${tokens.space.small} 0`}
        >
          <View as="div" flex="1">
            <Text
              as="span"
              fontSize={tokens.fontSizes.small}
              color={tokens.colors.font.tertiary}
            >
              Type
            </Text>
            <Text
              as="div"
              fontSize={tokens.fontSizes.medium}
              fontWeight={tokens.fontWeights.semibold}
            >
              {agent.type}
            </Text>
          </View>
          <View as="div" flex="1">
            <Text
              as="span"
              fontSize={tokens.fontSizes.small}
              color={tokens.colors.font.tertiary}
            >
              Last Active
            </Text>
            <Text
              as="div"
              fontSize={tokens.fontSizes.medium}
              fontWeight={tokens.fontWeights.semibold}
            >
              {lastActiveFormatted}
            </Text>
          </View>
        </View>

        {/* Health Metrics */}
        {agent.metrics && (
          <View
            as="div"
            display="flex"
            gap={tokens.space.small}
            padding={`${tokens.space.small} 0`}
            borderTop={`1px solid ${tokens.colors.border.primary}`}
          >
            <View as="div" flex="1">
              <Text
                as="span"
                fontSize={tokens.fontSizes.xsmall}
                color={tokens.colors.font.tertiary}
              >
                CPU Usage
              </Text>
              <Text
                as="div"
                fontSize={tokens.fontSizes.small}
                color={tokens.colors.font.primary}
              >
                {`${agent.metrics.cpu_usage}%`}
              </Text>
            </View>
            <View as="div" flex="1">
              <Text
                as="span"
                fontSize={tokens.fontSizes.xsmall}
                color={tokens.colors.font.tertiary}
              >
                Memory
              </Text>
              <Text
                as="div"
                fontSize={tokens.fontSizes.small}
                color={tokens.colors.font.primary}
              >
                {`${agent.metrics.memory_usage}%`}
              </Text>
            </View>
            <View as="div" flex="1">
              <Text
                as="span"
                fontSize={tokens.fontSizes.xsmall}
                color={tokens.colors.font.tertiary}
              >
                Error Rate
              </Text>
              <Text
                as="div"
                fontSize={tokens.fontSizes.small}
                color={tokens.colors.font.primary}
              >
                {`${agent.metrics.error_rate}%`}
              </Text>
            </View>
          </View>
        )}
      </View>
    </CustomCard>
  );
};

export default React.memo(AgentCard);