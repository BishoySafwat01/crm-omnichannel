import React from 'react';
import { ConversationList } from './components/ConversationList';
import { ChatCanvas } from './components/ChatCanvas';
import { CustomerProfileSidebar } from './components/CustomerProfileSidebar';

export const ChatPage: React.FC = () => {
  return (
    <div className="flex-1 flex min-h-0 w-full overflow-hidden relative gap-3 px-4 pb-3">
      {/* Right Sidebar: Inbox & Conversations Queue */}
      <ConversationList />

      {/* Center Pane: Active Chat Canvas */}
      <ChatCanvas />

      {/* Left Sidebar: Lead Attributes & Customer Hub */}
      <CustomerProfileSidebar />
    </div>
  );
};

export default ChatPage;
