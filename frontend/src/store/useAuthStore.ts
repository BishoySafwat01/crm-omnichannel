import { create } from 'zustand';

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
      const res = await fetch('/api/v1/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), password }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({ detail: 'فشل في تسجيل الدخول' }));
        throw new Error(errData.detail || 'البريد الإلكتروني أو كلمة المرور غير صحيحة');
      }

      const data = await res.json();
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
      const res = await fetch('/api/v1/auth/me', {
        headers: {
          'Accept': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
      });

      if (res.ok) {
        const user: User = await res.json();
        set({ user, isAuthenticated: true, token });
      } else {
        get().logout();
      }
    } catch (e) {
      console.warn('[AuthStore] Failed to fetch current user profile:', e);
    }
  },

  clearError: () => set({ error: null }),
}));
