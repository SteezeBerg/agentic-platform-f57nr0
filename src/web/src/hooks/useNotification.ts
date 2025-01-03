import { useState, useCallback, useRef, useEffect, useMemo } from 'react'; // v18.2.0
import { debounce } from 'lodash'; // v4.17.21
import { LoadingState } from '../types/common';

// Enums
export enum NotificationType {
  SUCCESS = 'SUCCESS',
  ERROR = 'ERROR',
  WARNING = 'WARNING',
  INFO = 'INFO'
}

export enum NotificationAnimationState {
  entering = 'entering',
  entered = 'entered',
  exiting = 'exiting',
  exited = 'exited'
}

// Constants
const DEFAULT_DURATION = 5000;
const MAX_NOTIFICATIONS = 5;
const ANIMATION_DURATION = 300;
const DEFAULT_PRIORITY = 1;
const HIGH_PRIORITY = 2;
const NOTIFICATION_DEBOUNCE_MS = 100;

// Interfaces
export interface NotificationAction {
  label: string;
  onClick: () => void;
  variant: 'primary' | 'secondary' | 'link';
}

export interface Notification {
  id: string;
  message: string;
  type: NotificationType;
  duration: number;
  priority: number;
  persistent: boolean;
  groupId?: string;
  actions?: NotificationAction[];
  customRender?: (notification: Notification) => React.ReactNode;
  ariaLive: 'polite' | 'assertive';
  animationState: NotificationAnimationState;
}

export interface NotificationOptions {
  message: string;
  type: NotificationType;
  duration?: number;
  priority?: number;
  persistent?: boolean;
  groupId?: string;
  actions?: NotificationAction[];
  customRender?: (notification: Notification) => React.ReactNode;
}

export const useNotification = () => {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const timeoutRefs = useRef<Map<string, NodeJS.Timeout>>(new Map());
  const notificationQueue = useRef<Notification[]>([]);

  // Cleanup function for notification timeouts
  useEffect(() => {
    return () => {
      timeoutRefs.current.forEach(timeout => clearTimeout(timeout));
      timeoutRefs.current.clear();
    };
  }, []);

  // Debounced notification state update for performance
  const debouncedSetNotifications = useMemo(
    () => debounce((newNotifications: Notification[]) => {
      setNotifications(newNotifications);
    }, NOTIFICATION_DEBOUNCE_MS),
    []
  );

  // Generate unique notification ID
  const generateId = useCallback(() => {
    return `notification-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }, []);

  // Determine notification priority and aria-live attribute
  const getNotificationConfig = useCallback((type: NotificationType) => {
    switch (type) {
      case NotificationType.ERROR:
        return { priority: HIGH_PRIORITY, ariaLive: 'assertive' as const };
      case NotificationType.WARNING:
        return { priority: HIGH_PRIORITY, ariaLive: 'polite' as const };
      default:
        return { priority: DEFAULT_PRIORITY, ariaLive: 'polite' as const };
    }
  }, []);

  // Handle notification animation states
  const updateAnimationState = useCallback((
    notificationId: string,
    animationState: NotificationAnimationState
  ) => {
    setNotifications(prev => 
      prev.map(notification => 
        notification.id === notificationId
          ? { ...notification, animationState }
          : notification
      )
    );
  }, []);

  // Clear a specific notification
  const clearNotification = useCallback((notificationId: string) => {
    const timeout = timeoutRefs.current.get(notificationId);
    if (timeout) {
      clearTimeout(timeout);
      timeoutRefs.current.delete(notificationId);
    }

    updateAnimationState(notificationId, NotificationAnimationState.exiting);

    setTimeout(() => {
      setNotifications(prev => prev.filter(n => n.id !== notificationId));
      
      // Process queue if there are waiting notifications
      if (notificationQueue.current.length > 0) {
        const nextNotification = notificationQueue.current.shift();
        if (nextNotification) {
          debouncedSetNotifications([...notifications, nextNotification]);
        }
      }
    }, ANIMATION_DURATION);
  }, [notifications, updateAnimationState, debouncedSetNotifications]);

  // Clear all notifications
  const clearAllNotifications = useCallback(() => {
    timeoutRefs.current.forEach(timeout => clearTimeout(timeout));
    timeoutRefs.current.clear();
    notificationQueue.current = [];
    
    notifications.forEach(notification => {
      updateAnimationState(notification.id, NotificationAnimationState.exiting);
    });

    setTimeout(() => {
      setNotifications([]);
    }, ANIMATION_DURATION);
  }, [notifications, updateAnimationState]);

  // Show a new notification
  const showNotification = useCallback((options: NotificationOptions): string => {
    const id = generateId();
    const { priority, ariaLive } = getNotificationConfig(options.type);
    
    const notification: Notification = {
      id,
      message: options.message,
      type: options.type,
      duration: options.duration ?? DEFAULT_DURATION,
      priority: options.priority ?? priority,
      persistent: options.persistent ?? false,
      groupId: options.groupId,
      actions: options.actions,
      customRender: options.customRender,
      ariaLive,
      animationState: NotificationAnimationState.entering
    };

    // Handle error notifications from LoadingState
    if (options.type === NotificationType.ERROR && options.message.includes(LoadingState.ERROR)) {
      notification.priority = HIGH_PRIORITY;
      notification.persistent = true;
    }

    // Handle notification queue if max limit reached
    if (notifications.length >= MAX_NOTIFICATIONS) {
      notificationQueue.current.push(notification);
      return id;
    }

    // Group similar notifications
    if (notification.groupId) {
      const existingGroupNotification = notifications.find(n => n.groupId === notification.groupId);
      if (existingGroupNotification) {
        clearNotification(existingGroupNotification.id);
      }
    }

    debouncedSetNotifications([...notifications, notification]);

    // Set up auto-dismiss timer for non-persistent notifications
    if (!notification.persistent && notification.duration > 0) {
      const timeout = setTimeout(() => {
        clearNotification(id);
      }, notification.duration);
      timeoutRefs.current.set(id, timeout);
    }

    // Update animation state after mounting
    setTimeout(() => {
      updateAnimationState(id, NotificationAnimationState.entered);
    }, 50);

    return id;
  }, [notifications, generateId, getNotificationConfig, clearNotification, updateAnimationState, debouncedSetNotifications]);

  return {
    notifications,
    showNotification,
    clearNotification,
    clearAllNotifications,
    NotificationType
  };
};