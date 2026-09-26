import React, { useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  Ban,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Mail,
  MailOpen,
  Tag,
  User,
} from 'lucide-react';
import { Conversation, MetaMessageTag } from '../../../../types/crm';
import { ConversationAvatar, getBrandObject } from '../../../../components/ConversationAvatar';
import { PresenceState } from '../../../../utils/presence';
import { MessageSearchToolbar, ChatEmployeeItem } from './MessageSearchToolbar';
import { AiInsightsDrawer, AiInsightsData } from './AiInsightsDrawer';
import { META_TAGS } from '../../constants/chatConstants';
import { useAuthStore, isAdminUser } from '../../../../store/useAuthStore';
import { useCrmStore } from '../../../../store/useCrmStore';

const CONVERSATION_LABELS = [
  'طلبات مكتملة',
  'طلبات غير مكتملة',
  'تم إرسال عرض',
] as const;

interface IconActionProps {
  label: string;
  onClick?: () => void;
  active?: boolean;
  disabled?: boolean;
  danger?: boolean;
  children: React.ReactNode;
}

const IconAction: React.FC<IconActionProps> = ({
  label,
  onClick,
  active = false,
  disabled = false,
  danger = false,
  children,
}) => (
  <div className="group relative flex shrink-0">
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      className={`flex h-8 w-8 items-center justify-center rounded-full border transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-theme-primary/40 disabled:cursor-not-allowed disabled:opacity-45 ${
        danger && active
          ? 'border-rose-200 bg-rose-50 text-rose-600 hover:bg-rose-100'
          : active
          ? 'border-amber-200 bg-amber-50 text-amber-600 hover:bg-amber-100'
          : 'border-transparent text-slate-500 hover:border-slate-200 hover:bg-slate-100 hover:text-slate-800'
      }`}
    >
      {children}
    </button>
    <span
      role="tooltip"
      className="pointer-events-none absolute left-1/2 top-full z-50 mt-2 -translate-x-1/2 whitespace-nowrap rounded-lg bg-slate-900 px-2.5 py-1.5 text-[11px] font-semibold text-white opacity-0 shadow-lg transition-opacity group-hover:opacity-100 group-focus-within:opacity-100"
    >
      {label}
    </span>
  </div>
);

export interface ChatHeaderProps {
  activeConv: Conversation;
  presence: PresenceState;
  is24hWindowExpired: boolean;
  selectedMetaTag: MetaMessageTag;
  setSelectedMetaTag: (tag: MetaMessageTag) => void;
  setConversationStatus: (convId: string, status: any) => void;
  onOpenBlockModal: (mode: 'block' | 'unblock') => void;
  onToggleProfile?: () => void;
  isProfileOpen?: boolean;
  onBackToList?: () => void;

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
  onToggleProfile,
  isProfileOpen,
  onBackToList,

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
  const currentUser = useAuthStore((state) => state.user);
  const isAdmin = isAdminUser(currentUser);
  const setConversationUnreadCount = useCrmStore((state) => state.setConversationUnreadCount);
  const setConversationLabels = useCrmStore((state) => state.setConversationLabels);
  const [isLabelsOpen, setIsLabelsOpen] = useState(false);
  const [isUpdatingLabels, setIsUpdatingLabels] = useState(false);
  const labelsPopoverRef = useRef<HTMLDivElement>(null);
  const customerName =
    activeConv.customer_display_name || activeConv.customer?.display_name || 'عميل بدون اسم';
  const avatarUrl = activeConv.customer_avatar_url || activeConv.customer?.avatar_url;
  const brandObj = getBrandObject(activeConv.brand_id, activeConv.brand || activeConv.brand_name);
  const pageName = brandObj.isDirect ? 'محادثة خاصة' : brandObj.name;
  const currentNormalizedStatus =
    (activeConv.status?.toLowerCase() === 'closed' || activeConv.status?.toLowerCase() === 'completed')
      ? 'completed'
      : (activeConv.status?.toLowerCase() === 'pending')
      ? 'pending'
      : 'open';
  const isUnread = (activeConv.unread_count || 0) > 0;
  const conversationLabels = activeConv.labels || [];

  useEffect(() => {
    setIsLabelsOpen(false);
  }, [activeConv.id]);

  useEffect(() => {
    if (!isLabelsOpen) return;

    const handlePointerDown = (event: MouseEvent) => {
      if (!labelsPopoverRef.current?.contains(event.target as Node)) {
        setIsLabelsOpen(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setIsLabelsOpen(false);
    };

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isLabelsOpen]);

  const handleToggleLabel = async (label: string) => {
    if (isUpdatingLabels) return;
    const nextLabels = conversationLabels.includes(label)
      ? conversationLabels.filter((currentLabel) => currentLabel !== label)
      : [...conversationLabels, label];
    setIsUpdatingLabels(true);
    try {
      await setConversationLabels(activeConv.id, nextLabels);
    } finally {
      setIsUpdatingLabels(false);
    }
  };

  const handleBack = () => {
    if (onBackToList) {
      onBackToList();
    } else {
      useCrmStore.setState({ activeConversationId: null });
    }
  };

  return (
    <header className="h-13 bg-white/80 backdrop-blur-md border-b border-slate-100/80 px-2.5 sm:px-4 flex items-center justify-between shrink-0 z-20">
      {/* Customer Avatar & Name & Status Subtitle (RTL Right) */}
      <div className="flex items-center gap-2 sm:gap-3 min-w-0">
        {/* Back Button for mobile & tablet (< 1024px / < lg) */}
        <button
          type="button"
          onClick={handleBack}
          className="lg:hidden flex items-center gap-1 px-2 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition shrink-0 cursor-pointer shadow-2xs"
          title="العودة لقائمة المحادثات"
        >
          <ChevronRight className="w-4 h-4 rtl:rotate-0 ltr:rotate-180 text-slate-600 shrink-0" />
          <span className="hidden sm:inline">عودة</span>
        </button>

        <ConversationAvatar
          customerName={customerName}
          customerAvatarUrl={avatarUrl}
          brandAvatarUrl={activeConv.page_avatar_url}
          brandId={activeConv.brand_id}
          brandName={activeConv.brand || activeConv.brand_name}
          channel={activeConv.channel}
          size="md"
          showPresenceDot={true}
          presenceDotColor={presence.dotColor}
          presenceStatusText={presence.statusText}
        />

        <div className="min-w-0">
          <h2 className="text-xs font-bold text-slate-900 truncate max-w-[90px] sm:max-w-[150px] md:max-w-none">
            {customerName}
          </h2>
          <p className="text-[11px] text-slate-500 font-medium flex items-center gap-1.5 mt-0.5 truncate">
            <span className="text-theme-primary font-semibold truncate">{pageName}</span>
            <span className="text-slate-300">&bull;</span>
            <span className={presence.colorClass}>{presence.statusText}</span>
          </p>
        </div>
      </div>

      {/* Grouped Actions Toolbar (RTL Left) */}
      <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
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

        {/* Meta-style conversation actions */}
        <div className="flex items-center gap-0.5 rounded-full border border-slate-200/80 bg-white/90 p-0.5 shadow-2xs">
          <button
            type="button"
            onClick={() => setConversationUnreadCount(activeConv.id, isUnread ? 0 : 1)}
            aria-label={isUnread ? 'تحديد كمقروء' : 'تحديد كغير مقروء'}
            className={`flex h-8 shrink-0 items-center gap-1.5 rounded-full border px-2.5 text-[11px] font-bold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-theme-primary/40 ${
              isUnread
                ? 'border-red-200 bg-red-50 text-red-700 hover:bg-red-100'
                : 'border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
            }`}
          >
            {isUnread ? <Mail className="h-4 w-4" /> : <MailOpen className="h-4 w-4" />}
            <span className="hidden sm:inline">{isUnread ? 'غير مقروء' : 'مقروء'}</span>
          </button>

          <div ref={labelsPopoverRef} className="group relative flex shrink-0">
            <button
              type="button"
              onClick={() => setIsLabelsOpen((isOpen) => !isOpen)}
              aria-label="تصنيفات وليبولز المحادثة"
              aria-haspopup="menu"
              aria-expanded={isLabelsOpen}
              className={`flex h-8 items-center justify-center gap-0.5 rounded-full border px-2 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-theme-primary/40 ${
                isLabelsOpen || conversationLabels.length > 0
                  ? 'border-theme-primary/20 bg-theme-primary-tint text-theme-primary'
                  : 'border-transparent text-slate-500 hover:border-slate-200 hover:bg-slate-100 hover:text-slate-800'
              }`}
            >
              <Tag className="h-4 w-4" />
              <ChevronDown className={`h-3 w-3 transition-transform ${isLabelsOpen ? 'rotate-180' : ''}`} />
            </button>
            {!isLabelsOpen && (
              <span
                role="tooltip"
                className="pointer-events-none absolute left-1/2 top-full z-50 mt-2 -translate-x-1/2 whitespace-nowrap rounded-lg bg-slate-900 px-2.5 py-1.5 text-[11px] font-semibold text-white opacity-0 shadow-lg transition-opacity group-hover:opacity-100 group-focus-within:opacity-100"
              >
                تصنيفات وليبولز المحادثة
              </span>
            )}
            {isLabelsOpen && (
              <div
                role="menu"
                aria-label="تصنيفات المحادثة"
                className="absolute left-0 top-full z-50 mt-2 w-56 rounded-2xl border border-slate-200 bg-white p-2 text-right shadow-xl"
                dir="rtl"
              >
                <p className="px-2 pb-2 pt-1 text-[11px] font-bold text-slate-500">
                  تصنيفات المحادثة
                </p>
                {CONVERSATION_LABELS.map((label) => {
                  const isSelected = conversationLabels.includes(label);
                  return (
                    <button
                      key={label}
                      type="button"
                      role="menuitemcheckbox"
                      aria-checked={isSelected}
                      disabled={isUpdatingLabels}
                      onClick={() => handleToggleLabel(label)}
                      className="flex w-full items-center gap-2 rounded-xl px-2.5 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-wait disabled:opacity-60"
                    >
                      <span
                        className={`flex h-4 w-4 items-center justify-center rounded border ${
                          isSelected
                            ? 'border-theme-primary bg-theme-primary text-white'
                            : 'border-slate-300 bg-white'
                        }`}
                      >
                        {isSelected && <Check className="h-3 w-3" />}
                      </span>
                      <span>{label}</span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          <IconAction
            label={
              !isAdmin
                ? 'حظر العميل متاح للمشرف فقط'
                : activeConv.customer?.is_blocked
                ? 'إلغاء حظر العميل'
                : 'حظر العميل كرسائل مزعجة'
            }
            onClick={
              isAdmin
                ? () => onOpenBlockModal(activeConv.customer?.is_blocked ? 'unblock' : 'block')
                : undefined
            }
            active={Boolean(activeConv.customer?.is_blocked)}
            disabled={!isAdmin}
            danger
          >
            <Ban className="h-4 w-4" />
          </IconAction>

          <IconAction
            label={
              currentNormalizedStatus === 'completed'
                ? 'إعادة فتح المحادثة'
                : 'إكمال وحل المحادثة'
            }
            onClick={() =>
              setConversationStatus(
                activeConv.id,
                currentNormalizedStatus === 'completed' ? 'open' : 'completed'
              )
            }
            active={currentNormalizedStatus === 'completed'}
          >
            <CheckCircle2 className="h-4 w-4" />
          </IconAction>
        </div>

        {/* Customer Profile Drawer Toggle (< 1400px / 2xl) */}
        {onToggleProfile && (
          <button
            type="button"
            onClick={onToggleProfile}
            className={`2xl:hidden flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold transition border cursor-pointer shrink-0 ${
              isProfileOpen
                ? 'bg-theme-primary text-white border-theme-primary shadow-xs'
                : 'bg-slate-50 hover:bg-slate-100 text-slate-700 border-slate-200/80 shadow-2xs'
            }`}
            title="عرض ملف العميل"
          >
            <User className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">العميل</span>
          </button>
        )}
      </div>
    </header>
  );
};
