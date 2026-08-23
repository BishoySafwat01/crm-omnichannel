import React, { useState, useRef, useEffect } from 'react';
import {
  Send,
  Zap,
  CheckCheck,
  UserCheck,
  Sparkles,
  Paperclip,
  FileText,
  Play,
  Pause,
  Download,
  AlertTriangle,
  RotateCcw,
  Trash2,
  Clock,
  X,
  Mic,
  User,
  AlertCircle,
  Plus,
  MapPin,
  ExternalLink,
  ChevronDown,
  Search,
  ChevronUp,
  Ban,
  ShieldCheck,
  Pin,
  CornerUpLeft,
  Video,
  Edit2,
  Check,
  Loader2,
  Image as ImageIcon,
  Forward as ForwardIcon,
} from 'lucide-react';
import { useCrmStore } from '../store/useCrmStore';
import { useAuthStore } from '../store/useAuthStore';
import { MetaMessageTag } from '../types/crm';
import { UserAvatar } from './UserAvatar';
import { formatChatDateDivider, isDifferentDay } from '../lib/dateUtils';
import { aiApi } from '../services/api';
import { useCustomerPresence } from '../hooks/useCustomerPresence';
import { MessageActionsMenu } from './MessageActions/MessageActionsMenu';
import { ForwardMessageModal } from './MessageActions/ForwardMessageModal';

// Custom Inline Audio Player Component
const CustomAudioPlayer: React.FC<{ url: string }> = ({ url }) => {
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
        // Chromium WebM fix for Infinity duration
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
    const totalDur = (audioRef.current.duration && isFinite(audioRef.current.duration)) ? audioRef.current.duration : duration;
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
        className="w-8 h-8 rounded-full bg-emerald-600 hover:bg-emerald-700 text-white flex items-center justify-center transition shrink-0 shadow-2xs cursor-pointer"
      >
        {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 ml-0.5" />}
      </button>

      <div className="flex-1 space-y-1">
        <div
          onClick={handleSeek}
          className="h-2 bg-slate-200 rounded-full overflow-hidden cursor-pointer relative"
        >
          <div
            className="h-full bg-emerald-600 transition-all duration-75"
            style={{ width: `${Math.min(100, Math.max(0, progress))}%` }}
          />
        </div>
        <div className="flex items-center justify-between text-[10px] text-slate-500 font-medium font-mono">
          <span>{formatAudioTime(currentTime)}</span>
          <span>{duration > 0 ? formatAudioTime(duration) : 'تسجيل صوتي'}</span>
        </div>
      </div>
    </div>
  );
};

interface ResolvedMedia {
  isAudio: boolean;
  isImage: boolean;
  isVideo: boolean;
  isDoc: boolean;
  url: string | null;
  fileName: string;
}

const getProxiedMediaUrl = (url: string | null | undefined): string => {
  if (!url) return '';
  if (url.startsWith('/uploads/') || url.startsWith('/api') || url.startsWith('blob:') || url.startsWith('data:')) {
    return url;
  }
  if (url.includes('fbcdn.net') || url.includes('facebook.com') || url.includes('cdninstagram.com')) {
    return `/api/v1/media/proxy?url=${encodeURIComponent(url)}`;
  }
  return url;
};

const isSocialWebLink = (url: string | undefined | null): boolean => {
  if (!url) return false;
  return (
    url.includes('instagram.com/reel/') ||
    url.includes('instagram.com/p/') ||
    url.includes('instagram.com/stories/') ||
    url.includes('facebook.com/watch') ||
    url.includes('facebook.com/story')
  );
};

const resolveMedia = (msg: any): ResolvedMedia => {
  let url: string | null = null;
  let mime = '';
  let type = '';
  let fileName = '';

  if (msg.attachments && msg.attachments.length > 0) {
    const first = msg.attachments[0];
    url = first.url || first.payload?.url || first.image_data?.url || first.image_data?.preview_url || first.file_url;
    mime = first.mime_type || '';
    type = first.type || (first.image_data ? 'image' : first.file_type || '');
    fileName = first.filename || first.name || first.title || '';
  }

  if (!url && msg.media_url) {
    url = msg.media_url;
    type = msg.media_type || type || '';
  }
  if (!url && (msg.metadata_?.attachments?.[0] || msg.metadata?.attachments?.[0])) {
    const att = msg.metadata_?.attachments?.[0] || msg.metadata?.attachments?.[0];
    url = att.url || att.payload?.url || att.image_data?.url || att.image_data?.preview_url || att.file_url;
    mime = att.mime_type || '';
    type = att.type || (att.image_data ? 'image' : '');
    fileName = att.filename || att.name || att.title || '';
  }

  const textVal = (msg.text || '').trim();
  if (!url && (textVal.startsWith('voice_') || textVal.startsWith('img_') || textVal.startsWith('vid_') || textVal.startsWith('image-') || textVal.startsWith('/uploads/') || /\.(ogg|mp4|m4a|webm|mp3|wav|jpg|jpeg|png|webp|gif)$/i.test(textVal))) {
    url = textVal.startsWith('/uploads/') ? textVal : `/uploads/${textVal.replace(/^\(+|\)+$/g, '')}`;
    fileName = textVal;
  }

  if (!url) {
    return { isAudio: false, isImage: false, isVideo: false, isDoc: false, url: null, fileName: '' };
  }

  url = getProxiedMediaUrl(url);

  const lower = url.toLowerCase();
  const isSocial = isSocialWebLink(url);
  const msgType = (msg.message_type || type || '').toLowerCase();

  const isAudio =
    !isSocial &&
    (msgType === 'audio' ||
      type === 'audio' ||
      mime.startsWith('audio/') ||
      lower.includes('voice_') ||
      lower.includes('voice') ||
      lower.includes('audio') ||
      /\.(ogg|m4a|mp3|wav|aac|opus)/i.test(lower) ||
      (lower.includes('.webm') && (lower.includes('voice') || mime.startsWith('audio/') || msgType === 'audio')));

  const isVideo =
    !isSocial &&
    !isAudio &&
    (msgType === 'video' ||
      type === 'video' ||
      mime.startsWith('video/') ||
      lower.includes('vid_') ||
      /\.(mp4|mov|avi|mkv|ogv)/i.test(lower) ||
      (lower.includes('.webm') && !lower.includes('voice')));

  const isImage =
    !isSocial &&
    !isAudio &&
    !isVideo &&
    (msgType === 'image' ||
      type === 'image' ||
      mime.startsWith('image/') ||
      lower.includes('image-') ||
      lower.includes('img_') ||
      lower.includes('img-') ||
      /\.(jpg|jpeg|png|webp|gif|svg)/i.test(lower) ||
      ((lower.includes('fbsbx.com') || lower.includes('fbcdn.net') || lower.includes('cdninstagram.com')) &&
        !/\.(ogg|m4a|mp3|webm|wav|aac|mp4|mov)/i.test(lower)));

  const isShare =
    isSocial ||
    msg.message_type === 'share_reel' ||
    msg.message_type === 'share_post' ||
    msg.message_type === 'share' ||
    lower.includes('instagram.com');

  const isDoc = !isImage && !isAudio && !isVideo && !isShare;

  return { isAudio, isImage, isVideo, isDoc, url, fileName: fileName || url.split('/').pop() || 'file' };
};

const CANNED_RESPONSES = [
  'أهلاً بك! يسعدنا تواصلك مع مجموعة LUXIRA.',
  'تم تسجيل طلبك بنجاح، وسيتم التواصل معك خلال لحظات.',
  'المنتج متوفر حالياً وخصم خاص بمناسبة العرض الحالي.',
  'شكراً لثقتكم بنا، هل يمكنني مساعدتك بأي استفسار آخر؟',
];

const META_TAGS: { id: MetaMessageTag; label: string }[] = [
  { id: 'HUMAN_AGENT', label: 'HUMAN_AGENT (رد موظف دعم)' },
  { id: 'CONFIRMED_EVENT_UPDATE', label: 'CONFIRMED_EVENT_UPDATE (تحديث موعد)' },
  { id: 'POST_PURCHASE_UPDATE', label: 'POST_PURCHASE_UPDATE (تحديث الطلب)' },
];

const AGENTS = [
  { id: '', name: 'غير مخصص' },
  { id: 'أحمد محمود', name: 'أحمد محمود' },
  { id: 'سارة علي', name: 'سارة علي' },
  { id: 'محمد حسن', name: 'محمد حسن' },
];

const AVAILABLE_BRANDS = [
  { id: 'LAVVA', label: 'LAVVA' },
  { id: 'MOON LIGHT', label: 'MOON LIGHT' },
  { id: 'LOTUS BLUE', label: 'LOTUS BLUE' },
  { id: 'BEAUTY CENTER', label: 'BEAUTY CENTER' },
  { id: 'LOXX KING', label: 'LOXX KING' },
  { id: 'FLARE', label: 'FLARE' },
];

export const ChatCanvas: React.FC = () => {
  const currentUser = useAuthStore((state) => state.user);
  const {
    conversations,
    activeConversationId,
    messages,
    fetchMessages,
    sendMessage,
    retryMessage,
    deleteMessage,
    uploadAndSendMedia,
    isTyping,
    setConversationStatus,
    assignAgentToConversation,
    setConversationPriority,
    updateConversationBrand,
    isLoadingMessages,
    isFetchingMore,
    loadMoreMessages,
    selectedMetaTag,
    setSelectedMetaTag,
    draftText,
    setDraftText,
    replyingToMessage,
    setReplyingToMessage,
    editingMessage,
    setEditingMessage,
    isForwardModalOpen,
    setIsForwardModalOpen,
    forwardingMessage,
    editMessage,
    toggleReaction,
  } = useCrmStore();

  const { user } = useAuthStore();
  const isAdmin = user?.role === 'admin' || (user?.role as any) === 'ADMIN';

  const [showCannedPicker, setShowCannedPicker] = useState(false);
  const [showAttachmentMenu, setShowAttachmentMenu] = useState(false);
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [editInputText, setEditInputText] = useState('');
  const [isSubmittingEdit, setIsSubmittingEdit] = useState(false);

  useEffect(() => {
    if (editingMessage) {
      setEditInputText(editingMessage.text || '');
    } else {
      setEditInputText('');
    }
  }, [editingMessage]);

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

  // Staged Media / Attachment State
  const [stagedMedia, setStagedMedia] = useState<{
    file: File;
    previewUrl?: string;
    type: 'image' | 'video' | 'audio' | 'doc';
    name: string;
    size: number;
  } | null>(null);
  const [isUploadingMedia, setIsUploadingMedia] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  // Live Voice Recording State
  const [isRecording, setIsRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const recordingTimerRef = useRef<any>(null);

  // File Inputs Refs
  const imageInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);
  const docInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const activeConv = conversations.find((c) => c.id === activeConversationId);
  const activeMessages = activeConversationId ? messages[activeConversationId] || [] : [];
  const latestPinned = React.useMemo(() => activeMessages.filter((m) => m.is_pinned && !m.is_deleted).slice(-1)[0] || null, [activeMessages]);
  const isCustomerTyping = activeConversationId ? isTyping[activeConversationId] : false;
  const presence = useCustomerPresence(
    activeConv?.last_activity_at || activeConv?.customer?.last_activity_at || activeConv?.last_customer_message_at || activeConv?.last_message_at,
    Boolean(isCustomerTyping)
  );

  // In-Chat Search State & Smooth Jump
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [inChatSearchQuery, setInChatSearchQuery] = useState('');
  const [matchedMsgIndex, setMatchedMsgIndex] = useState(0);

  const matchedMessageIds = React.useMemo(() => {
    if (!inChatSearchQuery.trim()) return [];
    const q = inChatSearchQuery.toLowerCase().trim();
    return activeMessages.filter((m) => (m.text || '').toLowerCase().includes(q)).map((m) => m.id);
  }, [inChatSearchQuery, activeMessages]);

  const handleJumpToMatch = (dir: 'next' | 'prev') => {
    if (matchedMessageIds.length === 0) return;
    let nextIdx = dir === 'next' ? matchedMsgIndex + 1 : matchedMsgIndex - 1;
    if (nextIdx >= matchedMessageIds.length) nextIdx = 0;
    if (nextIdx < 0) nextIdx = matchedMessageIds.length - 1;
    setMatchedMsgIndex(nextIdx);
    const targetId = matchedMessageIds[nextIdx];
    const el = document.getElementById(`msg-${targetId}`);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  };

  const renderHighlightedText = (text: string, query: string) => {
    if (!query || !query.trim()) return text;
    const q = query.trim();
    const parts = text.split(new RegExp(`(${q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi'));
    return (
      <>
        {parts.map((part, i) =>
          part.toLowerCase() === q.toLowerCase() ? (
            <mark key={i} className="bg-amber-300 text-slate-950 font-bold px-1 rounded shadow-2xs">
              {part}
            </mark>
          ) : (
            part
          )
        )}
      </>
    );
  };

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
      setAiInsights({
        summary: activeConv.ai_summary,
        intent: activeConv.detected_intent,
        sentiment: activeConv.detected_sentiment,
        replies: activeConv.ai_suggested_replies || [],
      });
    }
  }, [activeConv?.id, activeConv?.ai_summary, activeConv?.detected_intent, activeConv?.detected_sentiment, activeConv?.ai_suggested_replies]);

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
      if (res.updated_priority) {
        setConversationPriority(activeConv.id, res.updated_priority as any);
      }
    } catch (e) {
      console.error('AI Analysis failed:', e);
    } finally {
      setIsAnalyzingAI(false);
    }
  };

  const lastCustomerMsgAt = activeConv?.last_customer_message_at
    ? new Date(activeConv.last_customer_message_at).getTime()
    : Date.now();
  const is24hWindowExpired = Date.now() - lastCustomerMsgAt > 24 * 3600 * 1000;

  const bottomAnchorRef = useRef<HTMLDivElement>(null);
  const isUserScrolledUpRef = useRef<boolean>(false);

  const scrollToBottom = React.useCallback((behavior: ScrollBehavior = 'auto') => {
    if (bottomAnchorRef.current) {
      bottomAnchorRef.current.scrollIntoView({ behavior, block: 'end' });
    } else if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior, block: 'end' });
    } else if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollTop = scrollContainerRef.current.scrollHeight;
    }
  }, []);

  const handleScroll = React.useCallback(() => {
    if (!scrollContainerRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = scrollContainerRef.current;

    if (scrollTop === 0 && !isFetchingMore) {
      loadMoreMessages();
    }

    const distanceFromBottom = scrollHeight - scrollTop - clientHeight;
    isUserScrolledUpRef.current = distanceFromBottom > 150;
  }, [isFetchingMore, loadMoreMessages]);

  React.useLayoutEffect(() => {
    isUserScrolledUpRef.current = false;
    scrollToBottom('auto');
    const timer = setTimeout(() => scrollToBottom('auto'), 50);
    return () => clearTimeout(timer);
  }, [activeConversationId, scrollToBottom]);

  React.useLayoutEffect(() => {
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

    // P2-8: Fallback poll — 15 s interval (WebSocket events drive updates when connected)
    const msgInterval = setInterval(() => {
      fetchMessages(activeConversationId);
    }, 15000);

    return () => clearInterval(msgInterval);
  }, [activeConversationId, fetchMessages]);

  const handleMediaLoaded = React.useCallback(() => {
    if (!isUserScrolledUpRef.current) {
      scrollToBottom('auto');
    }
  }, [scrollToBottom]);

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: false,
          autoGainControl: true,
        },
      });
      audioChunksRef.current = [];

      let mimeType = 'audio/webm;codecs=opus';
      if (typeof MediaRecorder !== 'undefined') {
        if (MediaRecorder.isTypeSupported('audio/webm;codecs=opus')) {
          mimeType = 'audio/webm;codecs=opus';
        } else if (MediaRecorder.isTypeSupported('audio/ogg;codecs=opus')) {
          mimeType = 'audio/ogg;codecs=opus';
        } else if (MediaRecorder.isTypeSupported('audio/mp4')) {
          mimeType = 'audio/mp4';
        } else {
          mimeType = '';
        }
      }

      const options = mimeType ? { mimeType } : undefined;
      const mediaRecorder = new MediaRecorder(stream, options);
      mediaRecorderRef.current = mediaRecorder;

      mediaRecorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          audioChunksRef.current.push(e.data);
        }
      };

      mediaRecorder.start(100);
      setIsRecording(true);
      setRecordingSeconds(0);

      recordingTimerRef.current = setInterval(() => {
        setRecordingSeconds((prev) => prev + 1);
      }, 1000);
    } catch (err) {
      alert('تعذر الوصول إلى الميكروفون. يرجى تفعيل إذن الصوت في إعدادات المتصفح والتأكد من توصيل الميكروفون.');
    }
  };

  const stopAndSendRecording = () => {
    if (!mediaRecorderRef.current || !activeConversationId) return;

    clearInterval(recordingTimerRef.current);
    const mediaRecorder = mediaRecorderRef.current;

    mediaRecorder.onstop = async () => {
      // Release microphone hardware immediately
      mediaRecorder.stream.getTracks().forEach((track) => track.stop());

      if (!audioChunksRef.current || audioChunksRef.current.length === 0) {
        alert('لم يتم التقاط أي صوت. يرجى التحدث في الميكروفون وإعادة المحاولة.');
        setIsRecording(false);
        setRecordingSeconds(0);
        return;
      }

      const rawMime = mediaRecorder.mimeType || 'audio/webm';
      const cleanMime = rawMime.split(';')[0].trim() || 'audio/webm';
      const ext = cleanMime.includes('ogg') ? '.ogg' : (cleanMime.includes('mp4') ? '.m4a' : (cleanMime.includes('wav') ? '.wav' : '.webm'));
      const audioBlob = new Blob(audioChunksRef.current, { type: rawMime || cleanMime });
      const audioFile = new File([audioBlob], `voice_${Date.now()}${ext}`, { type: cleanMime });

      setIsRecording(false);
      setRecordingSeconds(0);
      setTimeout(() => scrollToBottom('auto'), 50);

      uploadAndSendMedia(audioFile).catch((err) => {
        console.error('Failed to send voice note:', err);
      });
    };

    if (mediaRecorder.state === 'recording') {
      try {
        mediaRecorder.requestData();
      } catch (e) {
        // ignore
      }
      mediaRecorder.stop();
    }
  };

  const cancelRecording = () => {
    if (mediaRecorderRef.current) {
      clearInterval(recordingTimerRef.current);
      mediaRecorderRef.current.stop();
      mediaRecorderRef.current.stream.getTracks().forEach((track) => track.stop());
    }
    audioChunksRef.current = [];
    setIsRecording(false);
    setRecordingSeconds(0);
  };

  const handleSelectFile = (file: File) => {
    if (!file) return;
    const fileNameLower = file.name.toLowerCase();
    const isVoice = fileNameLower.startsWith('voice_') || file.type.startsWith('audio/') || ['ogg', 'opus', 'mp3', 'm4a', 'wav', 'aac'].some((ext) => fileNameLower.endsWith(ext));
    const isVideo = !isVoice && (file.type.startsWith('video/') || ['mp4', 'mov', 'avi', 'mkv', 'ogv'].some((ext) => fileNameLower.endsWith(ext)) || (fileNameLower.endsWith('.webm') && !fileNameLower.includes('voice')));
    const isImage = !isVoice && !isVideo && (file.type.startsWith('image/') || ['png', 'jpg', 'jpeg', 'webp', 'gif', 'svg'].some((ext) => fileNameLower.endsWith(ext)));
    const isAudio = isVoice || (!isVideo && !isImage && file.type.startsWith('audio/'));
    const mediaType: 'image' | 'video' | 'audio' | 'doc' = isAudio ? 'audio' : (isVideo ? 'video' : (isImage ? 'image' : 'doc'));

    let previewUrl: string | undefined = undefined;
    if (isImage || isVideo || isAudio) {
      previewUrl = URL.createObjectURL(file);
    }

    setStagedMedia({
      file,
      previewUrl,
      type: mediaType,
      name: file.name,
      size: file.size,
    });
    setUploadError(null);
    setShowAttachmentMenu(false);
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      handleSelectFile(file);
      e.target.value = '';
    }
  };

  const handleSend = () => {
    if (!activeConversationId) return;

    if (stagedMedia) {
      const fileToSend = stagedMedia.file;
      const textToSend = draftText.trim();
      if (stagedMedia.previewUrl) URL.revokeObjectURL(stagedMedia.previewUrl);

      // Instantly clear composer box
      setStagedMedia(null);
      setDraftText('');
      setShowCannedPicker(false);
      setUploadError(null);
      setTimeout(() => scrollToBottom('auto'), 50);

      uploadAndSendMedia(fileToSend, textToSend);
      return;
    }

    if (!draftText.trim()) return;
    const textToSend = draftText.trim();
    setDraftText('');
    setShowCannedPicker(false);
    sendMessage(textToSend);
    setTimeout(() => scrollToBottom('auto'), 50);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const formatMessageTime = (isoStr?: string) => {
    if (!isoStr) return '';
    return new Date(isoStr).toLocaleTimeString('ar-EG', {
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const formatSeconds = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  if (!activeConv) {
    return (
      <main className="flex-1 bg-gradient-to-b from-slate-50 to-slate-100/50 flex items-center justify-center p-6 dir-rtl text-right">
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

  const customerName = activeConv.customer_display_name || activeConv.customer?.display_name || 'عميل بدون اسم';
  const avatarUrl = activeConv.customer_avatar_url || activeConv.customer?.avatar_url;

  return (
    <main className="flex-1 bg-white/75 backdrop-blur-xl border border-white/60 shadow-[0_4px_20px_-2px_rgba(0,0,0,0.03)] rounded-2xl flex flex-col h-[calc(100vh-80px)] relative z-10 overflow-hidden">
      {/* Sleek 56px Google Glass Chat Header Bar */}
      <header className="h-14 bg-white/80 backdrop-blur-md border-b border-slate-100/80 px-6 flex items-center justify-between shrink-0 z-20">
        {/* Customer Avatar & Name & Status Subtitle (RTL Right) */}
        <div className="flex items-center gap-3">
          <div className="relative">
            <UserAvatar name={customerName} avatarUrl={avatarUrl} size="md" />
            <span className={`w-3 h-3 border-2 border-white rounded-full absolute bottom-0 right-0 ${presence.dotColor}`} title={presence.statusText} />
          </div>

          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-xs font-bold text-slate-900">{customerName}</h2>
              <span className="text-[10px] bg-[#E8F0FE] text-[#1A73E8] px-2 py-0.5 rounded-full font-bold">
                {activeConv.brand || activeConv.brand_name || 'LUXIRA'}
              </span>
            </div>
            <p className="text-[11px] text-slate-500 font-medium flex items-center gap-1.5 mt-0.5">
              <span className={presence.colorClass}>{presence.statusText}</span>
              <span>•</span>
              <span>{activeConv.channel}</span>
            </p>
          </div>
        </div>

        {/* Grouped Actions Toolbar (RTL Left) */}
        <div className="flex items-center gap-2">
          {/* In-Chat Search Trigger & Bar */}
          <div className="relative flex items-center">
            {isSearchOpen ? (
              <div className="flex items-center gap-1 bg-slate-100/90 rounded-full px-2.5 py-1 border border-slate-200 shadow-2xs animate-in fade-in zoom-in-95 duration-100">
                <Search className="w-3.5 h-3.5 text-slate-400" />
                <input
                  type="text"
                  value={inChatSearchQuery}
                  onChange={(e) => {
                    setInChatSearchQuery(e.target.value);
                    setMatchedMsgIndex(0);
                  }}
                  placeholder="بحث في المحادثة..."
                  autoFocus
                  className="bg-transparent text-xs font-semibold text-slate-800 placeholder-slate-400 focus:outline-none w-36 sm:w-44"
                />
                {matchedMessageIds.length > 0 && (
                  <div className="flex items-center gap-1 border-r border-slate-200 pr-1.5 text-[11px] font-bold text-slate-600">
                    <span>{matchedMsgIndex + 1}/{matchedMessageIds.length}</span>
                    <button type="button" onClick={() => handleJumpToMatch('prev')} className="hover:text-[#1A73E8] p-0.5">
                      <ChevronUp className="w-3 h-3" />
                    </button>
                    <button type="button" onClick={() => handleJumpToMatch('next')} className="hover:text-[#1A73E8] p-0.5">
                      <ChevronDown className="w-3 h-3" />
                    </button>
                  </div>
                )}
                <button
                  type="button"
                  onClick={() => {
                    setIsSearchOpen(false);
                    setInChatSearchQuery('');
                  }}
                  className="p-1 text-slate-400 hover:text-slate-600 transition rounded-full"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setIsSearchOpen(true)}
                className="p-1.5 rounded-full border bg-slate-100/70 hover:bg-white text-slate-600 border-slate-200/60 transition shadow-2xs"
                title="بحث داخل المحادثة"
              >
                <Search className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* AI Insights Floating Popover Button */}
          <div className="relative">
            <button
              onClick={() => setIsAiPopoverOpen(!isAiPopoverOpen)}
              className={`p-1.5 rounded-full border transition flex items-center gap-1 text-xs font-bold ${
                isAiPopoverOpen
                  ? 'bg-[#1A73E8] text-white border-[#1A73E8] shadow-xs'
                  : 'bg-[#E8F0FE] hover:bg-blue-100 text-[#1A73E8] border-[#1A73E8]/20'
              }`}
              title="تحليلات الذكاء الاصطناعي"
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
                    onClick={() => setIsAiPopoverOpen(false)}
                    className="text-slate-400 hover:text-slate-600 text-xs font-bold"
                  >
                    ✕
                  </button>
                </div>

                <p className="text-xs text-slate-700 leading-relaxed font-medium">
                  {aiInsights.summary ? `✨ ${aiInsights.summary}` : 'لا يوجد ملخص متاح حالياً. انقر زر التحليل لتوليد ملخص للمحادثة.'}
                </p>

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
                    onClick={handleRunAIAnalysis}
                    disabled={isAnalyzingAI}
                    className="text-xs bg-[#1A73E8] hover:bg-[#1557B0] text-white font-bold px-3 py-1 rounded-full transition shadow-2xs flex items-center gap-1 disabled:opacity-50"
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
            onClick={() => setConversationStatus(activeConv.id, 'completed')}
            className="px-3 py-1 text-xs font-bold bg-[#1A73E8] hover:bg-[#1557B0] text-white rounded-full transition flex items-center gap-1 shadow-2xs"
          >
            <UserCheck className="w-3.5 h-3.5" />
            <span>إكمال</span>
          </button>
        </div>
      </header>

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

      {/* Message Timeline Stream */}
      <div
        ref={scrollContainerRef}
        onScroll={handleScroll}
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
        ) : (
          (() => {
            const sortedMessages = [...activeMessages].sort(
              (a, b) => new Date(a.created_at || 0).getTime() - new Date(b.created_at || 0).getTime()
            );

            return sortedMessages.map((msg, index) => {
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
              const prevMsg = index > 0 ? sortedMessages[index - 1] : null;
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

                  <div id={`msg-${msg.id}`} className={`flex flex-col ${isAgent ? 'items-start' : 'items-end'}`}>
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
                          {msg.sender_name || (msg.sender_user_id && msg.sender_user_id === currentUser?.id ? currentUser?.full_name : null) || 'موظف الدعم'}
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
                          <p className="text-slate-600 truncate mt-0.5 max-w-xs">{msg.reply_to.text || 'مرفق وسائط'}</p>
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
                          {media.isAudio && media.url && (
                            <CustomAudioPlayer url={media.url} />
                          )}

                          {/* HTML5 Video Player */}
                          {(msg.message_type === 'video' || media.isVideo) && (media.url || msg.media_url) && (
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
                            <div className="relative group cursor-pointer overflow-hidden rounded-xl max-w-xs my-1">
                              <img
                                src={media.url}
                                alt="مرفق صورة"
                                onLoad={handleMediaLoaded}
                                className="w-full max-h-64 object-cover rounded-xl transition-transform duration-200 group-hover:scale-[1.02] border border-slate-100"
                                onClick={() => setPreviewImage(media.url)}
                              />
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
                              <p className="whitespace-pre-wrap break-words">{msg.text}</p>
                            )}
                        </>
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

                      {/* Timestamp & Double Checkmarks (✓✓) */}
                      <div
                        className={`flex items-center gap-1.5 mt-1 text-[10px] ${
                          isAgent ? 'text-[#137333]/80 justify-start' : 'text-slate-400 justify-end'
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
                          <span className="text-[#137333] font-bold text-[11px]" title="تم التوصيل">
                            ✓✓
                          </span>
                        )}
                      </div>

                      {/* Reactions Pill Group */}
                      {msg.reactions && msg.reactions.length > 0 && !isDeleted && (
                        <div className="flex flex-wrap gap-1 mt-1.5 pt-1 border-t border-black/5">
                          {Object.entries(
                            msg.reactions.reduce<Record<string, { count: number; users: string[]; hasReacted: boolean }>>(
                              (acc, r) => {
                                if (!acc[r.emoji]) acc[r.emoji] = { count: 0, users: [], hasReacted: false };
                                acc[r.emoji].count += 1;
                                acc[r.emoji].users.push(r.user_name || 'موظف');
                                if (r.user_id === currentUser?.id) acc[r.emoji].hasReacted = true;
                                return acc;
                              },
                              {}
                            )
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
          })()
        )}

        <div ref={messagesEndRef} />
        <div ref={bottomAnchorRef} className="h-px w-full" />
      </div>

      {/* Floating Smart Reply Chips */}
      {aiInsights.replies && aiInsights.replies.length > 0 && (
        <div className="px-6 pt-1 flex justify-center bg-transparent">
          <div className="w-full max-w-2xl flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
            <span className="text-[10px] font-bold text-[#1A73E8] shrink-0 flex items-center gap-1 bg-white/90 backdrop-blur-md px-2.5 py-0.5 rounded-full border border-slate-200/80 shadow-2xs">
              <Sparkles className="w-3 h-3 text-amber-500" /> اقتراحات:
            </span>
            {aiInsights.replies.map((reply, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => setDraftText(reply)}
                className="text-xs bg-white/90 backdrop-blur-md hover:bg-[#E8F0FE] text-slate-700 border border-slate-200/80 px-3.5 py-1 rounded-full shrink-0 shadow-2xs font-medium transition"
              >
                "{reply}"
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Floating Dock Message Composer */}
      <footer className="px-6 mb-4 mt-1 bg-transparent relative z-20">
        {/* Hidden File Inputs for Categories */}
        <input
          type="file"
          ref={imageInputRef}
          accept="image/*"
          onChange={handleFileInputChange}
          className="hidden"
        />
        <input
          type="file"
          ref={videoInputRef}
          accept="video/*"
          onChange={handleFileInputChange}
          className="hidden"
        />
        <input
          type="file"
          ref={docInputRef}
          accept="application/pdf,.doc,.docx,.xls,.xlsx,.txt,.csv"
          onChange={handleFileInputChange}
          className="hidden"
        />
        <input
          type="file"
          ref={fileInputRef}
          accept="*/*"
          onChange={handleFileInputChange}
          className="hidden"
        />

        {/* Upload Error Banner */}
        {uploadError && (
          <div className="mb-2 p-2.5 bg-rose-50 border border-rose-200 text-rose-700 rounded-xl text-xs font-semibold flex items-center justify-between animate-in fade-in duration-150">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
              <span>{uploadError}</span>
            </div>
            <button
              type="button"
              onClick={() => setUploadError(null)}
              className="text-rose-500 hover:text-rose-800 text-xs font-bold"
            >
              ✕
            </button>
          </div>
        )}

        {/* Rounded All-in-One Floating Dock Composer Box */}
        <div className="border border-slate-200/80 focus-within:border-[#1A73E8] focus-within:ring-2 focus-within:ring-[#1A73E8]/20 bg-white/95 backdrop-blur-md rounded-2xl p-2.5 transition shadow-[0_10px_30px_-4px_rgba(0,0,0,0.06)] space-y-1.5 relative">
          {/* Staged Reply Preview Bar */}
          {replyingToMessage && !editingMessage && (
            <div className="flex items-center justify-between p-2 px-3 bg-blue-50/80 rounded-xl border border-blue-100 animate-in fade-in duration-150">
              <div className="flex items-center gap-2.5 overflow-hidden">
                <CornerUpLeft className="w-4 h-4 text-[#1A73E8] shrink-0" />
                <div className="text-right truncate">
                  <span className="text-[10px] font-bold text-[#1A73E8] block">
                    الرد على {replyingToMessage.sender_name || (replyingToMessage.sender_type === 'customer' ? activeConv?.customer_display_name || 'العميل' : 'موظف الدعم')}
                  </span>
                  <p className="text-xs text-slate-700 truncate font-medium">
                    {replyingToMessage.text || replyingToMessage.attachments?.[0]?.title || 'مرفق وسائط'}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setReplyingToMessage(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-blue-100 transition"
                title="إلغاء الرد"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          )}

          {/* Staged Attachment Preview Strip */}
          {stagedMedia && !editingMessage && (
            <div className="flex items-center justify-between p-2 bg-slate-50 rounded-xl border border-slate-200/80 animate-in fade-in duration-150">
              <div className="flex items-center gap-3">
                {stagedMedia.type === 'image' && stagedMedia.previewUrl ? (
                  <img
                    src={stagedMedia.previewUrl}
                    alt="Preview"
                    className="w-12 h-12 object-cover rounded-lg border border-slate-200 shadow-2xs shrink-0"
                  />
                ) : stagedMedia.type === 'video' ? (
                  <div className="w-12 h-12 rounded-lg bg-indigo-50 text-indigo-600 border border-indigo-200 flex items-center justify-center font-bold shrink-0">
                    <Video className="w-6 h-6" />
                  </div>
                ) : (
                  <div className="w-12 h-12 rounded-lg bg-blue-50 text-[#1A73E8] border border-blue-200 flex items-center justify-center font-bold shrink-0">
                    <FileText className="w-6 h-6" />
                  </div>
                )}
                <div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-[10px] font-extrabold uppercase px-1.5 py-0.2 rounded bg-slate-200 text-slate-700">
                      {stagedMedia.type === 'image' ? 'صورة' : stagedMedia.type === 'video' ? 'فيديو' : 'ملف'}
                    </span>
                    <p className="text-xs font-bold text-slate-800 truncate max-w-[180px] sm:max-w-xs">
                      {stagedMedia.name}
                    </p>
                  </div>
                  <p className="text-[10px] text-slate-400 font-semibold mt-0.5">
                    {formatFileSize(stagedMedia.size)}
                  </p>
                </div>
              </div>

              <button
                type="button"
                disabled={isUploadingMedia}
                onClick={() => {
                  if (stagedMedia.previewUrl) URL.revokeObjectURL(stagedMedia.previewUrl);
                  setStagedMedia(null);
                }}
                className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition"
                title="إلغاء المرفق"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          )}

          {/* Inline Edit Mode or Regular Composer */}
          {editingMessage ? (
            <div className="space-y-2 animate-in fade-in duration-150 p-1">
              <div className="flex items-center justify-between pb-1 border-b border-amber-200">
                <div className="flex items-center gap-1.5 text-xs font-bold text-amber-900">
                  <Edit2 className="w-3.5 h-3.5 text-amber-600" />
                  <span>تعديل الرسالة</span>
                </div>
                <button
                  type="button"
                  onClick={() => setEditingMessage(null)}
                  className="text-slate-400 hover:text-slate-700 text-xs font-bold p-1 rounded-lg hover:bg-slate-100"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              <textarea
                value={editInputText}
                onChange={(e) => setEditInputText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    if (editInputText.trim() && !isSubmittingEdit) {
                      setIsSubmittingEdit(true);
                      editMessage(editingMessage.id, editInputText.trim())
                        .then(() => setEditingMessage(null))
                        .catch((err) => console.error(err))
                        .finally(() => setIsSubmittingEdit(false));
                    }
                  }
                }}
                rows={2}
                className="w-full bg-transparent text-slate-900 text-xs focus:outline-none resize-none font-medium placeholder-slate-400 px-1"
                placeholder="اكتب التعديل هنا... (Enter للحفظ)"
              />
              <div className="flex items-center justify-end gap-2 pt-1 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setEditingMessage(null)}
                  disabled={isSubmittingEdit}
                  className="px-3 py-1.5 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100 transition"
                >
                  إلغاء
                </button>
                <button
                  type="button"
                  disabled={!editInputText.trim() || isSubmittingEdit}
                  onClick={() => {
                    if (editInputText.trim()) {
                      setIsSubmittingEdit(true);
                      editMessage(editingMessage.id, editInputText.trim())
                        .then(() => setEditingMessage(null))
                        .catch((err) => console.error(err))
                        .finally(() => setIsSubmittingEdit(false));
                    }
                  }}
                  className="px-4 py-1.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold transition flex items-center gap-1 shadow-xs disabled:opacity-50 cursor-pointer"
                >
                  <Check className="w-3.5 h-3.5" />
                  <span>{isSubmittingEdit ? 'جاري الحفظ...' : 'حفظ التعديل'}</span>
                </button>
              </div>
            </div>
          ) : isRecording ? (
            /* Live Audio Recording Dock */
            <div className="flex items-center justify-between gap-3 px-3 py-2 bg-rose-50/90 rounded-xl border border-rose-200/80 animate-in fade-in duration-150">
              <div className="flex items-center gap-3">
                <span className="flex h-3 w-3 relative">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-3 w-3 bg-rose-600" />
                </span>
                <span className="text-xs font-bold text-rose-700">جاري تسجيل الصوت...</span>
                <span className="font-mono text-xs font-bold bg-white px-2.5 py-0.5 rounded-lg border border-rose-200 text-rose-800 shadow-2xs">
                  {formatSeconds(recordingSeconds)}
                </span>
                {/* Waveform Pulse Animation */}
                <div className="flex items-center gap-0.5 h-4">
                  <span className="w-1 bg-rose-500 rounded-full animate-[pulse_0.6s_ease-in-out_infinite] h-2" />
                  <span className="w-1 bg-rose-500 rounded-full animate-[pulse_0.4s_ease-in-out_infinite] h-4" />
                  <span className="w-1 bg-rose-500 rounded-full animate-[pulse_0.7s_ease-in-out_infinite] h-3" />
                  <span className="w-1 bg-rose-500 rounded-full animate-[pulse_0.5s_ease-in-out_infinite] h-5" />
                  <span className="w-1 bg-rose-500 rounded-full animate-[pulse_0.8s_ease-in-out_infinite] h-2" />
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={cancelRecording}
                  className="px-3 py-1.5 rounded-xl bg-white hover:bg-rose-100 text-rose-700 text-xs font-bold transition flex items-center gap-1 border border-rose-200 shadow-2xs"
                  title="إلغاء التسجيل"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>إلغاء</span>
                </button>

                <button
                  type="button"
                  onClick={stopAndSendRecording}
                  disabled={isUploadingMedia}
                  className="px-3.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition flex items-center gap-1.5 shadow-xs disabled:opacity-50"
                  title="إرسال التسجيل الصوتي"
                >
                  {isUploadingMedia ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Send className="w-3.5 h-3.5 rotate-180" />
                  )}
                  <span>{isUploadingMedia ? 'جاري الإرسال...' : 'إرسال الفويس'}</span>
                </button>
              </div>
            </div>
          ) : (
            <textarea
              value={draftText}
              onChange={(e) => setDraftText(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={
                stagedMedia
                  ? 'اكتب تعليقاً على المرفق (اختياري) ثم اضغط إرسال...'
                  : 'اكتب رسالتك هنا... (Enter للإرسال)'
              }
              rows={stagedMedia ? 1 : 2}
              className="w-full bg-transparent text-slate-900 text-xs focus:outline-none resize-none font-medium placeholder-slate-400 px-1"
            />
          )}

          {/* Controls Bar */}
          {!isRecording && !editingMessage && (
            <div className="flex items-center justify-between pt-1 border-t border-slate-100 relative">
              <div className="flex items-center gap-1 relative">
                {/* Paperclip Button & Popover */}
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setShowAttachmentMenu(!showAttachmentMenu)}
                    className={`p-1.5 rounded-full transition ${
                      showAttachmentMenu
                        ? 'bg-blue-100 text-[#1A73E8]'
                        : 'text-slate-400 hover:text-slate-700 hover:bg-slate-100'
                    }`}
                    title="إرفاق وسائط وملفات"
                  >
                    <Paperclip className="w-4 h-4" />
                  </button>

                  {/* Categorized Attachment Menu Popover */}
                  {showAttachmentMenu && (
                    <div className="absolute bottom-full right-0 mb-2 w-52 bg-white/95 backdrop-blur-xl rounded-2xl shadow-xl border border-white/80 p-1.5 z-50 space-y-0.5 animate-in fade-in zoom-in-95 duration-100">
                      <button
                        type="button"
                        onClick={() => {
                          imageInputRef.current?.click();
                          setShowAttachmentMenu(false);
                        }}
                        className="w-full text-right px-3 py-2 rounded-xl text-xs font-semibold text-slate-700 hover:bg-emerald-50 hover:text-emerald-800 flex items-center gap-2.5 transition"
                      >
                        <ImageIcon className="w-4 h-4 text-emerald-600" />
                        <span>إرفاق صورة (Image)</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          videoInputRef.current?.click();
                          setShowAttachmentMenu(false);
                        }}
                        className="w-full text-right px-3 py-2 rounded-xl text-xs font-semibold text-slate-700 hover:bg-indigo-50 hover:text-indigo-800 flex items-center gap-2.5 transition"
                      >
                        <Video className="w-4 h-4 text-indigo-600" />
                        <span>إرفاق فيديو (Video)</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          docInputRef.current?.click();
                          setShowAttachmentMenu(false);
                        }}
                        className="w-full text-right px-3 py-2 rounded-xl text-xs font-semibold text-slate-700 hover:bg-blue-50 hover:text-[#1A73E8] flex items-center gap-2.5 transition"
                      >
                        <FileText className="w-4 h-4 text-[#1A73E8]" />
                        <span>إرفاق ملف / مستند (PDF, Word)</span>
                      </button>
                    </div>
                  )}
                </div>

                {/* Microphone / Voice Note Trigger */}
                <button
                  type="button"
                  onClick={startRecording}
                  className="p-1.5 rounded-full text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition"
                  title="تسجيل رسالة صوتية (Voice Note)"
                >
                  <Mic className="w-4 h-4" />
                </button>

                {/* Canned Responses Trigger */}
                <button
                  type="button"
                  onClick={() => setShowCannedPicker(!showCannedPicker)}
                  className="p-1.5 rounded-full text-slate-400 hover:text-[#1A73E8] hover:bg-blue-50 transition"
                  title="ردود جاهزة"
                >
                  <Zap className="w-4 h-4" />
                </button>
              </div>

              {/* Send Button */}
             المزيد  <button
                type="button"
                onClick={handleSend}
                disabled={!draftText.trim() && !stagedMedia}
                className={`px-3 py-2 rounded-xl font-bold text-xs transition flex items-center gap-1.5 ${
                  draftText.trim() || stagedMedia
                    ? 'bg-[#1A73E8] hover:bg-[#1557B0] text-white shadow-xs active:scale-95 cursor-pointer'
                    : 'bg-slate-100 text-slate-400 cursor-not-allowed'
                }`}
                title="إرسال"
              >
                <span>إرسال</span>
                <Send className="w-3.5 h-3.5 rotate-180" />
              </button>
            </div>
          )}
        </div>
      </footer>

      {/* Forward Message Modal */}
      <ForwardMessageModal
        isOpen={isForwardModalOpen}
        message={forwardingMessage}
        onClose={() => setIsForwardModalOpen(false, null)}
      />
    </main>
  );
};
