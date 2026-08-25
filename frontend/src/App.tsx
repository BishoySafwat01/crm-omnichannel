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
import { useCrmStore } from './store/useCrmStore';
import { useAuthStore } from './store/useAuthStore';
import { realtimeService } from './services/websocket';

export const App: React.FC = () => {
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
  const [activeMainView, setActiveMainView] = useState<'chat' | 'comments' | 'automations' | 'dashboard' | 'database' | 'team'>('chat');
  // P2-8: Track WebSocket connection state to suppress redundant polling
  const [wsConnected, setWsConnected] = useState(false);
  const wsConnectedRef = useRef(wsConnected);
  wsConnectedRef.current = wsConnected;

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

  const isUserAdmin = user?.role === 'admin' || (user?.role as any) === 'ADMIN';

  return (
    <div className="h-screen w-screen flex flex-col bg-slate-50 text-slate-900 font-sans overflow-hidden select-none" dir="rtl">
      {!isAuthenticated && <LoginModal />}
      <IntegrationsModal />

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
      {isUserAdmin && activeMainView === 'comments' ? (
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
