import React, { useEffect, useState } from 'react';
import { TopBar } from './components/TopBar';
import { ConversationList } from './components/ConversationList';
import { ChatCanvas } from './components/ChatCanvas';
import { CustomerProfileSidebar } from './components/CustomerProfileSidebar';
import { LoginModal } from './components/LoginModal';
import { AutomationsManager } from './components/Admin/AutomationsManager';
import { ExecutiveDashboard } from './components/Admin/ExecutiveDashboard';
import { CustomerDataHub } from './components/Admin/CustomerDataHub';
import { useCrmStore } from './store/useCrmStore';
import { useAuthStore } from './store/useAuthStore';
import { realtimeService } from './services/websocket';

export const App: React.FC = () => {
  const { fetchConversations, fetchUnreadSummary, handleRealtimeEvent } = useCrmStore();
  const { isAuthenticated, fetchMe, user } = useAuthStore();
  const [activeMainView, setActiveMainView] = useState<'chat' | 'automations' | 'dashboard' | 'database'>('chat');

  useEffect(() => {
    fetchMe();
  }, []);

  useEffect(() => {
    if (!isAuthenticated) return;

    console.log('[App] Hydrating CRM conversations & unread summary from FastAPI backend...');
    fetchConversations();
    fetchUnreadSummary();

    // 5-second background polling interval
    const pollInterval = setInterval(() => {
      fetchConversations();
      fetchUnreadSummary();
    }, 5000);

    // Connect to WebSocket real-time channel
    realtimeService.connect();

    // Subscribe store listener to real-time events
    const unsubscribe = realtimeService.subscribe((event) => {
      handleRealtimeEvent(event);
    });

    return () => {
      clearInterval(pollInterval);
      unsubscribe();
      realtimeService.close();
    };
  }, [isAuthenticated]);

  const isUserAdmin = user?.role === 'admin' || (user?.role as any) === 'ADMIN';

  return (
    <div className="h-screen w-screen flex flex-col bg-[#F8FAFC] text-slate-900 overflow-hidden select-none" dir="rtl">
      {!isAuthenticated && <LoginModal />}

      {/* Top Header & Brand Switcher */}
      <TopBar activeMainView={activeMainView} setActiveMainView={setActiveMainView} />

      {/* Main View Area */}
      {isUserAdmin && activeMainView === 'automations' ? (
        <AutomationsManager />
      ) : isUserAdmin && activeMainView === 'dashboard' ? (
        <ExecutiveDashboard />
      ) : isUserAdmin && activeMainView === 'database' ? (
        <CustomerDataHub />
      ) : (
        /* Main Multi-Pane Chat Workspace */
        <div className="flex-1 flex min-h-0 w-full overflow-hidden relative">
          {/* Right Sidebar: Inbox & Conversations Queue */}
          <ConversationList />

          {/* Center Pane: Active Chat Canvas */}
          <ChatCanvas />

          {/* Left Sidebar: Lead Attributes & Tag Groups */}
          <CustomerProfileSidebar />
        </div>
      )}
    </div>
  );
};

export default App;
