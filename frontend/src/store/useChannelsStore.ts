import { create } from 'zustand';
import { ConnectedPage } from '../types/crm';
import { metaOAuthApi } from '../services/api';
import { useAuthStore } from './useAuthStore';

interface ChannelsState {
  connectedPages: ConnectedPage[];
  isLoadingPages: boolean;
  isConnecting: boolean;
  isProcessingCallback: boolean;
  actionLoadingMap: Record<string, boolean>;
  error: string | null;
  successMessage: string | null;

  fetchConnectedPages: () => Promise<void>;
  initiateMetaConnect: (customRedirectUri?: string) => Promise<void>;
  connectMetaPage: (customRedirectUri?: string) => Promise<void>;
  cancelMetaConnect: () => void;
  handleOAuthCallback: (
    code: string,
    state: string,
    customRedirectUri?: string,
    tokenOverride?: string
  ) => Promise<{ success: boolean; count?: number; pages?: ConnectedPage[]; error?: string }>;
  subscribePageWebhook: (pageId: string) => Promise<boolean>;
  togglePageStatus: (pageId: string, currentStatus: string) => Promise<boolean>;
  disconnectPage: (pageId: string) => Promise<boolean>;
  syncPageHistory: (pageId: string) => Promise<boolean>;
  clearFeedback: () => void;
}

let activeMetaPopup: Window | null = null;

export const useChannelsStore = create<ChannelsState>((set, get) => ({
  connectedPages: [],
  isLoadingPages: false,
  isConnecting: false,
  isProcessingCallback: false,
  actionLoadingMap: {},
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

    try {
      // 1. Fetch authorization URL from backend FIRST
      const defaultCallback = 'https://webluxira.com/api/v1/meta/oauth/callback';
      const redirectUri =
        customRedirectUri ||
        (typeof window !== 'undefined' && window.location.origin
          ? `${window.location.origin}/api/v1/meta/oauth/callback`
          : defaultCallback);

      const res = await metaOAuthApi.getMetaLoginUrl(redirectUri);
      const authUrl = res?.authorization_url;
      if (!authUrl) throw new Error('فشل في إنشاء رابط تصريح Meta من الخادم');

      // 2. Open popup directly pointing to Facebook OAuth
      const width = 650;
      const height = 750;
      let left = 200;
      let top = 100;
      if (typeof window !== 'undefined') {
        left = window.screenX + Math.max(0, (window.outerWidth - width) / 2);
        top = window.screenY + Math.max(0, (window.outerHeight - height) / 2);
      }
      const popup = window.open(
        authUrl,
        'Meta_OAuth_Window',
        `width=${width},height=${height},left=${left},top=${top},status=no,resizable=yes`
      );

      activeMetaPopup = popup;

      if (!popup && typeof window !== 'undefined') {
        // Fallback if popup blocker completely disallowed window.open
        window.location.href = authUrl;
        return;
      }

      // 3. Listen for pure PostMessage event from backend landing
      const handleMessage = async (event: MessageEvent) => {
        if (event.origin !== window.location.origin) return;
        if (event.data?.type === 'META_OAUTH_COMPLETE') {
          window.removeEventListener('message', handleMessage);
          activeMetaPopup = null;
          if (event.data.status === 'success') {
            await get().fetchConnectedPages();
            set({
              isConnecting: false,
              successMessage: 'تم بنجاح ربط صفحاتك وتفعيل اشتراك الويب هـوك تلقائياً ✨',
            });
          } else {
            set({
              isConnecting: false,
              error: event.data.error || 'فشلت عملية الربط مع حساب فيسبوك',
            });
          }
        }
      };
      window.addEventListener('message', handleMessage);

      // Safe window closed check: only resets if user manually closes popup window
      const checkClosed = setInterval(() => {
        if (popup && popup.closed) {
          clearInterval(checkClosed);
          window.removeEventListener('message', handleMessage);
          activeMetaPopup = null;
          if (get().isConnecting) {
            set({ isConnecting: false });
          }
        }
      }, 1000);
    } catch (err: any) {
      activeMetaPopup = null;
      console.error('[ChannelsStore] Failed to initiate Meta OAuth:', err);
      set({
        isConnecting: false,
        error: err?.message || 'فشل في بدء عملية الربط مع Meta',
      });
    }
  },

  connectMetaPage: async (customRedirectUri?: string) => {
    return get().initiateMetaConnect(customRedirectUri);
  },

  cancelMetaConnect: () => {
    if (activeMetaPopup && !activeMetaPopup.closed) {
      try {
        activeMetaPopup.close();
      } catch {}
      activeMetaPopup = null;
    }
    set({ isConnecting: false });
  },

  handleOAuthCallback: async (
    code: string,
    state: string,
    customRedirectUri?: string,
    tokenOverride?: string
  ) => {
    set({ isProcessingCallback: true, error: null, successMessage: null });
    try {
      const storedRedirect =
        typeof window !== 'undefined'
          ? sessionStorage.getItem('meta_oauth_redirect_uri')
          : null;
      const defaultCallback = 'https://webluxira.com/api/v1/meta/oauth/callback';
      const redirectUri =
        customRedirectUri ||
        storedRedirect ||
        (typeof window !== 'undefined' && window.location.origin
          ? `${window.location.origin}/api/v1/meta/oauth/callback`
          : defaultCallback);

      // Resolve active bearer token with opener fallback
      let activeToken = tokenOverride;
      if (!activeToken && typeof window !== 'undefined') {
        activeToken =
          useAuthStore.getState().token ||
          localStorage.getItem('auth_token') ||
          localStorage.getItem('token') ||
          (window as any).__CRM_AUTH_TOKEN__ ||
          sessionStorage.getItem('auth_token') ||
          undefined;

        if (!activeToken && window.opener && window.opener !== window) {
          try {
            const opener = window.opener as any;
            activeToken =
              opener.useAuthStore?.getState?.()?.token ||
              opener.__CRM_AUTH_TOKEN__ ||
              opener.localStorage?.getItem('auth_token') ||
              opener.localStorage?.getItem('token') ||
              undefined;
          } catch {}
        }
      }

      const savedPages = await metaOAuthApi.submitMetaOAuthCallback(
        {
          code,
          state,
          redirect_uri: redirectUri,
        },
        activeToken
      );

      if (typeof window !== 'undefined') {
        sessionStorage.removeItem('meta_oauth_redirect_uri');
      }

      set({
        connectedPages: savedPages,
        isProcessingCallback: false,
        isConnecting: false,
        successMessage: `تم بنجاح ربط ${savedPages.length} صفحة من صفحات فيسبوك وتفعيل اشتراك الويب هـوك تلقائياً ✨`,
      });

      return { success: true, count: savedPages.length, pages: savedPages };
    } catch (err: any) {
      console.error('[ChannelsStore] Failed to complete Meta OAuth callback:', err);
      if (typeof window !== 'undefined') {
        sessionStorage.removeItem('meta_oauth_redirect_uri');
      }
      const errMsg = err.message || 'فشل في استكمال الربط مع حساب فيسبوك';
      set({
        isProcessingCallback: false,
        isConnecting: false,
        error: errMsg,
      });
      return { success: false, error: errMsg };
    }
  },

  subscribePageWebhook: async (pageId: string) => {
    set((state) => ({
      actionLoadingMap: { ...state.actionLoadingMap, [`sub_${pageId}`]: true },
      error: null,
      successMessage: null,
    }));
    try {
      const updatedPage = await metaOAuthApi.subscribeConnectedPage(pageId);
      set((state) => ({
        connectedPages: state.connectedPages.map((p) =>
          p.page_id === pageId ? { ...p, is_webhook_subscribed: updatedPage.is_webhook_subscribed } : p
        ),
        actionLoadingMap: { ...state.actionLoadingMap, [`sub_${pageId}`]: false },
        successMessage: updatedPage.is_webhook_subscribed
          ? `تم بنجاح تفعيل اشتراك الويب هـوك للصفحة (${updatedPage.name}) ✨`
          : `تعذر تفعيل الاشتراك التلقائي للصفحة (${updatedPage.name})`,
      }));
      return true;
    } catch (err: any) {
      set((state) => ({
        actionLoadingMap: { ...state.actionLoadingMap, [`sub_${pageId}`]: false },
        error: err.message || 'فشل في تحديث اشتراك الويب هـوك',
      }));
      return false;
    }
  },

  togglePageStatus: async (pageId: string, currentStatus: string) => {
    const nextStatus = currentStatus === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE';
    set((state) => ({
      actionLoadingMap: { ...state.actionLoadingMap, [`status_${pageId}`]: true },
      error: null,
      successMessage: null,
    }));
    try {
      const updatedPage = await metaOAuthApi.updateConnectedPageStatus(pageId, nextStatus);
      set((state) => ({
        connectedPages: state.connectedPages.map((p) =>
          p.page_id === pageId ? { ...p, status: updatedPage.status } : p
        ),
        actionLoadingMap: { ...state.actionLoadingMap, [`status_${pageId}`]: false },
        successMessage: `تم تحديث حالة الصفحة (${updatedPage.name}) إلى: ${updatedPage.status === 'ACTIVE' ? 'نشط 🟢' : 'معطل ⚪'}`,
      }));
      return true;
    } catch (err: any) {
      set((state) => ({
        actionLoadingMap: { ...state.actionLoadingMap, [`status_${pageId}`]: false },
        error: err.message || 'فشل في تغيير حالة الصفحة',
      }));
      return false;
    }
  },

  disconnectPage: async (pageId: string) => {
    set((state) => ({
      actionLoadingMap: { ...state.actionLoadingMap, [`del_${pageId}`]: true },
      error: null,
      successMessage: null,
    }));
    try {
      await metaOAuthApi.deleteConnectedPage(pageId);
      set((state) => ({
        connectedPages: state.connectedPages.filter((p) => p.page_id !== pageId),
        actionLoadingMap: { ...state.actionLoadingMap, [`del_${pageId}`]: false },
        successMessage: 'تم بنجاح إلغاء ربط الصفحة وحذفها من النظام 🗑️',
      }));
      return true;
    } catch (err: any) {
      set((state) => ({
        actionLoadingMap: { ...state.actionLoadingMap, [`del_${pageId}`]: false },
        error: err.message || 'فشل في إلغاء ربط الصفحة',
      }));
      return false;
    }
  },

  syncPageHistory: async (pageId: string) => {
    set((state) => ({
      actionLoadingMap: { ...state.actionLoadingMap, [`sync_${pageId}`]: true },
      error: null,
      successMessage: null,
    }));
    try {
      await metaOAuthApi.syncConnectedPageHistory(pageId);
      set((state) => ({
        actionLoadingMap: { ...state.actionLoadingMap, [`sync_${pageId}`]: false },
        successMessage: 'تم تشغيل مهمة سحب ومزامنة محادثات الصفحة من فيسبوك بنجاح 🔄',
      }));
      return true;
    } catch (err: any) {
      set((state) => ({
        actionLoadingMap: { ...state.actionLoadingMap, [`sync_${pageId}`]: false },
        error: err.message || 'فشل في بدء مزامنة محادثات الصفحة',
      }));
      return false;
    }
  },

  clearFeedback: () => set({ error: null, successMessage: null }),
}));

// Global Window Event Listeners (BFCache)
if (typeof window !== 'undefined') {
  // Unlock connecting state if restored via browser back/forward cache (bfcache)
  window.addEventListener('pageshow', () => {
    useChannelsStore.setState({ isConnecting: false });
  });
}
