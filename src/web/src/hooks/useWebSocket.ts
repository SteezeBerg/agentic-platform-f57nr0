import { useState, useEffect, useCallback, useRef } from 'react'; // v18.2.0
import { WebSocketService } from '../services/websocket';
import { useNotification, NotificationType } from './useNotification';
import { ApiResponse } from '../types/common';

// Constants
const DEFAULT_OPTIONS: UseWebSocketOptions = {
  autoConnect: true,
  reconnectInterval: 1000,
  maxReconnectAttempts: 5,
  debug: false,
  batchInterval: 100,
  heartbeatInterval: 30000,
  connectionPoolSize: 3,
  messageQueueSize: 1000
} as const;

// Interfaces
export interface UseWebSocketOptions {
  autoConnect: boolean;
  reconnectInterval: number;
  maxReconnectAttempts: number;
  debug: boolean;
  batchInterval: number;
  heartbeatInterval: number;
  connectionPoolSize: number;
  messageQueueSize: number;
}

export interface WebSocketState {
  connected: boolean;
  connecting: boolean;
  error: WebSocketError | null;
  reconnectAttempts: number;
  lastHeartbeat: number;
  queueSize: number;
  latency: number;
}

interface WebSocketError {
  type: string;
  message: string;
  timestamp: number;
}

interface WebSocketMetrics {
  messagesSent: number;
  messagesReceived: number;
  averageLatency: number;
  connectionUptime: number;
  lastHeartbeatLatency: number;
}

export const useWebSocket = (options: Partial<UseWebSocketOptions> = {}) => {
  const mergedOptions = { ...DEFAULT_OPTIONS, ...options };
  const { showNotification } = useNotification();
  
  // State
  const [state, setState] = useState<WebSocketState>({
    connected: false,
    connecting: false,
    error: null,
    reconnectAttempts: 0,
    lastHeartbeat: 0,
    queueSize: 0,
    latency: 0
  });

  const [metrics, setMetrics] = useState<WebSocketMetrics>({
    messagesSent: 0,
    messagesReceived: 0,
    averageLatency: 0,
    connectionUptime: 0,
    lastHeartbeatLatency: 0
  });

  // Refs
  const wsService = useRef<WebSocketService | null>(null);
  const connectionPool = useRef<Set<WebSocket>>(new Set());
  const messageQueue = useRef<any[]>([]);
  const uptimeStart = useRef<number>(Date.now());
  const metricsInterval = useRef<NodeJS.Timeout>();

  // Initialize WebSocket service
  useEffect(() => {
    wsService.current = new WebSocketService({
      reconnectInterval: mergedOptions.reconnectInterval,
      maxReconnectAttempts: mergedOptions.maxReconnectAttempts,
      debug: mergedOptions.debug,
      heartbeatInterval: mergedOptions.heartbeatInterval
    });

    if (mergedOptions.autoConnect) {
      connect();
    }

    return () => {
      disconnect();
    };
  }, []);

  // Metrics tracking
  useEffect(() => {
    metricsInterval.current = setInterval(() => {
      if (state.connected) {
        setMetrics(prev => ({
          ...prev,
          connectionUptime: Date.now() - uptimeStart.current
        }));
      }
    }, 1000);

    return () => {
      if (metricsInterval.current) {
        clearInterval(metricsInterval.current);
      }
    };
  }, [state.connected]);

  // Connection management
  const connect = useCallback(async () => {
    if (state.connecting || state.connected) return;

    setState(prev => ({ ...prev, connecting: true }));

    try {
      // Initialize connection pool
      while (connectionPool.current.size < mergedOptions.connectionPoolSize) {
        const ws = await wsService.current?.connect();
        if (ws) {
          connectionPool.current.add(ws);
        }
      }

      setState(prev => ({
        ...prev,
        connected: true,
        connecting: false,
        error: null,
        reconnectAttempts: 0
      }));

      uptimeStart.current = Date.now();
      showNotification({
        type: NotificationType.SUCCESS,
        message: 'WebSocket connection established'
      });
    } catch (error) {
      const wsError: WebSocketError = {
        type: 'connection_error',
        message: error instanceof Error ? error.message : 'Connection failed',
        timestamp: Date.now()
      };

      setState(prev => ({
        ...prev,
        connecting: false,
        error: wsError,
        reconnectAttempts: prev.reconnectAttempts + 1
      }));

      showNotification({
        type: NotificationType.ERROR,
        message: `WebSocket connection failed: ${wsError.message}`
      });
    }
  }, [state.connecting, state.connected]);

  const disconnect = useCallback(() => {
    connectionPool.current.forEach(ws => ws.close());
    connectionPool.current.clear();
    messageQueue.current = [];
    
    if (wsService.current) {
      wsService.current.disconnect();
    }

    setState(prev => ({
      ...prev,
      connected: false,
      connecting: false,
      error: null,
      queueSize: 0
    }));
  }, []);

  // Message handling
  const batchMessages = useCallback((messages: any[]) => {
    if (!state.connected) {
      messageQueue.current.push(...messages);
      setState(prev => ({ ...prev, queueSize: messageQueue.current.length }));
      return;
    }

    const batch = messages.slice(0, mergedOptions.messageQueueSize);
    wsService.current?.send({
      type: 'batch',
      payload: batch,
      timestamp: Date.now()
    });

    setMetrics(prev => ({
      ...prev,
      messagesSent: prev.messagesSent + batch.length
    }));
  }, [state.connected]);

  const subscribe = useCallback(<T>(
    eventType: string,
    callback: (data: ApiResponse<T>) => void,
    options: { priority?: number; filter?: (data: any) => boolean } = {}
  ) => {
    if (!wsService.current) return () => {};

    const startTime = Date.now();
    const unsubscribe = wsService.current.subscribe(eventType, (message: ApiResponse<T>) => {
      const latency = Date.now() - startTime;
      setState(prev => ({ ...prev, latency }));
      setMetrics(prev => ({
        ...prev,
        messagesReceived: prev.messagesReceived + 1,
        averageLatency: (prev.averageLatency + latency) / 2
      }));

      if (options.filter && !options.filter(message)) return;
      callback(message);
    }, options);

    return unsubscribe;
  }, []);

  return {
    state,
    metrics,
    connect,
    disconnect,
    subscribe,
    batchMessages
  };
};

export default useWebSocket;