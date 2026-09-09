import React, { useEffect, useRef, useState } from 'react';
import { TopBar } from './components/layout/TopBar';
import { LoginModal } from './components/common/LoginModal';
import { IntegrationsModal } from './components/common/IntegrationsModal';
import { AdminSecurityAlertToast } from './components/common/AdminSecurityAlertToast';
import { LocationAlertToast } from './components/common/LocationAlertToast';
import { ChatPage } from './pages/Chat/ChatPage';
import { CommentsPage } from './pages/Comments/CommentsPage';
import { AutomationPage } from './pages/Automation/AutomationPage';
import { DashboardPage } from './pages/Dashboard/DashboardPage';
import { CustomersPage } from './pages/Customers/CustomersPage';
import { TeamPage } from './pages/Team/TeamPage';
import { ChannelsPage } from './pages/Channels/ChannelsPage';
import { PrivacyPolicyPage, TermsPage, DataDeletionPage } from './pages/Legal';
import { useCrmStore } from './store/useCrmStore';
import { useAuthStore, isAdminUser } from './store/useAuthStore';
import { realtimeService } from './services/websocket';
import { MetaOAuthCallbackHandler } from './components/oauth/MetaOAuthCallbackHandler';

export const App: React.FC = () => {
  const [currentPath, setCurrentPath] = useState<string>(() => {
    return typeof window !== 'undefined' ? window.location.pathname.toLowerCase() : '/';
  });

  useEffect(() => {
    const handleLocationChange = () => {
      setCurrentPath(window.location.pathname.toLowerCase());
    };

    window.addEventListener('popstate', handleLocationChange);
    return () => {
      window.removeEventListener('popstate', handleLocationChange);
    };
  }, []);

  const {
    fetchConversations,
    fetchUnreadSummary,
    fetchAvailableCountries,
    fetchTeamMembers,
    handleRealtimeEvent,
    adminSecurityAlerts,
    dismissSecurityAlert,
    setActiveConversationId,
    locationAlerts,
    dismissLocationAlert,
  } = useCrmStore();
  const { isAuthenticated, fetchMe, user } = useAuthStore();
  const [activeMainView, setActiveMainView] = useState<'chat' | 'comments' | 'automations' | 'dashboard' | 'database' | 'team' | 'channels'>('chat');
  // P2-8: Track WebSocket connection state to suppress redundant polling
  const [wsConnected, setWsConnected] = useState(false);
  const wsConnectedRef = useRef(wsConnected);
  wsConnectedRef.current = wsConnected;

  // Dedicated, Public Legal & Compliance Routes (No authentication required)
  if (currentPath === '/privacy-policy' || currentPath === '/privacy') {
    return <PrivacyPolicyPage />;
  }
  if (currentPath === '/terms-of-service' || currentPath === '/terms') {
    return <TermsPage />;
  }
  if (currentPath === '/data-deletion' || currentPath === '/deletion') {
    return <DataDeletionPage />;
  }

  // Meta OAuth Popup Window Interception:
  // If running inside a popup window, intercept errors/codes immediately to prevent rendering the full CRM shell.
  const isPopup = typeof window !== 'undefined' && Boolean(window.opener && window.opener !== window);
  const searchParams = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null;
  const errorCode = searchParams?.get('error_code');
  const errorMessage = searchParams?.get('error_message');
  const metaError = searchParams?.get('error');
  const errorDescription = searchParams?.get('error_description') || searchParams?.get('error_reason');
  const hasMetaError = Boolean(errorCode || errorMessage || metaError || errorDescription);
  const hasMetaCode = Boolean(searchParams?.get('code') && searchParams?.get('state'));

  if (isPopup) {
    if (hasMetaError) {
      const reportedError =
        errorMessage ||
        errorDescription ||
        metaError ||
        (errorCode ? `Facebook Error: ${errorCode}` : 'تم إلغاء عملية الربط');

      try {
        window.opener.postMessage(
          {
            type: 'META_OAUTH_ERROR',
            error: reportedError,
          },
          window.location.origin
        );
      } catch (e) {
        console.warn('[Popup] Failed to postMessage error to opener:', e);
      }
      window.close();
      setTimeout(() => window.close(), 100);

      return (
        <div className="fixed inset-0 bg-slate-950 flex items-center justify-center p-6 text-center select-none" dir="rtl">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 max-w-xs w-full space-y-3 shadow-2xl text-white">
            <div className="w-10 h-10 rounded-xl bg-rose-500/20 text-rose-400 flex items-center justify-center mx-auto">
              <div className="w-5 h-5 border-2 border-rose-400 border-t-transparent rounded-full animate-spin" />
            </div>
            <h3 className="text-sm font-bold text-white">جارٍ معالجة الاتصال وإغلاق النافذة...</h3>
            <p className="text-xs text-slate-400">{reportedError}</p>
          </div>
        </div>
      );
    }

    const code = searchParams?.get('code');
    const state = searchParams?.get('state');
    if (code && state) {
      try {
        window.opener.postMessage(
          {
            type: 'META_OAUTH_SUCCESS',
            code,
            state,
          },
          window.location.origin
        );
      } catch (e) {
        console.warn('[Popup] Failed to postMessage success to opener:', e);
      }
      window.close();
      setTimeout(() => window.close(), 100);

      return (
        <div className="fixed inset-0 bg-slate-950 flex items-center justify-center p-6 text-center select-none" dir="rtl">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 max-w-xs w-full space-y-3 shadow-2xl text-white">
            <div className="w-10 h-10 rounded-xl bg-blue-500/20 text-blue-400 flex items-center justify-center mx-auto">
              <div className="w-5 h-5 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
            </div>
            <h3 className="text-sm font-bold text-white">جارٍ معالجة الاتصال وإغلاق النافذة...</h3>
            <p className="text-xs text-slate-400">تم استلام تصريح Meta بنجاح</p>
          </div>
        </div>
      );
    }

    // Default popup fallback: close immediately and render minimal blank loader
    window.close();
    setTimeout(() => window.close(), 100);

    return (
      <div className="fixed inset-0 bg-slate-950 flex items-center justify-center p-6 text-center select-none" dir="rtl">
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 max-w-xs w-full space-y-3 shadow-2xl text-white">
          <div className="w-10 h-10 rounded-xl bg-blue-500/20 text-blue-400 flex items-center justify-center mx-auto">
            <div className="w-5 h-5 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
          </div>
          <h3 className="text-sm font-bold text-white">جارٍ معالجة الاتصال وإغلاق النافذة...</h3>
        </div>
      </div>
    );
  }

  useEffect(() => {
    fetchMe();
  }, []);

  useEffect(() => {
    if (!isAuthenticated) return;

    console.log('[App] Hydrating CRM conversations, unread summary & locations from FastAPI backend...');
    fetchConversations();
    fetchUnreadSummary();
    fetchAvailableCountries();
    fetchTeamMembers();

    // P2-8: Fallback polling — only runs when WebSocket is NOT connected.
    // Interval is set conservatively (30s) to reduce server load.
    const pollInterval = setInterval(() => {
      if (!wsConnectedRef.current) {
        fetchConversations();
        fetchUnreadSummary();
      }
    }, 30000);

    // Connect to WebSocket real-time channel
    realtimeService.connect();

    // Track open/close so polling can be suppressed while WS is active
    const unsubscribeWs = realtimeService.subscribe((event) => {
      if (event.type === 'PONG' || event.type) {
        if (!wsConnectedRef.current) {
          setWsConnected(true);
        }
      }
      handleRealtimeEvent(event);
    });

    // Send a periodic PING to detect connection state
    const pingInterval = setInterval(() => {
      try {
        realtimeService.send({ type: 'PING' });
        setWsConnected(true);
      } catch {
        setWsConnected(false);
      }
    }, 10000);

    return () => {
      clearInterval(pollInterval);
      clearInterval(pingInterval);
      unsubscribeWs();
      realtimeService.close();
      setWsConnected(false);
    };
  }, [isAuthenticated]);

  const isUserAdmin = isAdminUser(user);

  return (
    <div className="h-screen w-screen flex flex-col bg-slate-50 text-slate-900 font-sans overflow-hidden select-none" dir="rtl">
      {!isAuthenticated && <LoginModal />}
      <IntegrationsModal />
      <MetaOAuthCallbackHandler />

      {/* Real-time Red Admin Security Alert Toasts */}
      {isUserAdmin && (
        <AdminSecurityAlertToast
          alerts={adminSecurityAlerts}
          onDismiss={dismissSecurityAlert}
          onNavigateToChat={(convId) => {
            setActiveMainView('chat');
            if (convId) {
              setActiveConversationId(convId);
            }
          }}
        />
      )}

      {/* Real-time Green Location Detection Toasts */}
      <LocationAlertToast
        alerts={locationAlerts}
        onDismiss={dismissLocationAlert}
      />

      {/* Top Header & Brand Switcher */}
      <TopBar activeMainView={activeMainView} setActiveMainView={setActiveMainView} />

      {/* Main View Area (Feature / Page-Based Routing) */}
      {isUserAdmin && activeMainView === 'channels' ? (
        <ChannelsPage />
      ) : isUserAdmin && activeMainView === 'comments' ? (
        <CommentsPage />
      ) : isUserAdmin && activeMainView === 'automations' ? (
        <AutomationPage />
      ) : isUserAdmin && activeMainView === 'dashboard' ? (
        <DashboardPage />
      ) : isUserAdmin && activeMainView === 'database' ? (
        <CustomersPage />
      ) : isUserAdmin && activeMainView === 'team' ? (
        <TeamPage />
      ) : (
        <ChatPage />
      )}
    </div>
  );
};

export default App;
