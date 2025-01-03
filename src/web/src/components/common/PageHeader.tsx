import React, { memo, useCallback } from 'react';
import { View, Heading, useMediaQuery } from '@aws-amplify/ui-react'; // v6.0.0
import Breadcrumbs from './Breadcrumbs';
import Button from './Button';
import { useTheme } from '../../hooks/useTheme';

// Interface for component props with accessibility and testing support
export interface PageHeaderProps {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode[];
  showBreadcrumbs?: boolean;
  ariaLabel?: string;
  testId?: string;
  className?: string;
}

/**
 * Enhanced page header component implementing AWS Amplify UI design patterns
 * with Material Design 3.0 principles and WCAG 2.1 Level AA accessibility.
 *
 * @component
 * @example
 * ```tsx
 * <PageHeader
 *   title="Agent Builder"
 *   subtitle="Create and manage AI agents"
 *   actions={[<Button>Create Agent</Button>]}
 * />
 * ```
 */
const PageHeader = memo<PageHeaderProps>(({
  title,
  subtitle,
  actions = [],
  showBreadcrumbs = true,
  ariaLabel,
  testId = 'page-header',
  className
}) => {
  const { theme } = useTheme();
  const [isDesktop] = useMediaQuery('(min-width: 1024px)');

  // Memoized styles based on theme and breakpoints
  const containerStyles = useCallback(() => ({
    display: 'flex',
    flexDirection: 'column' as const,
    gap: theme.tokens.space.md,
    marginBottom: theme.tokens.space.xl,
    width: '100%',
    backgroundColor: theme.tokens.colors.background.primary,
    padding: isDesktop ? theme.tokens.space.lg : theme.tokens.space.md,
    borderBottom: `1px solid ${theme.tokens.colors.border.primary}`,
    '@media print': {
      display: 'none'
    }
  }), [theme, isDesktop]);

  const contentStyles = useCallback(() => ({
    display: 'flex',
    flexDirection: isDesktop ? 'row' as const : 'column' as const,
    justifyContent: 'space-between',
    alignItems: isDesktop ? 'center' : 'flex-start',
    gap: theme.tokens.space.md
  }), [theme, isDesktop]);

  const titleContainerStyles = useCallback(() => ({
    display: 'flex',
    flexDirection: 'column' as const,
    gap: theme.tokens.space.xs
  }), [theme]);

  const actionsContainerStyles = useCallback(() => ({
    display: 'flex',
    gap: theme.tokens.space.sm,
    flexWrap: 'wrap' as const,
    alignItems: 'center',
    marginLeft: isDesktop ? 'auto' : '0'
  }), [theme, isDesktop]);

  return (
    <View
      as="header"
      style={containerStyles()}
      className={className}
      data-testid={testId}
      role="banner"
      aria-label={ariaLabel || 'Page header'}
    >
      {/* Breadcrumb Navigation */}
      {showBreadcrumbs && (
        <Breadcrumbs
          ariaLabel="Page navigation"
          className="page-header-breadcrumbs"
        />
      )}

      {/* Main Content Container */}
      <View style={contentStyles()}>
        {/* Title and Subtitle Section */}
        <View style={titleContainerStyles()}>
          <Heading
            level={1}
            style={{
              fontSize: theme.tokens.fontSizes.xl,
              fontWeight: theme.tokens.fontWeights.semibold,
              color: theme.tokens.colors.text.primary,
              margin: 0
            }}
          >
            {title}
          </Heading>

          {subtitle && (
            <View
              as="p"
              style={{
                fontSize: theme.tokens.fontSizes.md,
                color: theme.tokens.colors.text.secondary,
                margin: 0,
                maxWidth: '60ch' // Optimal line length for readability
              }}
            >
              {subtitle}
            </View>
          )}
        </View>

        {/* Actions Section */}
        {actions.length > 0 && (
          <View style={actionsContainerStyles()}>
            {actions.map((action, index) => (
              <React.Fragment key={`header-action-${index}`}>
                {action}
              </React.Fragment>
            ))}
          </View>
        )}
      </View>
    </View>
  );
});

PageHeader.displayName = 'PageHeader';

export default PageHeader;