import React, { useState, useCallback, useMemo, useRef } from 'react';
import { styled } from '@aws-amplify/ui-react'; // v6.0.0
import { z } from 'zod'; // v3.22.4
import Tooltip from './Tooltip';
import { validateUserInput } from '../../utils/validation';

// Styled components using AWS Amplify UI design patterns
const FormFieldContainer = styled('div', {
  position: 'relative',
  width: '100%',
  minHeight: '4rem',
  marginBottom: '1rem'
});

const Label = styled('label', {
  display: 'block',
  marginBottom: '0.25rem',
  fontSize: '0.875rem',
  fontWeight: '500',
  color: 'var(--amplify-colors-font-primary)',
  userSelect: 'none',

  '& .required': {
    color: 'var(--amplify-colors-red-60)',
    marginLeft: '0.25rem'
  }
});

const Input = styled('input', {
  width: '100%',
  padding: '0.5rem 0.75rem',
  fontSize: '1rem',
  lineHeight: '1.5',
  color: 'var(--amplify-colors-font-primary)',
  backgroundColor: 'var(--amplify-colors-background-primary)',
  border: '1px solid var(--amplify-colors-border-primary)',
  borderRadius: '4px',
  transition: 'all 0.2s ease',

  '&:focus': {
    outline: 'none',
    borderColor: 'var(--amplify-colors-primary-60)',
    boxShadow: '0 0 0 2px var(--amplify-colors-primary-20)'
  },

  '&:disabled': {
    backgroundColor: 'var(--amplify-colors-background-disabled)',
    cursor: 'not-allowed',
    opacity: 0.7
  },

  '&[aria-invalid="true"]': {
    borderColor: 'var(--amplify-colors-red-60)',
    backgroundColor: 'var(--amplify-colors-red-10)'
  }
});

const ErrorText = styled('div', {
  position: 'absolute',
  bottom: '-1.25rem',
  left: 0,
  fontSize: '0.75rem',
  color: 'var(--amplify-colors-red-60)',
  minHeight: '1rem'
});

interface FormFieldProps {
  id: string;
  name: string;
  label: string;
  type: string;
  value: any;
  onChange: (value: any) => void;
  placeholder?: string;
  helpText?: string;
  required?: boolean;
  disabled?: boolean;
  error?: string;
  validationSchema?: z.ZodSchema;
  className?: string;
  autoComplete?: string;
  minLength?: number;
  maxLength?: number;
  pattern?: string;
  readOnly?: boolean;
  'aria-label'?: string;
  'aria-describedby'?: string;
}

const FormField: React.FC<FormFieldProps> = ({
  id,
  name,
  label,
  type,
  value,
  onChange,
  placeholder,
  helpText,
  required = false,
  disabled = false,
  error,
  validationSchema,
  className,
  autoComplete,
  minLength,
  maxLength,
  pattern,
  readOnly,
  'aria-label': ariaLabel,
  'aria-describedby': ariaDescribedBy
}) => {
  const [localError, setLocalError] = useState<string>('');
  const inputRef = useRef<HTMLInputElement>(null);
  const errorId = `${id}-error`;
  const helpTextId = `${id}-help`;

  // Memoize validation schema
  const schema = useMemo(() => {
    return validationSchema || z.any();
  }, [validationSchema]);

  // Debounced validation handler
  const validateInput = useCallback((value: any) => {
    try {
      if (validationSchema) {
        validateUserInput({ [name]: value }, schema);
        setLocalError('');
      }
    } catch (err) {
      if (err instanceof Error) {
        setLocalError(err.message);
      }
    }
  }, [name, schema, validationSchema]);

  // Handle input change with validation
  const handleChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = event.target.value;
    validateInput(newValue);
    onChange(newValue);
  }, [onChange, validateInput]);

  // Handle keyboard interactions
  const handleKeyDown = useCallback((event: React.KeyboardEvent) => {
    if (event.key === 'Enter' && inputRef.current) {
      inputRef.current.blur();
    }
  }, []);

  return (
    <FormFieldContainer className={className}>
      <Label htmlFor={id}>
        {label}
        {required && <span className="required" aria-hidden="true">*</span>}
      </Label>

      <div style={{ position: 'relative' }}>
        <Input
          ref={inputRef}
          id={id}
          name={name}
          type={type}
          value={value}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          disabled={disabled}
          required={required}
          aria-invalid={!!(error || localError)}
          aria-label={ariaLabel || label}
          aria-describedby={`${helpText ? helpTextId : ''} ${error || localError ? errorId : ''} ${ariaDescribedBy || ''}`}
          autoComplete={autoComplete}
          minLength={minLength}
          maxLength={maxLength}
          pattern={pattern}
          readOnly={readOnly}
        />

        {helpText && (
          <Tooltip
            content={helpText}
            position="right"
            delay={200}
          >
            <span
              id={helpTextId}
              role="tooltip"
              style={{
                position: 'absolute',
                right: '0.5rem',
                top: '50%',
                transform: 'translateY(-50%)',
                cursor: 'help'
              }}
            >
              ℹ️
            </span>
          </Tooltip>
        )}
      </div>

      <ErrorText
        id={errorId}
        role="alert"
        aria-live="polite"
      >
        {error || localError}
      </ErrorText>
    </FormFieldContainer>
  );
};

export default FormField;