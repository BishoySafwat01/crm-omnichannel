import React from 'react';
import { UserCheck, Ban, AlertTriangle, RotateCcw } from 'lucide-react';
import { Conversation, MetaMessageTag } from '../../../../types/crm';
import { ConversationAvatar, getBrandObject } from '../../../../components/ConversationAvatar';
import { PresenceState } from '../../../../utils/presence';
import { MessageSearchToolbar, ChatEmployeeItem } from './MessageSearchToolbar';
import { AiInsightsDrawer, AiInsightsData } from './AiInsightsDrawer';
import { META_TAGS } from '../../constants/chatConstants';

export interface ChatHeaderProps {
  activeConv: Conversation;
  presence: PresenceState;
  is24hWindowExpired: boolean;
  selectedMetaTag: MetaMessageTag;
  setSelectedMetaTag: (tag: MetaMessageTag) => void;
  setConversationStatus: (convId: string, status: any) => void;
  onOpenBlockModal: (mode: 'block' | 'unblock') => void;

  // Search Toolbar Props
  isSearchOpen: boolean;
  onOpenSearch: () => void;
  onCloseSearch: () => void;
  searchQuery: string;
  onSearchQueryChange: (query: string) => void;
  matchedCount: number;
  currentMatchIndex: number;
  onJumpToMatch: (dir: 'next' | 'prev') => void;
  chatEmployees: ChatEmployeeItem[];
  activeEmpFilterId: string | null;
  activeEmpFilterObj: ChatEmployeeItem | null;
  onSelectEmployeeFilter: (empId: string | null) => void;

  // AI Insights Props
  isAiPopoverOpen: boolean;
  onToggleAiPopover: () => void;
  onCloseAiPopover: () => void;
  aiInsights: AiInsightsData;
  isAnalyzingAI: boolean;
  onRunAIAnalysis: () => void;
  onSelectSmartReply: (reply: string) => void;
}

export const ChatHeader: React.FC<ChatHeaderProps> = ({
  activeConv,
  presence,
  is24hWindowExpired,
  selectedMetaTag,
  setSelectedMetaTag,
  setConversationStatus,
  onOpenBlockModal,

  isSearchOpen,
  onOpenSearch,
  onCloseSearch,
  searchQuery,
  onSearchQueryChange,
  matchedCount,
  currentMatchIndex,
  onJumpToMatch,
  chatEmployees,
  activeEmpFilterId,
  activeEmpFilterObj,
  onSelectEmployeeFilter,

  isAiPopoverOpen,
  onToggleAiPopover,
  onCloseAiPopover,
  aiInsights,
  isAnalyzingAI,
  onRunAIAnalysis,
  onSelectSmartReply,
}) => {
  const customerName =
    activeConv.customer_display_name || activeConv.customer?.display_name || 'عميل بدون اسم';
  const avatarUrl = activeConv.customer_avatar_url || activeConv.customer?.avatar_url;
  const brandObj = getBrandObject(activeConv.brand_id, activeConv.brand || activeConv.brand_name);
  const currentNormalizedStatus =
    (activeConv.status?.toLowerCase() === 'closed' || activeConv.status?.toLowerCase() === 'completed')
      ? 'completed'
      : (activeConv.status?.toLowerCase() === 'pending')
      ? 'pending'
      : 'open';

  return (
    <header className="h-13 bg-white/80 backdrop-blur-md border-b border-slate-100/80 px-4 flex items-center justify-between shrink-0 z-20">
      {/* Customer Avatar & Name & Status Subtitle (RTL Right) */}
      <div className="flex items-center gap-3">
        <ConversationAvatar
          customerName={customerName}
          customerAvatarUrl={avatarUrl}
          brandId={activeConv.brand_id}
          brandName={activeConv.brand || activeConv.brand_name}
          channel={activeConv.channel}
          size="md"
          showPresenceDot={true}
          presenceDotColor={presence.dotColor}
          presenceStatusText={presence.statusText}
        />

        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-xs font-bold text-slate-900">{customerName}</h2>
            {brandObj.isDirect ? (
              <span className="text-[10px] bg-indigo-50 text-indigo-700 border border-indigo-200 px-2 py-0.5 rounded-full font-bold">
                محادثة خاصة (Direct)
              </span>
            ) : (
              <span className="text-[10px] bg-theme-primary-tint text-theme-primary border border-theme-primary/20 px-2 py-0.5 rounded-full font-bold">
                {brandObj.name}
              </span>
            )}
          </div>
          <p className="text-[11px] text-slate-500 font-medium flex items-center gap-1.5 mt-0.5">
            <span className={presence.colorClass}>{presence.statusText}</span>
            <span>•</span>
            <span className="capitalize">{activeConv.channel || 'messenger'}</span>
          </p>
        </div>
      </div>

      {/* Grouped Actions Toolbar (RTL Left) */}
      <div className="flex items-center gap-2">
        {/* In-Chat Search & Employee Filter Toolbar */}
        <MessageSearchToolbar
          isSearchOpen={isSearchOpen}
          onOpenSearch={onOpenSearch}
          onCloseSearch={onCloseSearch}
          searchQuery={searchQuery}
          onSearchQueryChange={onSearchQueryChange}
          matchedCount={matchedCount}
          currentIndex={currentMatchIndex}
          onJumpToMatch={onJumpToMatch}
          chatEmployees={chatEmployees}
          activeEmpFilterId={activeEmpFilterId}
          activeEmpFilterObj={activeEmpFilterObj}
          onSelectEmployee={onSelectEmployeeFilter}
        />

        {/* AI Insights Floating Popover */}
        <AiInsightsDrawer
          isOpen={isAiPopoverOpen}
          onToggleOpen={onToggleAiPopover}
          onClose={onCloseAiPopover}
          insights={aiInsights}
          isAnalyzing={isAnalyzingAI}
          onRunAnalysis={onRunAIAnalysis}
          onSelectSmartReply={onSelectSmartReply}
        />

        {/* 24-Hour Policy Window Alert */}
        {is24hWindowExpired && (
          <div className="flex items-center gap-1.5 bg-amber-50 text-amber-900 px-2 py-0.5 rounded-full border border-amber-200 text-xs font-semibold">
            <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0" />
            <span>24h</span>
            <select
              value={selectedMetaTag}
              onChange={(e) => setSelectedMetaTag(e.target.value as MetaMessageTag)}
              className="bg-white text-xs text-slate-800 rounded-full px-1.5 py-0.5 border border-amber-300 focus:outline-none font-medium"
            >
              {META_TAGS.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Status Dropdown Pill */}
        <select
          value={currentNormalizedStatus}
          onChange={(e) => setConversationStatus(activeConv.id, e.target.value)}
          className={`text-xs font-bold rounded-full px-3 py-1 focus:outline-none cursor-pointer border transition-colors ${
            currentNormalizedStatus === 'completed'
              ? 'bg-slate-100 text-slate-700 border-slate-300'
              : currentNormalizedStatus === 'pending'
              ? 'bg-amber-50 text-amber-700 border-amber-200'
              : 'bg-theme-primary-tint text-theme-primary border-theme-primary/20'
          }`}
        >
          <option value="open">مفتوحة</option>
          <option value="pending">قيد الانتظار</option>
          <option value="completed">المغلقة</option>
        </select>

        {/* Complete / Reopen Action Button */}
        {currentNormalizedStatus === 'completed' ? (
          <button
            type="button"
            onClick={() => setConversationStatus(activeConv.id, 'open')}
            className="px-3 py-1 text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white rounded-full transition flex items-center gap-1 shadow-2xs cursor-pointer"
            title="إعادة فتح المحادثة"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>إعادة فتح</span>
          </button>
        ) : (
          <button
            type="button"
            onClick={() => setConversationStatus(activeConv.id, 'completed')}
            className="px-3 py-1 text-xs font-bold bg-theme-primary hover:bg-theme-primary-hover text-white rounded-full transition flex items-center gap-1 shadow-2xs cursor-pointer"
            title="إكمال وإغلاق المحادثة"
          >
            <UserCheck className="w-3.5 h-3.5" />
            <span>إكمال</span>
          </button>
        )}

        {/* Block / Unblock Customer Header Action */}
        {activeConv.customer?.is_blocked ? (
          <button
            type="button"
            onClick={() => onOpenBlockModal('unblock')}
            className="px-2.5 py-1 text-xs font-bold bg-rose-100 hover:bg-rose-200 text-rose-700 rounded-full transition flex items-center gap-1 border border-rose-300 shadow-2xs cursor-pointer"
            title="إلغاء حظر العميل"
          >
            <Ban className="w-3.5 h-3.5 text-rose-600" />
            <span>محظور (فك الحظر)</span>
          </button>
        ) : (
          <button
            type="button"
            onClick={() => onOpenBlockModal('block')}
            className="p-1.5 rounded-full text-slate-400 hover:text-rose-600 hover:bg-rose-50 border border-transparent hover:border-rose-200 transition cursor-pointer"
            title="حظر هذا العميل (Block Customer)"
          >
            <Ban className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
    </header>
  );
};
