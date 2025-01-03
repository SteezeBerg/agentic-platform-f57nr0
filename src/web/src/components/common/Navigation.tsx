import React, { useCallback, useMemo } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { View, useMediaQuery } from '@aws-amplify/ui-react';
import { IconButton } from './IconButton';
import { useAuth } from '../../hooks/useAuth';
import { useTheme } from '../../hooks/useTheme';
import { UserRole } from '../../types/auth';

// Navigation item interface with role-based access control
interface NavItemProps {
  to: string;
  label: string;
  icon?: React.ReactNode;
  requiredRoles?: UserRole[];
  badge?: number | string;
  children?: NavItemProps[];
}

// Component props interface
interface NavigationProps {
  isMobile: boolean;
  isOpen: boolean;
  onToggle: () => void;
  className?: string;
}

// Navigation styles with theme support
const NAV_STYLES = {
  container: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: 'var(--amplify-space-small)',
    padding: 'var(--amplify-space-medium)',
    transition: 'all 0.2s ease-in-out',
  },
  item: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--amplify-space-small)',
    padding: 'var(--amplify-space-small) var(--amplify-space-medium)',
    borderRadius: 'var(--amplify-radii-small)',
    textDecoration: 'none',
    color: 'var(--amplify-colors-font-primary)',
    transition: 'all 0.2s ease-in-out',
    '&:hover': {
      backgroundColor: 'var(--amplify-colors-background-secondary)',
    },
    '&.active': {
      backgroundColor: 'var(--amplify-colors-brand-primary)',
      color: 'var(--amplify-colors-font-inverse)',
    },
  },
  badge: {
    padding: '2px 6px',
    borderRadius: 'var(--amplify-radii-small)',
    fontSize: 'var(--amplify-font-sizes-xxs)',
    backgroundColor: 'var(--amplify-colors-brand-secondary)',
    color: 'var(--amplify-colors-font-inverse)',
  },
  mobileOverlay: {
    position: 'fixed' as const,
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    zIndex: 100,
  },
  mobileNav: {
    position: 'fixed' as const,
    top: 0,
    left: 0,
    bottom: 0,
    width: '80%',
    maxWidth: '300px',
    backgroundColor: 'var(--amplify-colors-background-primary)',
    zIndex: 101,
    transform: 'translateX(-100%)',
    transition: 'transform 0.3s ease-in-out',
  },
  mobileNavOpen: {
    transform: 'translateX(0)',
  },
};

// Main navigation items configuration
const getNavItems = (userRoles: UserRole[]): NavItemProps[] => [
  {
    to: '/dashboard',
    label: 'Dashboard',
    requiredRoles: [UserRole.ADMIN, UserRole.POWER_USER, UserRole.DEVELOPER, UserRole.BUSINESS_USER, UserRole.VIEWER],
  },
  {
    to: '/agents',
    label: 'Agents',
    requiredRoles: [UserRole.ADMIN, UserRole.POWER_USER, UserRole.DEVELOPER],
  },
  {
    to: '/knowledge',
    label: 'Knowledge Hub',
    requiredRoles: [UserRole.ADMIN, UserRole.POWER_USER, UserRole.DEVELOPER],
  },
  {
    to: '/deployments',
    label: 'Deployments',
    requiredRoles: [UserRole.ADMIN, UserRole.POWER_USER],
  },
  {
    to: '/settings',
    label: 'Settings',
    requiredRoles: [UserRole.ADMIN],
  },
];

export const Navigation = React.memo<NavigationProps>(({
  isMobile,
  isOpen,
  onToggle,
  className,
}) => {
  const { user, userRoles } = useAuth();
  const location = useLocation();
  const { theme, isDarkMode } = useTheme();
  const isSmallScreen = useMediaQuery('(max-width: 768px)');

  // Filter navigation items based on user roles
  const navItems = useMemo(() => {
    if (!user || !userRoles) return [];
    return getNavItems(userRoles).filter(item => 
      !item.requiredRoles || item.requiredRoles.some(role => userRoles.includes(role))
    );
  }, [user, userRoles]);

  // Handle keyboard navigation
  const handleKeyDown = useCallback((event: React.KeyboardEvent) => {
    if (event.key === 'Escape' && isOpen) {
      onToggle();
    }
  }, [isOpen, onToggle]);

  // Render navigation item with accessibility support
  const renderNavItem = (item: NavItemProps) => (
    <NavLink
      key={item.to}
      to={item.to}
      className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
      style={NAV_STYLES.item}
      aria-current={location.pathname === item.to ? 'page' : undefined}
    >
      {item.icon && <span className="nav-icon">{item.icon}</span>}
      <span className="nav-label">{item.label}</span>
      {item.badge && (
        <span className="nav-badge" style={NAV_STYLES.badge}>
          {item.badge}
        </span>
      )}
    </NavLink>
  );

  // Mobile navigation with overlay
  if (isMobile) {
    return (
      <>
        <IconButton
          icon={isOpen ? '×' : '☰'}
          onClick={onToggle}
          ariaLabel={isOpen ? 'Close navigation' : 'Open navigation'}
          className="nav-toggle"
        />
        {isOpen && (
          <View
            as="div"
            style={NAV_STYLES.mobileOverlay}
            onClick={onToggle}
            role="presentation"
          />
        )}
        <View
          as="nav"
          style={{
            ...NAV_STYLES.mobileNav,
            ...(isOpen && NAV_STYLES.mobileNavOpen),
          }}
          className={className}
          role="navigation"
          aria-label="Main navigation"
          onKeyDown={handleKeyDown}
        >
          <View style={NAV_STYLES.container}>
            {navItems.map(renderNavItem)}
          </View>
        </View>
      </>
    );
  }

  // Desktop navigation
  return (
    <View
      as="nav"
      style={NAV_STYLES.container}
      className={className}
      role="navigation"
      aria-label="Main navigation"
    >
      {navItems.map(renderNavItem)}
    </View>
  );
});

Navigation.displayName = 'Navigation';

export type { NavigationProps, NavItemProps };
export default Navigation;