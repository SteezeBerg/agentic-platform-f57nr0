import { lazy, Suspense } from 'react';
import { RouteObject } from 'react-router-dom';
import { ErrorBoundary } from 'react-error-boundary';
import { AuthLayout, AuthLayoutProps } from '../layouts/AuthLayout';
import { AuthGuard, AuthGuardProps } from '../components/auth/AuthGuard';
import { UserRole } from '../types/auth';

// Constants for route configuration
export const PUBLIC_ROUTES = [
  '/login',
  '/forgot-password',
  '/reset-password',
  '/error'
] as const;

export const ADMIN_ROUTES = [
  '/settings',
  '/admin',
  '/system',
  '/users'
] as const;

// Enhanced route metadata interface
interface RouteMetadata {
  title: string;
  analyticsId: string;
  rateLimit: {
    requests: number;
    windowMs: number;
  };
}

// Loading strategy configuration
interface LoadingStrategy {
  prefetch: boolean;
  retryAttempts: number;
  timeout: number;
}

// Enhanced route configuration interface
interface AppRoute extends RouteObject {
  requiresAuth: boolean;
  roles?: UserRole[];
  metadata: RouteMetadata;
  loadingStrategy: LoadingStrategy;
}

// Lazy-loaded components with performance optimization
const LAZY_COMPONENTS = {
  Dashboard: lazy(() => import('../pages/dashboard/Dashboard')),
  Login: lazy(() => import('../pages/auth/Login')),
  Profile: lazy(() => import('../pages/auth/Profile')),
  AgentList: lazy(() => import('../pages/agents/AgentList')),
  AgentDetails: lazy(() => import('../pages/agents/AgentDetails')),
  CreateAgent: lazy(() => import('../pages/agents/CreateAgent')),
  EditAgent: lazy(() => import('../pages/agents/EditAgent')),
  DeploymentList: lazy(() => import('../pages/deployment/DeploymentList')),
  DeploymentDetails: lazy(() => import('../pages/deployment/DeploymentDetails')),
  KnowledgeList: lazy(() => import('../pages/knowledge/KnowledgeList')),
  KnowledgeDetails: lazy(() => import('../pages/knowledge/KnowledgeDetails')),
  Settings: lazy(() => import('../pages/settings/Settings')),
  SystemStatus: lazy(() => import('../pages/system/SystemStatus')),
  ErrorPage: lazy(() => import('../pages/error/ErrorPage'))
};

// Helper functions for route configuration
const isPublicRoute = (path: string): boolean => {
  return PUBLIC_ROUTES.includes(path as any);
};

const requiresAdmin = (path: string): boolean => {
  return ADMIN_ROUTES.includes(path as any);
};

const wrapInLayout = (
  component: React.ReactNode,
  requiresAuth: boolean,
  loadingStrategy: LoadingStrategy
): React.ReactNode => {
  return (
    <ErrorBoundary FallbackComponent={LAZY_COMPONENTS.ErrorPage}>
      <Suspense fallback={<div>Loading...</div>}>
        {requiresAuth ? (
          <AuthGuard>
            <AuthLayout>{component}</AuthLayout>
          </AuthGuard>
        ) : (
          <AuthLayout>{component}</AuthLayout>
        )}
      </Suspense>
    </ErrorBoundary>
  );
};

// Enhanced route configuration with security and performance features
export const routes: AppRoute[] = [
  {
    path: '/',
    element: wrapInLayout(
      <LAZY_COMPONENTS.Dashboard />,
      true,
      { prefetch: true, retryAttempts: 3, timeout: 5000 }
    ),
    requiresAuth: true,
    metadata: {
      title: 'Dashboard',
      analyticsId: 'dashboard_view',
      rateLimit: { requests: 100, windowMs: 60000 }
    },
    loadingStrategy: { prefetch: true, retryAttempts: 3, timeout: 5000 }
  },
  {
    path: '/login',
    element: wrapInLayout(
      <LAZY_COMPONENTS.Login />,
      false,
      { prefetch: true, retryAttempts: 3, timeout: 3000 }
    ),
    requiresAuth: false,
    metadata: {
      title: 'Login',
      analyticsId: 'login_view',
      rateLimit: { requests: 50, windowMs: 60000 }
    },
    loadingStrategy: { prefetch: true, retryAttempts: 3, timeout: 3000 }
  },
  {
    path: '/agents',
    element: wrapInLayout(
      <LAZY_COMPONENTS.AgentList />,
      true,
      { prefetch: true, retryAttempts: 3, timeout: 5000 }
    ),
    requiresAuth: true,
    roles: [UserRole.ADMIN, UserRole.POWER_USER, UserRole.DEVELOPER],
    metadata: {
      title: 'Agents',
      analyticsId: 'agent_list_view',
      rateLimit: { requests: 100, windowMs: 60000 }
    },
    loadingStrategy: { prefetch: true, retryAttempts: 3, timeout: 5000 }
  },
  {
    path: '/agents/create',
    element: wrapInLayout(
      <LAZY_COMPONENTS.CreateAgent />,
      true,
      { prefetch: false, retryAttempts: 3, timeout: 5000 }
    ),
    requiresAuth: true,
    roles: [UserRole.ADMIN, UserRole.POWER_USER],
    metadata: {
      title: 'Create Agent',
      analyticsId: 'create_agent_view',
      rateLimit: { requests: 50, windowMs: 60000 }
    },
    loadingStrategy: { prefetch: false, retryAttempts: 3, timeout: 5000 }
  },
  {
    path: '/knowledge',
    element: wrapInLayout(
      <LAZY_COMPONENTS.KnowledgeList />,
      true,
      { prefetch: true, retryAttempts: 3, timeout: 5000 }
    ),
    requiresAuth: true,
    roles: [UserRole.ADMIN, UserRole.POWER_USER, UserRole.DEVELOPER],
    metadata: {
      title: 'Knowledge Base',
      analyticsId: 'knowledge_list_view',
      rateLimit: { requests: 100, windowMs: 60000 }
    },
    loadingStrategy: { prefetch: true, retryAttempts: 3, timeout: 5000 }
  },
  {
    path: '/deployments',
    element: wrapInLayout(
      <LAZY_COMPONENTS.DeploymentList />,
      true,
      { prefetch: true, retryAttempts: 3, timeout: 5000 }
    ),
    requiresAuth: true,
    roles: [UserRole.ADMIN, UserRole.POWER_USER],
    metadata: {
      title: 'Deployments',
      analyticsId: 'deployment_list_view',
      rateLimit: { requests: 100, windowMs: 60000 }
    },
    loadingStrategy: { prefetch: true, retryAttempts: 3, timeout: 5000 }
  },
  {
    path: '/settings',
    element: wrapInLayout(
      <LAZY_COMPONENTS.Settings />,
      true,
      { prefetch: false, retryAttempts: 3, timeout: 5000 }
    ),
    requiresAuth: true,
    roles: [UserRole.ADMIN],
    metadata: {
      title: 'Settings',
      analyticsId: 'settings_view',
      rateLimit: { requests: 50, windowMs: 60000 }
    },
    loadingStrategy: { prefetch: false, retryAttempts: 3, timeout: 5000 }
  },
  {
    path: '*',
    element: wrapInLayout(
      <LAZY_COMPONENTS.ErrorPage />,
      false,
      { prefetch: true, retryAttempts: 3, timeout: 3000 }
    ),
    requiresAuth: false,
    metadata: {
      title: 'Error',
      analyticsId: 'error_view',
      rateLimit: { requests: 100, windowMs: 60000 }
    },
    loadingStrategy: { prefetch: true, retryAttempts: 3, timeout: 3000 }
  }
];

export default routes;