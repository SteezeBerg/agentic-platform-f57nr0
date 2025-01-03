import React, { useCallback, useState } from 'react';
import { Modal } from './Modal';
import { Button } from './Button';
import { useTheme } from '../../hooks/useTheme';
import { UI_CONSTANTS } from '../../config/constants';

/**
 * Props interface for the ConfirmDialog component with enhanced accessibility and loading state support
 * @interface ConfirmDialogProps
 */
export interface ConfirmDialogProps {
  /** Controls dialog visibility */
  isOpen: boolean;
  /** Callback function when dialog is closed, ensures proper focus restoration */
  onClose: () => void;
  /** Async-compatible callback function when action is confirmed */
  onConfirm: () => Promise<void> | void;
  /** Dialog title for proper ARIA labeling */
  title: string;
  /** Confirmation message or content with rich text support */
  message: string | React.ReactNode;
  /** Accessible text for confirm button */
  confirmText?: string;
  /** Accessible text for cancel button */
  cancelText?: string;
  /** Visual variant for confirm button following design system */
  confirmVariant?: 'primary' | 'secondary' | 'tertiary';
  /** Loading state for async operations */
  isLoading?: boolean;
}

/**
 * A fully accessible confirmation dialog component implementing AWS Amplify UI design patterns
 * with Material Design 3.0 principles and WCAG 2.1 Level AA compliance.
 * 
 * @component
 */
export const ConfirmDialog = React.memo<ConfirmDialogProps>(({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  confirmVariant = 'primary',
  isLoading = false
}) => {
  const { theme, isDarkMode } = useTheme();
  const [internalLoading, setInternalLoading] = useState(false);

  // Handle confirmation with loading state
  const handleConfirm = useCallback(async () => {
    try {
      setInternalLoading(true);
      await onConfirm();
      onClose();
    } catch (error) {
      console.error('Confirmation action failed:', error);
    } finally {
      setInternalLoading(false);
    }
  }, [onConfirm, onClose]);

  // Handle keyboard events for enhanced accessibility
  const handleKeyDown = useCallback((event: React.KeyboardEvent) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      handleConfirm();
    }
  }, [handleConfirm]);

  // Render footer buttons with proper ordering and states
  const renderFooter = () => (
    <>
      <Button
        variant="tertiary"
        onClick={onClose}
        disabled={internalLoading || isLoading}
        ariaLabel={cancelText}
        testId="confirm-dialog-cancel"
      >
        {cancelText}
      </Button>
      <Button
        variant={confirmVariant}
        onClick={handleConfirm}
        isLoading={internalLoading || isLoading}
        disabled={internalLoading || isLoading}
        ariaLabel={confirmText}
        testId="confirm-dialog-confirm"
      >
        {confirmText}
      </Button>
    </>
  );

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={title}
      size="small"
      closeOnEscape={!internalLoading && !isLoading}
      closeOnBackdropClick={!internalLoading && !isLoading}
      testId="confirm-dialog"
    >
      <div
        css={{
          padding: theme.tokens.space.lg,
          color: isDarkMode ? theme.tokens.colors.text.primary.dark : theme.tokens.colors.text.primary.light,
          fontSize: theme.tokens.fontSizes.md,
          lineHeight: theme.tokens.lineHeights.normal,
          '@media (prefers-reduced-motion: reduce)': {
            transition: 'none',
          },
        }}
        role="alertdialog"
        aria-modal="true"
        aria-describedby="confirm-dialog-message"
        onKeyDown={handleKeyDown}
      >
        <div id="confirm-dialog-message">
          {typeof message === 'string' ? (
            <p css={{ margin: 0 }}>{message}</p>
          ) : (
            message
          )}
        </div>
      </div>
      <div
        css={{
          display: 'flex',
          justifyContent: 'flex-end',
          gap: theme.tokens.space.md,
          padding: `${theme.tokens.space.md} ${theme.tokens.space.lg}`,
          borderTop: `1px solid ${isDarkMode ? theme.tokens.colors.border.dark : theme.tokens.colors.border.light}`,
          transition: `all ${UI_CONSTANTS.MODAL_TRANSITION_MS}ms ${theme.tokens.transitions?.timing.ease}`,
          '@media (prefers-reduced-motion: reduce)': {
            transition: 'none',
          },
        }}
      >
        {renderFooter()}
      </div>
    </Modal>
  );
});

ConfirmDialog.displayName = 'ConfirmDialog';

export default ConfirmDialog;