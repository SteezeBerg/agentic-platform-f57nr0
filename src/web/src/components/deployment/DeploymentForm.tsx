import React, { useState, useEffect, useCallback } from 'react';
import { styled, Button, Alert, Select, TextField, Heading } from '@aws-amplify/ui-react'; // v6.0.0
import { z } from 'zod'; // v3.22.4

import { FormField } from '../common/FormField';
import {
  DeploymentConfig,
  DeploymentEnvironment,
  DeploymentType,
  BlueGreenConfig,
  HealthCheckConfig,
  ResourceConfig
} from '../../types/deployment';
import { useDeployment } from '../../hooks/useDeployment';

// Styled components using AWS Amplify UI design patterns
const FormContainer = styled('div', {
  padding: '1.5rem',
  backgroundColor: 'var(--amplify-colors-background-secondary)',
  borderRadius: 'var(--amplify-radii-medium)',
  maxWidth: '800px',
  margin: '0 auto'
});

const SectionContainer = styled('div', {
  marginBottom: '1.5rem',
  padding: '1rem',
  borderLeft: '4px solid var(--amplify-colors-border-primary)'
});

const ButtonGroup = styled('div', {
  display: 'flex',
  justifyContent: 'flex-end',
  gap: '0.5rem',
  marginTop: '2rem'
});

const ValidationError = styled('div', {
  color: 'var(--amplify-colors-red-60)',
  marginTop: '0.25rem',
  fontSize: '0.875rem'
});

// Validation schemas
const resourceSchema = z.object({
  cpu: z.string().regex(/^\d+(\.\d+)?$/).refine(val => parseFloat(val) >= 0.25 && parseFloat(val) <= 4),
  memory: z.string().regex(/^\d+$/).refine(val => parseInt(val) >= 512 && parseInt(val) <= 8192)
});

const healthCheckSchema = z.object({
  path: z.string().startsWith('/'),
  interval: z.number().min(10).max(300),
  timeout: z.number().min(5).max(60),
  healthy_threshold: z.number().min(2).max(10),
  unhealthy_threshold: z.number().min(2).max(10)
});

interface DeploymentFormProps {
  agentId: string;
  onSubmit: (config: DeploymentConfig) => Promise<void>;
  onCancel?: () => void;
  initialValues?: DeploymentConfig;
  isProduction?: boolean;
  onValidationError?: (errors: string[]) => void;
  onResourceEstimate?: (estimate: ResourceConfig) => void;
}

export const DeploymentForm: React.FC<DeploymentFormProps> = ({
  agentId,
  onSubmit,
  onCancel,
  initialValues,
  isProduction = false,
  onValidationError,
  onResourceEstimate
}) => {
  // State management
  const [config, setConfig] = useState<DeploymentConfig>(() => ({
    deployment_type: initialValues?.deployment_type || 'ecs',
    environment: initialValues?.environment || 'development',
    strategy: initialValues?.strategy || 'blue_green',
    scaling: initialValues?.scaling || {
      min_instances: 1,
      max_instances: 3,
      target_cpu_utilization: 70
    },
    health_check: initialValues?.health_check || {
      path: '/health',
      interval: 30,
      timeout: 10,
      healthy_threshold: 2,
      unhealthy_threshold: 3
    },
    rollback: initialValues?.rollback || {
      enabled: isProduction,
      automatic: true,
      threshold: 25
    },
    environment_variables: initialValues?.environment_variables || {},
    resources: initialValues?.resources || {
      cpu: '1',
      memory: '2048'
    }
  }));

  const [errors, setErrors] = useState<string[]>([]);
  const { createDeployment, validateDeployment, estimateResources } = useDeployment();

  // Validate environment-specific configuration
  const validateEnvironmentConfig = useCallback(() => {
    const validationErrors: string[] = [];

    if (isProduction) {
      if (!config.rollback.enabled) {
        validationErrors.push('Rollback must be enabled for production deployments');
      }
      if (config.scaling.min_instances < 2) {
        validationErrors.push('Production requires minimum 2 instances for high availability');
      }
    }

    try {
      resourceSchema.parse(config.resources);
      healthCheckSchema.parse(config.health_check);
    } catch (error) {
      if (error instanceof z.ZodError) {
        validationErrors.push(...error.errors.map(e => e.message));
      }
    }

    return validationErrors;
  }, [config, isProduction]);

  // Handle form submission
  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    const validationErrors = validateEnvironmentConfig();

    if (validationErrors.length > 0) {
      setErrors(validationErrors);
      onValidationError?.(validationErrors);
      return;
    }

    try {
      // Validate deployment configuration
      const validationResult = await validateDeployment(config);
      if (!validationResult.isValid) {
        setErrors(validationResult.errors);
        onValidationError?.(validationResult.errors);
        return;
      }

      // Estimate resource requirements
      const resourceEstimate = await estimateResources(config);
      onResourceEstimate?.(resourceEstimate);

      // Create deployment
      await createDeployment(agentId, config);
      await onSubmit(config);
    } catch (error) {
      setErrors([error instanceof Error ? error.message : 'Failed to create deployment']);
    }
  };

  // Update resource estimates when configuration changes
  useEffect(() => {
    const updateEstimates = async () => {
      try {
        const estimate = await estimateResources(config);
        onResourceEstimate?.(estimate);
      } catch (error) {
        console.error('Failed to estimate resources:', error);
      }
    };

    updateEstimates();
  }, [config, estimateResources, onResourceEstimate]);

  return (
    <FormContainer>
      <form onSubmit={handleSubmit}>
        <Heading level={2}>Deployment Configuration</Heading>

        {errors.length > 0 && (
          <Alert variation="error" marginBottom="1rem">
            {errors.map((error, index) => (
              <div key={index}>{error}</div>
            ))}
          </Alert>
        )}

        <SectionContainer>
          <Heading level={3}>Environment Settings</Heading>
          <FormField
            id="deployment-type"
            label="Deployment Type"
            type="select"
            value={config.deployment_type}
            onChange={(value) => setConfig(prev => ({ ...prev, deployment_type: value as DeploymentType }))}
            required
          >
            <Select.Option value="ecs">ECS</Select.Option>
            <Select.Option value="lambda">Lambda</Select.Option>
            <Select.Option value="streamlit">Streamlit</Select.Option>
            <Select.Option value="slack">Slack</Select.Option>
          </FormField>

          <FormField
            id="environment"
            label="Environment"
            type="select"
            value={config.environment}
            onChange={(value) => setConfig(prev => ({ ...prev, environment: value as DeploymentEnvironment }))}
            required
          >
            <Select.Option value="development">Development</Select.Option>
            <Select.Option value="staging">Staging</Select.Option>
            <Select.Option value="production">Production</Select.Option>
          </FormField>
        </SectionContainer>

        <SectionContainer>
          <Heading level={3}>Resource Configuration</Heading>
          <FormField
            id="cpu"
            label="CPU Units"
            type="text"
            value={config.resources.cpu}
            onChange={(value) => setConfig(prev => ({
              ...prev,
              resources: { ...prev.resources, cpu: value }
            }))}
            required
            helpText="CPU units (0.25 to 4)"
          />

          <FormField
            id="memory"
            label="Memory (MB)"
            type="text"
            value={config.resources.memory}
            onChange={(value) => setConfig(prev => ({
              ...prev,
              resources: { ...prev.resources, memory: value }
            }))}
            required
            helpText="Memory in MB (512 to 8192)"
          />
        </SectionContainer>

        <SectionContainer>
          <Heading level={3}>Scaling Configuration</Heading>
          <FormField
            id="min-instances"
            label="Minimum Instances"
            type="number"
            value={config.scaling.min_instances}
            onChange={(value) => setConfig(prev => ({
              ...prev,
              scaling: { ...prev.scaling, min_instances: parseInt(value) }
            }))}
            required
            min={isProduction ? 2 : 1}
          />

          <FormField
            id="max-instances"
            label="Maximum Instances"
            type="number"
            value={config.scaling.max_instances}
            onChange={(value) => setConfig(prev => ({
              ...prev,
              scaling: { ...prev.scaling, max_instances: parseInt(value) }
            }))}
            required
            min={config.scaling.min_instances}
          />
        </SectionContainer>

        <SectionContainer>
          <Heading level={3}>Health Check Configuration</Heading>
          <FormField
            id="health-check-path"
            label="Health Check Path"
            type="text"
            value={config.health_check.path}
            onChange={(value) => setConfig(prev => ({
              ...prev,
              health_check: { ...prev.health_check, path: value }
            }))}
            required
          />

          <FormField
            id="health-check-interval"
            label="Check Interval (seconds)"
            type="number"
            value={config.health_check.interval}
            onChange={(value) => setConfig(prev => ({
              ...prev,
              health_check: { ...prev.health_check, interval: parseInt(value) }
            }))}
            required
            min={10}
            max={300}
          />
        </SectionContainer>

        <SectionContainer>
          <Heading level={3}>Rollback Configuration</Heading>
          <FormField
            id="rollback-enabled"
            label="Enable Rollback"
            type="checkbox"
            value={config.rollback.enabled}
            onChange={(value) => setConfig(prev => ({
              ...prev,
              rollback: { ...prev.rollback, enabled: value }
            }))}
            disabled={isProduction}
            checked={isProduction || config.rollback.enabled}
          />

          {config.rollback.enabled && (
            <FormField
              id="rollback-threshold"
              label="Rollback Threshold (%)"
              type="number"
              value={config.rollback.threshold}
              onChange={(value) => setConfig(prev => ({
                ...prev,
                rollback: { ...prev.rollback, threshold: parseInt(value) }
              }))}
              required
              min={0}
              max={100}
            />
          )}
        </SectionContainer>

        <ButtonGroup>
          {onCancel && (
            <Button
              onClick={onCancel}
              variation="secondary"
            >
              Cancel
            </Button>
          )}
          <Button
            type="submit"
            variation="primary"
          >
            Deploy
          </Button>
        </ButtonGroup>
      </form>
    </FormContainer>
  );
};

export default DeploymentForm;