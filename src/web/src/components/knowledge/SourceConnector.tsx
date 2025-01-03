import React, { useState, useCallback, useEffect, useRef } from 'react';
import { 
  View, 
  Heading, 
  SelectField, 
  TextField, 
  Button, 
  Alert,
  Flex,
  Badge,
  Text,
  Divider
} from '@aws-amplify/ui-react';
import { z } from 'zod';
import { useAnalytics } from '@aws-amplify/analytics';

import {
  KnowledgeSource,
  KnowledgeSourceType,
  KnowledgeSourceStatus,
  CreateKnowledgeSourceRequest,
  IndexingStrategy,
  ConnectionSecurity,
  MonitoringConfig
} from '../../types/knowledge';
import { knowledgeService } from '../../services/knowledge';
import ErrorBoundary from '../common/ErrorBoundary';
import { useNotification, NotificationType } from '../../hooks/useNotification';

// Validation schema for source configuration
const sourceConfigSchema = z.object({
  name: z.string().min(1).max(100),
  source_type: z.nativeEnum(KnowledgeSourceType),
  connection_config: z.record(z.unknown()),
  indexing_strategy: z.nativeEnum(IndexingStrategy)
});

// Component props interface
interface SourceConnectorProps {
  initialSource?: KnowledgeSource;
  onSourceCreated: (source: KnowledgeSource) => void;
  onSourceUpdated: (source: KnowledgeSource) => void;
  isEditing?: boolean;
  securityConfig: ConnectionSecurity;
  monitoringConfig: MonitoringConfig;
  onError: (error: Error) => void;
  onSecurityValidation: (isValid: boolean) => void;
  onHealthCheck: (status: KnowledgeSourceStatus) => void;
}

// Styled components
const ConnectorContainer = {
  padding: 'var(--amplify-space-large)',
  borderRadius: 'var(--amplify-radii-medium)',
  border: '1px solid var(--amplify-colors-border-primary)',
  backgroundColor: 'var(--amplify-colors-background-secondary)',
  maxWidth: '800px',
  margin: '0 auto'
};

const FormSection = {
  marginBottom: 'var(--amplify-space-medium)'
};

const SecuritySection = {
  backgroundColor: 'var(--amplify-colors-background-warning)',
  padding: 'var(--amplify-space-medium)',
  borderRadius: 'var(--amplify-radii-small)',
  marginTop: 'var(--amplify-space-medium)'
};

/**
 * Enterprise-grade knowledge source connector component with comprehensive security,
 * accessibility, and monitoring capabilities.
 */
const SourceConnector: React.FC<SourceConnectorProps> = ({
  initialSource,
  onSourceCreated,
  onSourceUpdated,
  isEditing = false,
  securityConfig,
  monitoringConfig,
  onError,
  onSecurityValidation,
  onHealthCheck
}) => {
  // State management
  const [formData, setFormData] = useState<Partial<CreateKnowledgeSourceRequest>>({
    name: initialSource?.name || '',
    source_type: initialSource?.source_type || KnowledgeSourceType.CONFLUENCE,
    indexing_strategy: initialSource?.indexing_strategy || IndexingStrategy.INCREMENTAL,
    connection_config: initialSource?.connection_config || {}
  });
  const [isValidating, setIsValidating] = useState(false);
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});
  const [healthStatus, setHealthStatus] = useState<KnowledgeSourceStatus>(
    initialSource?.status || KnowledgeSourceStatus.DISCONNECTED
  );

  // Hooks
  const { showNotification } = useNotification();
  const analytics = useAnalytics();
  const validationTimeoutRef = useRef<NodeJS.Timeout>();

  // Analytics tracking
  useEffect(() => {
    analytics.record({
      name: 'SourceConnectorView',
      attributes: {
        isEditing,
        sourceType: formData.source_type
      }
    });
  }, [isEditing, formData.source_type, analytics]);

  // Security validation
  const validateSecurity = useCallback(async () => {
    try {
      setIsValidating(true);
      const isValid = await knowledgeService.validateSourceSecurity({
        source_type: formData.source_type!,
        connection_config: formData.connection_config,
        security_config: securityConfig
      });
      onSecurityValidation(isValid);
      return isValid;
    } catch (error) {
      onError(error as Error);
      return false;
    } finally {
      setIsValidating(false);
    }
  }, [formData, securityConfig, onSecurityValidation, onError]);

  // Health monitoring
  const checkSourceHealth = useCallback(async () => {
    try {
      const status = await knowledgeService.monitorSourceHealth({
        source_type: formData.source_type!,
        connection_config: formData.connection_config,
        monitoring_config: monitoringConfig
      });
      setHealthStatus(status);
      onHealthCheck(status);
    } catch (error) {
      onError(error as Error);
    }
  }, [formData, monitoringConfig, onHealthCheck, onError]);

  // Form validation with debounce
  const validateForm = useCallback(() => {
    try {
      sourceConfigSchema.parse(formData);
      setValidationErrors({});
      return true;
    } catch (error) {
      if (error instanceof z.ZodError) {
        const errors: Record<string, string> = {};
        error.errors.forEach(err => {
          errors[err.path.join('.')] = err.message;
        });
        setValidationErrors(errors);
      }
      return false;
    }
  }, [formData]);

  // Handle form changes with validation
  const handleInputChange = useCallback((field: string, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    
    if (validationTimeoutRef.current) {
      clearTimeout(validationTimeoutRef.current);
    }
    
    validationTimeoutRef.current = setTimeout(() => {
      validateForm();
      validateSecurity();
    }, 500);
  }, [validateForm, validateSecurity]);

  // Form submission handler
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      if (!validateForm()) {
        showNotification({
          message: 'Please correct the validation errors before submitting.',
          type: NotificationType.ERROR
        });
        return;
      }

      const isSecure = await validateSecurity();
      if (!isSecure) {
        showNotification({
          message: 'Security validation failed. Please check your configuration.',
          type: NotificationType.ERROR
        });
        return;
      }

      setIsValidating(true);
      const sourceData = formData as CreateKnowledgeSourceRequest;

      const result = isEditing
        ? await knowledgeService.updateKnowledgeSource(initialSource!.id, sourceData)
        : await knowledgeService.createKnowledgeSource(sourceData);

      await checkSourceHealth();

      showNotification({
        message: `Knowledge source ${isEditing ? 'updated' : 'created'} successfully.`,
        type: NotificationType.SUCCESS
      });

      if (isEditing) {
        onSourceUpdated(result);
      } else {
        onSourceCreated(result);
      }

      analytics.record({
        name: isEditing ? 'SourceUpdated' : 'SourceCreated',
        attributes: {
          sourceType: result.source_type,
          status: result.status
        }
      });

    } catch (error) {
      onError(error as Error);
      showNotification({
        message: `Failed to ${isEditing ? 'update' : 'create'} knowledge source.`,
        type: NotificationType.ERROR
      });
    } finally {
      setIsValidating(false);
    }
  };

  return (
    <ErrorBoundary>
      <View as="section" style={ConnectorContainer}>
        <Heading level={2} isTruncated>
          {isEditing ? 'Edit Knowledge Source' : 'Add Knowledge Source'}
        </Heading>
        
        <form onSubmit={handleSubmit} aria-label="Knowledge source configuration form">
          <View style={FormSection}>
            <TextField
              label="Source Name"
              value={formData.name}
              onChange={e => handleInputChange('name', e.target.value)}
              required
              errorMessage={validationErrors.name}
              isInvalid={!!validationErrors.name}
              placeholder="Enter source name"
              maxLength={100}
              aria-label="Source name input"
            />
          </View>

          <View style={FormSection}>
            <SelectField
              label="Source Type"
              value={formData.source_type}
              onChange={e => handleInputChange('source_type', e.target.value)}
              required
              errorMessage={validationErrors.source_type}
              isInvalid={!!validationErrors.source_type}
              aria-label="Source type selection"
            >
              {Object.values(KnowledgeSourceType).map(type => (
                <option key={type} value={type}>
                  {type.replace('_', ' ')}
                </option>
              ))}
            </SelectField>
          </View>

          <View style={SecuritySection}>
            <Heading level={4}>Security Configuration</Heading>
            <Badge variation={isValidating ? 'info' : healthStatus === KnowledgeSourceStatus.CONNECTED ? 'success' : 'warning'}>
              {isValidating ? 'Validating...' : healthStatus}
            </Badge>
          </View>

          <View style={FormSection}>
            <SelectField
              label="Indexing Strategy"
              value={formData.indexing_strategy}
              onChange={e => handleInputChange('indexing_strategy', e.target.value)}
              required
              errorMessage={validationErrors.indexing_strategy}
              isInvalid={!!validationErrors.indexing_strategy}
              aria-label="Indexing strategy selection"
            >
              {Object.values(IndexingStrategy).map(strategy => (
                <option key={strategy} value={strategy}>
                  {strategy.replace('_', ' ')}
                </option>
              ))}
            </SelectField>
          </View>

          <Divider />

          <Flex justifyContent="space-between" alignItems="center" marginTop="medium">
            <Button
              type="button"
              onClick={() => validateSecurity()}
              isLoading={isValidating}
              variation="link"
              aria-label="Validate security configuration"
            >
              Validate Security
            </Button>
            
            <Button
              type="submit"
              isLoading={isValidating}
              variation="primary"
              isDisabled={Object.keys(validationErrors).length > 0}
              aria-label={isEditing ? 'Update knowledge source' : 'Create knowledge source'}
            >
              {isEditing ? 'Update Source' : 'Create Source'}
            </Button>
          </Flex>
        </form>
      </View>
    </ErrorBoundary>
  );
};

export default SourceConnector;