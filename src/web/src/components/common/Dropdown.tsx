import React, { memo, useCallback, useEffect, useRef, useState } from 'react';
import { SelectField } from '@aws-amplify/ui-react'; // v6.0.0
import { LoadingState } from '../../types/common';
import { useTheme } from '../../hooks/useTheme';

// Interfaces
export interface DropdownOption {
  value: string | number;
  label: string;
  disabled?: boolean;
  icon?: React.ReactNode;
  description?: string;
  group?: string;
}

export interface DropdownProps {
  options: DropdownOption[];
  value: string | string[] | number | number[];
  onChange: (value: string | string[] | number | number[]) => void;
  placeholder?: string;
  isMulti?: boolean;
  isLoading?: boolean;
  isDisabled?: boolean;
  error?: string;
  size?: 'small' | 'medium' | 'large';
  isSearchable?: boolean;
  maxHeight?: number;
  renderOption?: (option: DropdownOption) => React.ReactNode;
}

const Dropdown: React.FC<DropdownProps> = memo(({
  options,
  value,
  onChange,
  placeholder = 'Select an option',
  isMulti = false,
  isLoading = false,
  isDisabled = false,
  error,
  size = 'medium',
  isSearchable = false,
  maxHeight = 300,
  renderOption
}) => {
  const { theme, isDarkMode } = useTheme();
  const [isOpen, setIsOpen] = useState(false);
  const [searchValue, setSearchValue] = useState('');
  const [focusedIndex, setFocusedIndex] = useState(-1);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const optionsRef = useRef<HTMLDivElement>(null);

  // Filter options based on search value
  const filteredOptions = isSearchable
    ? options.filter(option =>
        option.label.toLowerCase().includes(searchValue.toLowerCase()) ||
        option.description?.toLowerCase().includes(searchValue.toLowerCase())
      )
    : options;

  // Group options if group property exists
  const groupedOptions = filteredOptions.reduce((acc, option) => {
    const group = option.group || 'default';
    if (!acc[group]) {
      acc[group] = [];
    }
    acc[group].push(option);
    return acc;
  }, {} as Record<string, DropdownOption[]>);

  // Handle keyboard navigation
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setFocusedIndex(prev => 
          prev < filteredOptions.length - 1 ? prev + 1 : 0
        );
        break;
      case 'ArrowUp':
        e.preventDefault();
        setFocusedIndex(prev => 
          prev > 0 ? prev - 1 : filteredOptions.length - 1
        );
        break;
      case 'Enter':
        e.preventDefault();
        if (focusedIndex >= 0) {
          const selectedOption = filteredOptions[focusedIndex];
          handleSelect(selectedOption);
        }
        break;
      case 'Escape':
        e.preventDefault();
        setIsOpen(false);
        break;
    }
  }, [filteredOptions, focusedIndex]);

  // Handle option selection
  const handleSelect = useCallback((option: DropdownOption) => {
    if (option.disabled) return;

    if (isMulti) {
      const currentValues = Array.isArray(value) ? value : [];
      const newValue = currentValues.includes(option.value)
        ? currentValues.filter(v => v !== option.value)
        : [...currentValues, option.value];
      onChange(newValue);
    } else {
      onChange(option.value);
      setIsOpen(false);
    }
  }, [isMulti, value, onChange]);

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Scroll focused option into view
  useEffect(() => {
    if (focusedIndex >= 0 && optionsRef.current) {
      const focusedElement = optionsRef.current.children[focusedIndex];
      if (focusedElement) {
        focusedElement.scrollIntoView({ block: 'nearest' });
      }
    }
  }, [focusedIndex]);

  return (
    <div
      ref={dropdownRef}
      css={{
        position: 'relative',
        width: '100%',
        zIndex: theme.tokens.zIndices.dropdown
      }}
      role="combobox"
      aria-expanded={isOpen}
      aria-haspopup="listbox"
      aria-controls="dropdown-options"
    >
      <SelectField
        value={value}
        onChange={e => {
          setSearchValue(e.target.value);
          if (!isOpen) setIsOpen(true);
        }}
        onFocus={() => setIsOpen(true)}
        placeholder={placeholder}
        isDisabled={isDisabled || isLoading}
        hasError={!!error}
        size={size}
        css={{
          borderRadius: theme.tokens.radii.small,
          fontSize: theme.tokens.fontSizes.sm,
          transition: 'all 0.2s ease',
          backgroundColor: isDarkMode 
            ? theme.tokens.colors.background.secondary 
            : theme.tokens.colors.background.primary,
          borderColor: error 
            ? theme.tokens.colors.border.error 
            : theme.tokens.colors.border.primary,
          '&:hover': {
            borderColor: theme.tokens.colors.border.hover
          },
          '&:focus-within': {
            borderColor: theme.tokens.colors.border.focus,
            boxShadow: `0 0 0 2px ${theme.tokens.colors.border.focus}`,
            outline: 'none'
          }
        }}
        errorMessage={error}
      >
        {isLoading ? (
          <div css={{ padding: theme.tokens.space.medium }}>
            Loading options...
          </div>
        ) : isOpen && (
          <div
            ref={optionsRef}
            role="listbox"
            id="dropdown-options"
            css={{
              maxHeight,
              overflowY: 'auto',
              boxShadow: theme.tokens.shadows.medium,
              backgroundColor: isDarkMode 
                ? theme.tokens.colors.background.tertiary 
                : theme.tokens.colors.background.secondary,
              borderRadius: theme.tokens.radii.medium
            }}
            onKeyDown={handleKeyDown}
          >
            {Object.entries(groupedOptions).map(([group, groupOptions]) => (
              <div key={group}>
                {group !== 'default' && (
                  <div
                    css={{
                      padding: `${theme.tokens.space.xs} ${theme.tokens.space.sm}`,
                      color: theme.tokens.colors.text.secondary,
                      fontSize: theme.tokens.fontSizes.sm,
                      fontWeight: theme.tokens.fontWeights.medium
                    }}
                  >
                    {group}
                  </div>
                )}
                {groupOptions.map((option, index) => (
                  <div
                    key={option.value}
                    role="option"
                    aria-selected={Array.isArray(value) 
                      ? value.includes(option.value) 
                      : value === option.value}
                    aria-disabled={option.disabled}
                    tabIndex={0}
                    css={{
                      padding: theme.tokens.space.sm,
                      cursor: option.disabled ? 'not-allowed' : 'pointer',
                      backgroundColor: focusedIndex === index 
                        ? theme.tokens.colors.background.interactive 
                        : 'transparent',
                      opacity: option.disabled ? 0.5 : 1,
                      '&:hover': {
                        backgroundColor: !option.disabled && theme.tokens.colors.background.interactive
                      }
                    }}
                    onClick={() => handleSelect(option)}
                  >
                    {renderOption ? renderOption(option) : (
                      <div css={{ display: 'flex', alignItems: 'center', gap: theme.tokens.space.xs }}>
                        {option.icon}
                        <div>
                          <div css={{ fontWeight: theme.tokens.fontWeights.medium }}>
                            {option.label}
                          </div>
                          {option.description && (
                            <div css={{
                              fontSize: theme.tokens.fontSizes.xs,
                              color: theme.tokens.colors.text.secondary
                            }}>
                              {option.description}
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ))}
          </div>
        )}
      </SelectField>
    </div>
  );
});

Dropdown.displayName = 'Dropdown';

export default Dropdown;