import { create } from 'zustand';
import { API_BASE, getAuthHeaders } from '../services/api';

export interface PortalBranding {
  workspace_id: string;
  workspace_name: string;
  workspace_slug: string;
  brand_display_name: string;
  brand_logo_url: string | null;
  favicon_url: string | null;
  theme_primary_color: string;
  canned_responses: Record<string, any> | null;
  custom_domain: string | null;
}

const DEFAULT_BRANDING: PortalBranding = {
  workspace_id: '00000000-0000-0000-0000-000000000001',
  workspace_name: 'LUXIRA Group',
  workspace_slug: 'default',
  brand_display_name: 'مجموعة لوكسيرا - نظام إدارة العملاء الموحد',
  brand_logo_url: null,
  favicon_url: null,
  theme_primary_color: '#1A73E8',
  canned_responses: null,
  custom_domain: null,
};

interface PortalBrandingState {
  branding: PortalBranding;
  isLoading: boolean;
  isSaving: boolean;
  error: string | null;
  saveSuccess: boolean;
  fetchBranding: () => Promise<void>;
  updateBranding: (payload: Partial<PortalBranding>) => Promise<void>;
  applyBrandingToDom: (data: PortalBranding) => void;
  clearSaveState: () => void;
}

export const usePortalBrandingStore = create<PortalBrandingState>((set, get) => ({
  branding: DEFAULT_BRANDING,
  isLoading: false,
  isSaving: false,
  error: null,
  saveSuccess: false,

  clearSaveState: () => {
    set({ saveSuccess: false, error: null });
  },

  applyBrandingToDom: (data: PortalBranding) => {
    if (typeof document === 'undefined') return;

    // 1. Dynamic Title
    if (data.brand_display_name) {
      document.title = data.brand_display_name;
    }

    // 2. Dynamic Favicon
    if (data.favicon_url) {
      let link: HTMLLinkElement | null = document.querySelector("link[rel~='icon']");
      if (!link) {
        link = document.createElement('link');
        link.rel = 'icon';
        document.getElementsByTagName('head')[0].appendChild(link);
      }
      link.href = data.favicon_url;
    }

    // 3. Primary Theme CSS variable injection
    if (data.theme_primary_color) {
      document.documentElement.style.setProperty('--primary-color', data.theme_primary_color);
    }
  },

  fetchBranding: async () => {
    set({ isLoading: true, error: null });
    try {
      const res = await fetch(`${API_BASE}/portal/branding`, {
        headers: getAuthHeaders(),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: PortalBranding = await res.json();
      set({ branding: data, isLoading: false });
      get().applyBrandingToDom(data);
    } catch (err: any) {
      set({ isLoading: false, error: err?.message || 'Failed to load branding' });
      get().applyBrandingToDom(DEFAULT_BRANDING);
    }
  },

  updateBranding: async (payload: Partial<PortalBranding>) => {
    set({ isSaving: true, error: null, saveSuccess: false });
    try {
      const res = await fetch(`${API_BASE}/portal/branding`, {
        method: 'PATCH',
        headers: {
          ...getAuthHeaders(),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.detail || `HTTP ${res.status}`);
      }

      const updatedData: PortalBranding = await res.json();
      set({ branding: updatedData, isSaving: false, saveSuccess: true });
      get().applyBrandingToDom(updatedData);
    } catch (err: any) {
      set({ isSaving: false, error: err?.message || 'Failed to update branding', saveSuccess: false });
      throw err;
    }
  },
}));

