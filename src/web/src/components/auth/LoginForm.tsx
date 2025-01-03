import React, { useState, useCallback, useEffect, useRef } from 'react';
import { styled } from '@aws-amplify/ui-react'; // v6.0.0
import { z } from 'zod'; // v3.22.4
import { useAuth } from '../../hooks/useAuth';
import Button from '../common/Button';
import FormField from '../common/FormField';
import { isValidEmail, isValidPassword } from '../../utils/validation';
import { UI_CONSTANTS } from '../../config/constants';

// Styled components with WCAG 2.1 Level AA compliance
const FormContainer = styled('form', {
  width: '100%',
  maxWidth: '400px',
  padding: '2rem',
  backgroundColor: 'var(--amplify-colors-background-primary)',
  borderRadius: UI_CONSTANTS.MINIMUM_TARGET_SIZE / 4,
  boxShadow: 'var(--amplify-shadows-medium)',
  '@media (prefers-reduced-motion: reduce)': {
    transition: 'none',
  },
});

const FormTitle = styled('h1', {
  fontSize: '1.5rem',
  fontWeight: '600',
  marginBottom: '1.5rem',
  color: 'var(--amplify-colors-font-primary)',
  textAlign: 'center',
});

const RememberMeContainer = styled('div', {
  display: 'flex',
  alignItems: 'center',
  gap: '0.5rem',
  marginBottom: '1rem',
});

const ErrorMessage = styled('div', {
  color: 'var(--amplify-colors-red-60)',
  fontSize: '0.875rem',
  marginBottom: '1rem',
  padding: '0.5rem',
  borderRadius: '4px',
  backgroundColor: 'var(--amplify-colors-red-10)',
  display: 'flex',
  alignItems: 'center',
  gap: '0.5rem',
});

// Login form validation schema
const loginSchema = z.object({
  email: z.string()
    .email('Please enter a valid email address')
    .refine(isValidEmail, 'Invalid email format'),
  password: z.string()
    .min(12, 'Password must be at least 12 characters')
    .refine(isValidPassword, 'Password does not meet security requirements'),
  rememberMe: z.boolean().optional()
});

type LoginFormData = z.infer<typeof loginSchema>;

interface LoginFormProps {
  onSuccess: () => void;
  onSecurityEvent?: (event: { type: string; details: Record<string, unknown> }) => void;
}

const LoginForm: React.FC<LoginFormProps> = ({ onSuccess, onSecurityEvent }) => {
  const { login, isLoading, error: authError } = useAuth();
  const [formData, setFormData] = useState<LoginFormData>({
    email: '',
    password: '',
    rememberMe: false
  });
  const [error, setError] = useState<string>('');
  const formRef = useRef<HTMLFormElement>(null);
  const submitAttempts = useRef(0);
  const lastSubmitTime = useRef<number>(0);

  // Reset error when form data changes
  useEffect(() => {
    setError('');
  }, [formData]);

  // Security monitoring for rapid submit attempts
  useEffect(() => {
    const RESET_INTERVAL = 300000; // 5 minutes
    const resetTimer = setInterval(() => {
      submitAttempts.current = 0;
    }, RESET_INTERVAL);

    return () => clearInterval(resetTimer);
  }, []);

  const handleInputChange = useCallback((field: keyof LoginFormData) => (
    value: string | boolean
  ) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  }, []);

  const validateForm = useCallback(async (): Promise<boolean> => {
    try {
      await loginSchema.parseAsync(formData);
      return true;
    } catch (err) {
      if (err instanceof z.ZodError) {
        setError(err.errors[0].message);
      }
      return false;
    }
  }, [formData]);

  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();

    // Rate limiting check
    const now = Date.now();
    if (now - lastSubmitTime.current < 1000) { // 1 second cooldown
      setError('Please wait before trying again');
      onSecurityEvent?.({
        type: 'RATE_LIMIT_EXCEEDED',
        details: { timestamp: now }
      });
      return;
    }

    // Track submission attempts
    submitAttempts.current += 1;
    if (submitAttempts.current > 5) {
      setError('Too many login attempts. Please try again later.');
      onSecurityEvent?.({
        type: 'MAX_ATTEMPTS_EXCEEDED',
        details: { attempts: submitAttempts.current }
      });
      return;
    }

    lastSubmitTime.current = now;

    // Validate form
    const isValid = await validateForm();
    if (!isValid) return;

    try {
      await login({
        email: formData.email,
        password: formData.password
      });
      
      onSecurityEvent?.({
        type: 'LOGIN_SUCCESS',
        details: { email: formData.email }
      });
      
      onSuccess();
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Login failed';
      setError(errorMessage);
      
      onSecurityEvent?.({
        type: 'LOGIN_FAILURE',
        details: { error: errorMessage }
      });
    }
  }, [formData, login, onSuccess, onSecurityEvent, validateForm]);

  return (
    <FormContainer
      ref={formRef}
      onSubmit={handleSubmit}
      aria-labelledby="login-title"
      noValidate
    >
      <FormTitle id="login-title">Sign In</FormTitle>

      {(error || authError) && (
        <ErrorMessage role="alert" aria-live="polite">
          <span aria-hidden="true">⚠️</span>
          {error || authError}
        </ErrorMessage>
      )}

      <FormField
        id="email"
        name="email"
        label="Email"
        type="email"
        value={formData.email}
        onChange={handleInputChange('email')}
        required
        autoComplete="email"
        aria-describedby="email-error"
        validationSchema={loginSchema.shape.email}
      />

      <FormField
        id="password"
        name="password"
        label="Password"
        type="password"
        value={formData.password}
        onChange={handleInputChange('password')}
        required
        autoComplete="current-password"
        aria-describedby="password-error"
        validationSchema={loginSchema.shape.password}
      />

      <RememberMeContainer>
        <input
          type="checkbox"
          id="rememberMe"
          checked={formData.rememberMe}
          onChange={(e) => handleInputChange('rememberMe')(e.target.checked)}
          aria-label="Remember me"
        />
        <label htmlFor="rememberMe">Remember me</label>
      </RememberMeContainer>

      <Button
        type="submit"
        isLoading={isLoading}
        isFullWidth
        disabled={isLoading}
        aria-label="Sign in to your account"
      >
        Sign In
      </Button>
    </FormContainer>
  );
};

export default LoginForm;