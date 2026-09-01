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
} from 'lucide-react';
import { Message, Conversation } from '../../../../types/crm';
import { User as UserType } from '../../../../store/useAuthStore';
import { formatChatDateDivider, isDifferentDay } from '../../../../utils/dateUtils';
import { MessageActionsMenu } from '../MessageActionsMenu';

// Constants for Virtual Scrolling Optimization
const VIRTUALIZATION_THRESHOLD = 60; // Enable windowing if messages exceed this count
const WINDOW_SIZE = 50; // Visible batch size
const ESTIMATED_ITEM_HEIGHT = 72; // Average message row height in pixels

// Inline Audio Player Component
export const CustomAudioPlayer: React.FC<{ url: string }> = ({ url }) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const togglePlay = () => {
    if (!audioRef.current) return;
    if (isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
    } else {
      audioRef.current.volume = 1.0;
      audioRef.current.muted = false;
      audioRef.current
        .play()
        .then(() => setIsPlaying(true))
        .catch((err) => {
          console.warn('Audio playback error:', err);
          setIsPlaying(false);
        });
    }
  };

  const handleTimeUpdate = () => {
    if (!audioRef.current) return;
    const current = audioRef.current.currentTime;
    let dur = audioRef.current.duration;
    if (dur === Infinity || isNaN(dur)) {
      dur = duration > 0 ? duration : current;
    }
    setCurrentTime(current);
    if (dur > 0 && isFinite(dur)) {
      setProgress((current / dur) * 100);
    }
  };

  const handleLoadedMetadata = () => {
    if (audioRef.current) {
      const dur = audioRef.current.duration;
      if (dur === Infinity || isNaN(dur)) {
        audioRef.current.currentTime = 1e101;
        audioRef.current.ontimeupdate = function () {
          this.ontimeupdate = () => handleTimeUpdate();
          if (audioRef.current) {
            audioRef.current.currentTime = 0;
            setDuration(audioRef.current.duration || 0);
          }
        };
      } else {
        setDuration(dur);
      }
    }
  };

  const handleSeek = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!audioRef.current) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const width = rect.width;
    const totalDur = audioRef.current.duration && isFinite(audioRef.current.duration) ? audioRef.current.duration : duration;
    if (totalDur > 0 && isFinite(totalDur)) {
      const newTime = (clickX / width) * totalDur;
      audioRef.current.currentTime = newTime;
      setProgress((newTime / totalDur) * 100);
    }
  };

  const formatAudioTime = (sec: number) => {
    if (isNaN(sec) || !isFinite(sec) || sec <= 0) return '0:00';
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  return (
    <div className="flex items-center gap-3 bg-slate-100/90 hover:bg-slate-100 p-2.5 rounded-2xl border border-slate-200/80 my-1 min-w-[220px]">
      <audio
        ref={audioRef}
        src={url}
        preload="auto"
        onTimeUpdate={handleTimeUpdate}
        onLoadedMetadata={handleLoadedMetadata}
        onCanPlay={() => {
          if (audioRef.current && isFinite(audioRef.current.duration) && audioRef.current.duration > 0) {
            setDuration(audioRef.current.duration);
          }
        }}
        onEnded={() => {
          setIsPlaying(false);
          setProgress(0);
          setCurrentTime(0);
        }}
        className="hidden"
      />
      <button
        type="button"
        onClick={togglePlay}
        className="w-8 h-8 rounded-full bg-[#1A73E8] hover:bg-[#1557B0] text-white flex items-center justify-center transition shadow-2xs shrink-0 cursor-pointer"
      >
        {isPlaying ? (
          <span className="font-bold text-xs">⏸</span>
        ) : (
          <span className="font-bold text-xs ml-0.5">▶</span>
        )}
      </button>

      <div className="flex-1 flex flex-col gap-1">
        <div
          onClick={handleSeek}
          className="h-2 bg-slate-200 rounded-full cursor-pointer relative overflow-hidden"
        >
          <div
            className="h-full bg-[#1A73E8] rounded-full transition-all duration-100"
            style={{ width: `${progress}%` }}
          />
        </div>
        <div className="flex items-center justify-between text-[10px] text-slate-500 font-medium font-mono">
          <span>{formatAudioTime(currentTime)}</span>
          <span>{formatAudioTime(duration)}</span>
        </div>
      </div>
    </div>
  );
};

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
  const media = resolveMedia(msg);
  const hasContent = Boolean(
    (msg.text && msg.text.trim()) ||
      media.isAudio ||
      media.isImage ||
      media.isVideo ||
      media.isDoc ||
      msg.media_url ||
      msg.is_deleted
  );

  if (!hasContent) return null;

  const isAgent = msg.sender_type === 'agent';
  const isPending = msg.delivery_status === 'pending';
  const isFailed = msg.delivery_status === 'failed';
  const isDeleted = Boolean(msg.is_deleted);
  const showDateDivider = !prevMsg || isDifferentDay(msg.created_at, prevMsg.created_at);

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
        className={`group/msg relative flex items-center gap-1.5 my-1 transition-all ${
          isAgent ? 'flex-row' : 'flex-row-reverse'
        }`}
      >
        <div
          className={`max-w-md px-4 py-2.5 rounded-2xl text-xs leading-relaxed shadow-2xs transition-all relative ${
            isFailed
              ? 'bg-rose-50 text-rose-800 border border-rose-200 rounded-br-none font-medium'
              : isDeleted
              ? 'bg-slate-100/90 text-slate-400 border border-slate-200/80 rounded-2xl italic'
              : isAgent
              ? 'bg-[#E6F4EA] text-[#137333] border border-emerald-100/60 rounded-2xl rounded-tl-none font-normal'
              : 'bg-white text-[#1E293B] border border-slate-100 rounded-2xl rounded-tr-none font-normal'
          }`}
        >
          {/* Sender Tag for Agent Messages */}
          {isAgent && !isDeleted && (
            <span className="text-[10px] text-[#137333] font-bold block mb-1">
              {msg.sender_name ||
                (msg.sender_user_id && msg.sender_user_id === currentUser?.id
                  ? currentUser?.full_name
                  : null) ||
                'موظف الدعم'}
            </span>
          )}

          {/* Forwarded Tag */}
          {msg.forwarded && !isDeleted && (
            <div className="flex items-center gap-1 text-[10px] text-slate-400 font-semibold mb-1">
              <ForwardIcon className="w-3 h-3 text-slate-400" />
              <span>معاد توجيهها</span>
            </div>
          )}

          {/* Quoted Reply Reference */}
          {msg.reply_to && !isDeleted && (
            <div
              onClick={() => scrollToMessage(msg.reply_to?.message_id)}
              className="mb-2 p-2 rounded-xl bg-black/5 hover:bg-black/10 border-r-3 border-[#1A73E8] cursor-pointer transition text-[11px] select-none text-right"
            >
              <div className="flex items-center gap-1 text-[10px] font-bold text-[#1A73E8]">
                <CornerUpLeft className="w-3 h-3" />
                <span>{msg.reply_to.sender_name || 'رد على رسالة'}</span>
              </div>
              <p className="text-slate-600 truncate mt-0.5 max-w-xs">
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

              {/* HTML5 Video Player */}
              {(msg.message_type === 'video' || media.isVideo) &&
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
                  className="relative group cursor-pointer overflow-hidden rounded-2xl max-w-xs my-1 shadow-xs border border-slate-200/80 bg-slate-50 select-none"
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
              {msg.text &&
                !msg.text.startsWith('voice_') &&
                !msg.text.startsWith('img_') &&
                !msg.text.startsWith('vid_') &&
                !msg.text.startsWith('image-') &&
                !msg.text.includes('📍') && (
                  <p className="whitespace-pre-wrap break-words">
                    {renderHighlightedText(msg.text, inChatSearchQuery)}
                  </p>
                )}
            </>
          )}

          {/* Timestamp, Pin, Edited & Delivery Status */}
          <div
            className={`flex items-center gap-1.5 mt-1 text-[10px] ${
              isAgent ? 'text-[#137333]/80 justify-start' : 'text-slate-400 justify-end'
            }`}
          >
            <span>{formatMessageTime(msg.created_at)}</span>
            {isAgent &&
              (msg.sender_name ||
                (msg.sender_user_id &&
                  teamMembers.find((m) => m.id === msg.sender_user_id)?.full_name)) && (
                <span className="text-[10px] text-[#137333] font-semibold flex items-center gap-0.5">
                  <span>•</span>
                  <span>
                    {msg.sender_name ||
                      teamMembers.find((m) => m.id === msg.sender_user_id)?.full_name}
                  </span>
                </span>
              )}
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
              <span className="text-[#137333] font-bold text-[11px]" title="تم التوصيل">
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
      className="flex-1 overflow-y-auto px-6 py-4 space-y-3 bg-slate-50/40 scrollbar-none"
    >
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
  );
};
