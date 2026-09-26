import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import {
  FileText,
  Download,
  AlertTriangle,
  Trash2,
  Clock,
  CornerUpLeft,
  Pin,
  Forward as ForwardIcon,
  ZoomIn,
  User,
  ExternalLink,
  Film,
} from 'lucide-react';
import { Message, Conversation } from '../../../../types/crm';
import { User as UserType } from '../../../../store/useAuthStore';
import { formatChatDateDivider, isDifferentDay } from '../../../../utils/dateUtils';
import { MessageActionsMenu } from '../MessageActionsMenu';
import { isSocialWebLink } from '../../utils/mediaResolver';

// Constants for Virtual Scrolling Optimization
const VIRTUALIZATION_THRESHOLD = 60; // Enable windowing if messages exceed this count
const WINDOW_SIZE = 50; // Visible batch size
const ESTIMATED_ITEM_HEIGHT = 72; // Average message row height in pixels

import { CustomAudioPlayer } from './AudioPlayerWidget';

// Memoized Single Message Bubble for 60 FPS rendering
export const MemoizedMessageBubble = React.memo<{
  msg: Message;
  prevMsg: Message | null;
  currentUser: UserType | null;
  teamMembers: Array<{ id: string; full_name?: string }>;
  inChatSearchQuery: string;
  scrollToMessage: (msgId?: string) => void;
  handleMediaLoaded: () => void;
  handleOpenImagePreview: (url: string) => void;
  toggleReaction: (msgId: string, emoji: string) => void;
  resolveMedia: (msg: Message) => any;
  formatMessageTime: (dateStr: string) => string;
  renderHighlightedText: (text: string, query: string) => React.ReactNode;
}>(({
  msg,
  prevMsg,
  currentUser,
  teamMembers,
  inChatSearchQuery,
  scrollToMessage,
  handleMediaLoaded,
  handleOpenImagePreview,
  toggleReaction,
  resolveMedia,
  formatMessageTime,
  renderHighlightedText,
}) => {
  const [isCustomerMessageCopied, setIsCustomerMessageCopied] = useState(false);
  const copyFeedbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const media = resolveMedia(msg);
  const isReelOrShare = Boolean(
    !media.isImage &&
      !media.isVideo &&
      !media.isAudio &&
      (media.isShare ||
        msg.message_type === 'share_reel' ||
        msg.message_type === 'share_post' ||
        (media.url && isSocialWebLink(media.url)))
  );
  const shareTargetUrl = media.shareUrl || media.url || msg.media_url || '';

  const hasContent = Boolean(
    (msg.text && msg.text.trim()) ||
      media.isAudio ||
      media.isImage ||
      media.isVideo ||
      media.isDoc ||
      isReelOrShare ||
      msg.media_url ||
      msg.is_deleted
  );

  const sType = (msg.sender_type || '').toLowerCase();
  const isAutomated = Boolean(
    msg.metadata?.is_automated ||
    msg.metadata_?.is_automated ||
    msg.metadata?.is_bot ||
    msg.metadata_?.is_bot ||
    msg.sender_external_id === 'automation_bot' ||
    (msg.sender_name && msg.sender_name.includes('(Bot)')) ||
    sType === 'bot'
  );
  const isAgent =
    sType === 'agent' ||
    sType === 'user' ||
    sType === 'bot' ||
    Boolean((msg as Message & { is_from_agent?: boolean }).is_from_agent) ||
    isAutomated;
  const botSenderName =
    msg.metadata?.bot_sender_name ||
    msg.metadata_?.bot_sender_name ||
    (msg.sender_name && msg.sender_name.includes('(Bot)') ? msg.sender_name : null) ||
    (msg.sender_name ? `${msg.sender_name} (Bot)` : 'المساعد الآلي (Bot)');
  const isPending = msg.delivery_status === 'pending';
  const isFailed = msg.delivery_status === 'failed';
  const isDeleted = Boolean(msg.is_deleted);
  const showDateDivider = !prevMsg || isDifferentDay(msg.created_at, prevMsg.created_at);
  const canQuickCopyCustomerMessage = !isAgent && !isDeleted && Boolean(msg.text?.trim());

  useEffect(() => {
    return () => {
      if (copyFeedbackTimerRef.current) {
        clearTimeout(copyFeedbackTimerRef.current);
      }
    };
  }, []);

  const copyCustomerMessage = async () => {
    if (!canQuickCopyCustomerMessage || !msg.text) return;

    try {
      await navigator.clipboard.writeText(msg.text);
      setIsCustomerMessageCopied(true);
      if (copyFeedbackTimerRef.current) {
        clearTimeout(copyFeedbackTimerRef.current);
      }
      copyFeedbackTimerRef.current = setTimeout(() => {
        setIsCustomerMessageCopied(false);
        copyFeedbackTimerRef.current = null;
      }, 1600);
    } catch (error) {
      console.warn('Failed to copy customer message:', error);
    }
  };

  const handleCustomerMessageClick = (event: React.MouseEvent<HTMLDivElement>) => {
    if (!canQuickCopyCustomerMessage) return;
    if ((window.getSelection()?.toString().length ?? 0) !== 0) return;

    const target = event.target;
    if (
      target instanceof Element &&
      target.closest('a, button, video, audio, img, [data-prevent-quick-copy]')
    ) {
      return;
    }

    void copyCustomerMessage();
  };

  const handleCustomerMessageKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (!canQuickCopyCustomerMessage || (event.key !== 'Enter' && event.key !== ' ')) return;
    event.preventDefault();
    void copyCustomerMessage();
  };

  if (!hasContent) return null;

  return (
    <React.Fragment key={msg.id}>
      {showDateDivider && (
        <div className="flex justify-center my-3">
          <span className="text-[11px] bg-white/90 text-slate-500 border border-slate-200/60 px-3 py-0.5 rounded-full font-medium shadow-2xs">
            {formatChatDateDivider(msg.created_at)}
          </span>
        </div>
      )}

      <div
        id={`msg-${msg.id}`}
        dir="ltr"
        className={`group/msg relative flex items-center gap-1.5 my-1 transition-all select-text ${
          isAgent ? 'flex-row-reverse' : 'flex-row'
        }`}
      >
        <div
          dir="auto"
          onClick={handleCustomerMessageClick}
          onKeyDown={handleCustomerMessageKeyDown}
          role={canQuickCopyCustomerMessage ? 'button' : undefined}
          tabIndex={canQuickCopyCustomerMessage ? 0 : undefined}
          title={canQuickCopyCustomerMessage ? 'انقر لنسخ الرسالة' : undefined}
          aria-label={canQuickCopyCustomerMessage ? 'انقر لنسخ رسالة العميل' : undefined}
          className={`max-w-md px-4 py-2.5 rounded-2xl text-xs leading-relaxed shadow-2xs transition-all relative select-text ${
            canQuickCopyCustomerMessage
              ? 'cursor-pointer active:scale-[0.99] transition-transform'
              : ''
          } ${
            isFailed
              ? `bg-rose-50 text-rose-800 border border-rose-200 font-medium ${isAgent ? 'rounded-tr-none' : 'rounded-tl-none'}`
              : isDeleted
              ? 'bg-slate-100/90 text-slate-400 border border-slate-200/80 rounded-2xl italic'
              : isAgent
              ? 'bg-theme-primary text-white border border-theme-primary rounded-2xl rounded-tr-none font-normal shadow-sm shadow-theme-primary/20'
              : 'bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 shadow-sm border border-slate-200/80 dark:border-slate-700/80 rounded-2xl rounded-tl-none font-normal'
          }`}
        >
          {isCustomerMessageCopied && (
            <span
              role="status"
              aria-live="polite"
              className="absolute -top-8 left-1/2 -translate-x-1/2 z-20 whitespace-nowrap rounded-full bg-slate-900/90 px-2.5 py-1 text-[10px] font-semibold text-white shadow-lg pointer-events-none select-none animate-in fade-in zoom-in-95 duration-150"
            >
              تم نسخ نص رسالة العميل إلى الحافظة ✓
            </span>
          )}

          {/* Sender Tag for Agent / Bot Messages */}
          {isAgent && !isDeleted && (
            <span className="text-[10px] text-white/90 font-bold block mb-1">
              {isAutomated ? (
                <span className="inline-flex items-center gap-1">
                  <span className="text-[11px] leading-none" role="img" aria-label="Bot">🤖</span>
                  <span>{botSenderName}</span>
                </span>
              ) : (
                <span>
                  {msg.sender_name ||
                    (msg.sender_user_id && msg.sender_user_id === currentUser?.id
                      ? currentUser?.full_name
                      : null) ||
                    'موظف الدعم'}
                </span>
              )}
            </span>
          )}

          {/* Forwarded Tag */}
          {msg.forwarded && !isDeleted && (
            <div className={`flex items-center gap-1 text-[10px] font-semibold mb-1 ${isAgent ? 'text-white/70' : 'text-slate-400'}`}>
              <ForwardIcon className={`w-3 h-3 ${isAgent ? 'text-white/70' : 'text-slate-400'}`} />
              <span>معاد توجيهها</span>
            </div>
          )}

          {/* Quoted Reply Reference */}
          {msg.reply_to && !isDeleted && (
            <div
              onClick={() => scrollToMessage(msg.reply_to?.message_id)}
              data-prevent-quick-copy
              className="mb-2 p-2 rounded-xl bg-black/5 hover:bg-black/10 border-r-3 border-[#1A73E8] cursor-pointer transition text-[11px] select-text text-right"
            >
              <div className="flex items-center gap-1 text-[10px] font-bold text-[#1A73E8]">
                <CornerUpLeft className="w-3 h-3" />
                <span>{msg.reply_to.sender_name || 'رد على رسالة'}</span>
              </div>
              <p className={`${isAgent ? 'text-white/80' : 'text-slate-600'} truncate mt-0.5 max-w-xs`}>
                {msg.reply_to.text || 'مرفق وسائط'}
              </p>
            </div>
          )}

          {/* Deleted Message Placeholder */}
          {isDeleted ? (
            <div className="flex items-center gap-1.5 py-1 text-slate-400 italic text-xs font-medium">
              <Trash2 className="w-3.5 h-3.5 text-slate-400" />
              <span>تم حذف هذه الرسالة</span>
            </div>
          ) : (
            <>
              {/* Native Audio Player */}
              {media.isAudio && media.url && <CustomAudioPlayer url={media.url} />}

              {/* Dedicated Social Reel / Share Card */}
              {isReelOrShare && shareTargetUrl && (
                <div className="my-1.5 max-w-xs rounded-2xl overflow-hidden border border-slate-200/80 bg-gradient-to-br from-slate-50 via-white to-slate-50 shadow-xs transition-all hover:shadow-md">
                  <div className="p-3 bg-gradient-to-r from-[#833ab4]/10 via-[#fd1d1d]/10 to-[#fcb045]/10 border-b border-slate-100 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-xl bg-gradient-to-tr from-[#f09433] via-[#dc2743] to-[#bc1888] flex items-center justify-center text-white shadow-xs">
                        <Film className="w-3.5 h-3.5 text-white" />
                      </div>
                      <div>
                        <span className="text-[11px] font-bold text-slate-800 block">
                          {media.shareType === 'reel' || msg.message_type === 'share_reel'
                            ? 'Instagram Reel'
                            : 'مشاركة من إنستغرام'}
                        </span>
                        <span className="text-[9px] text-slate-400 font-medium">مقطع ريلز / رابط مشاركة</span>
                      </div>
                    </div>
                  </div>
                  <div className="p-2.5 flex flex-col gap-2">
                    <p className="text-[11px] text-slate-600 truncate dir-ltr text-left font-mono bg-slate-100/70 px-2 py-1 rounded-lg">
                      {shareTargetUrl}
                    </p>
                    <a
                      href={shareTargetUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center justify-center gap-1.5 w-full py-1.5 px-3 rounded-xl bg-gradient-to-r from-[#dc2743] to-[#bc1888] hover:from-[#c11e38] hover:to-[#a01573] text-white text-[11px] font-bold transition shadow-xs active:scale-[0.98]"
                    >
                      <span>مشاهدة على Instagram</span>
                      <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                  </div>
                </div>
              )}

              {/* HTML5 Video Player (Protected: Only direct video files, never reels/shares) */}
              {!isReelOrShare &&
                (msg.message_type === 'video' || media.isVideo) &&
                (media.url || msg.media_url) && (
                  <div className="relative overflow-hidden rounded-xl max-w-xs my-1 bg-black/10">
                    <video
                      controls
                      preload="metadata"
                      onLoadedData={handleMediaLoaded}
                      src={msg.media_url || media.url || ''}
                      className="w-full max-h-72 object-contain rounded-xl bg-black"
                    >
                      <source src={msg.media_url || media.url || ''} />
                      متصفحك لا يدعم تشغيل الفيديو.
                    </video>
                  </div>
                )}

              {/* Inline Image Preview */}
              {media.isImage && media.url && (
                <div
                  className="relative group cursor-pointer overflow-hidden rounded-2xl max-w-xs my-1 shadow-xs border border-slate-200/80 bg-slate-50 select-text"
                  onClick={() => handleOpenImagePreview(media.url!)}
                  title="اضغط للتكبير وعرض الصورة بالحجم الكامل"
                >
                  <img
                    src={media.url}
                    alt="مرفق صورة"
                    onLoad={handleMediaLoaded}
                    className="w-full max-h-72 object-cover rounded-2xl transition-all duration-300 group-hover:scale-[1.03] group-hover:brightness-95"
                  />
                  <div className="absolute inset-0 bg-black/25 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center pointer-events-none rounded-2xl">
                    <span className="p-2.5 bg-black/70 backdrop-blur-md rounded-full text-white shadow-xl flex items-center gap-1.5 text-xs font-bold">
                      <ZoomIn className="w-4 h-4" />
                      <span>عرض وتكبير</span>
                    </span>
                  </div>
                </div>
              )}

              {/* Document Card */}
              {media.isDoc && media.url && (
                <div className="flex items-center justify-between gap-3 bg-white p-2 rounded-xl border border-slate-100 my-1 text-slate-800">
                  <div className="flex items-center gap-2">
                    <FileText className="w-4 h-4 text-[#1A73E8]" />
                    <span className="text-xs font-bold truncate max-w-[140px]">
                      {media.fileName}
                    </span>
                  </div>
                  <a
                    href={media.url}
                    target="_blank"
                    rel="noreferrer"
                    className="p-1 rounded-full bg-[#1A73E8] text-white hover:bg-[#1557B0] transition"
                  >
                    <Download className="w-3.5 h-3.5" />
                  </a>
                </div>
              )}

              {/* Regular Text Content */}
              {(() => {
                if (!msg.text) return null;
                if (media.isAudio) return null;
                if (
                  msg.text.startsWith('voice_') ||
                  msg.text.startsWith('img_') ||
                  msg.text.startsWith('vid_') ||
                  msg.text.startsWith('image-') ||
                  msg.text.includes('📍')
                ) {
                  return null;
                }

                // 1. Unconditionally strip synthetic share / reel bracket notations from any message text
                let displayTxt = (msg.text || '').trim();
                displayTxt = displayTxt
                  .replace(/\[?(?:Instagram Reel\/Share|Reel\/Share|Share):\s*https?:\/\/[^\]\s]+\]?/gi, '')
                  .trim();

                // 2. If message contains media (image, video, or audio), check for redundancy
                const hasMediaAsset = media.isImage || media.isVideo || media.isAudio;
                if (hasMediaAsset) {
                  if (!displayTxt) return null;

                  // If text directly matches the media url or proxy url
                  if (
                    displayTxt === media.url ||
                    displayTxt === msg.media_url ||
                    (media.url && media.url.includes(encodeURIComponent(displayTxt)))
                  ) {
                    return null;
                  }

                  // If text is solely a CDN link or file URL
                  const lowerTxt = displayTxt.toLowerCase();
                  const isSoleCdnLink =
                    (lowerTxt.startsWith('http://') || lowerTxt.startsWith('https://')) &&
                    (lowerTxt.includes('fbcdn.net') ||
                      lowerTxt.includes('fbsbx.com') ||
                      lowerTxt.includes('cdninstagram.com') ||
                      lowerTxt.includes('amazonaws.com') ||
                      /\.(jpg|jpeg|png|webp|gif|svg|mp4|mov|webm|ogg|mp3|wav|m4a|aac)($|\?)/i.test(lowerTxt));

                  if (isSoleCdnLink) {
                    return null;
                  }

                  // Also check if message_type is image/video and text is a raw URL
                  const mType = String(msg.message_type || '').toLowerCase();
                  if (
                    (mType === 'image' || mType === 'video') &&
                    (lowerTxt.startsWith('http://') || lowerTxt.startsWith('https://'))
                  ) {
                    return null;
                  }
                }

                // 3. If it's a dedicated Reel or Share card, suppress text if it matches shareTargetUrl
                if (isReelOrShare) {
                  if (!displayTxt || displayTxt === shareTargetUrl) {
                    return null;
                  }
                }

                // 4. If nothing remains, suppress
                if (!displayTxt) return null;

                return (
                  <p dir="auto" className="whitespace-pre-wrap break-words select-text">
                    {renderHighlightedText(displayTxt, inChatSearchQuery)}
                  </p>
                );
              })()}
            </>
          )}

          {/* Timestamp, Pin, Edited & Delivery Status */}
          <div
            className={`flex items-center gap-1.5 mt-1 text-[10px] ${
              isAgent ? 'text-white/75 justify-start' : 'text-slate-400 justify-end'
            }`}
          >
            <span>{formatMessageTime(msg.created_at)}</span>
            {msg.is_edited && !isDeleted && (
              <span className="text-[10px] opacity-75 font-medium">(معدلة)</span>
            )}
            {msg.is_pinned && !isDeleted && (
              <span title="رسالة مثبتة">
                <Pin className="w-3 h-3 text-amber-500 fill-amber-500 shrink-0" />
              </span>
            )}
            {isPending && <Clock className="w-3 h-3 text-amber-500 animate-spin" />}
            {isFailed && <AlertTriangle className="w-3.5 h-3.5 text-rose-500" />}
            {isAgent && !isPending && !isFailed && !isDeleted && (
              <span className="text-white/90 font-bold text-[11px]" title="تم التوصيل">
                ✓✓
              </span>
            )}
          </div>

          {/* Reactions Pill Group */}
          {msg.reactions && msg.reactions.length > 0 && !isDeleted && (
            <div className="flex flex-wrap gap-1 mt-1.5 pt-1 border-t border-black/5">
              {Object.entries(
                msg.reactions.reduce<
                  Record<string, { count: number; users: string[]; hasReacted: boolean }>
                >((acc, r) => {
                  if (!acc[r.emoji]) acc[r.emoji] = { count: 0, users: [], hasReacted: false };
                  acc[r.emoji].count += 1;
                  acc[r.emoji].users.push(r.user_name || 'موظف');
                  if (r.user_id === currentUser?.id) acc[r.emoji].hasReacted = true;
                  return acc;
                }, {})
              ).map(([emoji, data]) => (
                <button
                  key={emoji}
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleReaction(msg.id, emoji);
                  }}
                  title={data.users.join('، ')}
                  className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold transition shadow-2xs border cursor-pointer ${
                    data.hasReacted
                      ? 'bg-indigo-50 text-indigo-700 border-indigo-200 ring-1 ring-indigo-300'
                      : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  <span>{emoji}</span>
                  {data.count > 1 && <span>{data.count}</span>}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Hover Floating Action Menu */}
        {!isPending && !isFailed && !isDeleted && (
          <div className="opacity-0 group-hover/msg:opacity-100 focus-within:opacity-100 transition-opacity duration-150 shrink-0 select-none">
            <MessageActionsMenu message={msg} isAgentMessage={isAgent} />
          </div>
        )}
      </div>
    </React.Fragment>
  );
});

MemoizedMessageBubble.displayName = 'MemoizedMessageBubble';

export interface MessageThreadProps {
  messages: Message[];
  activeConv: Conversation | null;
  currentUser: UserType | null;
  teamMembers: Array<{ id: string; full_name?: string }>;
  inChatSearchQuery: string;
  isCustomerTyping: boolean;
  isLoadingMessages: boolean;
  isFetchingMore: boolean;
  activeEmpFilterId: string | null;
  activeEmpFilterObj: { name: string } | null;
  setInChatEmployeeFilter: (id: string | null) => void;
  setSelectedEmployeeId: (id: string | null) => void;
  scrollToMessage: (msgId?: string) => void;
  scrollToBottom: (behavior?: ScrollBehavior) => void;
  scrollContainerRef: React.RefObject<HTMLDivElement>;
  bottomAnchorRef: React.RefObject<HTMLDivElement>;
  messagesEndRef: React.RefObject<HTMLDivElement>;
  handleScroll: (e: React.UIEvent<HTMLDivElement>) => void;
  handleMediaLoaded: () => void;
  handleOpenImagePreview: (url: string) => void;
  toggleReaction: (msgId: string, emoji: string) => void;
  resolveMedia: (msg: Message) => any;
  formatMessageTime: (dateStr: string) => string;
  renderHighlightedText: (text: string, query: string) => React.ReactNode;
}

export const MessageThread: React.FC<MessageThreadProps> = ({
  messages,
  activeConv,
  currentUser,
  teamMembers,
  inChatSearchQuery,
  isLoadingMessages,
  isFetchingMore,
  activeEmpFilterId,
  activeEmpFilterObj,
  setInChatEmployeeFilter,
  setSelectedEmployeeId,
  scrollToMessage,
  scrollContainerRef,
  bottomAnchorRef,
  messagesEndRef,
  handleScroll,
  handleMediaLoaded,
  handleOpenImagePreview,
  toggleReaction,
  resolveMedia,
  formatMessageTime,
  renderHighlightedText,
}) => {
  // Deduplicate and sort messages chronologically
  const sortedMessages = useMemo(() => {
    const seenMsgIds = new Set<string>();
    const rawSorted = [...messages]
      .filter((m) => {
        if (!m || !m.id) return false;
        if (seenMsgIds.has(m.id)) return false;
        seenMsgIds.add(m.id);
        return true;
      })
      .sort(
        (a, b) => new Date(a.created_at || 0).getTime() - new Date(b.created_at || 0).getTime()
      );

    if (!activeEmpFilterId) return rawSorted;

    const filterTarget = activeEmpFilterId.toLowerCase().trim();
    const filterName = (activeEmpFilterObj?.name || '').toLowerCase().trim();
    return rawSorted.filter((m) => {
      if (m.sender_type !== 'agent') return false;
      const sId = (m.sender_user_id || '').toLowerCase().trim();
      const sName = (m.sender_name || '').toLowerCase().trim();
      const sExt = (m.sender_external_id || '').toLowerCase().trim();
      return (
        (sId && sId === filterTarget) ||
        (sName &&
          (sName === filterTarget ||
            (filterName &&
              (sName === filterName || sName.includes(filterName) || filterName.includes(sName))))) ||
        (sExt &&
          (sExt === filterTarget || (filterName && (sExt === filterName || sExt.includes(filterName)))))
      );
    });
  }, [messages, activeEmpFilterId, activeEmpFilterObj]);

  // Virtual windowing state for long threads (> 60 messages)
  const [renderedWindowCount, setRenderedWindowCount] = useState(WINDOW_SIZE);
  const totalCount = sortedMessages.length;
  const isVirtual = totalCount > VIRTUALIZATION_THRESHOLD;

  // Reset window count when conversation changes
  useEffect(() => {
    setRenderedWindowCount(WINDOW_SIZE);
  }, [activeConv?.id]);

  // Expand rendered window when user scrolls near the top of the container
  const onInternalScroll = useCallback(
    (e: React.UIEvent<HTMLDivElement>) => {
      handleScroll(e);
      if (!isVirtual) return;

      const container = e.currentTarget;
      if (container.scrollTop < 250 && renderedWindowCount < totalCount) {
        setRenderedWindowCount((prev) => Math.min(totalCount, prev + 30));
      }
    },
    [handleScroll, isVirtual, renderedWindowCount, totalCount]
  );

  // Calculate the slice of messages to render
  const visibleMessages = useMemo(() => {
    if (!isVirtual || renderedWindowCount >= totalCount) {
      return sortedMessages;
    }
    const startIndex = Math.max(0, totalCount - renderedWindowCount);
    return sortedMessages.slice(startIndex);
  }, [sortedMessages, isVirtual, renderedWindowCount, totalCount]);

  const unrenderedCount = isVirtual ? Math.max(0, totalCount - renderedWindowCount) : 0;
  const topSpacerHeight = unrenderedCount * ESTIMATED_ITEM_HEIGHT;

  return (
    <div
      ref={scrollContainerRef as any}
      onScroll={onInternalScroll}
      className="relative flex-1 overflow-y-auto px-6 py-4 bg-[#ECE5DD] scrollbar-none select-text"
    >
      <div className="relative min-h-full select-text">
        <svg
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 h-full w-full stroke-slate-400/20"
        >
          <defs>
            <pattern id="chat-makeup-doodles" width="128" height="128" patternUnits="userSpaceOnUse">
              <g fill="none" strokeWidth="1.1" strokeLinecap="round" strokeLinejoin="round">
                {/* Lipstick */}
                <g transform="translate(8 9) rotate(-10 8 14)">
                  <path d="M5 9h7v15H5zM3.5 24h10v5h-10zM6 9V5l3-3 3 3v4M5 19h7" />
                </g>
                {/* Perfume bottle */}
                <g transform="translate(44 7)">
                  <path d="M5 9h16l3 5v17H2V14l3-5ZM8 4h10v5H8zM11 1h4v3M6 19c4-3 10-3 14 0" />
                  <path d="m18 4 7-2m0 0 4 2m-4-2 3-2" />
                </g>
                {/* Eyeliner */}
                <g transform="translate(96 8) rotate(9 8 16)">
                  <rect x="5" y="17" width="7" height="18" rx="2.5" />
                  <path d="M8.5 17V4M4 5l9-1M4 8l9-1M4 11l9-1" />
                </g>
                {/* Powder compact */}
                <g transform="translate(7 69)">
                  <ellipse cx="12" cy="14" rx="11" ry="5.5" />
                  <path d="M1 14V7c0-5 22-5 22 0v7M5 9c4-3 10-3 14 0" />
                </g>
                {/* Makeup brush */}
                <g transform="translate(51 65) rotate(15 8 14)">
                  <path d="M3 6c4-5 11-5 15 0l-3 7H6L3 6ZM6 13h9l-2 22H9L6 13Z" />
                  <path d="m5 3 3 4m3-6v6m5-4-2 4" />
                </g>
                {/* Hand mirror */}
                <g transform="translate(93 68) rotate(-8 11 15)">
                  <circle cx="10" cy="10" r="9" />
                  <circle cx="10" cy="10" r="6" />
                  <path d="m10 19 1.5 12h-3L10 19ZM5 8c2-3 5-4 8-2" />
                </g>
              </g>
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#chat-makeup-doodles)" stroke="none" />
        </svg>

        <div className="relative z-10 space-y-3 select-text">
      {isFetchingMore && (
        <div className="text-center py-1 text-xs text-[#1A73E8] animate-pulse font-semibold">
          جاري تحميل الرسائل الأقدم...
        </div>
      )}

      {isLoadingMessages ? (
        <div className="text-center text-xs text-slate-400 py-10 animate-pulse font-medium">
          جاري تحميل الرسائل...
        </div>
      ) : activeEmpFilterId && sortedMessages.length === 0 ? (
        <div className="text-center py-16 px-4 space-y-3 bg-white/50 rounded-2xl border border-dashed border-indigo-200 m-4 animate-in fade-in">
          <div className="w-10 h-10 rounded-full bg-indigo-50 text-indigo-600 flex items-center justify-center mx-auto">
            <User className="w-5 h-5" />
          </div>
          <div>
            <p className="text-xs font-bold text-slate-800">
              لا توجد ردود مسجلة للموظف ({activeEmpFilterObj?.name || activeEmpFilterId}) في هذه المحادثة
            </p>
            <p className="text-[11px] text-slate-500 mt-1">
              إجمالي رسائل هذه المحادثة: {messages.length} رسالة
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              setInChatEmployeeFilter(null);
              setSelectedEmployeeId(null);
            }}
            className="text-xs px-3 py-1 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-full transition shadow-2xs cursor-pointer"
          >
            عرض كل رسائل المحادثة
          </button>
        </div>
      ) : (
        <>
          {/* Virtual Top Spacer to preserve scroll position and scrollbar track */}
          {topSpacerHeight > 0 && (
            <div
              style={{ height: `${topSpacerHeight}px` }}
              className="w-full flex items-center justify-center text-[10px] text-slate-300 select-none pointer-events-none"
            >
              <span>↑ مرر للأعلى لعرض {unrenderedCount} رسالة أقدم</span>
            </div>
          )}

          {visibleMessages.map((msg, idx) => {
            const prevMsg = idx > 0 ? visibleMessages[idx - 1] : null;
            return (
              <MemoizedMessageBubble
                key={msg.id}
                msg={msg}
                prevMsg={prevMsg}
                currentUser={currentUser}
                teamMembers={teamMembers}
                inChatSearchQuery={inChatSearchQuery}
                scrollToMessage={scrollToMessage}
                handleMediaLoaded={handleMediaLoaded}
                handleOpenImagePreview={handleOpenImagePreview}
                toggleReaction={toggleReaction}
                resolveMedia={resolveMedia}
                formatMessageTime={formatMessageTime}
                renderHighlightedText={renderHighlightedText}
              />
            );
          })}
        </>
      )}

      <div ref={messagesEndRef as any} />
      <div ref={bottomAnchorRef as any} className="h-px w-full" />
        </div>
      </div>
    </div>
  );
};
