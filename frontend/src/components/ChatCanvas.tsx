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
} from 'lucide-react';
import { useCrmStore } from '../store/useCrmStore';
import { MetaMessageTag } from '../types/crm';
import { UserAvatar } from './UserAvatar';
import { formatChatDateDivider, isDifferentDay } from '../lib/dateUtils';
import { aiApi } from '../services/api';
import { useCustomerPresence } from '../hooks/useCustomerPresence';

// Custom Inline Audio Player Component
const CustomAudioPlayer: React.FC<{ url: string }> = ({ url }) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const togglePlay = () => {
    if (!audioRef.current) return;
    if (isPlaying) {
      audioRef.current.pause();
    } else {
      audioRef.current.play();
    }
    setIsPlaying(!isPlaying);
  };

  const handleTimeUpdate = () => {
    if (!audioRef.current) return;
    const current = audioRef.current.currentTime;
    const duration = audioRef.current.duration || 1;
    setProgress((current / duration) * 100);
  };

  return (
    <div className="flex items-center gap-2.5 bg-slate-100/80 p-2 rounded-xl border border-slate-200 my-1">
      <audio
        ref={audioRef}
        src={url}
        onTimeUpdate={handleTimeUpdate}
        onEnded={() => setIsPlaying(false)}
        className="hidden"
      />
      <button
        type="button"
        onClick={togglePlay}
        className="w-7 h-7 rounded-full bg-emerald-600 text-white flex items-center justify-center hover:bg-emerald-700 transition shrink-0 shadow-2xs"
      >
        {isPlaying ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5 ml-0.5" />}
      </button>

      <div className="flex-1 space-y-1">
        <div className="h-1.5 bg-slate-200 rounded-full overflow-hidden">
          <div
            className="h-full bg-emerald-600 transition-all duration-100"
            style={{ width: `${progress}%` }}
          />
        </div>
        <span className="text-[10px] text-slate-500 font-medium">ملاحظة صوتية</span>
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
      lower.includes('voice') ||
      lower.includes('audio') ||
      /\.(ogg|m4a|mp3|webm|wav|aac)/i.test(lower));

  const isVideo =
    !isSocial &&
    !isAudio &&
    (msgType === 'video' ||
      type === 'video' ||
      mime.startsWith('video/') ||
      lower.includes('vid_') ||
      /\.(mp4|mov|avi|mkv)/i.test(lower));

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
  } = useCrmStore();

  const [showCannedPicker, setShowCannedPicker] = useState(false);
  const [previewImage, setPreviewImage] = useState<string | null>(null);

  // Live Voice Recording State
  const [isRecording, setIsRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const recordingTimerRef = useRef<any>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const activeConv = conversations.find((c) => c.id === activeConversationId);
  const activeMessages = activeConversationId ? messages[activeConversationId] || [] : [];
  const isCustomerTyping = activeConversationId ? isTyping[activeConversationId] : false;
  const presence = useCustomerPresence(
    activeConv?.last_activity_at || activeConv?.customer?.last_activity_at || activeConv?.last_customer_message_at || activeConv?.last_message_at,
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
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioChunksRef.current = [];
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          audioChunksRef.current.push(e.data);
        }
      };

      mediaRecorder.start();
      setIsRecording(true);
      setRecordingSeconds(0);

      recordingTimerRef.current = setInterval(() => {
        setRecordingSeconds((prev) => prev + 1);
      }, 1000);
    } catch (err) {
      alert('تعذر الوصول إلى الميكروفون. يرجى تفعيل إذن الصوت بالمتصفح.');
    }
  };

  const stopAndSendRecording = () => {
    if (!mediaRecorderRef.current || !activeConversationId) return;

    clearInterval(recordingTimerRef.current);
    const mediaRecorder = mediaRecorderRef.current;

    mediaRecorder.onstop = async () => {
      const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/ogg; codecs=opus' });
      const audioFile = new File([audioBlob], `voice_${Date.now()}.ogg`, { type: 'audio/ogg' });

      try {
        await uploadAndSendMedia(audioFile);
      } catch (err) {
        alert('فشل إرسال التسجيل الصوتي.');
      } finally {
        setIsRecording(false);
        setRecordingSeconds(0);
        mediaRecorder.stream.getTracks().forEach((track) => track.stop());
      }
    };

    mediaRecorder.stop();
  };

  const cancelRecording = () => {
    if (mediaRecorderRef.current) {
      clearInterval(recordingTimerRef.current);
      mediaRecorderRef.current.stop();
      mediaRecorderRef.current.stream.getTracks().forEach((track) => track.stop());
    }
    setIsRecording(false);
    setRecordingSeconds(0);
  };

  const handleSend = () => {
    if (!activeConversationId || !draftText.trim()) return;
    sendMessage(draftText.trim());
    setDraftText('');
    setShowCannedPicker(false);
    setTimeout(() => scrollToBottom('auto'), 50);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !activeConversationId) return;
    try {
      await uploadAndSendMedia(file);
      if (fileInputRef.current) fileInputRef.current.value = '';
    } catch (err) {
      alert('فشل رفع الملف/الصورة.');
    }
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
                  msg.media_url
              );

              if (!hasContent) return null;

              const isAgent = msg.sender_type === 'agent';
              const isPending = msg.delivery_status === 'pending';
              const isFailed = msg.delivery_status === 'failed';
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

                  <div className={`flex flex-col ${isAgent ? 'items-start' : 'items-end'}`}>
                    <div
                      className={`max-w-md px-4 py-2.5 rounded-2xl text-xs leading-relaxed shadow-2xs ${
                        isFailed
                          ? 'bg-rose-50 text-rose-800 border border-rose-200 rounded-br-none font-medium'
                          : isAgent
                          ? 'bg-[#E6F4EA] text-[#137333] border border-emerald-100/60 rounded-2xl rounded-tl-none font-normal'
                          : 'bg-white text-[#1E293B] border border-slate-100 rounded-2xl rounded-tr-none font-normal'
                      }`}
                    >
                      {/* Sender Tag for Agent Messages */}
                      {isAgent && (
                        <span className="text-[10px] text-[#137333] font-bold block mb-1">
                          موظف الدعم
                        </span>
                      )}

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

                      {/* Timestamp & Double Checkmarks (✓✓) */}
                      <div
                        className={`flex items-center gap-1 mt-1 text-[10px] ${
                          isAgent ? 'text-[#137333]/80 justify-start' : 'text-slate-400 justify-end'
                        }`}
                      >
                        <span>{formatMessageTime(msg.created_at)}</span>
                        {isPending && <Clock className="w-3 h-3 text-amber-500 animate-spin" />}
                        {isFailed && <AlertTriangle className="w-3.5 h-3.5 text-rose-500" />}
                        {isAgent && !isPending && !isFailed && (
                          <span className="text-[#137333] font-bold text-[11px]" title="تم التوصيل">
                            ✓✓
                          </span>
                        )}
                      </div>
                    </div>
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
        {/* Rounded All-in-One Floating Dock Composer Box */}
        <div className="border border-slate-200/80 focus-within:border-[#1A73E8] focus-within:ring-2 focus-within:ring-[#1A73E8]/20 bg-white/95 backdrop-blur-md rounded-2xl p-2.5 transition shadow-[0_10px_30px_-4px_rgba(0,0,0,0.06)] space-y-1.5">
          <textarea
            value={draftText}
            onChange={(e) => setDraftText(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="اكتب رسالتك هنا... (Enter للإرسال)"
            rows={2}
            className="w-full bg-transparent text-slate-900 text-xs focus:outline-none resize-none font-medium placeholder-slate-400 px-1"
          />

          {/* Controls Bar */}
          <div className="flex items-center justify-between pt-1 border-t border-slate-100">
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="p-1.5 rounded-full text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition"
                title="إرفاق ملف"
              >
                <Paperclip className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={startRecording}
                className="p-1.5 rounded-full text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition"
                title="تسجيل صوتي"
              >
                <Mic className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => setShowCannedPicker(!showCannedPicker)}
                className="p-1.5 rounded-full text-slate-400 hover:text-[#1A73E8] hover:bg-blue-50 transition"
                title="ردود جاهزة"
              >
                <Zap className="w-4 h-4" />
              </button>
            </div>

            <button
              onClick={handleSend}
              disabled={!draftText.trim()}
              className={`p-2.5 rounded-full font-bold transition flex items-center justify-center ${
                draftText.trim()
                  ? 'bg-[#1A73E8] hover:bg-[#1557B0] text-white shadow-sm active:scale-95'
                  : 'bg-slate-100 text-slate-400 cursor-not-allowed'
              }`}
              title="إرسال"
            >
              <Send className="w-4 h-4 rotate-180" />
            </button>
          </div>
        </div>
      </footer>
    </main>
  );
};
