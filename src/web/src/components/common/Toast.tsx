import React, { useEffect, useCallback, memo } from 'react';
import { View, Text, Icon, useTheme } from '@aws-amplify/ui-react'; // v6.0.0
import { motion, AnimatePresence } from 'framer-motion'; // v10.16.4
import { NotificationType } from '../../hooks/useNotification';

// Animation variants for smooth transitions
const ANIMATION_VARIANTS = {
  initial: {
    opacity: 0,
    y: -20,
    scale: 0.95
  },
  animate: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: {
      duration: 0.2,
      ease: 'easeOut'
    }
  },
  exit: {
    opacity: 0,
    y: -20,
    scale: 0.95,
    transition: {
      duration: 0.15,
      ease: 'easeIn'
    }
  }
};

// Type-specific styling and accessibility configurations
const TYPE_STYLES = {
  [NotificationType.SUCCESS]: {
    backgroundColor: 'var(--amplify-colors-green-60)',
    icon: 'checkmark',
    ariaLive: 'polite'
  },
  [NotificationType.ERROR]: {
    backgroundColor: 'var(--amplify-colors-red-60)',
    icon: 'alert',
    ariaLive: 'assertive',
    role: 'alert'
  },
  [NotificationType.WARNING]: {
    backgroundColor: 'var(--amplify-colors-orange-60)',
    icon: 'warning',
    ariaLive: 'polite'
  },
  [NotificationType.INFO]: {
    backgroundColor: 'var(--amplify-colors-blue-60)',
    icon: 'info',
    ariaLive: 'polite'
  }
};

export interface ToastAction {
  label: string;
  onClick: () => void;
  variant: 'primary' | 'secondary' | 'link';
}

export interface ToastProps {
  id: string;
  message: string;
  type: NotificationType;
  duration?: number;
  onClose?: () => void;
  actions?: ToastAction[];
}

const Toast: React.FC<ToastProps> = memo(({
  id,
  message,
  type,
  duration = 5000,
  onClose,
  actions
}) => {
  const { tokens } = useTheme();
  const typeStyle = TYPE_STYLES[type];
  
  // Handle auto-dismiss timer
  useEffect(() => {
    if (duration > 0) {
      const timer = setTimeout(() => {
        handleClose();
      }, duration);
      
      return () => clearTimeout(timer);
    }
  }, [duration]);

  // Memoized close handler
  const handleClose = useCallback(() => {
    onClose?.();
  }, [onClose]);

  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={id}
        initial="initial"
        animate="animate"
        exit="exit"
        variants={ANIMATION_VARIANTS}
      >
        <View
          backgroundColor={typeStyle.backgroundColor}
          borderRadius={tokens.radii.medium}
          padding={tokens.space.medium}
          boxShadow={tokens.shadows.medium}
          maxWidth="400px"
          display="flex"
          alignItems="flex-start"
          gap={tokens.space.small}
          role={typeStyle.role || 'status'}
          aria-live={typeStyle.ariaLive}
        >
          {/* Notification Icon */}
          <Icon
            ariaLabel={`${type.toLowerCase()} notification`}
            color={tokens.colors.white}
            size={tokens.fontSizes.large}
            name={typeStyle.icon}
          />

          {/* Content Container */}
          <View flex="1">
            {/* Message */}
            <Text
              color={tokens.colors.white}
              fontSize={tokens.fontSizes.medium}
              lineHeight={tokens.lineHeights.medium}
            >
              {message}
            </Text>

            {/* Action Buttons */}
            {actions && actions.length > 0 && (
              <View
                display="flex"
                gap={tokens.space.small}
                marginTop={tokens.space.small}
              >
                {actions.map((action, index) => (
                  <button
                    key={`${id}-action-${index}`}
                    onClick={action.onClick}
                    className={`amplify-button amplify-button--${action.variant}`}
                    style={{ color: tokens.colors.white }}
                  >
                    {action.label}
                  </button>
                ))}
              </View>
            )}
          </View>

          {/* Close Button */}
          <button
            onClick={handleClose}
            aria-label="Close notification"
            style={{
              background: 'transparent',
              border: 'none',
              padding: tokens.space.xxs,
              cursor: 'pointer',
              color: tokens.colors.white,
              opacity: 0.8,
              transition: 'opacity 0.2s ease'
            }}
            onMouseOver={(e) => (e.currentTarget.style.opacity = '1')}
            onMouseOut={(e) => (e.currentTarget.style.opacity = '0.8')}
          >
            <Icon
              ariaLabel="close"
              name="close"
              size={tokens.fontSizes.medium}
            />
          </button>
        </View>
      </motion.div>
    </AnimatePresence>
  );
});

Toast.displayName = 'Toast';

export default Toast;