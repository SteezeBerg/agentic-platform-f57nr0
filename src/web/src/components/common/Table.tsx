import React, { useCallback, useMemo, memo } from 'react';
import { Table, TableProps, TableColumnDefinition, useTheme } from '@aws-amplify/ui-react';
import { css } from '@emotion/react';
import { PaginationParams, SortOrder } from '../../types/common';
import Loading, { LoadingProps } from './Loading';

/**
 * Generic props interface for DataTable component with comprehensive type safety
 * @interface DataTableProps
 */
export interface DataTableProps<T> {
  /** Array of data items to display */
  data: T[];
  /** Column definitions with sorting and rendering options */
  columns: TableColumnDefinition<T>[];
  /** Loading state indicator */
  loading?: boolean;
  /** Enable row selection */
  selectable?: boolean;
  /** Row selection callback */
  onSelectionChange?: (selectedItems: T[]) => void;
  /** Sort callback */
  onSort?: (sortParams: PaginationParams) => void;
  /** Enable column sorting */
  sortable?: boolean;
  /** Pagination configuration */
  pagination?: PaginationParams;
  /** Accessible label for table */
  ariaLabel: string;
}

/**
 * A highly accessible, reusable table component implementing AWS Amplify UI design patterns
 * with Material Design 3.0 principles. Provides advanced features including sortable columns,
 * pagination, row selection, responsive layout, and comprehensive accessibility support.
 * 
 * @component
 * @template T - Type of data items displayed in the table
 */
const DataTable = <T extends Record<string, unknown>>({
  data,
  columns,
  loading = false,
  selectable = false,
  onSelectionChange,
  onSort,
  sortable = false,
  pagination,
  ariaLabel
}: DataTableProps<T>) => {
  const { tokens } = useTheme();

  // Memoized styles using emotion css
  const tableContainerStyles = useMemo(() => css`
    overflow: auto;
    border-radius: ${tokens.radii.medium};
    box-shadow: ${tokens.shadows.small};
    position: relative;
    min-height: 200px;

    @media (prefers-reduced-motion) {
      scroll-behavior: auto;
    }

    &:focus-visible {
      outline: 2px solid;
      outline-color: ${tokens.colors.border.focus};
    }
  `, [tokens]);

  const tableStyles = useMemo(() => css`
    width: 100%;
    border-collapse: collapse;
    font-size: ${tokens.fontSizes.small};
    table-layout: fixed;
    position: relative;
  `, [tokens]);

  const headerCellStyles = useMemo(() => css`
    font-weight: ${tokens.fontWeights.semibold};
    padding: ${tokens.space.medium};
    border-bottom: 1px solid;
    border-color: ${tokens.colors.border.primary};
    user-select: none;

    &[aria-sort] {
      cursor: pointer;
    }

    &:focus-visible {
      outline: 2px solid;
      outline-color: ${tokens.colors.border.focus};
    }
  `, [tokens]);

  // Optimized column sorting handler with memoization
  const handleSort = useCallback((columnId: string) => {
    if (!sortable || !onSort || !pagination) return;

    const newSortOrder = columnId === pagination.sort_by
      ? pagination.sort_order === SortOrder.ASC ? SortOrder.DESC : SortOrder.ASC
      : SortOrder.ASC;

    const newPagination: PaginationParams = {
      ...pagination,
      sort_by: columnId,
      sort_order: newSortOrder,
      page: 1 // Reset to first page on sort change
    };

    onSort(newPagination);

    // Announce sort change to screen readers
    const message = `Table sorted by ${columnId} in ${newSortOrder.toLowerCase()} order`;
    const announcement = document.createElement('div');
    announcement.setAttribute('role', 'status');
    announcement.setAttribute('aria-live', 'polite');
    announcement.innerText = message;
    document.body.appendChild(announcement);
    setTimeout(() => document.body.removeChild(announcement), 1000);
  }, [sortable, onSort, pagination]);

  // Memoized row selection handler
  const handleSelectionChange = useCallback((selectedItems: T[]) => {
    if (!onSelectionChange) return;
    onSelectionChange(selectedItems);

    // Announce selection change to screen readers
    const message = `${selectedItems.length} items selected`;
    const announcement = document.createElement('div');
    announcement.setAttribute('role', 'status');
    announcement.setAttribute('aria-live', 'polite');
    announcement.innerText = message;
    document.body.appendChild(announcement);
    setTimeout(() => document.body.removeChild(announcement), 1000);
  }, [onSelectionChange]);

  // Enhanced column definitions with sorting and accessibility
  const enhancedColumns = useMemo(() => columns.map(column => ({
    ...column,
    headerCellProps: {
      ...column.headerCellProps,
      css: headerCellStyles,
      onClick: sortable ? () => handleSort(column.id) : undefined,
      'aria-sort': pagination?.sort_by === column.id
        ? pagination.sort_order === SortOrder.ASC ? 'ascending' : 'descending'
        : undefined,
      role: sortable ? 'columnheader button' : 'columnheader',
      tabIndex: sortable ? 0 : undefined,
      onKeyPress: sortable
        ? (e: React.KeyboardEvent) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              handleSort(column.id);
            }
          }
        : undefined
    }
  })), [columns, sortable, pagination, handleSort, headerCellStyles]);

  return (
    <div
      css={tableContainerStyles}
      role="region"
      aria-label={ariaLabel}
      tabIndex={0}
    >
      {loading ? (
        <Loading
          size="medium"
          text="Loading table data..."
          overlay={false}
        />
      ) : (
        <Table<T>
          css={tableStyles}
          items={data}
          columns={enhancedColumns}
          selectionMode={selectable ? 'multiple' : 'none'}
          onSelectionChange={handleSelectionChange}
          aria-busy={loading}
          aria-colcount={columns.length}
          aria-rowcount={data.length}
          data-testid="data-table"
        />
      )}
    </div>
  );
};

DataTable.displayName = 'DataTable';

export default memo(DataTable) as typeof DataTable;