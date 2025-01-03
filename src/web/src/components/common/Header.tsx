import React, { useCallback, useMemo } from 'react';
import {
  View,
  Flex,
  Button,
  Menu,
  MenuItem,
  ThemeToggle,
  useBreakpointValue
} from '@aws-amplify/ui-react'; // v6.0.0
import { useNavigate } from 'react-router-dom'; // v6.0.0
import { Navigation, NavigationProps } from './Navigation';
import { useAuth } from '../../hooks/useAuth';
import { useTheme } from '../../hooks/useTheme';
import ErrorBoundary from './ErrorBoundary';

// Header-specific styles with theme support
const HEADER_STYLES = {
  container: {
    width: '100%',
    borderBottom: '1px solid var(--amplify-colors-border-primary)',
    backgroundColor: 'var(--amplify-colors-background-primary)',
    position: 'sticky' as const,
    top: 0,
    zIndex: 1000,
  },
  content: {
    padding: 'var(--amplify-space-medium)',
    maxWidth: '1440px',
    margin: '0 auto',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 'var(--amplify-space-medium)',
  },
  logo: {
    height: '32px',
    width: 'auto',
  },
  actions: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--amplify-space-small)',
  },
};

// ARIA labels for accessibility
const ARIA_LABELS = {
  header: 'Main application header',
  logo: 'Agent Builder Hub logo',
  navigation: 'Main navigation menu',
  profile: 'User profile menu',
  theme: 'Theme toggle button',
};

export interface HeaderProps {
  className?: string;
  testId?: string;
}

/**
 * Main header component implementing AWS Amplify UI design patterns
 * with comprehensive accessibility features and responsive behavior.
 */
const Header: React.FC<HeaderProps> = React.memo(({ className, testId }) => {
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const { theme, isDarkMode, toggleTheme } = useTheme();
  const isMobile = useBreakpointValue({ base: true, md: false });

  // Navigation state
  const [isNavOpen, setIsNavOpen] = React.useState(false);

  // Memoized navigation props
  const navigationProps = useMemo<NavigationProps>(() => ({
    isMobile,
    isOpen: isNavOpen,
    onToggle: () => setIsNavOpen(prev => !prev),
  }), [isMobile, isNavOpen]);

  // Handle secure logout
  const handleLogout = useCallback(async () => {
    try {
      await logout();
      navigate('/login');
    } catch (error) {
      console.error('Logout failed:', error);
    }
  }, [logout, navigate]);

  // Handle profile navigation
  const handleProfileClick = useCallback(() => {
    navigate('/profile');
  }, [navigate]);

  // Handle keyboard navigation
  const handleKeyboardNavigation = useCallback((event: React.KeyboardEvent) => {
    if (event.key === 'Escape' && isNavOpen) {
      setIsNavOpen(false);
    }
  }, [isNavOpen]);

  return (
    <ErrorBoundary>
      <View
        as="header"
        style={HEADER_STYLES.container}
        className={className}
        data-testid={testId}
        role="banner"
        aria-label={ARIA_LABELS.header}
        onKeyDown={handleKeyboardNavigation}
      >
        <Flex style={HEADER_STYLES.content}>
          {/* Logo and Navigation */}
          <Flex alignItems="center" gap="medium">
            <img
              src="/logo.svg"
              alt={ARIA_LABELS.logo}
              style={HEADER_STYLES.logo}
              onClick={() => navigate('/')}
              role="img"
            />
            <Navigation {...navigationProps} />
          </Flex>

          {/* Actions */}
          <Flex style={HEADER_STYLES.actions}>
            {/* Theme Toggle */}
            <ThemeToggle
              checked={isDarkMode}
              onChange={toggleTheme}
              aria-label={ARIA_LABELS.theme}
              size={isMobile ? 'small' : 'medium'}
            />

            {/* User Profile Menu */}
            {user && (
              <Menu
                trigger={
                  <Button
                    variation="menu"
                    aria-label={ARIA_LABELS.profile}
                    data-testid="profile-menu-trigger"
                  >
                    {user.firstName} {user.lastName}
                  </Button>
                }
              >
                <MenuItem onClick={handleProfileClick}>Profile</MenuItem>
                <MenuItem onClick={handleLogout}>Logout</MenuItem>
              </Menu>
            )}
          </Flex>
        </Flex>
      </View>
    </ErrorBoundary>
  );
});

Header.displayName = 'Header';

export default Header;