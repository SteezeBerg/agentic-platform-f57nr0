import React, { useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import Dropdown, { DropdownProps } from '../common/Dropdown';
import { DeploymentEnvironment } from '../../types/deployment';
import { useTheme } from '../../hooks/useTheme';

// Environment configuration with access control and icons
const ENVIRONMENT_OPTIONS = [
  {
    value: 'development',
    label: 'Development',
    icon: '🔧',
    requiredRole: 'developer',
    description: 'For development and testing'
  },
  {
    value: 'staging',
    label: 'Staging',
    icon: '🔍',
    requiredRole: 'powerUser',
    description: 'Pre-production validation'
  },
  {
    value: 'production',
    label: 'Production',
    icon: '🚀',
    requiredRole: 'admin',
    description: 'Live production environment'
  }
] as const;

// Role-based access control matrix
const ENVIRONMENT_ACCESS_MATRIX: Record<string, DeploymentEnvironment[]> = {
  admin: ['development', 'staging', 'production'],
  powerUser: ['development', 'staging'],
  developer: ['development'],
  businessUser: ['development']
};

export interface EnvironmentSelectorProps {
  value: DeploymentEnvironment;
  onChange: (environment: DeploymentEnvironment) => void;
  deploymentType: 'streamlit' | 'slack' | 'aws-react' | 'standalone';
  userRole: 'admin' | 'powerUser' | 'developer' | 'businessUser';
  isLoading?: boolean;
  disabled?: boolean;
  error?: string;
}

const EnvironmentSelector: React.FC<EnvironmentSelectorProps> = ({
  value,
  onChange,
  deploymentType,
  userRole,
  isLoading = false,
  disabled = false,
  error
}) => {
  const { t } = useTranslation();
  const { theme, isDarkMode } = useTheme();

  // Filter available environments based on user role and deployment type
  const availableEnvironments = useMemo(() => {
    const allowedEnvironments = ENVIRONMENT_ACCESS_MATRIX[userRole] || ['development'];
    return ENVIRONMENT_OPTIONS.filter(env => 
      allowedEnvironments.includes(env.value as DeploymentEnvironment)
    );
  }, [userRole]);

  // Custom option renderer with icons and descriptions
  const renderOption = useCallback((option: typeof ENVIRONMENT_OPTIONS[number]) => (
    <div
      css={{
        display: 'flex',
        alignItems: 'center',
        gap: theme.tokens.space.xs,
        padding: theme.tokens.space.xs
      }}
    >
      <span role="img" aria-hidden="true" css={{ fontSize: '1.2em' }}>
        {option.icon}
      </span>
      <div>
        <div css={{ fontWeight: theme.tokens.fontWeights.medium }}>
          {t(`environments.${option.value}.label`)}
        </div>
        <div
          css={{
            fontSize: theme.tokens.fontSizes.xs,
            color: theme.tokens.colors.text.secondary
          }}
        >
          {t(`environments.${option.value}.description`)}
        </div>
      </div>
    </div>
  ), [t, theme]);

  // Handle environment change with validation
  const handleEnvironmentChange = useCallback((newValue: string) => {
    const newEnvironment = newValue as DeploymentEnvironment;
    const allowedEnvironments = ENVIRONMENT_ACCESS_MATRIX[userRole];
    
    if (allowedEnvironments?.includes(newEnvironment)) {
      onChange(newEnvironment);
    }
  }, [onChange, userRole]);

  return (
    <div
      css={{
        width: '100%',
        maxWidth: '300px',
        position: 'relative'
      }}
    >
      <Dropdown
        options={availableEnvironments.map(env => ({
          value: env.value,
          label: t(`environments.${env.value}.label`),
          icon: env.icon,
          description: t(`environments.${env.value}.description`),
          disabled: disabled || !ENVIRONMENT_ACCESS_MATRIX[userRole]?.includes(env.value as DeploymentEnvironment)
        }))}
        value={value}
        onChange={handleEnvironmentChange}
        isLoading={isLoading}
        isDisabled={disabled}
        error={error}
        placeholder={t('environments.select')}
        renderOption={renderOption}
        size="medium"
        isSearchable={false}
        css={{
          '[data-amplify-select]': {
            backgroundColor: isDarkMode 
              ? theme.tokens.colors.background.secondary 
              : theme.tokens.colors.background.primary,
            borderColor: error 
              ? theme.tokens.colors.border.error 
              : theme.tokens.colors.border.primary
          },
          '&:focus-within': {
            '[data-amplify-select]': {
              borderColor: theme.tokens.colors.border.focus,
              boxShadow: `0 0 0 2px ${theme.tokens.colors.border.focus}`,
              outline: 'none'
            }
          }
        }}
      />
      {error && (
        <div
          css={{
            color: theme.tokens.colors.text.error,
            fontSize: theme.tokens.fontSizes.xs,
            marginTop: theme.tokens.space.xs
          }}
          role="alert"
        >
          {error}
        </div>
      )}
    </div>
  );
};

export default EnvironmentSelector;