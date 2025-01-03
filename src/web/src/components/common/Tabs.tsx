import React, { useState, useCallback, useEffect, useRef, memo } from 'react';
import { Tabs as AmplifyTabs, TabItem, useBreakpointValue, View, Text } from '@aws-amplify/ui-react'; // v6.0.0
import { useSwipeable } from 'react-swipeable'; // v7.0.0
import { useTheme } from '../../hooks/useTheme';
import ErrorBoundary from '../../components/common/ErrorBoundary';

// Interface definitions
export interface TabItemProps {
  id: string;
  label: string;
  content: React.ReactNode;
  disabled?: boolean;
  icon?: React.ReactNode;
  badge?: number | string;
}

export interface TabsProps {
  items: TabItemProps[];
  defaultIndex?: number;
  onChange?: (index: number) => void;
  ariaLabel?: string;
  lazyLoad?: boolean;
  transitionDuration?: number;
}

// Constants
const DEFAULT_TRANSITION_DURATION = 300;
const SWIPE_THRESHOLD = 50;
const MINIMUM_TOUCH_TARGET = 44; // WCAG 2.1 Level AA compliance

/**
 * Enterprise-grade tabbed interface component with accessibility support
 * and responsive design features.
 */
const Tabs: React.FC<TabsProps> = memo(({
  items,
  defaultIndex = 0,
  onChange,
  ariaLabel = 'Content tabs',
  lazyLoad = true,
  transitionDuration = DEFAULT_TRANSITION_DURATION
}) => {
  const { theme } = useTheme();
  const [activeIndex, setActiveIndex] = useState(defaultIndex);
  const [renderedTabs, setRenderedTabs] = useState<Set<number>>(new Set([defaultIndex]));
  const tabListRef = useRef<HTMLDivElement>(null);
  const touchStartX = useRef<number>(0);

  // Responsive layout adjustments
  const isMobile = useBreakpointValue({
    base: true,
    md: false
  });

  const showIcons = useBreakpointValue({
    base: false,
    lg: true
  });

  // Handle tab change with animation
  const handleTabChange = useCallback((index: number) => {
    if (index !== activeIndex && !items[index]?.disabled) {
      setActiveIndex(index);
      if (lazyLoad) {
        setRenderedTabs(prev => new Set([...prev, index]));
      }
      onChange?.(index);
    }
  }, [activeIndex, items, lazyLoad, onChange]);

  // Keyboard navigation
  const handleKeyDown = useCallback((event: React.KeyboardEvent) => {
    const { key } = event;
    let newIndex = activeIndex;

    switch (key) {
      case 'ArrowLeft':
        newIndex = activeIndex > 0 ? activeIndex - 1 : items.length - 1;
        break;
      case 'ArrowRight':
        newIndex = activeIndex < items.length - 1 ? activeIndex + 1 : 0;
        break;
      case 'Home':
        newIndex = 0;
        break;
      case 'End':
        newIndex = items.length - 1;
        break;
      default:
        return;
    }

    event.preventDefault();
    handleTabChange(newIndex);
  }, [activeIndex, items.length, handleTabChange]);

  // Touch gesture support
  const swipeHandlers = useSwipeable({
    onSwipedLeft: () => {
      if (activeIndex < items.length - 1) {
        handleTabChange(activeIndex + 1);
      }
    },
    onSwipedRight: () => {
      if (activeIndex > 0) {
        handleTabChange(activeIndex - 1);
      }
    },
    trackMouse: false,
    threshold: SWIPE_THRESHOLD
  });

  // Focus management
  useEffect(() => {
    const tabList = tabListRef.current;
    if (tabList) {
      const activeTab = tabList.querySelector(`[data-index="${activeIndex}"]`);
      if (activeTab instanceof HTMLElement) {
        activeTab.focus();
      }
    }
  }, [activeIndex]);

  // Styles with theme integration
  const styles = {
    tabContainer: {
      width: '100%',
      marginBottom: theme.tokens.space.medium,
      borderRadius: theme.tokens.radii.medium,
      position: 'relative' as const,
      overflow: 'hidden'
    },
    tabList: {
      display: 'flex',
      borderBottom: `1px solid ${theme.tokens.colors.border.primary}`,
      gap: theme.tokens.space.small,
      position: 'relative' as const,
      zIndex: 1
    },
    tabContent: {
      padding: theme.tokens.space.medium,
      backgroundColor: theme.tokens.colors.background.secondary,
      transition: `opacity ${transitionDuration}ms ${theme.tokens.motion.easing.easeInOut}`,
      minHeight: '200px'
    },
    tab: {
      minHeight: `${MINIMUM_TOUCH_TARGET}px`,
      padding: `${theme.tokens.space.small} ${theme.tokens.space.medium}`,
      cursor: 'pointer',
      userSelect: 'none' as const,
      display: 'flex',
      alignItems: 'center',
      gap: theme.tokens.space.small,
      color: theme.tokens.colors.text.primary,
      borderBottom: '2px solid transparent',
      transition: `all ${transitionDuration}ms ${theme.tokens.motion.easing.easeInOut}`,
      '&:hover': {
        backgroundColor: theme.tokens.colors.background.hover
      },
      '&[aria-selected="true"]': {
        borderBottomColor: theme.tokens.colors.border.focus,
        color: theme.tokens.colors.text.interactive
      },
      '&:focus-visible': {
        outline: 'none',
        boxShadow: `0 0 0 2px ${theme.tokens.colors.border.focus}`
      }
    }
  };

  return (
    <ErrorBoundary>
      <View
        as="div"
        style={styles.tabContainer}
        {...swipeHandlers}
      >
        <AmplifyTabs
          ref={tabListRef}
          currentIndex={activeIndex}
          onChange={handleTabChange}
          spacing="equal"
          justifyContent={isMobile ? 'center' : 'flex-start'}
          ariaLabel={ariaLabel}
          onKeyDown={handleKeyDown}
        >
          {items.map((item, index) => (
            <TabItem
              key={item.id}
              title={
                <View style={styles.tab} data-index={index}>
                  {showIcons && item.icon}
                  <Text>{item.label}</Text>
                  {item.badge && (
                    <View
                      as="span"
                      backgroundColor={theme.tokens.colors.background.info}
                      borderRadius="full"
                      padding="2px 8px"
                      fontSize="small"
                    >
                      {item.badge}
                    </View>
                  )}
                </View>
              }
              disabled={item.disabled}
            >
              <View
                style={{
                  ...styles.tabContent,
                  opacity: activeIndex === index ? 1 : 0,
                  visibility: activeIndex === index ? 'visible' : 'hidden'
                }}
                role="tabpanel"
                aria-labelledby={`tab-${item.id}`}
              >
                {(!lazyLoad || renderedTabs.has(index)) && item.content}
              </View>
            </TabItem>
          ))}
        </AmplifyTabs>
      </View>
    </ErrorBoundary>
  );
});

Tabs.displayName = 'Tabs';

export default Tabs;