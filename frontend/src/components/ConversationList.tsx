import React, { useMemo, useState } from 'react';
import { Search, Filter, MessageCircle, Clock, CheckCheck, MapPin, Globe, AlertTriangle, User } from 'lucide-react';
import { useCrmStore } from '../store/useCrmStore';
import { FilterTab } from '../types/crm';
import { UserAvatar } from './UserAvatar';

const PRIORITY_BADGES: Record<string, { label: string; color: string }> = {
  low: { label: 'منخفضة', color: 'bg-slate-100 text-slate-600' },
  normal: { label: 'عادية', color: 'bg-slate-100 text-slate-600' },
  high: { label: 'عالية', color: 'bg-amber-50 text-amber-700 font-semibold' },
  urgent: { label: 'عاجلة', color: 'bg-rose-50 text-rose-700 font-bold' },
};

const LOCATION_FILTERS = [
  { id: 'ALL', label: 'الكل' },
  { id: 'مصر', label: 'مصر 🇪🇬' },
  { id: 'العراق', label: 'العراق 🇮🇶' },
  { id: 'السعودية', label: 'السعودية 🇸🇦' },
  { id: 'الإمارات', label: 'الإمارات 🇦🇪' },
  { id: 'غير ذلك', label: 'غير ذلك' },
];

const isUuid = (str?: string) => Boolean(str && /^[0-9a-f]{8}-[0-9a-f]{4}/i.test(str));

const getAgentDisplayName = (agentId?: string) => {
  if (!agentId) return null;
  if (isUuid(agentId)) return 'موظف الدعم';
  return agentId;
};

const formatRelativeTime = (isoStr: string) => {
  if (!isoStr) return '';
  const date = new Date(isoStr);
  const diffSec = Math.floor((Date.now() - date.getTime()) / 1000);
  if (diffSec < 60) return 'الآن';
  if (diffSec < 3600) return `منذ ${Math.floor(diffSec / 60)} د`;
  if (diffSec < 86400) return `منذ ${Math.floor(diffSec / 3600)} س`;
  return date.toLocaleDateString('ar-EG', { month: 'short', day: 'numeric' });
};

const getChannelBadgeDot = (channel: string = 'messenger') => {
  switch (channel?.toLowerCase()) {
    case 'whatsapp':
      return <span className="w-2.5 h-2.5 bg-emerald-500 border border-white rounded-full absolute bottom-0 right-0" title="واتساب" />;
    case 'instagram':
      return <span className="w-2.5 h-2.5 bg-gradient-to-tr from-fuchsia-500 to-pink-500 border border-white rounded-full absolute bottom-0 right-0" title="إنستغرام" />;
    default:
      return <span className="w-2.5 h-2.5 bg-blue-500 border border-white rounded-full absolute bottom-0 right-0" title="ماسنجر" />;
  }
};

export const ConversationList: React.FC = () => {
  const [selectedLocation, setSelectedLocation] = useState<string | null>(null);

  const {
    conversations,
    activeConversationId,
    setActiveConversationId,
    selectedBrandId,
    selectedChannel,
    searchQuery,
    setSearchQuery,
    activeFilterTab,
    setActiveFilterTab,
    isLoadingConversations,
  } = useCrmStore();

  const getMessagePreview = (conv: any) => {
    if (conv.last_message_text && conv.last_message_text.trim()) {
      return conv.last_message_text;
    }
    return 'محادثة نشطة';
  };

  const renderSlaBadge = (conv: any) => {
    if (!conv.sla_status || conv.sla_status === 'none') return null;

    if (conv.sla_status === 'met') {
      return (
        <span className="text-[9px] text-emerald-700 bg-emerald-50 px-1.5 py-0.2 rounded font-semibold flex items-center gap-0.5">
          <CheckCheck className="w-2.5 h-2.5 text-emerald-600" />
          <span>SLA</span>
        </span>
      );
    }

    if (conv.sla_status === 'breached') {
      return (
        <span className="text-[9px] bg-rose-500 text-white px-1.5 py-0.2 rounded font-bold flex items-center gap-0.5 shadow-2xs">
          <AlertTriangle className="w-2.5 h-2.5" />
          <span>متأخر</span>
        </span>
      );
    }

    if (conv.sla_status === 'pending' && conv.sla_due_at) {
      const now = new Date().getTime();
      const due = new Date(conv.sla_due_at).getTime();
      const diffMins = Math.max(0, Math.ceil((due - now) / 60000));

      if (diffMins <= 0) {
        return (
          <span className="text-[9px] bg-rose-500 text-white px-1.5 py-0.2 rounded font-bold flex items-center gap-0.5 shadow-2xs">
            <AlertTriangle className="w-2.5 h-2.5" />
            <span>متأخر</span>
          </span>
        );
      }

      return (
        <span className="text-[9px] bg-amber-50 text-amber-800 px-1.5 py-0.2 rounded font-semibold flex items-center gap-0.5">
          <Clock className="w-2.5 h-2.5 text-amber-600" />
          <span>{diffMins} د</span>
        </span>
      );
    }

    return null;
  };

  const filteredConversations = useMemo(() => {
    if (!conversations || !Array.isArray(conversations)) return [];

    return conversations.filter((conv) => {
      // 1. Search Query Filter
      if (searchQuery && searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const name = (conv.customer_display_name || conv.customer?.display_name || '').toLowerCase();
        const lastMsg = (conv.last_message_text || '').toLowerCase();
        const extId = (conv.external_conversation_id || '').toLowerCase();
        if (!name.includes(q) && !lastMsg.includes(q) && !extId.includes(q)) return false;
      }

      // 2. Channel Filter
      if (selectedChannel && selectedChannel !== 'all') {
        const convChan = (conv.channel || 'messenger').toLowerCase();
        if (convChan !== selectedChannel.toLowerCase()) return false;
      }

      // 3. Status Filter
      if (activeFilterTab === 'unread' && (conv.unread_count || 0) === 0) return false;
      if (activeFilterTab === 'completed' && conv.status !== 'closed' && conv.status !== 'completed') return false;
      if (activeFilterTab === 'sla_breached' && conv.sla_status !== 'breached') return false;

      // 4. Location Filter
      if (selectedLocation && selectedLocation !== 'ALL') {
        const loc = conv.customer?.location || 'غير ذلك';
        if (selectedLocation === 'غير ذلك') {
          if (loc !== 'غير ذلك' && conv.customer?.location) return false;
        } else {
          if (!loc.includes(selectedLocation)) return false;
        }
      }

      // 5. Brand Filter
      if (!selectedBrandId || selectedBrandId.toLowerCase() === 'all' || selectedBrandId === 'الكل') {
        return true;
      }

      const convBrand = ((conv as any).brand || (conv as any).brand_id || (conv as any).business_unit || '').toLowerCase();
      const filterBrand = selectedBrandId.toLowerCase();
      if (!convBrand) return true;
      return convBrand === filterBrand || convBrand.includes(filterBrand);
    });
  }, [conversations, searchQuery, activeFilterTab, selectedBrandId, selectedChannel, selectedLocation]);

  const filterTabs: { id: FilterTab; label: string; icon: React.ReactNode }[] = [
    { id: 'all', label: 'الكل', icon: <MessageCircle className="w-3.5 h-3.5" /> },
    { id: 'unread', label: 'غير مقروءة', icon: <Clock className="w-3.5 h-3.5" /> },
    { id: 'completed', label: 'المغلقة', icon: <CheckCheck className="w-3.5 h-3.5" /> },
    { id: 'sla_breached', label: 'متأخرة', icon: <AlertTriangle className="w-3.5 h-3.5 text-rose-500" /> },
  ];

  return (
    <aside className="w-80 md:w-96 bg-white/70 backdrop-blur-xl border border-white/60 shadow-[0_4px_20px_-2px_rgba(0,0,0,0.03)] rounded-2xl flex flex-col shrink-0 h-[calc(100vh-80px)] relative z-10 overflow-hidden">
      {/* Header Search & Filter Toolbar */}
      <div className="p-3 border-b border-slate-100/70 space-y-2.5">
        <div className="relative flex items-center">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="بحث في المحادثات..."
            className="w-full bg-slate-100/80 hover:bg-slate-100 focus:bg-white text-slate-800 text-xs rounded-full pr-9 pl-8 py-2 border border-transparent focus:border-[#1A73E8] focus:outline-none focus:ring-2 focus:ring-[#1A73E8]/20 transition-all font-medium placeholder-slate-400"
          />
          <Search className="w-4 h-4 text-slate-400 absolute right-3 top-2.5" />
          <Filter className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-3 cursor-pointer hover:text-[#1A73E8]" />
        </div>

        {/* Filter Tabs */}
        <div className="flex items-center gap-1 p-1 bg-slate-100/60 rounded-full border border-slate-200/50 backdrop-blur-md">
          {filterTabs.map((tab) => {
            const isActive = activeFilterTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveFilterTab(tab.id)}
                className={`flex-1 flex items-center justify-center gap-1 py-1 px-2 text-[11px] font-medium rounded-full transition ${
                  isActive
                    ? 'bg-[#E8F0FE] text-[#1A73E8] font-bold shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-white/60'
                }`}
              >
                {tab.icon}
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Clean Minimalist Glass Conversation Cards */}
      <div className="flex-1 overflow-y-auto p-2 space-y-1 scrollbar-none">
        {isLoadingConversations ? (
          <div className="p-8 text-center text-xs text-slate-400 animate-pulse font-medium">
            جاري التحميل...
          </div>
        ) : filteredConversations.length === 0 ? (
          <div className="p-8 text-center text-xs text-slate-400 space-y-2">
            <Filter className="w-6 h-6 text-slate-300 mx-auto" />
            <p>لا توجد محادثات متطابقة</p>
          </div>
        ) : (
          filteredConversations.map((conv) => {
            const isActive = activeConversationId === conv.id;
            const customerName = conv.customer_display_name || conv.customer?.display_name || 'عميل';
            const avatarUrl = conv.customer_avatar_url || conv.customer?.avatar_url;
            const unreadCount = conv.unread_count || 0;

            return (
              <div
                key={conv.id}
                onClick={() => setActiveConversationId(conv.id)}
                className={`p-3 cursor-pointer transition-all duration-150 rounded-xl ${
                  isActive
                    ? 'bg-[#E8F0FE] border-r-4 border-r-[#1A73E8] shadow-2xs font-medium'
                    : 'bg-transparent hover:bg-white/90'
                }`}
              >
                {/* 1. Top Row: Avatar with Channel Badge + Customer Name + Relative Time */}
                <div className="flex items-center justify-between gap-2 mb-1">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="relative shrink-0">
                      <UserAvatar name={customerName} avatarUrl={avatarUrl} size="md" />
                      {getChannelBadgeDot(conv.channel)}
                    </div>
                    <h3 className={`text-xs truncate ${unreadCount > 0 ? 'font-extrabold text-slate-900' : 'font-bold text-slate-800'}`}>
                      {customerName}
                    </h3>
                  </div>

                  <span className="text-[10px] text-slate-400 font-medium whitespace-nowrap shrink-0">
                    {formatRelativeTime(conv.last_message_at)}
                  </span>
                </div>

                {/* 2. Bottom Row: Truncated Single-line Message Preview + Unread Count Badge */}
                <div className="flex items-center justify-between gap-2 pr-11">
                  <p className={`text-xs truncate ${unreadCount > 0 ? 'font-bold text-slate-900' : 'text-slate-500 font-normal'}`}>
                    {getMessagePreview(conv)}
                  </p>

                  {unreadCount > 0 && (
                    <span className="bg-[#1A73E8] text-white text-[10px] font-bold w-4 h-4 rounded-full flex items-center justify-center shrink-0 shadow-2xs">
                      {unreadCount}
                    </span>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Footer Pagination Bar */}
      <div className="p-3 border-t border-slate-100/70 flex items-center justify-between text-xs text-slate-500 font-medium shrink-0">
        <span>1-{filteredConversations.length} من {conversations.length} محادثة</span>
        <div className="flex items-center gap-1">
          <button className="w-6 h-6 rounded-full bg-slate-100/70 hover:bg-white text-slate-600 flex items-center justify-center text-xs font-bold border border-slate-200/50">
            ‹
          </button>
          <span className="w-6 h-6 rounded-full bg-[#E8F0FE] text-[#1A73E8] flex items-center justify-center text-xs font-bold">
            1
          </span>
          <button className="w-6 h-6 rounded-full bg-slate-100/70 hover:bg-white text-slate-600 flex items-center justify-center text-xs font-bold border border-slate-200/50">
            ›
          </button>
        </div>
      </div>
    </aside>
  );
};
