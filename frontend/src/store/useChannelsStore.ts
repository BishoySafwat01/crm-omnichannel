import { create } from 'zustand';
import { ConnectedPage } from '../types/crm';
import { metaOAuthApi } from '../services/api';

interface ChannelsState {
  connectedPages: ConnectedPage[];
  isLoadingPages: boolean;
  isConnecting: boolean;
  isProcessingCallback: boolean;
  error: string | null;
  successMessage: string | null;

  fetchConnectedPages: () => Promise<void>;
  initiateMetaConnect: (customRedirectUri?: string) => Promise<void>;
  cancelMetaConnect: () => void;
  handleOAuthCallback: (
    code: string,
    state: string,
    customRedirectUri?: string
  ) => Promise<{ success: boolean; count?: number; error?: string }>;
  clearFeedback: () => void;
}

export const useChannelsStore = create<ChannelsState>((set, get) => ({
  connectedPages: [],
  isLoadingPages: false,
  isConnecting: false,
  isProcessingCallback: false,
  error: null,
  successMessage: null,

  fetchConnectedPages: async () => {
    set({ isLoadingPages: true, error: null });
    try {
      const pages = await metaOAuthApi.getConnectedPages();
      set({ connectedPages: Array.isArray(pages) ? pages : [], isLoadingPages: false });
    } catch (err: any) {
      console.warn('[ChannelsStore] Failed to fetch connected pages:', err);
      set({
        error: err.message || 'فشل في تحميل الصفحات المتصلة',
        isLoadingPages: false,
      });
    }
  },

  initiateMetaConnect: async (customRedirectUri?: string) => {
    set({ isConnecting: true, error: null, successMessage: null });

    // 12-second safety watchdog: automatically release connecting state if navigation stalls or is blocked
    const watchdog = setTimeout(() => {
      if (get().isConnecting) {
        set({ isConnecting: false });
      }
    }, 12000);

    try {
      const redirectUri =
        customRedirectUri ||
        (typeof window !== 'undefined'
          ? `${window.location.origin}${window.location.pathname}`
          : '');

      if (typeof window !== 'undefined' && redirectUri) {
        sessionStorage.setItem('meta_oauth_redirect_uri', redirectUri);
      }

      const res = await metaOAuthApi.getMetaLoginUrl(redirectUri);
      if (res && res.authorization_url) {
        if (typeof window !== 'undefined') {
          window.location.href = res.authorization_url;
        }
      } else {
        clearTimeout(watchdog);
        throw new Error('لم يتم استلام رابط تصريح Meta');
      }
    } catch (err: any) {
      clearTimeout(watchdog);
      console.error('[ChannelsStore] Failed to initiate Meta OAuth:', err);
      set({
        isConnecting: false,
        error: err.message || 'فشل في بدء عملية الربط مع Meta',
      });
    }
  },

  cancelMetaConnect: () => {
    set({ isConnecting: false });
  },

  handleOAuthCallback: async (
    code: string,
    state: string,
    customRedirectUri?: string
  ) => {
    set({ isProcessingCallback: true, error: null, successMessage: null });
    try {
      const storedRedirect =
        typeof window !== 'undefined'
          ? sessionStorage.getItem('meta_oauth_redirect_uri')
          : null;
      const redirectUri =
        customRedirectUri ||
        storedRedirect ||
        (typeof window !== 'undefined'
          ? `${window.location.origin}${window.location.pathname}`
          : '');

      const savedPages = await metaOAuthApi.submitMetaOAuthCallback({
        code,
        state,
        redirect_uri: redirectUri,
      });

      if (typeof window !== 'undefined') {
        sessionStorage.removeItem('meta_oauth_redirect_uri');
      }

      set({
        connectedPages: savedPages,
        isProcessingCallback: false,
        successMessage: `تم بنجاح ربط ${savedPages.length} صفحة من صفحات فيسبوك وتفعيل اشتراك الويب هـوك تلقائياً ✨`,
      });

      return { success: true, count: savedPages.length };
    } catch (err: any) {
      console.error('[ChannelsStore] Failed to complete Meta OAuth callback:', err);
      if (typeof window !== 'undefined') {
        sessionStorage.removeItem('meta_oauth_redirect_uri');
      }
      const errMsg = err.message || 'فشل في استكمال الربط مع حساب فيسبوك';
      set({
        isProcessingCallback: false,
        error: errMsg,
      });
      return { success: false, error: errMsg };
    }
  },

  clearFeedback: () => set({ error: null, successMessage: null }),
}));

// Unlock connecting state if restored via browser back/forward cache (bfcache)
if (typeof window !== 'undefined') {
  window.addEventListener('pageshow', () => {
    useChannelsStore.setState({ isConnecting: false });
  });
}
