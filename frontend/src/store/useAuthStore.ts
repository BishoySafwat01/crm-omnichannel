import { create } from 'zustand';
import { authApi } from '../services/api';

export type UserRole = 'admin' | 'superadmin' | 'agent' | 'supervisor';

export const isAdminUser = (user: User | null): boolean => {
  if (!user) return false;
  const role = String(user.role).toLowerCase();
  return role === 'admin' || role === 'superadmin';
};

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

const getInitialToken = (): string | null => {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('auth_token') || localStorage.getItem('token') || null;
};

const getInitialUser = (): User | null => {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem('auth_user');
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
};

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
  setAuth: (token: string, user?: User | null) => void;
}

export const useAuthStore = create<AuthState>((set, get) => {
  const initialToken = getInitialToken();
  const initialUser = getInitialUser();

  return {
    token: initialToken,
    user: initialUser,
    isAuthenticated: Boolean(initialToken),
    isLoading: false,
    error: null,

    login: async (email, password) => {
      set({ isLoading: true, error: null });
      try {
        const data = await authApi.login(email, password);
        const token = data.access_token;
        const user = data.user;

        if (typeof window !== 'undefined') {
          localStorage.setItem('auth_token', token);
          if (user) {
            localStorage.setItem('auth_user', JSON.stringify(user));
          }
        }
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
      if (typeof window !== 'undefined') {
        localStorage.removeItem('auth_token');
        localStorage.removeItem('auth_user');
        localStorage.removeItem('token');
        try {
          sessionStorage.removeItem('auth_token');
          sessionStorage.removeItem('auth_user');
          delete (window as any).__CRM_AUTH_TOKEN__;
          delete (window as any).__CRM_AUTH_USER__;
        } catch {}
      }
      set({
        token: null,
        user: null,
        isAuthenticated: false,
        error: null,
      });
    },

    fetchMe: async () => {
      const token = get().token || getInitialToken();
      if (!token) {
        get().logout();
        return;
      }

      try {
        const user: User = await authApi.getMe(token);
        if (typeof window !== 'undefined' && user) {
          localStorage.setItem('auth_user', JSON.stringify(user));
        }
        set({ user, isAuthenticated: true, token });
      } catch (e) {
        console.warn('[AuthStore] Failed to fetch current user profile:', e);
        get().logout();
      }
    },

    setAuth: (token: string, user?: User | null) => {
      if (typeof window !== 'undefined') {
        localStorage.setItem('auth_token', token);
        if (user) {
          localStorage.setItem('auth_user', JSON.stringify(user));
        }
      }
      set((state) => ({
        token,
        user: user !== undefined ? user : state.user,
        isAuthenticated: Boolean(token),
      }));
    },

    clearError: () => set({ error: null }),
  };
});

// Expose on window for popup/opener synchronization
if (typeof window !== 'undefined') {
  (window as any).useAuthStore = useAuthStore;
}
