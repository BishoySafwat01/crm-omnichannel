import React, { useMemo, useState } from 'react';
import { Search, Filter, MessageCircle, Clock, CheckCheck, MapPin, Globe, AlertTriangle, User, Users, ChevronDown, X, Check, Store } from 'lucide-react';
import { useCrmStore } from '../../../store/useCrmStore';
import { FilterTab } from '../../../types/crm';
import { MOCK_BRANDS } from '../../../constants/brands';
import { UserAvatar } from '../../../components/ui/UserAvatar';
import { formatCustomerPresence } from '../../../utils/presence';

const PRIORITY_BADGES: Record<string, { label: string; color: string }> = {
  low: { label: 'منخفضة', color: 'bg-slate-100 text-slate-600' },
  normal: { label: 'عادية', color: 'bg-slate-100 text-slate-600' },
  high: { label: 'عالية', color: 'bg-amber-50 text-amber-700 font-semibold' },
  urgent: { label: 'عاجلة', color: 'bg-rose-50 text-rose-700 font-bold' },
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

export const ChannelBadgeIcon: React.FC<{ channel?: string; className?: string }> = ({ channel, className = 'w-4 h-4' }) => {
  const ch = (channel || 'messenger').toLowerCase();
  if (ch === 'whatsapp') {
    return (
      <span className={`${className} bg-[#25D366] text-white rounded-full flex items-center justify-center shadow-2xs border border-white shrink-0`} title="واتساب (WhatsApp)">
        <svg className="w-2.5 h-2.5 fill-current" viewBox="0 0 24 24">
          <path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91C2.13 13.66 2.59 15.36 3.45 16.86L2.05 22L7.3 20.62C8.75 21.41 10.38 21.83 12.04 21.83C17.5 21.83 21.95 17.38 21.95 11.92C21.95 9.27 20.92 6.78 19.05 4.91C17.18 3.03 14.69 2 12.04 2M12.05 3.67C14.25 3.67 16.31 4.53 17.87 6.09C19.42 7.65 20.28 9.72 20.28 11.92C20.28 16.46 16.58 20.15 12.04 20.15C10.56 20.15 9.11 19.76 7.85 19L7.55 18.83L4.43 19.65L5.26 16.61L5.06 16.29C4.24 14.99 3.8 13.47 3.8 11.91C3.81 7.37 7.5 3.67 12.05 3.67Z" />
        </svg>
      </span>
    );
  }
  if (ch === 'instagram') {
    return (
      <span className={`${className} bg-gradient-to-tr from-amber-500 via-rose-500 to-purple-600 text-white rounded-full flex items-center justify-center shadow-2xs border border-white shrink-0`} title="إنستغرام (Instagram)">
        <svg className="w-2.5 h-2.5 fill-current" viewBox="0 0 24 24">
          <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z" />
        </svg>
      </span>
    );
  }
  return (
    <span className={`${className} bg-[#1877F2] text-white rounded-full flex items-center justify-center shadow-2xs border border-white shrink-0`} title="فيسبوك ماسنجر (Messenger)">
      <svg className="w-2.5 h-2.5 fill-current" viewBox="0 0 24 24">
        <path d="M12 2C6.477 2 2 6.145 2 11.258C2 14.17 3.447 16.745 5.717 18.39V22L9.18 20.096C10.082 20.354 11.026 20.516 12 20.516C17.523 20.516 22 16.371 22 11.258C22 6.145 17.523 2 12 2M13.208 14.475L10.74 11.838L5.923 14.475L11.22 8.847L13.722 11.484L18.498 8.847L13.208 14.475Z" />
      </svg>
    </span>
  );
};

export const ConversationList: React.FC = () => {
  const [isEmployeeMenuOpen, setIsEmployeeMenuOpen] = useState(false);

  const {
    conversations,
    activeConversationId,
    setActiveConversationId,
    selectedBrandId,
    selectedChannel,
    selectedCountry,
    selectedEmployeeId,
    setSelectedEmployeeId,
    availableEmployees,
    messages,
    searchQuery,
    setSearchQuery,
    activeFilterTab,
    setActiveFilterTab,
    unreadSummary,
    isTyping,
    isLoadingConversations,
  } = useCrmStore();

  const getMessagePreview = (conv: any) => {
    if (conv.last_message_text && conv.last_message_text.trim()) {
      return conv.last_message_text;
    }
    return 'محادثة نشطة';
  };

  // Compile list of distinct employees available for filtering with their assigned store/brand (Task 2)
  const employeeOptions = useMemo(() => {
    const list: { id: string; name: string; role?: string; brand?: string }[] = [];
    const seen = new Set<string>();

    if (availableEmployees && Array.isArray(availableEmployees)) {
      availableEmployees.forEach((emp) => {
        if (emp.id && !seen.has(emp.id)) {
          seen.add(emp.id);
          const assignedConv = conversations.find((c) => c.assigned_agent_id === emp.id);
          const memberBrand =
            Array.isArray(emp.brand_access) && emp.brand_access.length > 0 && emp.brand_access[0] !== 'ALL' && emp.brand_access[0] !== 'الكل'
              ? emp.brand_access[0]
              : assignedConv?.brand || 'LUXIRA';
          list.push({ id: emp.id, name: emp.full_name || emp.email, role: emp.role, brand: memberBrand });
        }
      });
    }

    conversations.forEach((c) => {
      if (c.assigned_agent_id && !seen.has(c.assigned_agent_id)) {
        seen.add(c.assigned_agent_id);
        const name = c.customer?.assigned_agent_name || c.customer?.last_agent_name || 'موظف';
        list.push({ id: c.assigned_agent_id, name, brand: c.brand || 'LUXIRA' });
      }
    });

    return list;
  }, [availableEmployees, conversations]);

  const selectedEmployeeObj = employeeOptions.find((e) => e.id === selectedEmployeeId);

  const filteredConversations = useMemo(() => {
    if (!conversations || !Array.isArray(conversations)) return [];

    return conversations.filter((conv) => {
      // 1. Search Query Filter
      if (searchQuery && searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const storeName = (conv.brand || conv.brand_name || '').toLowerCase();
        const custName = (conv.customer_display_name || conv.customer?.display_name || '').toLowerCase();
        const lastMsg = (conv.last_message_text || '').toLowerCase();
        const extId = (conv.external_conversation_id || '').toLowerCase();
        if (!storeName.includes(q) && !custName.includes(q) && !lastMsg.includes(q) && !extId.includes(q)) {
          return false;
        }
      }

      // 2. Channel Filter
      if (selectedChannel && selectedChannel !== 'all') {
        const convChan = (conv.channel || 'messenger').toLowerCase();
        if (convChan !== selectedChannel.toLowerCase()) return false;
      }

      // 3. Status Tab Filter
      if (activeFilterTab === 'unread' && (conv.unread_count || 0) === 0) return false;
      if (activeFilterTab === 'completed' && conv.status !== 'closed' && conv.status !== 'completed') return false;
      if (activeFilterTab === 'sla_breached' && conv.sla_status !== 'breached') return false;

      // 4. Country / Location Filter
      if (selectedCountry && selectedCountry !== 'all' && selectedCountry !== 'الكل') {
        const custLoc = (conv.customer?.location || conv.customer?.country || '').toLowerCase();
        const target = selectedCountry.toLowerCase();
        if (target === 'غير ذلك') {
          if (custLoc && !custLoc.includes('غير ذلك')) return false;
        } else if (!custLoc.includes(target)) {
          return false;
        }
      }

      // 5. Brand Filter
      if (selectedBrandId && selectedBrandId.toLowerCase() !== 'all' && selectedBrandId !== 'الكل') {
        const convBrand = ((conv as any).brand || (conv as any).brand_name || (conv as any).brand_id || '').toLowerCase();
        const filterBrand = selectedBrandId.toLowerCase();
        if (convBrand && convBrand !== filterBrand && !convBrand.includes(filterBrand)) {
          return false;
        }
      }

      // 6. Employee Filter (Task 2)
      if (selectedEmployeeId) {
        const convAssignedId = conv.assigned_agent_id || conv.customer?.assigned_agent_id;
        const isAssigned = convAssignedId === selectedEmployeeId;

        // Check if any message in this conversation was answered by the selected employee
        const convMsgs = messages[conv.id] || [];
        const hasEmployeeReply = convMsgs.some(
          (m) => m.sender_type === 'agent' && m.sender_user_id === selectedEmployeeId
        );

        if (!isAssigned && !hasEmployeeReply) {
          return false;
        }
      }

      return true;
    });
  }, [conversations, searchQuery, activeFilterTab, selectedBrandId, selectedChannel, selectedCountry, selectedEmployeeId, messages]);

  const filterTabs: { id: FilterTab; label: string; icon: React.ReactNode; badgeCount?: number }[] = [
    { id: 'all', label: 'الكل', icon: <MessageCircle className="w-3.5 h-3.5" /> },
    {
      id: 'unread',
      label: 'غير مقروءة',
      icon: <Clock className="w-3.5 h-3.5" />,
      badgeCount: unreadSummary?.total_unread > 0 ? unreadSummary.total_unread : undefined,
    },
    { id: 'completed', label: 'المغلقة', icon: <CheckCheck className="w-3.5 h-3.5" /> },
    { id: 'sla_breached', label: 'متأخرة', icon: <AlertTriangle className="w-3.5 h-3.5 text-rose-500" /> },
  ];

  return (
    <aside className="w-80 md:w-96 bg-white/70 backdrop-blur-xl border border-white/60 shadow-[0_4px_20px_-2px_rgba(0,0,0,0.03)] rounded-2xl flex flex-col shrink-0 h-[calc(100vh-80px)] relative z-10 overflow-hidden">
      {/* Header Search & Filter Toolbar */}
      <div className="p-3 border-b border-slate-100/70 space-y-2.5">
        <div className="flex items-center gap-1.5">
          <div className="relative flex-1 flex items-center">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="بحث في المحادثات..."
              className="w-full bg-slate-100/80 hover:bg-slate-100 focus:bg-white text-slate-800 text-xs rounded-full pr-9 pl-4 py-2 border border-transparent focus:border-[#1A73E8] focus:outline-none focus:ring-2 focus:ring-[#1A73E8]/20 transition-all font-medium placeholder-slate-400"
            />
            <Search className="w-4 h-4 text-slate-400 absolute right-3 top-2.5 pointer-events-none" />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute left-3 top-2.5 text-slate-400 hover:text-slate-600"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Employee Filter Trigger (Task 2) */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setIsEmployeeMenuOpen(!isEmployeeMenuOpen)}
              className={`p-2 rounded-full border transition flex items-center gap-1 text-xs font-bold ${
                selectedEmployeeId
                  ? 'bg-blue-600 text-white border-blue-600 shadow-2xs'
                  : 'bg-slate-100/80 hover:bg-slate-200/80 text-slate-600 border-slate-200/60'
              }`}
              title="تصفية حسب الموظف"
            >
              <Users className="w-3.5 h-3.5" />
              <ChevronDown className="w-3 h-3" />
            </button>

            {/* Employee Filter Popover Menu */}
            {isEmployeeMenuOpen && (
              <div className="absolute top-full left-0 mt-2 w-56 bg-white/95 backdrop-blur-xl rounded-2xl shadow-xl border border-white/80 p-2 z-50 space-y-1 animate-in fade-in zoom-in-95 duration-100 text-right">
                <div className="px-2 py-1.5 text-[11px] font-bold text-slate-400 border-b border-slate-100 flex items-center justify-between">
                  <span>تصفية المحادثات بالموظف</span>
                  <Users className="w-3.5 h-3.5 text-slate-400" />
                </div>

                <button
                  type="button"
                  onClick={() => {
                    setSelectedEmployeeId(null);
                    setIsEmployeeMenuOpen(false);
                  }}
                  className={`w-full text-right px-3 py-2 rounded-xl text-xs font-bold transition flex items-center justify-between ${
                    !selectedEmployeeId ? 'bg-blue-50 text-[#1A73E8]' : 'text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded-lg bg-slate-800 text-white flex items-center justify-center text-[9px] font-black shrink-0 shadow-2xs">
                      ALL
                    </div>
                    <span>كل الموظفين (All)</span>
                  </div>
                  {!selectedEmployeeId && <Check className="w-3.5 h-3.5 text-[#1A73E8]" />}
                </button>

                {employeeOptions.map((emp) => {
                  const brandObj =
                    MOCK_BRANDS.find((b) => b.id.toLowerCase() === (emp.brand || '').toLowerCase()) ||
                    MOCK_BRANDS.find((b) => b.id === 'LUXIRA') ||
                    MOCK_BRANDS[1];
                  const brandName = emp.brand || brandObj?.name || 'LUXIRA';
                  const brandAvatar = brandObj?.avatar || brandName.substring(0, 2).toUpperCase();
                  const brandColor = brandObj?.color || 'from-[#1A73E8] to-blue-600';

                  return (
                    <button
                      key={emp.id}
                      type="button"
                      onClick={() => {
                        setSelectedEmployeeId(emp.id);
                        setIsEmployeeMenuOpen(false);
                      }}
                      className={`w-full text-right px-3 py-2 rounded-xl text-xs font-semibold transition flex items-center justify-between ${
                        selectedEmployeeId === emp.id ? 'bg-blue-50 text-[#1A73E8] font-bold' : 'text-slate-700 hover:bg-slate-50'
                      }`}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        {/* Store / Brand Logo Badge (Representing the store/brand the employee is working through) */}
                        <div
                          className={`w-6 h-6 rounded-lg bg-gradient-to-tr ${brandColor} text-white flex items-center justify-center text-[9px] font-black shrink-0 shadow-2xs`}
                          title={`المتجر: ${brandName}`}
                        >
                          {brandAvatar}
                        </div>

                        <div className="truncate">
                          <span className="font-bold text-slate-800">{emp.name}</span>
                          {emp.role && (
                            <span className="text-[10px] text-slate-400 font-normal mr-1.5">({emp.role})</span>
                          )}
                        </div>
                      </div>
                      {selectedEmployeeId === emp.id && <Check className="w-3.5 h-3.5 text-[#1A73E8] shrink-0" />}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Active Employee Filter Pill Indicator with Store Logo */}
        {selectedEmployeeObj && (() => {
          const brandObj =
            MOCK_BRANDS.find((b) => b.id.toLowerCase() === (selectedEmployeeObj.brand || '').toLowerCase()) ||
            MOCK_BRANDS.find((b) => b.id === 'LUXIRA') ||
            MOCK_BRANDS[1];
          const brandName = selectedEmployeeObj.brand || brandObj?.name || 'LUXIRA';
          const brandAvatar = brandObj?.avatar || brandName.substring(0, 2).toUpperCase();
          const brandColor = brandObj?.color || 'from-[#1A73E8] to-blue-600';

          return (
            <div className="flex items-center justify-between bg-blue-50/90 border border-blue-200/80 px-3 py-1 rounded-xl text-xs text-blue-900 font-semibold animate-in fade-in duration-100">
              <div className="flex items-center gap-2 truncate">
                <div
                  className={`w-5 h-5 rounded-md bg-gradient-to-tr ${brandColor} text-white flex items-center justify-center text-[9px] font-black shrink-0 shadow-2xs`}
                  title={`المتجر: ${brandName}`}
                >
                  {brandAvatar}
                </div>
                <span>الموظف: {selectedEmployeeObj.name}</span>
              </div>
              <button
                type="button"
                onClick={() => setSelectedEmployeeId(null)}
                className="text-blue-500 hover:text-blue-700 p-0.5 rounded-full cursor-pointer"
                title="إلغاء تصفية الموظف"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          );
        })()}

        {/* Filter Tabs (Task 1 Unread Badge) */}
        <div className="flex items-center gap-1 p-1 bg-slate-100/60 rounded-full border border-slate-200/50 backdrop-blur-md">
          {filterTabs.map((tab) => {
            const isActive = activeFilterTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveFilterTab(tab.id)}
                className={`flex-1 flex items-center justify-center gap-1 py-1 px-1.5 text-[11px] font-medium rounded-full transition relative ${
                  isActive
                    ? 'bg-[#E8F0FE] text-[#1A73E8] font-bold shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-white/60'
                }`}
              >
                {tab.icon}
                <span>{tab.label}</span>
                {tab.badgeCount !== undefined && tab.badgeCount > 0 && (
                  <span className="bg-[#1A73E8] text-white text-[9px] font-extrabold px-1.5 py-0.2 rounded-full min-w-[16px] text-center leading-none">
                    {tab.badgeCount}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Clean Minimalist Glass Conversation Cards (Task 6 Channel & Store UI) */}
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
            const storeName = conv.brand || conv.brand_name || 'LUXIRA';
            const customerName = conv.customer_display_name || conv.customer?.display_name || 'عميل';
            const brandObj =
              MOCK_BRANDS.find((b) => b.id.toLowerCase() === storeName.toLowerCase()) ||
              MOCK_BRANDS.find((b) => b.id === 'LUXIRA') ||
              MOCK_BRANDS[1];
            const brandAvatar = brandObj?.avatar || storeName.substring(0, 2).toUpperCase();
            const brandColor = brandObj?.color || 'from-[#1A73E8] to-blue-600';
            const storeAvatarUrl = (conv as any).brand_avatar_url || (conv as any).page_avatar_url || (conv as any).store_logo_url;
            const unreadCount = conv.unread_count || 0;
            const isCustomerTyping = Boolean(isTyping[conv.id]);
            const presence = formatCustomerPresence(
              conv.last_activity_at || conv.customer?.last_activity_at || conv.last_customer_message_at || conv.last_message_at,
              isCustomerTyping
            );

            return (
              <div
                key={conv.id}
                onClick={() => setActiveConversationId(conv.id)}
                className={`p-3 cursor-pointer transition-all duration-150 rounded-2xl ${
                  isActive
                    ? 'bg-[#E8F0FE] border-r-4 border-r-[#1A73E8] shadow-2xs font-medium'
                    : 'bg-transparent hover:bg-white/90'
                }`}
              >
                {/* 1. Top Row: Store/Brand Avatar with overlaid Channel Badge + Store Name (Primary) + Time */}
                <div className="flex items-center justify-between gap-2 mb-1">
                  <div className="flex items-center gap-2.5 min-w-0">
                    {/* Overlapping Brand/Store Avatar with Channel Badge Overlay */}
                    <div className="relative shrink-0">
                      {storeAvatarUrl ? (
                        <img
                          src={storeAvatarUrl}
                          alt={storeName}
                          className="w-10 h-10 rounded-full object-cover shadow-xs border border-white/80 shrink-0"
                        />
                      ) : (
                        <div
                          className="w-10 h-10 rounded-full bg-slate-100 text-slate-500 flex items-center justify-center shadow-xs border border-slate-200/80 shrink-0"
                          title={`المتجر: ${storeName}`}
                        >
                          <Store className="w-5 h-5 text-slate-500" />
                        </div>
                      )}
                      <div className="absolute -bottom-1 -right-1 z-10">
                        <ChannelBadgeIcon channel={conv.channel} className="w-4 h-4" />
                      </div>
                      <span
                        className={`w-2.5 h-2.5 border border-white rounded-full absolute top-0 right-0 ${presence.dotColor}`}
                        title={presence.statusText}
                      />
                    </div>

                    <div className="min-w-0">
                      {/* Store Name is Primary (Task 6) */}
                      <div className="flex items-center gap-1.5">
                        <h3 className={`text-xs truncate ${unreadCount > 0 ? 'font-black text-slate-950' : 'font-extrabold text-slate-900'}`}>
                          {storeName}
                        </h3>
                      </div>
                      {/* Customer Name */}
                      <p className="text-[11px] font-medium text-slate-500 truncate">
                        {customerName}
                      </p>
                    </div>
                  </div>

                  <span className="text-[10px] text-slate-400 font-medium whitespace-nowrap shrink-0">
                    {formatRelativeTime(conv.last_message_at)}
                  </span>
                </div>

                {/* 2. Bottom Row: Truncated Single-line Message Preview + Unread Count Badge */}
                <div className="flex items-center justify-between gap-2 pr-12">
                  <p className={`text-xs truncate ${unreadCount > 0 ? 'font-bold text-slate-900' : 'text-slate-500 font-normal'}`}>
                    {getMessagePreview(conv)}
                  </p>

                  {unreadCount > 0 && (
                    <span className="bg-[#1A73E8] text-white text-[10px] font-bold min-w-5 h-5 px-1.5 rounded-full flex items-center justify-center shrink-0 shadow-2xs leading-none">
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

