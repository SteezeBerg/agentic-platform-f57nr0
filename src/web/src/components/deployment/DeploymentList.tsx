import React, { useCallback, useMemo, useState } from 'react';
import { View, useCollection, useMediaQuery, useTheme } from '@aws-amplify/ui-react';
// @aws-amplify/ui-react version ^6.0.0
// react version ^18.2.0

import { Deployment } from '../../types/deployment';
import DeploymentCard from './DeploymentCard';
import DataGrid from '../common/DataGrid';
import { SortOrder } from '../../types/common';

export interface DeploymentListProps {
  deployments: Array<Deployment>;
  loading?: boolean;
  onViewDetails?: (deploymentId: string) => void;
  onRetry?: (deploymentId: string) => void;
  defaultView?: 'grid' | 'card';
  filterPresets?: Record<string, any>;
}

const DeploymentList: React.FC<DeploymentListProps> = ({
  deployments,
  loading = false,
  onViewDetails,
  onRetry,
  defaultView = 'grid',
  filterPresets
}) => {
  const { tokens } = useTheme();
  const isTablet = useMediaQuery('(max-width: 768px)');
  const [view, setView] = useState<'grid' | 'card'>(isTablet ? 'card' : defaultView);

  // Collection hook for enhanced data management
  const { items, sort, filter } = useCollection(deployments, {
    sortingField: 'last_active',
    sortingOrder: 'DESC'
  });

  // Memoized column definitions for the data grid
  const columns = useMemo(() => [
    {
      id: 'agent_id',
      header: 'Agent Name',
      accessorKey: 'agent_id',
      sortable: true,
      cell: (info: any) => (
        <View
          as="span"
          fontWeight={tokens.fontWeights.semibold}
          color={tokens.colors.font.primary}
        >
          {info.getValue()}
        </View>
      )
    },
    {
      id: 'status',
      header: 'Status',
      accessorKey: 'status',
      sortable: true,
      cell: (info: any) => (
        <View
          backgroundColor={
            info.getValue() === 'completed'
              ? tokens.colors.success[10]
              : info.getValue() === 'failed'
              ? tokens.colors.error[10]
              : tokens.colors.warning[10]
          }
          padding={`${tokens.space.xxs} ${tokens.space.xs}`}
          borderRadius={tokens.radii.small}
          textAlign="center"
          color={
            info.getValue() === 'completed'
              ? tokens.colors.success[80]
              : info.getValue() === 'failed'
              ? tokens.colors.error[80]
              : tokens.colors.warning[80]
          }
        >
          {info.getValue()}
        </View>
      )
    },
    {
      id: 'health',
      header: 'Health',
      accessorKey: 'health',
      sortable: true,
      cell: (info: any) => (
        <View
          backgroundColor={
            info.getValue() === 'healthy'
              ? tokens.colors.success[10]
              : info.getValue() === 'degraded'
              ? tokens.colors.warning[10]
              : tokens.colors.error[10]
          }
          padding={`${tokens.space.xxs} ${tokens.space.xs}`}
          borderRadius={tokens.radii.small}
          textAlign="center"
          color={
            info.getValue() === 'healthy'
              ? tokens.colors.success[80]
              : info.getValue() === 'degraded'
              ? tokens.colors.warning[80]
              : tokens.colors.error[80]
          }
        >
          {info.getValue()}
        </View>
      )
    },
    {
      id: 'cpu_usage',
      header: 'CPU Usage',
      accessorKey: 'metrics.resource_utilization.cpu_usage',
      sortable: true,
      cell: (info: any) => (
        <View textAlign="right">
          {`${Math.round(info.getValue() * 100)}%`}
        </View>
      )
    },
    {
      id: 'memory_usage',
      header: 'Memory Usage',
      accessorKey: 'metrics.resource_utilization.memory_usage',
      sortable: true,
      cell: (info: any) => (
        <View textAlign="right">
          {`${Math.round(info.getValue() * 100)}%`}
        </View>
      )
    },
    {
      id: 'environment',
      header: 'Environment',
      accessorKey: 'environment',
      sortable: true,
      cell: (info: any) => (
        <View
          backgroundColor={tokens.colors.neutral[10]}
          padding={`${tokens.space.xxs} ${tokens.space.xs}`}
          borderRadius={tokens.radii.small}
          textAlign="center"
        >
          {info.getValue()}
        </View>
      )
    },
    {
      id: 'last_active',
      header: 'Last Active',
      accessorKey: 'last_active',
      sortable: true,
      cell: (info: any) => {
        const date = new Date(info.getValue());
        const now = new Date();
        const diffInMinutes = Math.floor((now.getTime() - date.getTime()) / 60000);

        let formattedTime = '';
        if (diffInMinutes < 60) {
          formattedTime = `${diffInMinutes} mins ago`;
        } else if (diffInMinutes < 1440) {
          formattedTime = `${Math.floor(diffInMinutes / 60)} hours ago`;
        } else {
          formattedTime = date.toLocaleDateString();
        }

        return <View>{formattedTime}</View>;
      }
    }
  ], [tokens]);

  // Handlers for sorting and filtering
  const handleSort = useCallback((field: string, direction: SortOrder) => {
    sort({
      field,
      direction: direction === SortOrder.ASC ? 'ASC' : 'DESC'
    });
  }, [sort]);

  const handleFilter = useCallback((filters: Record<string, any>) => {
    filter({
      ...filterPresets,
      ...filters
    });
  }, [filter, filterPresets]);

  // Render grid or card view based on screen size and preference
  return (
    <View
      data-testid="deployment-list"
      role="region"
      aria-label="Deployment List"
      padding={tokens.space.medium}
    >
      {view === 'grid' ? (
        <DataGrid
          data={items}
          columns={columns}
          loading={loading}
          onSort={handleSort}
          onFilter={handleFilter}
          pagination={{
            page: 1,
            limit: 10,
            sort_by: '',
            sort_order: SortOrder.ASC,
            filters: {}
          }}
        />
      ) : (
        <View
          display="grid"
          gap={tokens.space.medium}
          gridTemplateColumns={{
            base: '1fr',
            small: 'repeat(2, 1fr)',
            medium: 'repeat(3, 1fr)',
            large: 'repeat(4, 1fr)'
          }}
        >
          {items.map((deployment) => (
            <DeploymentCard
              key={deployment.id}
              deployment={deployment}
              onViewDetails={onViewDetails}
              onRetry={onRetry}
            />
          ))}
        </View>
      )}
    </View>
  );
};

DeploymentList.displayName = 'DeploymentList';

export default React.memo(DeploymentList);