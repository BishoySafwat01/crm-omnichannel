import React, { useEffect, useState, useRef } from 'react';
import { Loader2, CheckCircle2, AlertCircle, X, Facebook, ShieldCheck } from 'lucide-react';
import { useAuthStore, isAdminUser } from '../../store/useAuthStore';
import { useChannelsStore } from '../../store/useChannelsStore';
import { useCrmStore } from '../../store/useCrmStore';

export const MetaOAuthCallbackHandler: React.FC = () => {
  const { user, isAuthenticated } = useAuthStore();
  const { handleOAuthCallback } = useChannelsStore();
  const { setIsIntegrationsModalOpen } = useCrmStore();

  const [notification, setNotification] = useState<{
    type: 'success' | 'error' | 'loading';
    message: string;
  } | null>(null);

  const [isPopupMode, setIsPopupMode] = useState(false);
  const processedRef = useRef(false);

  useEffect(() => {
    if (typeof window === 'undefined' || processedRef.current) return;

    const urlParams = new URLSearchParams(window.location.search);
    const code = urlParams.get('code');
    const state = urlParams.get('state');
    const metaError = urlParams.get('error');
    const errorDescription = urlParams.get('error_description') || urlParams.get('error_reason');

    const isPopup = Boolean(window.opener && window.opener !== window);
    setIsPopupMode(isPopup);

    // Case 1: Meta returned an error or user cancelled authorization
    if (metaError) {
      processedRef.current = true;
      const formattedError = errorDescription
        ? `تم إلغاء أو تعذر الاتصال مع فيسبوك: ${decodeURIComponent(errorDescription)}`
        : 'تم إلغاء عملية الربط مع فيسبوك بواسطة المستخدم.';

      if (isPopup) {
        try {
          window.opener.postMessage(
            {
              type: 'META_OAUTH_ERROR',
              error: formattedError,
            },
            window.location.origin
          );
        } catch (e) {
          console.warn('[Popup] Failed to postMessage error to opener:', e);
        }
        window.history.replaceState({}, document.title, window.location.pathname);
        setTimeout(() => window.close(), 600);
        return;
      }

      window.history.replaceState({}, document.title, window.location.pathname);
      setNotification({
        type: 'error',
        message: formattedError,
      });
      return;
    }

    // Case 2: Code and state returned from Meta OAuth dialog
    if (code && state) {
      processedRef.current = true;

      // Clean URL query parameters immediately to avoid re-triggering on accidental reload
      window.history.replaceState({}, document.title, window.location.pathname);

      // Verify user permissions
      if (!isAuthenticated) {
        const authErr = 'يجب تسجيل الدخول كمسؤول للنظام لإتمام عملية ربط القنوات.';
        if (isPopup) {
          try {
            window.opener.postMessage({ type: 'META_OAUTH_ERROR', error: authErr }, window.location.origin);
          } catch {}
          setTimeout(() => window.close(), 800);
          return;
        }
        setNotification({ type: 'error', message: authErr });
        return;
      }

      if (!isAdminUser(user)) {
        const permErr = 'صلاحيات غير كافية: ربط صفحات فيسبوك يتطلب دور مدير النظام (Admin / Superadmin).';
        if (isPopup) {
          try {
            window.opener.postMessage({ type: 'META_OAUTH_ERROR', error: permErr }, window.location.origin);
          } catch {}
          setTimeout(() => window.close(), 800);
          return;
        }
        setNotification({ type: 'error', message: permErr });
        return;
      }

      setNotification({
        type: 'loading',
        message: 'جارٍ استكمال مصادقة Meta OAuth وتشفير المفاتيح وتفعيل الويب هـوك تلقائياً...',
      });

      handleOAuthCallback(code, state).then((result) => {
        if (isPopup) {
          if (result.success) {
            setNotification({
              type: 'success',
              message: `تم الربط بنجاح! جارٍ إغلاق النافذة...`,
            });
            try {
              window.opener.postMessage(
                {
                  type: 'META_OAUTH_SUCCESS',
                  pages: result.pages || [],
                  count: result.count || 0,
                },
                window.location.origin
              );
            } catch (e) {
              console.warn('[Popup] Failed to postMessage success to opener:', e);
            }
            setTimeout(() => window.close(), 600);
          } else {
            setNotification({
              type: 'error',
              message: result.error || 'فشل في استكمال الربط مع حساب فيسبوك.',
            });
            try {
              window.opener.postMessage(
                {
                  type: 'META_OAUTH_ERROR',
                  error: result.error || 'فشل في استكمال الربط مع حساب فيسبوك.',
                },
                window.location.origin
              );
            } catch (e) {
              console.warn('[Popup] Failed to postMessage error to opener:', e);
            }
            setTimeout(() => window.close(), 800);
          }
          return;
        }

        // Standard in-page redirect fallback
        if (result.success) {
          setNotification({
            type: 'success',
            message: `تم بنجاح ربط ${result.count || 0} صفحة من صفحات فيسبوك وتفعيل اشتراك الويب هـوك ✨`,
          });
          setIsIntegrationsModalOpen(true);
          setTimeout(() => {
            setNotification(null);
          }, 6000);
        } else {
          setNotification({
            type: 'error',
            message: result.error || 'فشل في استكمال الربط مع حساب فيسبوك.',
          });
        }
      });
    }
  }, [isAuthenticated, user]);

  if (!notification) return null;

  // In popup mode, render a clean dedicated full-screen card
  if (isPopupMode) {
    return (
      <div className="fixed inset-0 bg-slate-950/90 backdrop-blur-md z-[99999] flex items-center justify-center p-6 text-center dir-rtl">
        <div className="bg-slate-900 border border-slate-700/80 rounded-3xl p-8 max-w-sm w-full space-y-4 shadow-2xl animate-in zoom-in-95 duration-150 text-white">
          <div className="w-12 h-12 rounded-2xl bg-[#1877F2]/20 border border-[#1877F2]/30 text-[#1877F2] flex items-center justify-center mx-auto">
            {notification.type === 'loading' && <Loader2 className="w-6 h-6 animate-spin text-[#1877F2]" />}
            {notification.type === 'success' && <CheckCircle2 className="w-6 h-6 text-emerald-400" />}
            {notification.type === 'error' && <AlertCircle className="w-6 h-6 text-rose-400" />}
          </div>
          <div>
            <h3 className="text-sm font-black">
              {notification.type === 'loading'
                ? 'جارٍ استكمال الربط الآمن...'
                : notification.type === 'success'
                ? 'اكتملت المصادقة بنجاح'
                : 'تنبيه المصادقة'}
            </h3>
            <p className="text-xs text-slate-400 mt-1 leading-relaxed">{notification.message}</p>
          </div>
        </div>
      </div>
    );
  }

  // In main window mode, render toast notification
  return (
    <div className="fixed top-5 left-1/2 -translate-x-1/2 z-[99999] max-w-lg w-[92%] dir-rtl animate-in fade-in slide-in-from-top-4 duration-200">
      <div
        className={`p-4 rounded-2xl shadow-2xl border backdrop-blur-xl flex items-start justify-between gap-3 text-right ${
          notification.type === 'loading'
            ? 'bg-slate-900/95 border-slate-700 text-white'
            : notification.type === 'success'
            ? 'bg-emerald-950/95 border-emerald-500/50 text-emerald-100'
            : 'bg-rose-950/95 border-rose-500/50 text-rose-100'
        }`}
      >
        <div className="flex items-start gap-3">
          <div className="mt-0.5 shrink-0">
            {notification.type === 'loading' && (
              <Loader2 className="w-5 h-5 text-[#1877F2] animate-spin" />
            )}
            {notification.type === 'success' && (
              <CheckCircle2 className="w-5 h-5 text-emerald-400" />
            )}
            {notification.type === 'error' && (
              <AlertCircle className="w-5 h-5 text-rose-400" />
            )}
          </div>
          <div className="space-y-0.5">
            <h4 className="text-xs font-black tracking-wide">
              {notification.type === 'loading'
                ? 'مصادقة Meta Dynamic OAuth'
                : notification.type === 'success'
                ? 'تم اكتمال الربط بنجاح'
                : 'تنبيه الربط مع Meta'}
            </h4>
            <p className="text-[11px] leading-relaxed opacity-90">{notification.message}</p>
          </div>
        </div>

        {notification.type !== 'loading' && (
          <button
            onClick={() => setNotification(null)}
            className="p-1 rounded-lg hover:bg-white/10 transition text-white/70 hover:text-white shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>
    </div>
  );
};
export default MetaOAuthCallbackHandler;
