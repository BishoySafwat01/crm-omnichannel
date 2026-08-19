import React, { useEffect } from 'react';
import { TopBar } from './components/TopBar';
import { ConversationList } from './components/ConversationList';
import { ChatCanvas } from './components/ChatCanvas';
import { CustomerProfileSidebar } from './components/CustomerProfileSidebar';
import { useCrmStore } from './store/useCrmStore';
import { realtimeService } from './services/websocket';

export const App: React.FC = () => {
  const { fetchConversations, handleRealtimeEvent, conversations, isLoadingConversations } = useCrmStore();

  useEffect(() => {
    // Clear any corrupted local storage keys from previous sessions
    try {
      localStorage.removeItem('crm-storage');
      localStorage.removeItem('auth-storage');
    } catch (e) {
      // Ignore storage errors in restricted contexts
    }

    console.log('[App] Hydrating CRM conversations from FastAPI backend...');
    fetchConversations().then(() => {
      console.log('[App] Live conversations hydration complete. Count:', useCrmStore.getState().conversations.length);
    });

    // 5-second background polling interval
    const pollInterval = setInterval(() => {
      fetchConversations();
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
  }, []);

  return (
    <div className="h-screen w-screen flex flex-col bg-[#F8FAFC] text-slate-900 overflow-hidden select-none" dir="rtl">
      {/* Top Header & Brand Switcher */}
      <TopBar />

      {/* Main Multi-Pane Workspace */}
      <div className="flex-1 flex min-h-0 w-full overflow-hidden relative">
        {/* Right Sidebar: Inbox & Conversations Queue */}
        <ConversationList />

        {/* Center Pane: Active Chat Canvas */}
        <ChatCanvas />

        {/* Left Sidebar: Lead Attributes & Tag Groups */}
        <CustomerProfileSidebar />
      </div>
    </div>
  );
};

export default App;
