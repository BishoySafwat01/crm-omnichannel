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

    // Pre-cache authenticated credentials for popup access
    const authState = useAuthStore.getState();
    const token =
      authState.token ||
      (typeof window !== 'undefined' ? localStorage.getItem('auth_token') || localStorage.getItem('token') : null);
    const user = authState.user;

    if (typeof window !== 'undefined') {
      if (token) {
        (window as any).__CRM_AUTH_TOKEN__ = token;
        try {
          sessionStorage.setItem('auth_token', token);
        } catch {}
      }
      if (user) {
        (window as any).__CRM_AUTH_USER__ = user;
        try {
          sessionStorage.setItem('auth_user', JSON.stringify(user));
        } catch {}
      }
    }

    // Calculate centered popup coordinates
    const width = 650;
    const height = 750;
    let left = 200;
    let top = 100;
    if (typeof window !== 'undefined') {
      left = window.screenX + Math.max(0, (window.outerWidth - width) / 2);
      top = window.screenY + Math.max(0, (window.outerHeight - height) / 2);
    }
    const popupFeatures = `width=${width},height=${height},left=${left},top=${top},scrollbars=yes,status=yes,resizable=yes`;

    // Open popup immediately on click to prevent browser popup blockers
    let popup: Window | null = null;
    if (typeof window !== 'undefined') {
      try {
        popup = window.open('about:blank', 'meta_oauth_popup', popupFeatures);
        activeMetaPopup = popup;
        if (popup) {
          popup.document.write(`
            <!DOCTYPE html>
            <html dir="rtl">
            <head>
              <meta charset="utf-8">
              <title>Meta OAuth - LUXIRA</title>
              <style>
                body { font-family: system-ui, -apple-system, sans-serif; display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100vh; margin: 0; background: #0f172a; color: #f8fafc; text-align: center; }
                .spinner { width: 36px; height: 36px; border: 3px solid #334155; border-top: 3px solid #1877f2; border-radius: 50%; animation: spin 0.8s linear infinite; margin-bottom: 16px; }
                @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
                h3 { margin: 0 0 6px 0; font-size: 16px; font-weight: 700; }
                p { margin: 0; font-size: 12px; color: #94a3b8; }
              </style>
            </head>
            <body>
              <div class="spinner"></div>
              <h3>جارٍ الاتصال بـ Meta...</h3>
              <p>يرجى الانتظار لتجهيز نافذة المصادقة الموثقة</p>
            </body>
            </html>
          `);
        }
      } catch {
        // popup fallback handled below
      }
    }

    // Safety watchdog: reset state if popup closed or navigation stalls
    const popupWatcher = setInterval(() => {
      if (popup && popup.closed) {
        clearInterval(popupWatcher);
        activeMetaPopup = null;
        if (get().isConnecting) {
          set({ isConnecting: false });
        }
      }
    }, 500);

    const safetyWatchdog = setTimeout(() => {
      clearInterval(popupWatcher);
      if (get().isConnecting) {
        set({ isConnecting: false });
      }
    }, 60000);

    try {
      const defaultCallback = 'https://webluxira.com/api/v1/meta/oauth/callback';
      const redirectUri =
        customRedirectUri ||
        (typeof window !== 'undefined' && window.location.origin
          ? `${window.location.origin}/api/v1/meta/oauth/callback`
          : defaultCallback);

      if (typeof window !== 'undefined' && redirectUri) {
        sessionStorage.setItem('meta_oauth_redirect_uri', redirectUri);
      }

      const res = await metaOAuthApi.getMetaLoginUrl(redirectUri);
      if (res && res.authorization_url) {
        if (popup && !popup.closed) {
          popup.location.href = res.authorization_url;
          popup.focus();
        } else if (typeof window !== 'undefined') {
          // Fallback if popup blocker completely disallowed window.open
          window.location.href = res.authorization_url;
        }
      } else {
        if (popup && !popup.closed) popup.close();
        activeMetaPopup = null;
        clearInterval(popupWatcher);
        clearTimeout(safetyWatchdog);
        throw new Error('لم يتم استلام رابط تصريح Meta من الخادم');
      }
    } catch (err: any) {
      if (popup && !popup.closed) popup.close();
      activeMetaPopup = null;
      clearInterval(popupWatcher);
      clearTimeout(safetyWatchdog);
      console.error('[ChannelsStore] Failed to initiate Meta OAuth:', err);
      set({
        isConnecting: false,
        error: err.message || 'فشل في بدء عملية الربط مع Meta',
      });
    }
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

// Global Window Event Listeners (PostMessage & BFCache)
if (typeof window !== 'undefined') {
  // Listen for OAuth completion from popup window
  window.addEventListener('message', async (event) => {
    // Only accept messages from same origin
    if (event.origin !== window.location.origin) return;

    if (activeMetaPopup && !activeMetaPopup.closed) {
      try {
        activeMetaPopup.close();
      } catch {}
      activeMetaPopup = null;
    }

    if (event.data?.type === 'META_OAUTH_SUCCESS') {
      const { code, state, pages } = event.data;
      if (code && state) {
        useChannelsStore.setState({ isProcessingCallback: true, isConnecting: true });
        try {
          const res = await useChannelsStore.getState().handleOAuthCallback(code, state);
          if (res && res.success) {
            useChannelsStore.getState().fetchConnectedPages();
          }
        } catch (err: any) {
          useChannelsStore.setState({
            isConnecting: false,
            isProcessingCallback: false,
            error: err?.message || 'فشل في استكمال الربط مع حساب فيسبوك',
          });
        }
      } else if (pages && pages.length > 0) {
        useChannelsStore.setState({
          connectedPages: pages,
          isConnecting: false,
          isProcessingCallback: false,
          successMessage: `تم بنجاح ربط ${pages.length} صفحة من صفحات فيسبوك وتفعيل اشتراك الويب هـوك تلقائياً ✨`,
        });
        useChannelsStore.getState().fetchConnectedPages();
      } else {
        useChannelsStore.setState({
          isConnecting: false,
          isProcessingCallback: false,
        });
        useChannelsStore.getState().fetchConnectedPages();
      }
    } else if (event.data?.type === 'META_OAUTH_ERROR') {
      const rawError = event.data.error;
      const formattedError =
        typeof rawError === 'string'
          ? rawError
          : typeof rawError === 'number'
          ? `خطأ فيسبوك: رمز الخطأ ${rawError}`
          : rawError?.message || 'تم إلغاء عملية الربط';

      useChannelsStore.setState({
        isConnecting: false,
        isProcessingCallback: false,
        error: formattedError,
      });
    }
  });

  // Unlock connecting state if restored via browser back/forward cache (bfcache)
  window.addEventListener('pageshow', () => {
    useChannelsStore.setState({ isConnecting: false });
  });
}
