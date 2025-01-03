import React, { useMemo } from 'react';
import { useLocation, Link } from 'react-router-dom'; // v6.0.0
import { Breadcrumb, ChevronRightIcon } from '@aws-amplify/ui-react'; // v6.0.0
import { routes } from '../../config/routes';

// Interface for component props with accessibility options
interface BreadcrumbsProps {
  className?: string;
  separator?: React.ReactNode;
  ariaLabel?: string;
  maxItems?: number;
}

// Interface for enhanced breadcrumb items with accessibility
interface BreadcrumbItem {
  label: string;
  path: string;
  ariaLabel: string;
  isCurrentPage: boolean;
}

/**
 * Generates accessible breadcrumb items from current route path
 * @param pathname Current route pathname
 * @param routes Application route configuration
 * @returns Array of breadcrumb items with accessibility properties
 */
const getBreadcrumbItems = (pathname: string, routes: typeof routes): BreadcrumbItem[] => {
  const segments = pathname.split('/').filter(Boolean);
  const items: BreadcrumbItem[] = [];
  let currentPath = '';

  // Always include home
  items.push({
    label: 'Home',
    path: '/',
    ariaLabel: 'Navigate to home page',
    isCurrentPage: pathname === '/'
  });

  // Build breadcrumb items from path segments
  segments.forEach((segment, index) => {
    currentPath += `/${segment}`;
    const route = routes.find(r => r.path === currentPath);
    
    if (route) {
      // Transform route metadata into readable label
      const label = route.metadata?.title || 
        segment.split('-')
          .map(word => word.charAt(0).toUpperCase() + word.slice(1))
          .join(' ');

      items.push({
        label,
        path: currentPath,
        ariaLabel: `Navigate to ${label.toLowerCase()} page`,
        isCurrentPage: index === segments.length - 1
      });
    }
  });

  return items;
};

/**
 * Breadcrumb navigation component that implements AWS Amplify UI design patterns
 * with Material Design 3.0 principles and comprehensive accessibility features.
 *
 * @component
 * @example
 * ```tsx
 * <Breadcrumbs ariaLabel="Page navigation" maxItems={4} />
 * ```
 */
const Breadcrumbs: React.FC<BreadcrumbsProps> = ({
  className,
  separator = <ChevronRightIcon />,
  ariaLabel = 'Page navigation breadcrumb',
  maxItems = 4
}) => {
  const location = useLocation();

  // Memoize breadcrumb items to prevent unnecessary recalculation
  const items = useMemo(() => 
    getBreadcrumbItems(location.pathname, routes),
    [location.pathname]
  );

  // Handle truncation for long breadcrumb trails
  const visibleItems = items.length > maxItems
    ? [
        ...items.slice(0, 1), // Always show home
        { label: '...', path: '', ariaLabel: 'Hidden breadcrumb items', isCurrentPage: false },
        ...items.slice(-2) // Show last two items
      ]
    : items;

  return (
    <Breadcrumb
      className={className}
      role="navigation"
      aria-label={ariaLabel}
      data-testid="breadcrumb-nav"
    >
      {visibleItems.map((item, index) => (
        <React.Fragment key={item.path || index}>
          <Breadcrumb.Item
            aria-current={item.isCurrentPage ? 'page' : undefined}
            data-testid={`breadcrumb-item-${index}`}
          >
            {item.path ? (
              <Link
                to={item.path}
                aria-label={item.ariaLabel}
                tabIndex={0}
                style={{
                  color: item.isCurrentPage ? 'var(--amplify-colors-font-primary)' : 'var(--amplify-colors-font-interactive)',
                  textDecoration: 'none',
                  ':hover': {
                    textDecoration: 'underline'
                  },
                  ':focus-visible': {
                    outline: '2px solid var(--amplify-colors-border-focus)',
                    outlineOffset: '2px',
                    borderRadius: 'var(--amplify-radii-small)'
                  }
                }}
              >
                {item.label}
              </Link>
            ) : (
              <span aria-hidden="true">{item.label}</span>
            )}
          </Breadcrumb.Item>
          
          {index < visibleItems.length - 1 && (
            <Breadcrumb.Separator
              aria-hidden="true"
              style={{
                color: 'var(--amplify-colors-font-tertiary)',
                margin: '0 var(--amplify-space-xs)'
              }}
            >
              {separator}
            </Breadcrumb.Separator>
          )}
        </React.Fragment>
      ))}
    </Breadcrumb>
  );
};

export type { BreadcrumbsProps };
export default Breadcrumbs;