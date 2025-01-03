import React, { useState, useCallback, useRef, useEffect } from 'react';
import { SearchField } from '@aws-amplify/ui-react'; // v6.0.0
import { debounce } from 'lodash'; // v4.17.21
import IconButton from './IconButton';
import { validateUserInput } from '../../utils/validation';
import { useTheme } from '../../hooks/useTheme';
import { LoadingState } from '../../types/common';

/**
 * Props interface for the SearchBar component with comprehensive accessibility features
 */
export interface SearchBarProps {
  /** Localized placeholder text for the search input */
  placeholder?: string;
  /** Async callback function when search value changes */
  onSearch: (value: string) => Promise<void>;
  /** Debounce delay in milliseconds */
  debounceTime?: number;
  /** Initial search value */
  initialValue?: string;
  /** Disabled state of the search bar */
  disabled?: boolean;
  /** Loading state during search operations */
  isLoading?: boolean;
  /** Error message for failed search operations */
  error?: string;
  /** Optional callback when search is cleared */
  onClear?: () => void;
}

/**
 * A highly accessible search bar component that implements AWS Amplify UI design patterns
 * with Material Design 3.0 principles. Provides real-time search with debouncing,
 * comprehensive keyboard navigation, and screen reader support.
 */
export const SearchBar = React.memo<SearchBarProps>(({
  placeholder = 'Search...',
  onSearch,
  debounceTime = 300,
  initialValue = '',
  disabled = false,
  isLoading = false,
  error,
  onClear
}) => {
  const [searchValue, setSearchValue] = useState(initialValue);
  const [internalLoading, setInternalLoading] = useState(false);
  const { theme, isDarkMode } = useTheme();
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Create debounced search handler
  const debouncedSearch = useCallback(
    debounce(async (value: string) => {
      if (!value.trim()) return;
      
      try {
        setInternalLoading(true);
        await onSearch(value);
      } catch (err) {
        console.error('Search error:', err);
      } finally {
        setInternalLoading(false);
      }
    }, debounceTime),
    [onSearch, debounceTime]
  );

  // Clean up debounced function on unmount
  useEffect(() => {
    return () => {
      debouncedSearch.cancel();
    };
  }, [debouncedSearch]);

  // Handle input changes with validation
  const handleChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = event.target.value;
    
    try {
      // Validate input for security
      validateUserInput({ searchValue: newValue }, {
        searchValue: (val: string) => val.length <= 100 && !/<[^>]*>/g.test(val)
      });
      
      setSearchValue(newValue);
      debouncedSearch(newValue);
    } catch (err) {
      console.warn('Invalid search input:', err);
    }
  }, [debouncedSearch]);

  // Handle clear button click
  const handleClear = useCallback(() => {
    setSearchValue('');
    onClear?.();
    searchInputRef.current?.focus();
  }, [onClear]);

  // Handle keyboard shortcuts
  const handleKeyDown = useCallback((event: React.KeyboardEvent<HTMLInputElement>) => {
    // Clear on Escape
    if (event.key === 'Escape') {
      handleClear();
      event.preventDefault();
    }
    // Focus on Ctrl/Cmd + K
    if ((event.ctrlKey || event.metaKey) && event.key === 'k') {
      searchInputRef.current?.focus();
      event.preventDefault();
    }
  }, [handleClear]);

  // Compute loading state
  const isSearchLoading = isLoading || internalLoading;

  // Memoize styles
  const styles = {
    container: {
      position: 'relative' as const,
      width: '100%',
      maxWidth: '600px',
      minWidth: '200px',
    },
    searchField: {
      backgroundColor: isDarkMode ? 
        theme.tokens.colors.background.secondary : 
        theme.tokens.colors.background.primary,
      borderColor: error ? 
        theme.tokens.colors.border.error : 
        theme.tokens.colors.border.primary,
      borderRadius: theme.tokens.radii.sm,
      transition: `all ${theme.tokens.transitions?.duration.fast} ${theme.tokens.transitions?.timing.ease}`,
      '&:hover:not(:disabled)': {
        borderColor: theme.tokens.colors.border.hover
      },
      '&:focus-within': {
        borderColor: theme.tokens.colors.border.focus,
        boxShadow: `0 0 0 2px ${theme.tokens.colors.border.focus}`,
        outline: 'none'
      }
    },
    clearButton: {
      position: 'absolute' as const,
      right: '8px',
      top: '50%',
      transform: 'translateY(-50%)'
    }
  };

  return (
    <div 
      style={styles.container}
      role="search"
      aria-label="Search input group"
    >
      <SearchField
        ref={searchInputRef}
        label="Search"
        placeholder={placeholder}
        value={searchValue}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        disabled={disabled}
        hasError={!!error}
        errorMessage={error}
        size="medium"
        css={styles.searchField}
        data-loading-state={isSearchLoading ? LoadingState.LOADING : LoadingState.IDLE}
        aria-busy={isSearchLoading}
        aria-invalid={!!error}
        aria-describedby={error ? 'search-error' : undefined}
      />
      {searchValue && (
        <div style={styles.clearButton}>
          <IconButton
            icon="✕"
            ariaLabel="Clear search"
            onClick={handleClear}
            disabled={disabled || isSearchLoading}
            size="small"
            variant="ghost"
            tooltip="Clear search (Esc)"
          />
        </div>
      )}
      {error && (
        <div 
          id="search-error"
          role="alert"
          aria-live="polite"
          style={{
            color: theme.tokens.colors.text.error,
            fontSize: theme.tokens.fontSizes.sm,
            marginTop: theme.tokens.space.xs
          }}
        >
          {error}
        </div>
      )}
    </div>
  );
});

SearchBar.displayName = 'SearchBar';

export default SearchBar;