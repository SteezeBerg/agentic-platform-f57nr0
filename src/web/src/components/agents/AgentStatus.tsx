import React, { memo, useCallback } from 'react';
// @aws-amplify/ui-react version ^6.0.0
import { View } from '@aws-amplify/ui-react';
import { AgentStatus as AgentStatusEnum } from '../../types/agent';
import StatusBadge from '../common/StatusBadge';

export interface AgentStatusProps {
  /** Current status of the agent */
  status: AgentStatusEnum;
  /** Optional CSS class name for custom styling */
  className?: string;
  /** Optional custom ARIA label for enhanced accessibility */
  ariaLabel?: string;
}

/**
 * Maps agent status to appropriate StatusBadge variant with semantic meaning
 * @param status - Current agent status
 * @returns StatusBadge variant based on semantic meaning
 */
const getStatusVariant = (status: AgentStatusEnum) => {
  switch (status) {
    case AgentStatusEnum.DEPLOYED:
    case AgentStatusEnum.READY:
      return 'success';
    case AgentStatusEnum.CONFIGURING:
    case AgentStatusEnum.DEPLOYING:
      return 'info';
    case AgentStatusEnum.ERROR:
      return 'error';
    case AgentStatusEnum.ARCHIVED:
      return 'default';
    case AgentStatusEnum.CREATED:
      return 'info';
    default:
      return 'default';
  }
};

/**
 * Generates accessible status label with proper context
 * @param status - Current agent status
 * @returns Human-readable status label with context
 */
const getStatusLabel = (status: AgentStatusEnum) => {
  switch (status) {
    case AgentStatusEnum.DEPLOYED:
      return 'Agent successfully deployed and operational';
    case AgentStatusEnum.READY:
      return 'Agent ready for deployment';
    case AgentStatusEnum.CONFIGURING:
      return 'Agent configuration in progress';
    case AgentStatusEnum.DEPLOYING:
      return 'Agent deployment in progress';
    case AgentStatusEnum.ERROR:
      return 'Agent encountered an error';
    case AgentStatusEnum.ARCHIVED:
      return 'Agent archived and inactive';
    case AgentStatusEnum.CREATED:
      return 'Agent created, awaiting configuration';
    default:
      return 'Unknown agent status';
  }
};

/**
 * Displays the current status of an agent using a styled status badge
 * Implements AWS Amplify UI design patterns with enhanced accessibility
 */
export const AgentStatus = memo<AgentStatusProps>(({
  status,
  className,
  ariaLabel
}) => {
  const getFormattedStatus = useCallback(() => {
    return status.charAt(0).toUpperCase() + status.slice(1).toLowerCase();
  }, [status]);

  return (
    <View
      as="div"
      className={className}
      data-testid="agent-status"
      display="inline-flex"
      alignItems="center"
    >
      <StatusBadge
        status={getFormattedStatus()}
        variant={getStatusVariant(status)}
        size="medium"
        ariaLabel={ariaLabel || getStatusLabel(status)}
      />
    </View>
  );
});

AgentStatus.displayName = 'AgentStatus';

export default AgentStatus;