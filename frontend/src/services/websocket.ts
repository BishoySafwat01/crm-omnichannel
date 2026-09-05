import { WebSocketEvent } from '../types/crm';

type MessageHandler = (event: WebSocketEvent) => void;

const WS_CLOSE_AUTH_FAILURE = 4001;

export class RealtimeWebSocketService {
  private socket: WebSocket | null = null;
  private listeners: Set<MessageHandler> = new Set();
  private reconnectInterval = 3000;
  private maxReconnectInterval = 15000;
  private currentReconnectDelay = 3000;
  private isExplicitlyClosed = false;

  /** Read the access token from wherever the app stores it. */
  private getToken(): string | null {
    return localStorage.getItem('auth_token');
  }

  public connect() {
    this.isExplicitlyClosed = false;
    const metaEnv = (import.meta as any).env || {};
    const envWsUrl = (metaEnv.VITE_WS_URL || '').trim();
    const envApiUrl = (metaEnv.VITE_API_URL || '').trim();

    let wsBase = '';
    if (envWsUrl) {
      wsBase = envWsUrl.replace(/\/$/, '');
    } else if (envApiUrl && envApiUrl.startsWith('http')) {
      wsBase = envApiUrl.replace(/^http/, 'ws').replace(/\/api\/v1\/?$/, '').replace(/\/$/, '');
    } else {
      const protocol = typeof window !== 'undefined' && window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const host = typeof window !== 'undefined' ? window.location.host : '';
      wsBase = `${protocol}//${host}`;
    }

    const token = this.getToken();
    // Append token as query param so the server can authenticate the handshake
    const tokenParam = token ? `?token=${encodeURIComponent(token)}` : '';
    const wsUrl = `${wsBase}/api/v1/ws/chat${tokenParam}`;

    try {
      this.socket = new WebSocket(wsUrl);

      this.socket.onopen = () => {
        console.log('Real-time WebSocket Connected:', wsUrl.split('?')[0]);
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

      this.socket.onclose = (closeEvent) => {
        if (closeEvent.code === WS_CLOSE_AUTH_FAILURE) {
          // Server rejected the token — don't retry; the user needs to log in again.
          console.warn('WebSocket authentication rejected (4001). Please log in again.');
          this.isExplicitlyClosed = true;
          return;
        }
        if (!this.isExplicitlyClosed) {
          console.warn(`WebSocket closed (${closeEvent.code}). Reconnecting in ${this.currentReconnectDelay / 1000}s...`);
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
