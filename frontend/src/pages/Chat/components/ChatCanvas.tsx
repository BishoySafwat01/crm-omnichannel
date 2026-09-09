import React, { useState, useRef, useEffect, useMemo, useCallback, useLayoutEffect } from 'react';
import { Sparkles, Pin, Users } from 'lucide-react';
import { useCrmStore } from '../../../store/useCrmStore';
import { useAuthStore } from '../../../store/useAuthStore';
import { MetaMessageTag } from '../../../types/crm';
import { aiApi } from '../../../services/api';
import { useCustomerPresence } from '../../../hooks/useCustomerPresence';
import { ForwardMessageModal } from './ForwardMessageModal';
import { BlockCustomerModal } from '../../../components/common/BlockCustomerModal';
import { ChatHeader } from './canvas/ChatHeader';
import { MessageThread } from './canvas/MessageThread';
import { ChatComposer } from './canvas/ChatComposer';
import { MediaLightboxModal } from './canvas/MediaLightboxModal';
import { resolveMedia } from '../utils/mediaResolver';

export const ChatCanvas: React.FC = () => {
  const currentUser = useAuthStore((state) => state.user);
  const {
    conversations,
    activeConversationId,
    messages,
    teamMembers,
    availableEmployees,
    selectedEmployeeId,
    setSelectedEmployeeId,
    isTyping,
    isLoadingMessages,
    isFetchingMore,
    fetchMessages,
    loadMoreMessages,
    setDraftText,
    setConversationPriority,
    setConversationStatus,
    isForwardModalOpen,
    forwardingMessage,
    setIsForwardModalOpen,
    toggleReaction,
    blockCustomer,
    unblockCustomer,
  } = useCrmStore();

  const [selectedMetaTag, setSelectedMetaTag] = useState<MetaMessageTag>('HUMAN_AGENT');

  // Lightbox Media Preview State
  const [previewImage, setPreviewImage] = useState<string | null>(null);

  // In-Chat Search & Employee Filtering State
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [inChatSearchQuery, setInChatSearchQuery] = useState('');
  const [inChatEmployeeFilter, setInChatEmployeeFilter] = useState<string | null>(null);
  const [matchedMsgIndex, setMatchedMsgIndex] = useState(0);

  // Block Customer Modal State
  const [isBlockModalOpen, setIsBlockModalOpen] = useState(false);
  const [blockModalMode, setBlockModalMode] = useState<'block' | 'unblock'>('block');

  const handleOpenImagePreview = (url: string) => {
    setPreviewImage(url);
  };

  const handleCloseImagePreview = () => {
    setPreviewImage(null);
  };

  const scrollToMessage = (msgId?: string) => {
    if (!msgId) return;
    const el = document.getElementById(`msg-${msgId}`);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      el.classList.add('ring-2', 'ring-[#1A73E8]', 'ring-offset-2', 'rounded-2xl', 'transition-all');
      setTimeout(() => {
        el.classList.remove('ring-2', 'ring-[#1A73E8]', 'ring-offset-2', 'rounded-2xl', 'transition-all');
      }, 2000);
    }
  };

  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const bottomAnchorRef = useRef<HTMLDivElement>(null);
  const isUserScrolledUpRef = useRef<boolean>(false);

  const activeConv = conversations.find((c) => c.id === activeConversationId);
  const activeMessages = activeConversationId ? messages[activeConversationId] || [] : [];
  const latestPinned = useMemo(
    () => activeMessages.filter((m) => m.is_pinned && !m.is_deleted).slice(-1)[0] || null,
    [activeMessages]
  );
  const isCustomerTyping = activeConversationId ? isTyping[activeConversationId] : false;
  const presence = useCustomerPresence(
    activeConv?.last_activity_at ||
      activeConv?.customer?.last_activity_at ||
      activeConv?.last_customer_message_at ||
      activeConv?.last_message_at,
    Boolean(isCustomerTyping)
  );

  // AI Copilot Intelligence State
  const [isAnalyzingAI, setIsAnalyzingAI] = useState(false);
  const [isAiPopoverOpen, setIsAiPopoverOpen] = useState(false);
  const [aiInsights, setAiInsights] = useState<{
    summary?: string;
    intent?: string;
    sentiment?: string;
    replies: string[];
  }>({ replies: [] });

  useEffect(() => {
    if (activeConv) {
      if (
        activeConv.ai_summary ||
        activeConv.detected_intent ||
        (activeConv.ai_suggested_replies && activeConv.ai_suggested_replies.length > 0)
      ) {
        setAiInsights({
          summary: activeConv.ai_summary,
          intent: activeConv.detected_intent,
          sentiment: activeConv.detected_sentiment,
          replies: activeConv.ai_suggested_replies || [],
        });
      } else {
        setAiInsights({ replies: [] });
        const convId = activeConv.id;
        aiApi
          .getInsights(convId)
          .then((res) => {
            if (
              res &&
              (res.ai_summary || (res.ai_suggested_replies && res.ai_suggested_replies.length > 0))
            ) {
              const updatedInsights = {
                summary: res.ai_summary,
                intent: res.detected_intent,
                sentiment: res.detected_sentiment,
                replies: res.ai_suggested_replies || [],
              };
              setAiInsights(updatedInsights);
              useCrmStore.setState((state) => ({
                conversations: state.conversations.map((c) =>
                  c.id === convId
                    ? {
                        ...c,
                        ai_summary: res.ai_summary,
                        detected_intent: res.detected_intent,
                        detected_sentiment: res.detected_sentiment,
                        ai_suggested_replies: res.ai_suggested_replies || [],
                      }
                    : c
                ),
              }));
            }
          })
          .catch((err) => {
            console.warn('AI insights auto-hydrate error:', err);
          });
      }
    } else {
      setAiInsights({ replies: [] });
    }
  }, [
    activeConv?.id,
    activeConv?.ai_summary,
    activeConv?.detected_intent,
    activeConv?.detected_sentiment,
    activeConv?.ai_suggested_replies,
  ]);

  const handleRunAIAnalysis = async () => {
    if (!activeConv?.id || isAnalyzingAI) return;
    setIsAnalyzingAI(true);
    try {
      const res = await aiApi.analyzeConversation(activeConv.id);
      setAiInsights({
        summary: res.ai_summary,
        intent: res.detected_intent,
        sentiment: res.detected_sentiment,
        replies: res.ai_suggested_replies || [],
      });
      useCrmStore.setState((state) => ({
        conversations: state.conversations.map((c) =>
          c.id === activeConv.id
            ? {
                ...c,
                ai_summary: res.ai_summary,
                detected_intent: res.detected_intent,
                detected_sentiment: res.detected_sentiment,
                ai_suggested_replies: res.ai_suggested_replies || [],
                priority: (res.updated_priority || c.priority) as any,
              }
            : c
        ),
      }));
      if (res.updated_priority) {
        setConversationPriority(activeConv.id, res.updated_priority as any);
      }
    } catch (e) {
      console.error('AI Analysis failed:', e);
    } finally {
      setIsAnalyzingAI(false);
    }
  };

  // Available employees for in-chat filter
  const chatEmployees = useMemo(() => {
    const list: { id: string; name: string; role?: string }[] = [];
    const seen = new Set<string>();

    if (availableEmployees && Array.isArray(availableEmployees)) {
      availableEmployees.forEach((emp) => {
        if (emp.id && !seen.has(emp.id.toLowerCase())) {
          seen.add(emp.id.toLowerCase());
          if (emp.full_name) seen.add(emp.full_name.toLowerCase());
          list.push({ id: emp.id, name: emp.full_name || emp.email, role: emp.role });
        }
      });
    }

    if (activeConv?.assigned_agent_id && !seen.has(activeConv.assigned_agent_id.toLowerCase())) {
      seen.add(activeConv.assigned_agent_id.toLowerCase());
      const name = activeConv.customer?.assigned_agent_name || 'موظف المحادثة';
      list.push({ id: activeConv.assigned_agent_id, name });
    }

    activeMessages.forEach((m) => {
      if (m.sender_type === 'agent') {
        const id = m.sender_user_id || m.sender_name || 'unknown';
        if (!seen.has(id.toLowerCase())) {
          seen.add(id.toLowerCase());
          list.push({ id, name: m.sender_name || 'موظف الدعم' });
        }
      }
    });

    return list;
  }, [activeConv, activeMessages, availableEmployees]);

  const activeEmpFilterId = inChatEmployeeFilter || selectedEmployeeId;

  const activeEmpFilterObj = useMemo(() => {
    if (!activeEmpFilterId) return null;
    const target = activeEmpFilterId.toLowerCase().trim();
    if (availableEmployees && Array.isArray(availableEmployees)) {
      const found = availableEmployees.find(
        (e) =>
          (e.id && e.id.toLowerCase().trim() === target) ||
          (e.full_name && e.full_name.toLowerCase().trim() === target) ||
          (e.email && e.email.toLowerCase().trim() === target)
      );
      if (found) {
        return { id: found.id, name: found.full_name || found.email, role: found.role };
      }
    }
    const foundInChat = chatEmployees.find((e) => e.id.toLowerCase().trim() === target);
    if (foundInChat) return foundInChat;

    return { id: activeEmpFilterId, name: activeEmpFilterId };
  }, [activeEmpFilterId, availableEmployees, chatEmployees]);

  // In-Chat Matched Messages for Text Search & Employee Search
  const matchedMessageIds = useMemo(() => {
    if (!inChatSearchQuery.trim() && !activeEmpFilterId) return [];
    const q = inChatSearchQuery.toLowerCase().trim();
    const filterTarget = (activeEmpFilterId || '').toLowerCase().trim();
    const filterName = (activeEmpFilterObj?.name || '').toLowerCase().trim();

    return activeMessages
      .filter((m) => {
        const matchText = !q || (m.text || '').toLowerCase().includes(q);
        const sId = (m.sender_user_id || '').toLowerCase().trim();
        const sName = (m.sender_name || '').toLowerCase().trim();
        const sExt = (m.sender_external_id || '').toLowerCase().trim();

        const matchEmp =
          !activeEmpFilterId ||
          (m.sender_type === 'agent' &&
            ((sId && sId === filterTarget) ||
              (sName &&
                (sName === filterTarget ||
                  (filterName &&
                    (sName === filterName ||
                      sName.includes(filterName) ||
                      filterName.includes(sName))))) ||
              (sExt && (sExt === filterTarget || (filterName && sExt.includes(filterName))))));

        return matchText && matchEmp;
      })
      .map((m) => m.id);
  }, [inChatSearchQuery, activeEmpFilterId, activeEmpFilterObj, activeMessages]);

  const handleJumpToMatch = (dir: 'next' | 'prev') => {
    if (matchedMessageIds.length === 0) return;
    let nextIdx = dir === 'next' ? matchedMsgIndex + 1 : matchedMsgIndex - 1;
    if (nextIdx >= matchedMessageIds.length) nextIdx = 0;
    if (nextIdx < 0) nextIdx = matchedMessageIds.length - 1;
    setMatchedMsgIndex(nextIdx);
    const targetId = matchedMessageIds[nextIdx];
    scrollToMessage(targetId);
  };

  const renderHighlightedText = (text: string, query: string) => {
    if (!query || !query.trim()) return text;
    const q = query.trim();
    const parts = text.split(new RegExp(`(${q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi'));
    return (
      <>
        {parts.map((part, i) =>
          part.toLowerCase() === q.toLowerCase() ? (
            <mark key={i} className="bg-amber-300 text-slate-900 rounded px-0.5 font-bold">
              {part}
            </mark>
          ) : (
            part
          )
        )}
      </>
    );
  };

  const lastCustomerMsgAt = activeConv?.last_customer_message_at
    ? new Date(activeConv.last_customer_message_at).getTime()
    : Date.now();
  const is24hWindowExpired = Date.now() - lastCustomerMsgAt > 24 * 3600 * 1000;

  const scrollToBottom = useCallback((behavior: ScrollBehavior = 'auto') => {
    if (bottomAnchorRef.current) {
      bottomAnchorRef.current.scrollIntoView({ behavior, block: 'end' });
    } else if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior, block: 'end' });
    } else if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollTop = scrollContainerRef.current.scrollHeight;
    }
  }, []);

  const handleScroll = useCallback(() => {
    if (!scrollContainerRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = scrollContainerRef.current;

    if (scrollTop === 0 && !isFetchingMore) {
      loadMoreMessages();
    }

    const distanceFromBottom = scrollHeight - scrollTop - clientHeight;
    isUserScrolledUpRef.current = distanceFromBottom > 150;
  }, [isFetchingMore, loadMoreMessages]);

  useLayoutEffect(() => {
    isUserScrolledUpRef.current = false;
    scrollToBottom('auto');
    const timer = setTimeout(() => scrollToBottom('auto'), 50);
    return () => clearTimeout(timer);
  }, [activeConversationId, scrollToBottom]);

  useLayoutEffect(() => {
    if (!isUserScrolledUpRef.current) {
      scrollToBottom('auto');
    }
  }, [activeMessages.length, activeConv?.last_message_at, isCustomerTyping, scrollToBottom]);

  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    const resizeObserver = new ResizeObserver(() => {
      if (!isUserScrolledUpRef.current) {
        scrollToBottom('auto');
      }
    });

    resizeObserver.observe(container);
    return () => resizeObserver.disconnect();
  }, [scrollToBottom]);

  useEffect(() => {
    if (!activeConversationId) return;

    fetchMessages(activeConversationId);

    const msgInterval = setInterval(() => {
      fetchMessages(activeConversationId);
    }, 15000);

    return () => clearInterval(msgInterval);
  }, [activeConversationId, fetchMessages]);

  const handleMediaLoaded = useCallback(() => {
    if (!isUserScrolledUpRef.current) {
      scrollToBottom('auto');
    }
  }, [scrollToBottom]);

  const formatMessageTime = (isoStr?: string) => {
    if (!isoStr) return '';
    return new Date(isoStr).toLocaleTimeString('ar-EG', {
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  if (!activeConv) {
    return (
      <main className="flex-1 bg-gradient-to-b from-slate-50 to-slate-100/50 flex items-center justify-center p-6 dir-rtl text-right h-full min-h-0 rounded-2xl border border-white/60 shadow-[0_4px_20px_-2px_rgba(0,0,0,0.03)]">
        <div className="bg-white/80 backdrop-blur-xl border border-white/80 shadow-xl rounded-3xl p-8 max-w-md w-full text-center space-y-4 animate-in fade-in zoom-in-95 duration-200">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-tr from-[#1A73E8]/10 to-teal-500/10 text-[#1A73E8] flex items-center justify-center mx-auto shadow-inner border border-[#1A73E8]/20">
            <Sparkles className="w-8 h-8" />
          </div>
          <div className="space-y-1.5">
            <h3 className="text-base font-extrabold text-slate-900">لا توجد محادثة محددة</h3>
            <p className="text-xs text-slate-500 font-medium leading-relaxed">
              اختر محادثة من القائمة الجانبية للبدء، أو قم بتغيير القناة / التصفية من الشريط العلوي.
            </p>
          </div>
          <div className="pt-2 border-t border-slate-100 text-[11px] text-slate-400 font-medium">
            تتم المزامنة تلقائياً عبر WebSockets & Meta Graph API
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="flex-1 bg-white/75 backdrop-blur-xl border border-white/60 shadow-[0_4px_20px_-2px_rgba(0,0,0,0.03)] rounded-2xl flex flex-col h-full min-h-0 relative z-10 overflow-hidden">
      {/* Sleek Google Glass Chat Header Bar */}
      <ChatHeader
        activeConv={activeConv}
        presence={presence}
        is24hWindowExpired={is24hWindowExpired}
        selectedMetaTag={selectedMetaTag}
        setSelectedMetaTag={setSelectedMetaTag}
        setConversationStatus={setConversationStatus}
        onOpenBlockModal={(mode) => {
          setBlockModalMode(mode);
          setIsBlockModalOpen(true);
        }}
        isSearchOpen={isSearchOpen}
        onOpenSearch={() => setIsSearchOpen(true)}
        onCloseSearch={() => {
          setIsSearchOpen(false);
          setInChatSearchQuery('');
          setInChatEmployeeFilter(null);
          setSelectedEmployeeId(null);
        }}
        searchQuery={inChatSearchQuery}
        onSearchQueryChange={(q) => {
          setInChatSearchQuery(q);
          setMatchedMsgIndex(0);
        }}
        matchedCount={matchedMessageIds.length}
        currentMatchIndex={matchedMsgIndex}
        onJumpToMatch={handleJumpToMatch}
        chatEmployees={chatEmployees}
        activeEmpFilterId={activeEmpFilterId}
        activeEmpFilterObj={activeEmpFilterObj}
        onSelectEmployeeFilter={(empId) => {
          setInChatEmployeeFilter(empId);
          if (!empId) setSelectedEmployeeId(null);
        }}
        isAiPopoverOpen={isAiPopoverOpen}
        onToggleAiPopover={() => setIsAiPopoverOpen(!isAiPopoverOpen)}
        onCloseAiPopover={() => setIsAiPopoverOpen(false)}
        aiInsights={aiInsights}
        isAnalyzingAI={isAnalyzingAI}
        onRunAIAnalysis={handleRunAIAnalysis}
        onSelectSmartReply={(reply) => setDraftText(reply)}
      />

      {/* Pinned Messages Banner */}
      {latestPinned && (
        <div className="bg-amber-50/95 border-b border-amber-200/80 px-6 py-2 flex items-center justify-between text-xs backdrop-blur-xs shrink-0 z-10 shadow-2xs">
          <div
            className="flex items-center gap-2 cursor-pointer truncate max-w-xl hover:opacity-85 transition"
            onClick={() => scrollToMessage(latestPinned.id)}
          >
            <Pin className="w-3.5 h-3.5 text-amber-600 fill-amber-600 shrink-0" />
            <span className="font-bold text-amber-900">رسالة مثبتة:</span>
            <span className="text-amber-800 truncate font-medium">
              {latestPinned.text || latestPinned.attachments?.[0]?.title || 'مرفق وسائط'}
            </span>
          </div>
          <div className="flex items-center gap-2.5">
            {latestPinned.pinned_by_name && (
              <span className="text-[10px] text-amber-700 font-semibold hidden sm:inline">
                ثبّتها {latestPinned.pinned_by_name}
              </span>
            )}
            <button
              type="button"
              onClick={() => scrollToMessage(latestPinned.id)}
              className="text-[11px] font-bold text-amber-800 hover:text-amber-950 underline cursor-pointer"
            >
              الانتقال للرسالة
            </button>
          </div>
        </div>
      )}

      {/* Active Employee Filter Notice Banner */}
      {activeEmpFilterObj && (
        <div className="bg-blue-50/95 border-b border-blue-200/80 px-6 py-2 flex items-center justify-between text-xs backdrop-blur-xs shrink-0 z-10 shadow-2xs">
          <div className="flex items-center gap-2 truncate">
            <Users className="w-3.5 h-3.5 text-[#1A73E8] shrink-0" />
            <span className="font-bold text-blue-900">تصفية حسب الموظف:</span>
            <span className="text-blue-800 font-medium truncate">
              عرض الردود المقدمة بواسطة ({activeEmpFilterObj.name}) فقط
            </span>
          </div>
          <button
            type="button"
            onClick={() => {
              setInChatEmployeeFilter(null);
              setSelectedEmployeeId(null);
            }}
            className="text-[11px] font-bold text-blue-700 hover:text-blue-950 underline shrink-0 cursor-pointer"
          >
            إلغاء التصفية وإظهار الكل
          </button>
        </div>
      )}

      {/* Virtualized Message Timeline Stream */}
      <MessageThread
        messages={activeMessages}
        activeConv={activeConv}
        currentUser={currentUser}
        teamMembers={teamMembers}
        inChatSearchQuery={inChatSearchQuery}
        isCustomerTyping={isCustomerTyping}
        isLoadingMessages={isLoadingMessages}
        isFetchingMore={isFetchingMore}
        activeEmpFilterId={activeEmpFilterId}
        activeEmpFilterObj={activeEmpFilterObj}
        setInChatEmployeeFilter={setInChatEmployeeFilter}
        setSelectedEmployeeId={setSelectedEmployeeId}
        scrollToMessage={scrollToMessage}
        scrollToBottom={scrollToBottom}
        scrollContainerRef={scrollContainerRef}
        bottomAnchorRef={bottomAnchorRef}
        messagesEndRef={messagesEndRef}
        handleScroll={handleScroll}
        handleMediaLoaded={handleMediaLoaded}
        handleOpenImagePreview={handleOpenImagePreview}
        toggleReaction={toggleReaction}
        resolveMedia={resolveMedia}
        formatMessageTime={formatMessageTime}
        renderHighlightedText={renderHighlightedText}
      />

      {/* Floating Dock Message Composer */}
      <ChatComposer
        activeConv={activeConv}
        onOpenBlockModal={(mode) => {
          setBlockModalMode(mode);
          setIsBlockModalOpen(true);
        }}
        scrollToBottom={scrollToBottom}
      />

      {/* Forward Message Modal */}
      <ForwardMessageModal
        isOpen={isForwardModalOpen}
        message={forwardingMessage}
        onClose={() => setIsForwardModalOpen(false, null)}
      />

      {/* Block / Unblock Customer Modal */}
      <BlockCustomerModal
        isOpen={isBlockModalOpen}
        mode={blockModalMode}
        customerName={activeConv.customer_display_name || activeConv.customer?.display_name || 'العميل'}
        brandName={activeConv.brand || activeConv.brand_name}
        channel={activeConv.channel}
        currentReason={activeConv.customer?.blocked_reason}
        onClose={() => setIsBlockModalOpen(false)}
        onConfirm={async (reason) => {
          if (!activeConv.customer?.id) return;
          if (blockModalMode === 'block') {
            await blockCustomer(activeConv.customer.id, reason);
          } else {
            await unblockCustomer(activeConv.customer.id);
          }
        }}
      />

      {/* WhatsApp-Style Image Lightbox Popup Modal */}
      <MediaLightboxModal
        previewImage={previewImage}
        onClose={handleCloseImagePreview}
        customerDisplayName={
          activeConv.customer_display_name || activeConv.customer?.display_name || 'محادثة الشات'
        }
      />
    </main>
  );
};
