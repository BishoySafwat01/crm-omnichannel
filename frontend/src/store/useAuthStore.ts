import { create } from 'zustand';
import { authApi } from '../services/api';

export type UserRole = 'admin' | 'agent' | 'supervisor';

export interface User {
  id: string;
  email: string;
  full_name: string;
  role: UserRole;
  brand_access: string[];
  channel_access?: string[];
  is_active: boolean;
  created_at: string;
}

interface AuthState {
  token: string | null;
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;

  login: (email: string, password: string) => Promise<boolean>;
  logout: () => void;
  fetchMe: () => Promise<void>;
  clearError: () => void;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  token: typeof window !== 'undefined' ? localStorage.getItem('auth_token') : null,
  user: null,
  isAuthenticated: Boolean(typeof window !== 'undefined' && localStorage.getItem('auth_token')),
  isLoading: false,
  error: null,

  login: async (email, password) => {
    set({ isLoading: true, error: null });
    try {
      const data = await authApi.login(email, password);
      const token = data.access_token;
      const user = data.user;

      localStorage.setItem('auth_token', token);
      set({
        token,
        user,
        isAuthenticated: true,
        isLoading: false,
        error: null,
      });
      return true;
    } catch (err: any) {
      set({
        isLoading: false,
        error: err.message || 'حدث خطأ في الاتصال بالخادم',
      });
      return false;
    }
  },

  logout: () => {
    localStorage.removeItem('auth_token');
    set({
      token: null,
      user: null,
      isAuthenticated: false,
      error: null,
    });
  },

  fetchMe: async () => {
    const token = get().token || localStorage.getItem('auth_token');
    if (!token) {
      get().logout();
      return;
    }

    try {
      const user: User = await authApi.getMe(token);
      set({ user, isAuthenticated: true, token });
    } catch (e) {
      console.warn('[AuthStore] Failed to fetch current user profile:', e);
      get().logout();
    }
  },

  clearError: () => set({ error: null }),
}));
