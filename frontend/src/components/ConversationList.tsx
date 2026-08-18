import React, { useMemo } from 'react';
import { Search, Filter, MessageCircle, Clock, CheckCheck, Tag, User } from 'lucide-react';
import { useCrmStore } from '../store/useCrmStore';
import { FilterTab } from '../types/crm';
import { UserAvatar } from './UserAvatar';

const PRIORITY_BADGES: Record<string, { label: string; color: string }> = {
  low: { label: 'منخفضة', color: 'bg-slate-100 text-slate-600 border-slate-200' },
  normal: { label: 'عادية', color: 'bg-slate-100 text-slate-600 border-slate-200' },
  high: { label: 'عالية', color: 'bg-amber-50 text-amber-700 border-amber-200 font-semibold' },
  urgent: { label: 'عاجلة', color: 'bg-rose-50 text-rose-700 border-rose-200 font-bold' },
};

export const ConversationList: React.FC = () => {
  const {
    conversations,
    selectedBrandId,
    activeConversationId,
    setActiveConversationId,
    searchQuery,
    setSearchQuery,
    activeFilterTab,
    setActiveFilterTab,
    isLoadingConversations,
  } = useCrmStore();

  const filteredConversations = useMemo(() => {
    if (!conversations || !Array.isArray(conversations)) return [];

    return conversations.filter((conv) => {
      // 1. Search Query Filter
      if (searchQuery && searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const name = (conv.customer_display_name || conv.customer?.display_name || '').toLowerCase();
        const lastMsg = (conv.last_message_text || '').toLowerCase();
        const extId = (conv.external_conversation_id || '').toLowerCase();
        if (!name.includes(q) && !lastMsg.includes(q) && !extId.includes(q)) return false;
      }

      // 2. Status Filter
      if (activeFilterTab === 'unread' && (conv.unread_count || 0) === 0) return false;
      if (activeFilterTab === 'completed' && conv.status !== 'closed' && conv.status !== 'completed') return false;

      // 3. Brand Filter (If 'ALL' or 'all' or empty, show all conversations)
      if (!selectedBrandId || selectedBrandId === 'all' || selectedBrandId === 'ALL' || selectedBrandId === 'الكل') return true;

      const convBrand = ((conv as any).brand || (conv as any).business_unit || conv.subject || '').toUpperCase();
      return !convBrand || convBrand.includes(selectedBrandId.toUpperCase());
    });
  }, [conversations, searchQuery, activeFilterTab, selectedBrandId]);

  const filterTabs: { id: FilterTab; label: string; icon: React.ReactNode }[] = [
    { id: 'all', label: 'الكل', icon: <MessageCircle className="w-3.5 h-3.5" /> },
    { id: 'unread', label: 'غير مقروءة', icon: <Clock className="w-3.5 h-3.5" /> },
    { id: 'completed', label: 'مكتملة', icon: <CheckCheck className="w-3.5 h-3.5" /> },
    { id: 'tagged', label: 'التصنيفات', icon: <Tag className="w-3.5 h-3.5" /> },
  ];

  const formatTimestamp = (isoStr: string) => {
    if (!isoStr) return '';
    const date = new Date(isoStr);
    return date.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <aside className="w-80 md:w-96 bg-white/80 backdrop-blur-md border-l border-slate-200/80 flex flex-col shrink-0 h-full relative z-10">
      {/* Header Search Bar */}
      <div className="p-3.5 border-b border-slate-200/80 space-y-3">
        <div className="relative">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="بحث بالاسم، الهاتف، أو المعرف..."
            className="w-full bg-slate-100/80 text-slate-900 text-xs rounded-full pr-9 pl-4 py-2 border border-slate-200/80 focus:border-teal-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-teal-500/20 transition font-medium placeholder-slate-400"
          />
          <Search className="w-4 h-4 text-slate-400 absolute right-3 top-2.5" />
        </div>

        {/* Filter Tabs */}
        <div className="grid grid-cols-4 gap-1 p-1 bg-slate-100/80 rounded-xl border border-slate-200/60">
          {filterTabs.map((tab) => {
            const isActive = activeFilterTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveFilterTab(tab.id)}
                className={`flex items-center justify-center gap-1 py-1.5 px-1 rounded-lg text-[11px] font-semibold transition ${
                  isActive
                    ? 'bg-white text-teal-800 shadow-xs border border-slate-200/80 font-bold'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-white/50'
                }`}
              >
                {tab.icon}
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Conversations Scroll Area */}
      <div className="flex-1 overflow-y-auto p-2.5 space-y-2">
        {isLoadingConversations ? (
          <div className="p-8 text-center text-xs text-slate-400 animate-pulse font-medium">
            جاري تحميل المحادثات...
          </div>
        ) : filteredConversations.length === 0 ? (
          <div className="p-8 text-center text-xs text-slate-400 space-y-2">
            <Filter className="w-7 h-7 text-slate-300 mx-auto" />
            <p>لا توجد محادثات متطابقة مع البحث الحالي</p>
          </div>
        ) : (
          filteredConversations.map((conv) => {
            const isActive = activeConversationId === conv.id;
            const customerName = conv.customer_display_name || conv.customer?.display_name || 'عميل';
            const avatarUrl = conv.customer_avatar_url || conv.customer?.avatar_url;
            const brandLabel = conv.brand_name || 'LUXIRA';
            const unreadCount = conv.unread_count || 0;
            const priorityInfo = PRIORITY_BADGES[conv.priority || 'normal'];

            return (
              <div
                key={conv.id}
                onClick={() => setActiveConversationId(conv.id)}
                className={`p-3 rounded-2xl cursor-pointer transition-all duration-150 ${
                  isActive ? 'glass-card-active' : 'glass-card hover:bg-slate-50/80'
                }`}
              >
                <div className="flex items-start justify-between gap-2 mb-1.5">
                  <div className="flex items-center gap-2.5">
                    {/* User Avatar */}
                    <div className="relative">
                      <UserAvatar name={customerName} avatarUrl={avatarUrl} size="md" />
                      <span className="w-2.5 h-2.5 bg-emerald-500 border-2 border-white rounded-full absolute bottom-0 right-0" />
                    </div>

                    <div>
                      <div className="flex items-center gap-1.5">
                        <h3 className="text-xs font-bold text-slate-900">{customerName}</h3>
                        {/* Priority Badge */}
                        {conv.priority && conv.priority !== 'normal' && (
                          <span
                            className={`text-[9px] px-1.5 py-0.2 rounded-full border ${priorityInfo.color}`}
                          >
                            {priorityInfo.label}
                          </span>
                        )}
                      </div>
                      <span className="text-[10px] text-teal-700 bg-teal-50 px-1.5 py-0.2 rounded font-semibold border border-teal-200/60">
                        {brandLabel}
                      </span>
                    </div>
                  </div>

                  {/* Timestamp & Assigned Agent indicator */}
                  <div className="flex flex-col items-end gap-1">
                    <span className="text-[10px] text-slate-400 font-medium whitespace-nowrap">
                      {formatTimestamp(conv.last_message_at)}
                    </span>
                    {conv.assigned_agent_id && (
                      <span className="text-[9px] bg-indigo-50 text-indigo-700 px-1.5 py-0.2 rounded-full border border-indigo-200/80 flex items-center gap-0.5 font-medium">
                        <User className="w-2.5 h-2.5" />
                        {conv.assigned_agent_id}
                      </span>
                    )}
                  </div>
                </div>

                {/* Message Snippet */}
                <p className="text-xs text-slate-600 line-clamp-1 pr-1 font-normal leading-relaxed">
                  {conv.last_message_text || 'لا توجد رسائل بعد'}
                </p>

                {/* Unread badge & tags summary */}
                <div className="flex items-center justify-between mt-2 pt-1.5 border-t border-slate-200/60">
                  <div className="flex items-center gap-1">
                    {conv.customer?.tags?.slice(0, 2).map((t) => (
                      <span
                        key={t}
                        className="text-[9px] bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full border border-slate-200 font-medium"
                      >
                        {t}
                      </span>
                    ))}
                  </div>

                  {unreadCount > 0 && (
                    <span className="bg-teal-600 text-white text-[10px] font-bold px-2 py-0.5 rounded-full shadow-xs">
                      {unreadCount}
                    </span>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
    </aside>
  );
};
