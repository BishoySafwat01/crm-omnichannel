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
    // Initial fetch of conversations with browser console log
    console.log('[App] Hydrating CRM conversations from FastAPI backend...');
    fetchConversations().then(() => {
      console.log('[App] Live conversations hydration complete. Count:', useCrmStore.getState().conversations.length);
    });

    // 10-second background polling interval
    const pollInterval = setInterval(() => {
      fetchConversations();
    }, 10000);

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

      {/* Database Empty / Connection Banner Notice */}
      {!isLoadingConversations && conversations.length === 0 && (
        <div className="bg-amber-50 border-b border-amber-200 px-6 py-2 text-xs font-semibold text-amber-800 flex items-center justify-between">
          <span>تنبيه: لم يتم العثور على محادثات في قاعدة البيانات حالياً (أو يتعذر الاتصال بالخادم الرئيسي).</span>
          <button
            onClick={() => fetchConversations()}
            className="px-2.5 py-1 bg-amber-200 text-amber-900 rounded-lg hover:bg-amber-300 transition"
          >
            إعادة محاولة الاتصال
          </button>
        </div>
      )}

      {/* Main Multi-Pane Workspace */}
      <div className="flex-1 flex overflow-hidden relative">
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
