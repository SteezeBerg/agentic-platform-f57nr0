import React, { useCallback, useMemo } from 'react';
import { Text, Flex, useTheme } from '@aws-amplify/ui-react'; // v6.0.0
import { AgentTemplate, AgentType } from '../../types/agent';
import CustomCard from '../common/Card';
import Button from '../common/Button';

// Icons for different agent types
import { 
  FaDesktop, 
  FaSlack, 
  FaReact, 
  FaRobot 
} from 'react-icons/fa'; // v9.0.0

export interface AgentTemplateCardProps {
  /** Template data to display */
  template: AgentTemplate;
  /** Callback when template is selected */
  onSelect: (template: AgentTemplate) => void;
  /** Whether template is currently selected */
  isSelected?: boolean;
  /** Loading state for async operations */
  isLoading?: boolean;
  /** Optional test ID for automated testing */
  testId?: string;
}

/**
 * Get themed icon for agent template type
 */
const getTemplateTypeIcon = (type: AgentType, colorMode: string): React.ReactNode => {
  const iconSize = '1.5rem';
  const iconColor = colorMode === 'dark' ? '#FFFFFF' : '#2E3A59';
  const iconProps = { size: iconSize, color: iconColor, 'aria-hidden': true };

  switch (type) {
    case AgentType.STREAMLIT:
      return <FaDesktop {...iconProps} />;
    case AgentType.SLACK:
      return <FaSlack {...iconProps} />;
    case AgentType.AWS_REACT:
      return <FaReact {...iconProps} />;
    case AgentType.STANDALONE:
      return <FaRobot {...iconProps} />;
  }
};

/**
 * A reusable card component for displaying agent template information with
 * AWS Amplify UI design patterns and comprehensive accessibility support.
 */
export const AgentTemplateCard = React.memo<AgentTemplateCardProps>(({
  template,
  onSelect,
  isSelected = false,
  isLoading = false,
  testId
}) => {
  const { tokens, colorMode } = useTheme();

  // Memoize event handler
  const handleSelect = useCallback(() => {
    if (!isLoading) {
      onSelect(template);
    }
  }, [onSelect, template, isLoading]);

  // Memoize template type icon
  const templateIcon = useMemo(() => 
    getTemplateTypeIcon(template.type, colorMode), 
    [template.type, colorMode]
  );

  // Card elevation based on selection state
  const elevation = isSelected ? 3 : 1;

  return (
    <CustomCard
      elevation={elevation}
      variant="elevated"
      className={`agent-template-card ${isSelected ? 'selected' : ''}`}
      data-testid={testId}
      role="article"
      aria-selected={isSelected}
      aria-label={`${template.name} template`}
    >
      <Flex direction="column" gap={tokens.space.medium}>
        {/* Header with icon and type */}
        <Flex alignItems="center" gap={tokens.space.small}>
          {templateIcon}
          <Text
            variation="secondary"
            fontSize={tokens.fontSizes.small}
            color={tokens.colors.text.secondary}
          >
            {template.type}
          </Text>
        </Flex>

        {/* Template name and description */}
        <Flex direction="column" gap={tokens.space.xs}>
          <Text
            fontSize={tokens.fontSizes.large}
            fontWeight={tokens.fontWeights.semibold}
            color={tokens.colors.text.primary}
          >
            {template.name}
          </Text>
          <Text
            variation="tertiary"
            fontSize={tokens.fontSizes.medium}
            color={tokens.colors.text.secondary}
          >
            {template.description}
          </Text>
        </Flex>

        {/* Capabilities list */}
        <Flex wrap="wrap" gap={tokens.space.xs}>
          {template.capabilities.map((capability) => (
            <Text
              key={capability}
              backgroundColor={tokens.colors.background.secondary}
              color={tokens.colors.text.secondary}
              padding={`${tokens.space.xxs} ${tokens.space.xs}`}
              borderRadius={tokens.radii.small}
              fontSize={tokens.fontSizes.small}
            >
              {capability}
            </Text>
          ))}
        </Flex>

        {/* Action button */}
        <Button
          variant="primary"
          size="medium"
          onClick={handleSelect}
          isLoading={isLoading}
          isFullWidth
          ariaLabel={`Select ${template.name} template`}
          disabled={isLoading}
        >
          {isSelected ? 'Selected' : 'Select Template'}
        </Button>
      </Flex>
    </CustomCard>
  );
});

AgentTemplateCard.displayName = 'AgentTemplateCard';

export default AgentTemplateCard;