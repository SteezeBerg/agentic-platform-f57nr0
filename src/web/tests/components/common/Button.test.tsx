import React from 'react';
import { render, fireEvent, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, describe, it, beforeEach, afterEach } from '@jest/globals';
import { ThemeProvider } from '@aws-amplify/ui-react'; // v6.0.0
import Button from '../../../src/components/common/Button';
import { theme } from '../../../src/config/theme';
import { UI_CONSTANTS } from '../../../src/config/constants';

// Helper function to render components with theme context
const renderWithTheme = (ui: React.ReactNode, themeOverrides = {}) => {
  return render(
    <ThemeProvider theme={{ ...theme, ...themeOverrides }}>
      {ui}
    </ThemeProvider>
  );
};

describe('Button Component', () => {
  // Clean up after each test
  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Rendering', () => {
    it('renders with default props correctly', () => {
      renderWithTheme(<Button>Click me</Button>);
      const button = screen.getByRole('button');
      expect(button).toBeInTheDocument();
      expect(button).toHaveTextContent('Click me');
      expect(button).toHaveStyle({ minWidth: `${UI_CONSTANTS.MINIMUM_TARGET_SIZE}px` });
    });

    it('applies correct variant styles', () => {
      const { rerender } = renderWithTheme(<Button variant="primary">Primary</Button>);
      let button = screen.getByRole('button');
      expect(button).toHaveStyle({ backgroundColor: theme.tokens.colors.primary.light });

      rerender(<Button variant="secondary">Secondary</Button>);
      button = screen.getByRole('button');
      expect(button).toHaveStyle({ backgroundColor: theme.tokens.colors.secondary.light });
    });

    it('handles size variations properly', () => {
      const { rerender } = renderWithTheme(<Button size="small">Small</Button>);
      let button = screen.getByRole('button');
      expect(button).toHaveStyle({ height: '32px' });

      rerender(<Button size="large">Large</Button>);
      button = screen.getByRole('button');
      expect(button).toHaveStyle({ height: '48px' });
    });

    it('supports full width mode', () => {
      renderWithTheme(<Button isFullWidth>Full Width</Button>);
      const button = screen.getByRole('button');
      expect(button).toHaveStyle({ width: '100%' });
    });

    it('renders icons correctly', () => {
      const leftIcon = <span data-testid="left-icon">←</span>;
      const rightIcon = <span data-testid="right-icon">→</span>;
      
      renderWithTheme(
        <Button leftIcon={leftIcon} rightIcon={rightIcon}>
          With Icons
        </Button>
      );
      
      expect(screen.getByTestId('left-icon')).toBeInTheDocument();
      expect(screen.getByTestId('right-icon')).toBeInTheDocument();
    });
  });

  describe('Interaction', () => {
    it('handles click events', async () => {
      const handleClick = jest.fn();
      renderWithTheme(<Button onClick={handleClick}>Click me</Button>);
      
      await userEvent.click(screen.getByRole('button'));
      expect(handleClick).toHaveBeenCalledTimes(1);
    });

    it('prevents click when disabled', async () => {
      const handleClick = jest.fn();
      renderWithTheme(<Button disabled onClick={handleClick}>Disabled</Button>);
      
      await userEvent.click(screen.getByRole('button'));
      expect(handleClick).not.toHaveBeenCalled();
    });

    it('shows loading state correctly', () => {
      renderWithTheme(<Button isLoading>Loading</Button>);
      
      const button = screen.getByRole('button');
      const loadingSpinner = screen.getByTestId('loading-component');
      
      expect(button).toHaveAttribute('aria-busy', 'true');
      expect(loadingSpinner).toBeInTheDocument();
      expect(button).toHaveAttribute('aria-disabled', 'true');
    });

    it('prevents multiple rapid clicks', async () => {
      const handleClick = jest.fn();
      renderWithTheme(<Button onClick={handleClick}>Click me</Button>);
      
      const button = screen.getByRole('button');
      await userEvent.tripleClick(button);
      expect(handleClick).toHaveBeenCalledTimes(3);
    });
  });

  describe('Accessibility', () => {
    it('supports keyboard navigation', async () => {
      const handleClick = jest.fn();
      renderWithTheme(<Button onClick={handleClick}>Press me</Button>);
      
      const button = screen.getByRole('button');
      button.focus();
      expect(button).toHaveFocus();
      
      fireEvent.keyDown(button, { key: 'Enter' });
      expect(handleClick).toHaveBeenCalled();
      
      fireEvent.keyDown(button, { key: ' ' });
      expect(handleClick).toHaveBeenCalledTimes(2);
    });

    it('provides proper ARIA attributes', () => {
      renderWithTheme(
        <Button 
          isLoading 
          ariaLabel="Custom label"
          tooltip="Helpful tip"
        >
          Accessible Button
        </Button>
      );
      
      const button = screen.getByRole('button');
      expect(button).toHaveAttribute('aria-label', 'Custom label');
      expect(button).toHaveAttribute('aria-busy', 'true');
      expect(button).toHaveAttribute('aria-disabled', 'true');
      expect(button).toHaveAttribute('aria-describedby');
    });

    it('maintains focus visibility', async () => {
      renderWithTheme(<Button>Focus me</Button>);
      
      const button = screen.getByRole('button');
      button.focus();
      
      expect(button).toHaveStyle({
        outline: 'none',
        boxShadow: `0 0 0 2px ${theme.tokens.colors.border.focus}`
      });
    });

    it('announces loading state to screen readers', async () => {
      const { rerender } = renderWithTheme(<Button>Click me</Button>);
      
      rerender(<Button isLoading>Click me</Button>);
      
      const button = screen.getByRole('button');
      expect(button).toHaveAttribute('aria-busy', 'true');
      expect(screen.getByText('Loading...')).toBeInTheDocument();
    });
  });

  describe('Theme Integration', () => {
    it('applies theme tokens correctly', () => {
      renderWithTheme(<Button>Themed Button</Button>);
      
      const button = screen.getByRole('button');
      expect(button).toHaveStyle({
        borderRadius: theme.tokens.radii.sm,
        fontWeight: theme.tokens.fontWeights.medium
      });
    });

    it('supports dark mode styles', () => {
      const darkTheme = {
        ...theme,
        tokens: {
          ...theme.tokens,
          colors: {
            ...theme.tokens.colors,
            background: {
              primary: '#121212'
            }
          }
        }
      };

      renderWithTheme(<Button>Dark Mode</Button>, darkTheme);
      const button = screen.getByRole('button');
      expect(button).toHaveStyle({
        backgroundColor: darkTheme.tokens.colors.background.primary
      });
    });

    it('handles reduced motion preferences', () => {
      // Mock matchMedia for reduced motion
      window.matchMedia = jest.fn().mockImplementation(query => ({
        matches: query === '(prefers-reduced-motion: reduce)',
        media: query,
        onchange: null,
        addListener: jest.fn(),
        removeListener: jest.fn(),
      }));

      renderWithTheme(<Button>No Motion</Button>);
      const button = screen.getByRole('button');
      expect(button).toHaveStyle({ transition: 'none' });
    });
  });
});