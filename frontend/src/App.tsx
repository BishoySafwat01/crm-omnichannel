import React, { useEffect, useRef, useState } from 'react';
import { TopBar } from './components/TopBar';
import { ConversationList } from './components/ConversationList';
import { ChatCanvas } from './components/ChatCanvas';
import { CustomerProfileSidebar } from './components/CustomerProfileSidebar';
import { LoginModal } from './components/LoginModal';
import { IntegrationsModal } from './components/IntegrationsModal';
import { AutomationsManager } from './components/Admin/AutomationsManager';
import { ExecutiveDashboard } from './components/Admin/ExecutiveDashboard';
import { CustomerDataHub } from './components/Admin/CustomerDataHub';
import { TeamGovernance } from './components/Admin/TeamGovernance';
import { SocialCommentsManager } from './components/Admin/SocialCommentsManager';
import { useCrmStore } from './store/useCrmStore';
import { useAuthStore } from './store/useAuthStore';
import { realtimeService } from './services/websocket';

export const App: React.FC = () => {
  const { fetchConversations, fetchUnreadSummary, fetchAvailableCountries, handleRealtimeEvent } = useCrmStore();
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
    const originalSocket = (realtimeService as any).socket;
    // We detect open/close via custom subscription events or by monkey-patching below
    // The simpler approach: subscribe to PONG to detect live connection
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

      {/* Top Header & Brand Switcher */}
      <TopBar activeMainView={activeMainView} setActiveMainView={setActiveMainView} />

      {/* Main View Area */}
      {isUserAdmin && activeMainView === 'comments' ? (
        <SocialCommentsManager />
      ) : isUserAdmin && activeMainView === 'automations' ? (
        <AutomationsManager />
      ) : isUserAdmin && activeMainView === 'dashboard' ? (
        <ExecutiveDashboard />
      ) : isUserAdmin && activeMainView === 'database' ? (
        <CustomerDataHub />
      ) : isUserAdmin && activeMainView === 'team' ? (
        <TeamGovernance />
      ) : (
        /* Main Multi-Pane Chat Workspace */
        <div className="flex-1 flex min-h-0 w-full overflow-hidden relative gap-3 px-4 pb-3">
          {/* Right Sidebar: Inbox & Conversations Queue */}
          <ConversationList />

          {/* Center Pane: Active Chat Canvas */}
          <ChatCanvas />

          {/* Left Sidebar: Lead Attributes & Customer Hub */}
          <CustomerProfileSidebar />
        </div>
      )}
    </div>
  );
};

export default App;
