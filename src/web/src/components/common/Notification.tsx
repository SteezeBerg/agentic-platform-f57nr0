import React, { useCallback, memo } from 'react';
import { View } from '@aws-amplify/ui-react'; // v6.0.0
import { AnimatePresence } from 'framer-motion'; // v10.16.4
import Toast from './Toast';
import { useNotification } from '../../hooks/useNotification';

// Enum for notification container positions
export enum NotificationPosition {
  'top-right' = 'top-right',
  'top-left' = 'top-left',
  'bottom-right' = 'bottom-right',
  'bottom-left' = 'bottom-left',
  'top-center' = 'top-center',
  'bottom-center' = 'bottom-center'
}

// Position-specific styles for the notification container
const POSITION_STYLES = {
  'top-right': { top: '20px', right: '20px' },
  'top-left': { top: '20px', left: '20px' },
  'bottom-right': { bottom: '20px', right: '20px' },
  'bottom-left': { bottom: '20px', left: '20px' },
  'top-center': { top: '20px', left: '50%', transform: 'translateX(-50%)' },
  'bottom-center': { bottom: '20px', left: '50%', transform: 'translateX(-50%)' }
};

// Base container styles following AWS Amplify UI patterns
const CONTAINER_STYLES = {
  position: 'fixed' as const,
  zIndex: 9999,
  display: 'flex',
  flexDirection: 'column' as const,
  gap: '10px',
  maxWidth: '100%',
  maxHeight: '100vh',
  pointerEvents: 'none' as const,
  overflow: 'hidden',
  padding: '10px'
};

// Props interface for the notification container
export interface NotificationContainerProps {
  position?: NotificationPosition;
}

/**
 * NotificationContainer component that manages and displays toast notifications
 * following AWS Amplify UI design patterns and Material Design 3.0 principles.
 */
const NotificationContainer: React.FC<NotificationContainerProps> = memo(({
  position = NotificationPosition['top-right']
}) => {
  const { notifications, clearNotification } = useNotification();

  // Memoized toast close handler
  const handleToastClose = useCallback((notificationId: string) => {
    clearNotification(notificationId);
  }, [clearNotification]);

  // Calculate container position styles
  const containerStyles = {
    ...CONTAINER_STYLES,
    ...POSITION_STYLES[position],
    // Handle RTL layout adjustments
    ...(document.dir === 'rtl' && {
      right: position.includes('left') ? POSITION_STYLES[position].left : undefined,
      left: position.includes('right') ? POSITION_STYLES[position].right : undefined
    })
  };

  return (
    <View
      as="div"
      className="notification-container"
      style={containerStyles}
      data-testid="notification-container"
      role="region"
      aria-label="Notifications"
    >
      <AnimatePresence mode="sync" initial={false}>
        {notifications.map((notification) => (
          <View
            key={notification.id}
            as="div"
            className="notification-item"
            style={{ pointerEvents: 'auto' }}
          >
            <Toast
              id={notification.id}
              message={notification.message}
              type={notification.type}
              duration={notification.duration}
              onClose={() => handleToastClose(notification.id)}
              actions={notification.actions}
            />
          </View>
        ))}
      </AnimatePresence>
    </View>
  );
});

// Set display name for debugging
NotificationContainer.displayName = 'NotificationContainer';

export default NotificationContainer;