import React, { useEffect, useState, useRef } from 'react';
import { Loader2, CheckCircle2, AlertCircle, X } from 'lucide-react';
import { useAuthStore, isAdminUser, User } from '../../store/useAuthStore';
import { useChannelsStore } from '../../store/useChannelsStore';
import { useCrmStore } from '../../store/useCrmStore';
import { authApi } from '../../services/api';

export const MetaOAuthCallbackHandler: React.FC = () => {
  const { user, isAuthenticated } = useAuthStore();
  const { handleOAuthCallback } = useChannelsStore();
  const { setIsIntegrationsModalOpen } = useCrmStore();

  const [notification, setNotification] = useState<{
    type: 'success' | 'error' | 'loading';
    message: string;
  } | null>(null);

  const processedRef = useRef(false);

  useEffect(() => {
    if (typeof window === 'undefined' || processedRef.current) return;

    const urlParams = new URLSearchParams(window.location.search);
    const code = urlParams.get('code');
    const state = urlParams.get('state');
    const metaError = urlParams.get('error');
    const errorCode = urlParams.get('error_code');
    const errorMessage = urlParams.get('error_message');
    const errorDescription = urlParams.get('error_description') || urlParams.get('error_reason');

    const hasError = Boolean(metaError || errorCode || errorMessage || errorDescription);

    // Case 1: Meta returned an error or user cancelled authorization
    if (hasError) {
      processedRef.current = true;
      const reportedError =
        errorMessage ||
        errorCode ||
        errorDescription ||
        metaError ||
        'تم إلغاء عملية الربط مع فيسبوك بواسطة المستخدم.';

      const formattedError =
        typeof reportedError === 'string'
          ? decodeURIComponent(reportedError.replace(/\+/g, ' '))
          : String(reportedError);

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

      (async () => {
        // 1. Resolve tokens and users across popup, opener, and local storage
        let activeToken =
          useAuthStore.getState().token ||
          (typeof window !== 'undefined' ? localStorage.getItem('auth_token') || localStorage.getItem('token') : null);

        let activeUser: User | null =
          useAuthStore.getState().user ||
          (() => {
            if (typeof window === 'undefined') return null;
            try {
              const cached = localStorage.getItem('auth_user');
              return cached ? JSON.parse(cached) : null;
            } catch {
              return null;
            }
          })();

        // 2. If token exists but user profile is null, fetch /auth/me before evaluating permissions
        if (activeToken && !activeUser) {
          setNotification({
            type: 'loading',
            message: 'جارٍ التحقق من صلاحيات مدير النظام وتأكيد جلسة المصادقة...',
          });
          try {
            activeUser = await authApi.getMe(activeToken);
            if (activeUser) {
              localStorage.setItem('auth_user', JSON.stringify(activeUser));
              useAuthStore.getState().setAuth(activeToken, activeUser);
            }
          } catch (profileErr) {
            console.warn('[OAuthCallback] Failed to fetch current user profile:', profileErr);
          }
        }

        // 3. Verify user authentication
        if (!activeToken) {
          const authErr = 'يجب تسجيل الدخول كمسؤول للنظام لإتمام عملية ربط القنوات.';
          setNotification({ type: 'error', message: authErr });
          return;
        }

        // 4. Verify admin permissions
        if (!isAdminUser(activeUser)) {
          const permErr = 'صلاحيات غير كافية: ربط صفحات فيسبوك يتطلب دور مدير النظام (Admin / Superadmin).';
          setNotification({ type: 'error', message: permErr });
          return;
        }

        // 5. Proceed with callback submission
        setNotification({
          type: 'loading',
          message: 'جارٍ استكمال مصادقة Meta OAuth وتشفير المفاتيح وتفعيل الويب هـوك تلقائياً...',
        });

        const result = await handleOAuthCallback(code, state, undefined, activeToken);

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
      })();
    }
  }, [isAuthenticated, user]);

  if (!notification) return null;

  // Render toast notification in main window
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
