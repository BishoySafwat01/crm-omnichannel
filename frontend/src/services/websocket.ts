import { WebSocketEvent } from '../types/crm';

type MessageHandler = (event: WebSocketEvent) => void;

export class RealtimeWebSocketService {
  private socket: WebSocket | null = null;
  private listeners: Set<MessageHandler> = new Set();
  private reconnectInterval = 3000;
  private maxReconnectInterval = 15000;
  private currentReconnectDelay = 3000;
  private isExplicitlyClosed = false;

  public connect() {
    this.isExplicitlyClosed = false;
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.host;
    const wsUrl = `${protocol}//${host}/ws/chat`;

    try {
      this.socket = new WebSocket(wsUrl);

      this.socket.onopen = () => {
        console.log('Real-time WebSocket Connected:', wsUrl);
        this.currentReconnectDelay = this.reconnectInterval;
      };

      this.socket.onmessage = (event) => {
        try {
          const data: WebSocketEvent = JSON.parse(event.data);
          this.notifyListeners(data);
        } catch (err) {
          console.error('Failed to parse WebSocket message:', err);
        }
      };

      this.socket.onclose = () => {
        if (!this.isExplicitlyClosed) {
          console.warn(`WebSocket closed. Reconnecting in ${this.currentReconnectDelay / 1000}s...`);
          setTimeout(() => {
            this.currentReconnectDelay = Math.min(
              this.currentReconnectDelay * 1.5,
              this.maxReconnectInterval
            );
            this.connect();
          }, this.currentReconnectDelay);
        }
      };

      this.socket.onerror = (err) => {
        console.warn('WebSocket error observed:', err);
      };
    } catch (e) {
      console.warn('WebSocket connection init failed:', e);
    }
  }

  public subscribe(handler: MessageHandler) {
    this.listeners.add(handler);
    return () => {
      this.listeners.delete(handler);
    };
  }

  public send(data: any) {
    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify(data));
    }
  }

  public close() {
    this.isExplicitlyClosed = true;
    if (this.socket) {
      this.socket.close();
    }
  }

  private notifyListeners(event: WebSocketEvent) {
    this.listeners.forEach((listener) => listener(event));
  }
}

export const realtimeService = new RealtimeWebSocketService();
