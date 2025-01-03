import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import { axe, toHaveNoViolations } from 'jest-axe';
import LoginForm from '../../../src/components/auth/LoginForm';
import { useAuth } from '../../../src/hooks/useAuth';
import { UI_CONSTANTS } from '../../../src/config/constants';

// Add jest-axe matchers
expect.extend(toHaveNoViolations);

// Mock useAuth hook
jest.mock('../../../src/hooks/useAuth');

// Mock success callback
const mockOnSuccess = jest.fn();
const mockOnSecurityEvent = jest.fn();

// Helper to create a mock store
const createMockStore = (initialState = {}) => {
  return configureStore({
    reducer: {
      auth: (state = initialState) => state,
    },
  });
};

// Helper to render component with all required providers
const renderLoginForm = (props = {}) => {
  const store = createMockStore({});
  return render(
    <Provider store={store}>
      <LoginForm onSuccess={mockOnSuccess} onSecurityEvent={mockOnSecurityEvent} {...props} />
    </Provider>
  );
};

describe('LoginForm Component', () => {
  let mockLogin: jest.Mock;
  
  beforeEach(() => {
    mockLogin = jest.fn();
    (useAuth as jest.Mock).mockReturnValue({
      login: mockLogin,
      isLoading: false,
      error: null
    });
    mockOnSuccess.mockClear();
    mockOnSecurityEvent.mockClear();
  });

  describe('Rendering and Accessibility', () => {
    it('should render all form elements with proper accessibility attributes', () => {
      renderLoginForm();

      // Check form elements presence
      expect(screen.getByRole('form')).toHaveAttribute('aria-labelledby', 'login-title');
      expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/password/i)).toBeInTheDocument();
      expect(screen.getByRole('checkbox', { name: /remember me/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /sign in/i })).toBeInTheDocument();

      // Verify ARIA attributes
      expect(screen.getByLabelText(/email/i)).toHaveAttribute('aria-describedby');
      expect(screen.getByLabelText(/password/i)).toHaveAttribute('aria-describedby');
    });

    it('should have no accessibility violations', async () => {
      const { container } = renderLoginForm();
      const results = await axe(container);
      expect(results).toHaveNoViolations();
    });

    it('should maintain focus management', async () => {
      renderLoginForm();
      const emailInput = screen.getByLabelText(/email/i);
      const passwordInput = screen.getByLabelText(/password/i);
      const submitButton = screen.getByRole('button', { name: /sign in/i });

      // Test tab order
      emailInput.focus();
      expect(document.activeElement).toBe(emailInput);
      userEvent.tab();
      expect(document.activeElement).toBe(passwordInput);
      userEvent.tab();
      expect(document.activeElement).toBe(screen.getByRole('checkbox', { name: /remember me/i }));
      userEvent.tab();
      expect(document.activeElement).toBe(submitButton);
    });
  });

  describe('Form Validation', () => {
    it('should validate email format', async () => {
      renderLoginForm();
      const emailInput = screen.getByLabelText(/email/i);

      await userEvent.type(emailInput, 'invalid-email');
      fireEvent.blur(emailInput);

      expect(await screen.findByRole('alert')).toHaveTextContent(/invalid email format/i);
    });

    it('should validate password requirements', async () => {
      renderLoginForm();
      const passwordInput = screen.getByLabelText(/password/i);

      await userEvent.type(passwordInput, 'short');
      fireEvent.blur(passwordInput);

      expect(await screen.findByRole('alert')).toHaveTextContent(/password must be at least 12 characters/i);
    });

    it('should show all validation errors on submit', async () => {
      renderLoginForm();
      const submitButton = screen.getByRole('button', { name: /sign in/i });

      fireEvent.click(submitButton);

      const alerts = await screen.findAllByRole('alert');
      expect(alerts).toHaveLength(2); // Email and password errors
    });
  });

  describe('Authentication Flow', () => {
    const validCredentials = {
      email: 'test@example.com',
      password: 'SecurePassword123!'
    };

    it('should handle successful login', async () => {
      mockLogin.mockResolvedValueOnce({});
      renderLoginForm();

      await userEvent.type(screen.getByLabelText(/email/i), validCredentials.email);
      await userEvent.type(screen.getByLabelText(/password/i), validCredentials.password);
      fireEvent.click(screen.getByRole('button', { name: /sign in/i }));

      await waitFor(() => {
        expect(mockLogin).toHaveBeenCalledWith(validCredentials);
        expect(mockOnSuccess).toHaveBeenCalled();
        expect(mockOnSecurityEvent).toHaveBeenCalledWith({
          type: 'LOGIN_SUCCESS',
          details: { email: validCredentials.email }
        });
      });
    });

    it('should handle login failure', async () => {
      const errorMessage = 'Invalid credentials';
      mockLogin.mockRejectedValueOnce(new Error(errorMessage));
      renderLoginForm();

      await userEvent.type(screen.getByLabelText(/email/i), validCredentials.email);
      await userEvent.type(screen.getByLabelText(/password/i), validCredentials.password);
      fireEvent.click(screen.getByRole('button', { name: /sign in/i }));

      await waitFor(() => {
        expect(screen.getByRole('alert')).toHaveTextContent(errorMessage);
        expect(mockOnSecurityEvent).toHaveBeenCalledWith({
          type: 'LOGIN_FAILURE',
          details: { error: errorMessage }
        });
      });
    });

    it('should handle loading state', async () => {
      (useAuth as jest.Mock).mockReturnValue({
        login: mockLogin,
        isLoading: true,
        error: null
      });
      renderLoginForm();

      const submitButton = screen.getByRole('button', { name: /sign in/i });
      expect(submitButton).toBeDisabled();
      expect(submitButton).toHaveAttribute('aria-busy', 'true');
    });
  });

  describe('Security Features', () => {
    it('should implement rate limiting', async () => {
      renderLoginForm();
      const submitButton = screen.getByRole('button', { name: /sign in/i });

      // Trigger multiple rapid submissions
      for (let i = 0; i < 3; i++) {
        fireEvent.click(submitButton);
      }

      await waitFor(() => {
        expect(screen.getByRole('alert')).toHaveTextContent(/please wait before trying again/i);
        expect(mockOnSecurityEvent).toHaveBeenCalledWith({
          type: 'RATE_LIMIT_EXCEEDED',
          details: expect.any(Object)
        });
      });
    });

    it('should handle maximum attempts', async () => {
      renderLoginForm();
      const submitButton = screen.getByRole('button', { name: /sign in/i });

      // Trigger more than maximum allowed attempts
      for (let i = 0; i < 6; i++) {
        await waitFor(() => {
          fireEvent.click(submitButton);
        });
      }

      expect(screen.getByRole('alert')).toHaveTextContent(/too many login attempts/i);
      expect(mockOnSecurityEvent).toHaveBeenCalledWith({
        type: 'MAX_ATTEMPTS_EXCEEDED',
        details: { attempts: 6 }
      });
    });
  });
});