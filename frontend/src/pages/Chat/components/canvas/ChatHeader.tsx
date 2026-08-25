import React, { useState } from 'react';
import { Sparkles, AlertTriangle, UserCheck, Ban, ShieldCheck } from 'lucide-react';
import { Conversation, MetaMessageTag } from '../../../../types/crm';
import { ConversationAvatar, getBrandObject } from '../../../../components/ConversationAvatar';
import { PresenceState } from '../../../../utils/presence';

export interface ChatHeaderProps {
  activeConv: Conversation;
  presence: PresenceState;
  is24hWindowExpired: boolean;
  selectedMetaTag: MetaMessageTag;
  setSelectedMetaTag: (tag: MetaMessageTag) => void;
  setConversationStatus: (convId: string, status: any) => void;
  aiInsights: {
    summary?: string;
    intent?: string;
    sentiment?: string;
    replies: string[];
  };
  isAnalyzingAI: boolean;
  onRunAIAnalysis: () => void;
  onSelectSmartReply?: (replyText: string) => void;
  onOpenBlockModal?: (mode: 'block' | 'unblock') => void;
}

const META_TAGS: { id: MetaMessageTag; label: string }[] = [
  { id: 'HUMAN_AGENT', label: 'Human Agent (دعم بشري 7 أيام)' },
  { id: 'POST_PURCHASE_UPDATE', label: 'Post-Purchase (تحديث بعد الشراء)' },
  { id: 'CONFIRMED_EVENT_UPDATE', label: 'Event Update (تحديث حدث مؤكد)' },
  { id: 'ACCOUNT_UPDATE', label: 'Account Update (تحديث الحساب)' },
];

export const ChatHeader: React.FC<ChatHeaderProps> = ({
  activeConv,
  presence,
  is24hWindowExpired,
  selectedMetaTag,
  setSelectedMetaTag,
  setConversationStatus,
  aiInsights,
  isAnalyzingAI,
  onRunAIAnalysis,
  onSelectSmartReply,
  onOpenBlockModal,
}) => {
  const [isAiPopoverOpen, setIsAiPopoverOpen] = useState(false);

  const customerName = activeConv.customer_display_name || activeConv.customer?.display_name || 'عميل';
  const avatarUrl = activeConv.customer_avatar_url || activeConv.customer?.avatar_url;
  const brandObj = getBrandObject(activeConv.brand_id, activeConv.brand || activeConv.brand_name);

  return (
    <div className="h-16 px-4 border-b border-slate-100 flex items-center justify-between gap-3 bg-white/70 backdrop-blur-md shrink-0">
      {/* Customer Info & Avatar */}
      <div className="flex items-center gap-3 min-w-0">
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
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-extrabold text-slate-900 truncate">{customerName}</h2>
            {brandObj.isDirect ? (
              <span className="text-[10px] bg-indigo-50 text-indigo-700 border border-indigo-200 px-1.5 py-0.2 rounded-md font-bold shrink-0">
                🔒 محادثة خاصة
              </span>
            ) : (
              <span className="text-[10px] bg-teal-50 text-teal-800 border border-teal-200 px-1.5 py-0.2 rounded-md font-bold shrink-0">
                متجر: {brandObj.name}
              </span>
            )}
          </div>
          <p className={`text-[11px] font-semibold ${presence.colorClass}`}>{presence.statusText}</p>
        </div>
      </div>

      {/* Action Controls & AI Insights */}
      <div className="flex items-center gap-2 shrink-0">
        {/* AI Insights Floating Popover */}
        <div className="relative">
          <button
            type="button"
            onClick={() => setIsAiPopoverOpen(!isAiPopoverOpen)}
            className={`p-1.5 rounded-full border transition flex items-center gap-1 text-xs font-bold ${
              isAiPopoverOpen
                ? 'bg-[#1A73E8] text-white border-[#1A73E8] shadow-xs'
                : 'bg-[#E8F0FE] hover:bg-blue-100 text-[#1A73E8] border-[#1A73E8]/20'
            }`}
            title="تحليلات الذكاء الاصطناعي والردود الذكية"
          >
            <Sparkles className="w-3.5 h-3.5 text-amber-500" />
            <span>AI</span>
          </button>

          {isAiPopoverOpen && (
            <div className="absolute top-full left-0 mt-2 w-80 bg-white/95 backdrop-blur-xl rounded-2xl shadow-xl border border-white/80 p-4 z-50 space-y-3 animate-in fade-in zoom-in-95 duration-100 text-right">
              <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                <span className="text-xs font-extrabold text-slate-800 flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-[#1A73E8]" />
                  تحليلات الذكاء الاصطناعي
                </span>
                <button
                  type="button"
                  onClick={() => setIsAiPopoverOpen(false)}
                  className="text-slate-400 hover:text-slate-600 text-xs font-bold cursor-pointer"
                >
                  ✕
                </button>
              </div>

              <p className="text-xs text-slate-700 leading-relaxed font-medium">
                {aiInsights.summary ? `✨ ${aiInsights.summary}` : 'لا يوجد ملخص متاح حالياً. انقر زر التحليل لتوليد ملخص للمحادثة.'}
              </p>

              {/* 1-Click Smart Replies Section (DEF-AI-01 Resolution) */}
              {aiInsights.replies && aiInsights.replies.length > 0 && (
                <div className="space-y-1.5 pt-2 border-t border-slate-100">
                  <span className="text-[11px] font-bold text-slate-600 flex items-center gap-1">
                    <span>💡</span>
                    <span>الردود الذكية المقترحة (Smart Replies):</span>
                  </span>
                  <div className="flex flex-col gap-1.5">
                    {aiInsights.replies.map((rep, idx) => (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => {
                          if (onSelectSmartReply) onSelectSmartReply(rep);
                          setIsAiPopoverOpen(false);
                        }}
                        className="text-right text-xs bg-blue-50/70 hover:bg-blue-100/90 text-blue-900 border border-blue-200/80 p-2 rounded-xl transition font-medium cursor-pointer shadow-2xs hover:shadow-xs"
                      >
                        {rep}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex items-center justify-between pt-1 border-t border-slate-100">
                <div className="flex items-center gap-1.5">
                  {aiInsights.intent && (
                    <span className="text-[10px] bg-[#E8F0FE] text-[#1A73E8] font-bold px-2 py-0.5 rounded-full border border-[#1A73E8]/20">
                      🎯 {aiInsights.intent}
                    </span>
                  )}
                  {aiInsights.sentiment && (
                    <span className="text-[10px] bg-[#E6F4EA] text-[#137333] font-bold px-2 py-0.5 rounded-full border border-[#CEEAD6]">
                      {aiInsights.sentiment}
                    </span>
                  )}
                </div>

                <button
                  type="button"
                  onClick={onRunAIAnalysis}
                  disabled={isAnalyzingAI}
                  className="text-xs bg-[#1A73E8] hover:bg-[#1557B0] text-white font-bold px-3 py-1 rounded-full transition shadow-2xs flex items-center gap-1 disabled:opacity-50 cursor-pointer"
                >
                  <Sparkles className={`w-3.5 h-3.5 ${isAnalyzingAI ? 'animate-spin' : ''}`} />
                  <span>{isAnalyzingAI ? 'تحليل...' : 'تحديث ✨'}</span>
                </button>
              </div>
            </div>
          )}
        </div>

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
          value={activeConv.status || 'open'}
          onChange={(e) => setConversationStatus(activeConv.id, e.target.value as any)}
          className="bg-[#E8F0FE] text-[#1A73E8] border border-[#1A73E8]/20 text-xs font-bold rounded-full px-3 py-1 focus:outline-none cursor-pointer"
        >
          <option value="open">مفتوحة</option>
          <option value="pending">قيد الانتظار</option>
          <option value="completed">المغلقة</option>
        </select>

        {/* Complete Action Button */}
        <button
          type="button"
          onClick={() => setConversationStatus(activeConv.id, 'completed')}
          className="px-3 py-1 text-xs font-bold bg-[#1A73E8] hover:bg-[#1557B0] text-white rounded-full transition flex items-center gap-1 shadow-2xs cursor-pointer"
        >
          <UserCheck className="w-3.5 h-3.5" />
          <span>إكمال</span>
        </button>

        {/* Block / Unblock Customer Header Action */}
        {onOpenBlockModal && (
          activeConv.customer?.is_blocked ? (
            <button
              type="button"
              onClick={() => onOpenBlockModal('unblock')}
              className="px-2.5 py-1 text-xs font-bold bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 rounded-full transition flex items-center gap-1 cursor-pointer"
              title="إلغاء حظر العميل"
            >
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
              <span>إلغاء الحظر</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={() => onOpenBlockModal('block')}
              className="px-2.5 py-1 text-xs font-bold bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded-full transition flex items-center gap-1 cursor-pointer"
              title="حظر العميل"
            >
              <Ban className="w-3.5 h-3.5 text-rose-600" />
              <span>حظر</span>
            </button>
          )
        )}
      </div>
    </div>
  );
};
