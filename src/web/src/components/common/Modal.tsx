import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Modal as AmplifyModal } from '@aws-amplify/ui-react'; // v6.0.0
import { IconButton } from './IconButton';
import { Button } from './Button';
import { useTheme } from '../../hooks/useTheme';
import { UI_CONSTANTS } from '../../config/constants';

/**
 * Props interface for the Modal component with comprehensive accessibility support
 * @interface ModalProps
 */
export interface ModalProps {
  /** Controls modal visibility */
  isOpen: boolean;
  /** Callback function when modal is closed */
  onClose: () => void;
  /** Async callback before modal closes, can prevent closing */
  onBeforeClose?: () => Promise<boolean>;
  /** Modal title displayed in header */
  title: string;
  /** Controls modal size with responsive behavior */
  size?: 'small' | 'medium' | 'large' | 'fullscreen';
  /** Modal content with proper focus management */
  children: React.ReactNode;
  /** Optional footer content with action buttons */
  footer?: React.ReactNode;
  /** Whether clicking backdrop closes modal */
  closeOnBackdropClick?: boolean;
  /** Whether pressing Escape closes modal */
  closeOnEscape?: boolean;
  /** Data test id for testing purposes */
  testId?: string;
}

/**
 * Get size-specific styles based on viewport and theme
 */
const getModalSize = (size: ModalProps['size'] = 'medium') => {
  switch (size) {
    case 'small':
      return {
        width: '400px',
        maxHeight: '70vh',
      };
    case 'large':
      return {
        width: '800px',
        maxHeight: '80vh',
      };
    case 'fullscreen':
      return {
        width: '100vw',
        height: '100vh',
        maxHeight: '100vh',
        margin: 0,
        borderRadius: 0,
      };
    default: // medium
      return {
        width: '600px',
        maxHeight: '75vh',
      };
  }
};

/**
 * Custom hook for managing focus trap within modal
 */
const useFocusTrap = (isOpen: boolean, modalRef: React.RefObject<HTMLDivElement>) => {
  const previousFocus = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (isOpen) {
      // Store previously focused element
      previousFocus.current = document.activeElement as HTMLElement;

      // Focus first focusable element in modal
      const focusableElements = modalRef.current?.querySelectorAll(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      );
      if (focusableElements?.length) {
        (focusableElements[0] as HTMLElement).focus();
      }

      return () => {
        // Restore focus when modal closes
        previousFocus.current?.focus();
      };
    }
  }, [isOpen, modalRef]);
};

/**
 * Highly reusable modal dialog component implementing AWS Amplify UI design patterns
 * with Material Design 3.0 principles and comprehensive accessibility support.
 */
export const Modal = React.memo<ModalProps>(({
  isOpen,
  onClose,
  onBeforeClose,
  title,
  size = 'medium',
  children,
  footer,
  closeOnBackdropClick = true,
  closeOnEscape = true,
  testId,
}) => {
  const { theme, isDarkMode } = useTheme();
  const modalRef = useRef<HTMLDivElement>(null);
  const [isClosing, setIsClosing] = useState(false);

  // Implement focus trap
  useFocusTrap(isOpen, modalRef);

  // Handle modal close with optional before close callback
  const handleClose = useCallback(async () => {
    if (isClosing) return;

    if (onBeforeClose) {
      setIsClosing(true);
      const canClose = await onBeforeClose();
      setIsClosing(false);

      if (!canClose) return;
    }

    onClose();
  }, [onClose, onBeforeClose, isClosing]);

  // Handle backdrop click
  const handleBackdropClick = useCallback((e: React.MouseEvent) => {
    if (closeOnBackdropClick && e.target === e.currentTarget) {
      handleClose();
    }
  }, [closeOnBackdropClick, handleClose]);

  // Handle escape key
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (closeOnEscape && e.key === 'Escape') {
      handleClose();
    }
  }, [closeOnEscape, handleClose]);

  // Add/remove event listeners
  useEffect(() => {
    if (isOpen) {
      document.addEventListener('keydown', handleKeyDown);
      return () => document.removeEventListener('keydown', handleKeyDown);
    }
  }, [isOpen, handleKeyDown]);

  // Generate modal styles
  const modalStyles = {
    ...getModalSize(size),
    backgroundColor: isDarkMode ? theme.tokens.colors.background.secondary : theme.tokens.colors.background.primary,
    color: isDarkMode ? theme.tokens.colors.text.primary.dark : theme.tokens.colors.text.primary.light,
    border: 'none',
    borderRadius: theme.tokens.radii.md,
    boxShadow: theme.tokens.shadows.large,
    outline: 'none',
    overflow: 'hidden',
    transition: `all ${UI_CONSTANTS.MODAL_TRANSITION_MS}ms ${theme.tokens.transitions?.timing.ease}`,
    '@media (prefers-reduced-motion: reduce)': {
      transition: 'none',
    },
  };

  return (
    <AmplifyModal
      ref={modalRef}
      isOpen={isOpen}
      onClose={handleClose}
      className="modal-dialog"
      css={modalStyles}
      data-testid={testId}
      aria-labelledby="modal-title"
      aria-modal="true"
      role="dialog"
    >
      {/* Modal Header */}
      <div
        css={{
          padding: theme.tokens.space.lg,
          borderBottom: `1px solid ${isDarkMode ? theme.tokens.colors.border.dark : theme.tokens.colors.border.light}`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <h2
          id="modal-title"
          css={{
            margin: 0,
            fontSize: theme.tokens.fontSizes.xl,
            fontWeight: theme.tokens.fontWeights.semibold,
          }}
        >
          {title}
        </h2>
        <IconButton
          icon="✕"
          ariaLabel="Close modal"
          variant="ghost"
          onClick={handleClose}
          disabled={isClosing}
          testId="modal-close-button"
        />
      </div>

      {/* Modal Content */}
      <div
        css={{
          padding: theme.tokens.space.lg,
          overflowY: 'auto',
          maxHeight: `calc(${getModalSize(size).maxHeight} - 160px)`,
        }}
        onClick={handleBackdropClick}
      >
        {children}
      </div>

      {/* Modal Footer */}
      {footer && (
        <div
          css={{
            padding: theme.tokens.space.lg,
            borderTop: `1px solid ${isDarkMode ? theme.tokens.colors.border.dark : theme.tokens.colors.border.light}`,
            display: 'flex',
            justifyContent: 'flex-end',
            gap: theme.tokens.space.md,
          }}
        >
          {footer}
        </div>
      )}
    </AmplifyModal>
  );
});

Modal.displayName = 'Modal';

export default Modal;