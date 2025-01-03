/**
 * WebSocket service implementation for real-time communication in Agent Builder Hub
 * Provides enterprise-grade WebSocket management with compression, reconnection,
 * and performance optimizations
 * @version 1.0.0
 */

import EventEmitter from 'events'; // v3.3.0
import pako from 'pako'; // v2.1.0
import { ApiResponse } from '../types/common';
import { API_ENDPOINTS } from '../config/api';

// WebSocket message types
export const EVENT_TYPES = {
  AGENT_STATUS: 'agent:status',
  DEPLOYMENT_STATUS: 'deployment:status',
  METRICS_UPDATE: 'metrics:update',
  CONNECTION_STATUS: 'connection:status',
  HEARTBEAT: 'connection:heartbeat',
  ERROR: 'connection:error'
} as const;

// Default configuration
const DEFAULT_CONFIG: Readonly<WebSocketConfig> = {
  reconnectInterval: 1000,
  maxReconnectAttempts: 5,
  debug: false,
  heartbeatInterval: 30000,
  connectionTimeout: 5000,
  useCompression: true,
  maxMessageSize: 1024 * 1024 // 1MB
} as const;

// Interfaces
export interface WebSocketConfig {
  url: string;
  reconnectInterval: number;
  maxReconnectAttempts: number;
  debug: boolean;
  heartbeatInterval: number;
  connectionTimeout: number;
  useCompression: boolean;
  maxMessageSize: number;
}

export interface WebSocketMessage<T = unknown> {
  type: keyof typeof EVENT_TYPES;
  payload: T;
  timestamp: number;
  id: string;
  compressed: boolean;
  priority: number;
}

export interface SubscribeOptions {
  priority?: number;
  filter?: (message: WebSocketMessage) => boolean;
}

/**
 * Enterprise-grade WebSocket service with enhanced features
 */
export class WebSocketService {
  private socket: WebSocket | null = null;
  private readonly config: WebSocketConfig;
  private readonly eventEmitter: EventEmitter;
  private reconnectAttempts: number = 0;
  private connected: boolean = false;
  private messageQueue: WebSocketMessage[] = [];
  private heartbeatInterval: NodeJS.Timeout | null = null;
  private connectionTimeout: NodeJS.Timeout | null = null;
  private lastMessageId: number = 0;

  constructor(config: Partial<WebSocketConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.eventEmitter = new EventEmitter();
    this.validateConfig();
  }

  /**
   * Establishes WebSocket connection with retry mechanism
   */
  public async connect(): Promise<void> {
    if (this.socket?.readyState === WebSocket.OPEN) {
      return;
    }

    return new Promise((resolve, reject) => {
      try {
        this.socket = new WebSocket(this.config.url);
        
        this.socket.onopen = () => {
          this.connected = true;
          this.reconnectAttempts = 0;
          this.startHeartbeat();
          this.processMessageQueue();
          this.emit(EVENT_TYPES.CONNECTION_STATUS, { connected: true });
          resolve();
        };

        this.socket.onclose = () => {
          this.handleDisconnect();
        };

        this.socket.onerror = (error) => {
          this.handleError(error);
        };

        this.socket.onmessage = (event) => {
          this.handleMessage(event);
        };

        // Set connection timeout
        this.connectionTimeout = setTimeout(() => {
          if (!this.connected) {
            this.handleConnectionTimeout();
            reject(new Error('Connection timeout'));
          }
        }, this.config.connectionTimeout);

      } catch (error) {
        this.handleError(error);
        reject(error);
      }
    });
  }

  /**
   * Gracefully closes WebSocket connection
   */
  public disconnect(): void {
    this.clearTimers();
    if (this.socket) {
      this.socket.close();
      this.socket = null;
    }
    this.connected = false;
    this.messageQueue = [];
    this.emit(EVENT_TYPES.CONNECTION_STATUS, { connected: false });
  }

  /**
   * Subscribes to WebSocket events with type checking
   */
  public subscribe<T>(
    eventType: keyof typeof EVENT_TYPES,
    callback: (message: WebSocketMessage<T>) => void,
    options: SubscribeOptions = {}
  ): () => void {
    const handler = (message: WebSocketMessage<T>) => {
      if (options.filter && !options.filter(message)) {
        return;
      }
      callback(message);
    };

    this.eventEmitter.on(eventType, handler);
    return () => this.eventEmitter.off(eventType, handler);
  }

  /**
   * Sends message through WebSocket with compression
   */
  public async send<T>(message: Omit<WebSocketMessage<T>, 'id' | 'timestamp'>): Promise<void> {
    const fullMessage: WebSocketMessage<T> = {
      ...message,
      id: this.generateMessageId(),
      timestamp: Date.now(),
      compressed: this.config.useCompression
    };

    if (!this.connected) {
      this.messageQueue.push(fullMessage);
      return;
    }

    try {
      const messageString = JSON.stringify(fullMessage);
      
      if (messageString.length > this.config.maxMessageSize) {
        throw new Error('Message exceeds maximum size limit');
      }

      const data = this.config.useCompression ? 
        pako.deflate(messageString) : 
        messageString;

      this.socket?.send(data);
    } catch (error) {
      this.handleError(error);
      throw error;
    }
  }

  // Private methods
  private validateConfig(): void {
    if (!this.config.url) {
      throw new Error('WebSocket URL is required');
    }
    if (this.config.reconnectInterval < 100) {
      throw new Error('Reconnect interval must be at least 100ms');
    }
  }

  private startHeartbeat(): void {
    this.heartbeatInterval = setInterval(() => {
      this.send({
        type: EVENT_TYPES.HEARTBEAT,
        payload: { timestamp: Date.now() },
        priority: 1
      });
    }, this.config.heartbeatInterval);
  }

  private handleMessage(event: MessageEvent): void {
    try {
      const data = event.data instanceof Blob ? 
        new TextDecoder().decode(event.data) : 
        event.data;

      const message: WebSocketMessage = this.config.useCompression ?
        JSON.parse(pako.inflate(data, { to: 'string' })) :
        JSON.parse(data);

      this.emit(message.type, message);
    } catch (error) {
      this.handleError(error);
    }
  }

  private async handleDisconnect(): Promise<void> {
    this.connected = false;
    this.clearTimers();
    this.emit(EVENT_TYPES.CONNECTION_STATUS, { connected: false });

    if (this.reconnectAttempts < this.config.maxReconnectAttempts) {
      this.reconnectAttempts++;
      const delay = this.calculateBackoff();
      await new Promise(resolve => setTimeout(resolve, delay));
      this.connect();
    }
  }

  private handleConnectionTimeout(): void {
    this.disconnect();
    this.emit(EVENT_TYPES.ERROR, {
      type: 'connection_timeout',
      message: 'WebSocket connection timed out'
    });
  }

  private handleError(error: unknown): void {
    this.config.debug && console.error('WebSocket error:', error);
    this.emit(EVENT_TYPES.ERROR, {
      type: 'websocket_error',
      message: error instanceof Error ? error.message : 'Unknown WebSocket error'
    });
  }

  private calculateBackoff(): number {
    return Math.min(
      1000 * Math.pow(2, this.reconnectAttempts),
      30000
    );
  }

  private async processMessageQueue(): Promise<void> {
    while (this.messageQueue.length > 0) {
      const message = this.messageQueue.shift();
      if (message) {
        await this.send(message);
      }
    }
  }

  private clearTimers(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
    if (this.connectionTimeout) {
      clearTimeout(this.connectionTimeout);
      this.connectionTimeout = null;
    }
  }

  private generateMessageId(): string {
    return `${Date.now()}-${++this.lastMessageId}`;
  }

  private emit(type: keyof typeof EVENT_TYPES, payload: unknown): void {
    this.eventEmitter.emit(type, payload);
  }
}

// Export singleton instance
export default new WebSocketService({
  url: `${process.env.REACT_APP_WS_URL || 'wss://api.agentbuilder.hakkoda.io'}${API_ENDPOINTS.WEBSOCKET}`
});