import React, { useState } from 'react';
import { ConversationList } from './components/ConversationList';
import { ChatCanvas } from './components/ChatCanvas';
import { CustomerProfileSidebar } from './components/CustomerProfileSidebar';
import { useCrmStore } from '../../store/useCrmStore';

export const ChatPage: React.FC = () => {
  const { activeConversationId } = useCrmStore();
  const [isProfileOpen, setIsProfileOpen] = useState(false);

  return (
    <div className="flex-1 flex min-h-0 w-full overflow-hidden relative gap-2 px-1.5 sm:px-2.5 pb-1.5 sm:pb-2.5">
      {/* Right Column (RTL Start): Inbox & Conversations Queue */}
      <div
        className={`h-full min-h-0 shrink-0 ${
          activeConversationId
            ? 'hidden lg:flex w-80 xl:w-96'
            : 'flex w-full lg:w-80 xl:w-96'
        }`}
      >
        <ConversationList className="w-full h-full" />
      </div>

      {/* Center Column: Active Chat Canvas */}
      <div
        className={`h-full min-h-0 flex-1 min-w-[380px] ${
          activeConversationId ? 'flex w-full' : 'hidden lg:flex'
        }`}
      >
        <ChatCanvas
          onToggleProfile={() => setIsProfileOpen((prev) => !prev)}
          isProfileOpen={isProfileOpen}
          onBackToList={() => useCrmStore.setState({ activeConversationId: null })}
        />
      </div>

      {/* Left Column: Lead Attributes & Customer Hub (Desktop >= 1400px / 2xl) */}
      <div className="hidden 2xl:flex shrink-0 h-full w-80 min-h-0">
        <CustomerProfileSidebar />
      </div>

      {/* Laptop, Tablet & Mobile Slide-Out Drawer Overlay (< 1400px / 2xl) */}
      {isProfileOpen && (
        <div className="fixed inset-0 z-50 2xl:hidden">
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs transition-opacity animate-in fade-in duration-150"
            onClick={() => setIsProfileOpen(false)}
          />
          {/* Slide-over Drawer (Fixed to Left edge for RTL natural ergonomics) */}
          <div className="fixed top-0 bottom-0 left-0 w-full max-w-sm sm:max-w-md bg-white shadow-2xl z-50 animate-in slide-in-from-left duration-200 flex flex-col">
            <CustomerProfileSidebar
              isDrawerMode={true}
              onClose={() => setIsProfileOpen(false)}
            />
          </div>
        </div>
      )}
    </div>
  );
};

export default ChatPage;
