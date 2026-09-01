/**
 * Centralized Application & API Configuration
 */

const envApiUrl = ((import.meta as any).env?.VITE_API_URL || '').trim();

export const APP_CONFIG = {
  API_BASE: envApiUrl || '/api/v1',
  API_BASE_URL: envApiUrl || 'http://127.0.0.1:8000/api/v1',
  FALLBACK_API_BASE: 'http://127.0.0.1:8000/api/v1',
  FALLBACK_DIRECT_BASE: 'http://127.0.0.1:8000/api/v1',
  DEFAULT_PAGE_SIZE: 20,
  MESSAGES_PAGE_SIZE: 200,
  WS_PING_INTERVAL_MS: 10000,
  POLL_INTERVAL_MS: 30000,
};
