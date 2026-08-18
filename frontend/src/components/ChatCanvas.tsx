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
  ShieldCheck,
  ShieldAlert,
  Mic,
  User,
  AlertCircle,
  Plus,
} from 'lucide-react';
import { useCrmStore } from '../store/useCrmStore';
import { Message, MetaMessageTag, Attachment } from '../types/crm';
import { UserAvatar } from './UserAvatar';

// Custom Inline Audio Player Component (Material 3 SaaS Light)
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
    <div className="flex items-center gap-2.5 bg-slate-50 p-2.5 rounded-xl border border-slate-200 my-1">
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
        className="w-8 h-8 rounded-full bg-teal-600 text-white flex items-center justify-center hover:bg-teal-700 transition shrink-0 shadow-xs"
      >
        {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 ml-0.5" />}
      </button>

      <div className="flex-1 space-y-1">
        <div className="h-1.5 bg-slate-200 rounded-full overflow-hidden">
          <div
            className="h-full bg-teal-600 transition-all duration-100"
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

const resolveMedia = (msg: any): ResolvedMedia => {
  let url: string | null = null;
  let mime = '';
  let type = '';
  let fileName = '';

  if (msg.attachments && msg.attachments.length > 0) {
    const first = msg.attachments[0];
    url = first.url || first.file_url;
    mime = first.mime_type || '';
    type = first.type || first.file_type || '';
    fileName = first.filename || first.title || '';
  }

  if (!url && msg.media_url) {
    url = msg.media_url;
    type = msg.media_type || '';
  }
  if (!url && (msg.metadata_?.attachments?.[0]?.url || msg.metadata?.attachments?.[0]?.url)) {
    const att = msg.metadata_?.attachments?.[0] || msg.metadata?.attachments?.[0];
    url = att.url;
    mime = att.mime_type || '';
    type = att.type || '';
    fileName = att.filename || att.title || '';
  }

  const textVal = (msg.text || '').trim();
  if (!url && (textVal.startsWith('voice_') || textVal.startsWith('img_') || textVal.startsWith('vid_') || textVal.startsWith('image-') || textVal.startsWith('/uploads/') || /\.(ogg|mp4|m4a|webm|mp3|wav|jpg|jpeg|png|webp|gif)$/i.test(textVal))) {
    url = textVal.startsWith('/uploads/') ? textVal : `/uploads/${textVal.replace(/^\(+|\)+$/g, '')}`;
    fileName = textVal;
  }

  if (!url) {
    return { isAudio: false, isImage: false, isVideo: false, isDoc: false, url: null, fileName: '' };
  }

  const lower = url.toLowerCase();
  const isImage =
    type === 'image' ||
    mime.startsWith('image/') ||
    lower.includes('image-') ||
    lower.includes('img_') ||
    lower.includes('img-') ||
    /\.(jpg|jpeg|png|webp|gif|svg)$/i.test(lower);

  const isVideo =
    type === 'video' ||
    mime.startsWith('video/') ||
    lower.includes('vid_') ||
    (/\.mp4$/i.test(lower) && mime.includes('video'));

  const isAudio =
    !isImage &&
    !isVideo &&
    (type === 'audio' ||
      mime.startsWith('audio/') ||
      lower.includes('voice') ||
      lower.includes('audio') ||
      /\.(ogg|m4a|mp3|webm|wav|aac|mp4)$/i.test(lower));

  const isDoc = !isImage && !isAudio && !isVideo;

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

export const ChatCanvas: React.FC = () => {
  const {
    conversations,
    activeConversationId,
    messages,
    sendMessage,
    retryMessage,
    deleteMessage,
    uploadAndSendMedia,
    isTyping,
    setConversationStatus,
    assignAgentToConversation,
    setConversationPriority,
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
  const [isDragging, setIsDragging] = useState(false);

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

  // 24-Hour Policy Window calculation
  const lastCustomerMsgAt = activeConv?.last_customer_message_at
    ? new Date(activeConv.last_customer_message_at).getTime()
    : Date.now();
  const is24hWindowExpired = Date.now() - lastCustomerMsgAt > 24 * 3600 * 1000;

  // Auto-scroll to bottom on new message
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [activeMessages.length, isCustomerTyping]);

  // Recording Timer Effect
  useEffect(() => {
    if (isRecording) {
      recordingTimerRef.current = setInterval(() => {
        setRecordingSeconds((prev) => prev + 1);
      }, 1000);
    } else {
      clearInterval(recordingTimerRef.current);
      setRecordingSeconds(0);
    }
    return () => clearInterval(recordingTimerRef.current);
  }, [isRecording]);

  const getSupportedMimeType = () => {
    if (typeof MediaRecorder === 'undefined') return '';
    if (MediaRecorder.isTypeSupported('audio/webm;codecs=opus')) return 'audio/webm;codecs=opus';
    if (MediaRecorder.isTypeSupported('audio/webm')) return 'audio/webm';
    if (MediaRecorder.isTypeSupported('audio/mp4')) return 'audio/mp4';
    if (MediaRecorder.isTypeSupported('audio/ogg')) return 'audio/ogg';
    return '';
  };

  // Voice Recording Handlers
  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      audioChunksRef.current = [];
      const mimeType = getSupportedMimeType();
      const mediaRecorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      mediaRecorderRef.current = mediaRecorder;

      mediaRecorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) audioChunksRef.current.push(e.data);
      };

      mediaRecorder.start(100);
      setIsRecording(true);
    } catch (e) {
      console.error('Failed to access microphone for recording:', e);
      alert('تعذر الوصول إلى الميكروفون للتسجيل الصوتى');
    }
  };

  const stopAndSendRecording = () => {
    if (!mediaRecorderRef.current || !isRecording) return;

    mediaRecorderRef.current.onstop = () => {
      const mimeType = getSupportedMimeType() || 'audio/webm';
      const audioBlob = new Blob(audioChunksRef.current, { type: mimeType });
      console.log('[VoiceRecorder] Captured blob size:', audioBlob.size, 'type:', audioBlob.type);

      if (audioBlob.size < 500) {
        console.warn('[VoiceRecorder] Captured blob size too small, skipping upload.');
        setIsRecording(false);
        return;
      }

      const ext = mimeType.includes('mp4') ? 'mp4' : (mimeType.includes('ogg') ? 'ogg' : 'webm');
      const audioFile = new File([audioBlob], `voice_note_${Date.now()}.${ext}`, {
        type: mimeType,
      });
      uploadAndSendMedia(audioFile);
      setIsRecording(false);
    };

    mediaRecorderRef.current.stop();
    mediaRecorderRef.current.stream.getTracks().forEach((track) => track.stop());
  };

  const cancelRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      mediaRecorderRef.current.stream.getTracks().forEach((track) => track.stop());
    }
    setIsRecording(false);
    audioChunksRef.current = [];
  };

  const handleScroll = () => {
    if (!scrollContainerRef.current || isFetchingMore) return;
    if (scrollContainerRef.current.scrollTop === 0) {
      loadMoreMessages();
    }
  };

  const handleSend = () => {
    if (!draftText.trim() || !activeConversationId) return;
    sendMessage(draftText);
    setDraftText('');
    setShowCannedPicker(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      uploadAndSendMedia(file);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) {
      uploadAndSendMedia(file);
    }
  };

  const formatMessageTime = (isoStr: string) => {
    if (!isoStr) return '';
    return new Date(isoStr).toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' });
  };

  const formatSeconds = (sec: number) => {
    const m = Math.floor(sec / 60).toString().padStart(2, '0');
    const s = (sec % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  };

  if (!activeConv) {
    return (
      <main className="flex-1 bg-[#F8FAFC] flex flex-col items-center justify-center p-8 text-slate-400">
        <Sparkles className="w-12 h-12 text-slate-300 animate-pulse mb-3" />
        <h2 className="text-sm font-bold text-slate-600">حدد محادثة من القائمة للبدء</h2>
      </main>
    );
  }

  const customerName = activeConv.customer?.display_name || activeConv.customer_display_name || 'عميل جديد';
  const customerAvatarUrl = activeConv.customer_avatar_url || activeConv.customer?.avatar_url;
  const brandName = activeConv.brand_name || 'LUXIRA';

  return (
    <main
      onDragOver={(e) => {
        e.preventDefault();
        setIsDragging(true);
      }}
      onDragLeave={() => setIsDragging(false)}
      onDrop={handleDrop}
      className={`flex-1 bg-[#F8FAFC] flex flex-col h-full relative z-10 transition-colors ${
        isDragging ? 'bg-teal-50/60 border-2 border-dashed border-teal-500' : ''
      }`}
    >
      {/* Drag & Drop Overlay */}
      {isDragging && (
        <div className="absolute inset-0 bg-white/90 backdrop-blur-md z-50 flex flex-col items-center justify-center text-teal-800 font-bold space-y-2">
          <Paperclip className="w-10 h-10 text-teal-600 animate-bounce" />
          <p className="text-sm">إفلات الملف هنا لإرساله فوراً للمحادثة</p>
        </div>
      )}

      {/* Active Chat Header & Agent Assignment Controls */}
      <header className="h-16 bg-white/85 backdrop-blur-md border-b border-slate-200/80 px-5 flex items-center justify-between shrink-0 shadow-xs">
        <div className="flex items-center gap-3">
          <UserAvatar name={customerName} avatarUrl={customerAvatarUrl} size="md" />
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-xs font-bold text-slate-900">{customerName}</h2>
              <span className="text-[10px] bg-teal-50 text-teal-700 font-semibold px-2 py-0.5 rounded-full border border-teal-200/60">
                {brandName}
              </span>
            </div>

            {/* 24-Hour Policy Window Badge */}
            {!is24hWindowExpired ? (
              <p className="text-[11px] text-emerald-700 flex items-center gap-1 font-medium mt-0.5">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                نافذة المراسلة نشطة (24h)
              </p>
            ) : (
              <div className="flex items-center gap-1.5 mt-0.5">
                <span className="text-[10px] bg-amber-50 text-amber-700 font-semibold px-2 py-0.5 rounded-full border border-amber-200 flex items-center gap-1">
                  <ShieldAlert className="w-3 h-3 text-amber-600" />
                  انتهت نافذة الـ 24 ساعة
                </span>
                <select
                  value={selectedMetaTag}
                  onChange={(e) => setSelectedMetaTag(e.target.value as MetaMessageTag)}
                  className="bg-slate-100 text-[10px] text-slate-800 rounded-lg px-2 py-0.5 border border-slate-200 focus:outline-none"
                >
                  {META_TAGS.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.label}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>
        </div>

        {/* Conversation Assignment & Status Controls */}
        <div className="flex items-center gap-2">
          {/* Agent Assignment */}
          <div className="flex items-center gap-1 bg-slate-100/80 px-2.5 py-1 rounded-xl border border-slate-200/60">
            <User className="w-3.5 h-3.5 text-indigo-600" />
            <select
              value={activeConv.assigned_agent_id || ''}
              onChange={(e) => assignAgentToConversation(activeConv.id, e.target.value || null)}
              className="bg-transparent text-xs text-slate-700 font-medium focus:outline-none"
            >
              {AGENTS.map((a) => (
                <option key={a.id} value={a.id} className="bg-white text-slate-800">
                  {a.name}
                </option>
              ))}
            </select>
          </div>

          {/* Priority Selector */}
          <div className="flex items-center gap-1 bg-slate-100/80 px-2.5 py-1 rounded-xl border border-slate-200/60">
            <AlertCircle className="w-3.5 h-3.5 text-amber-600" />
            <select
              value={activeConv.priority || 'normal'}
              onChange={(e) =>
                setConversationPriority(activeConv.id, e.target.value as any)
              }
              className="bg-transparent text-xs text-slate-700 font-medium focus:outline-none"
            >
              <option value="low" className="bg-white">منخفضة</option>
              <option value="normal" className="bg-white">عادية</option>
              <option value="high" className="bg-white">عالية</option>
              <option value="urgent" className="bg-white">عاجلة</option>
            </select>
          </div>

          <button
            onClick={() => setConversationStatus(activeConv.id, 'completed')}
            className="px-3 py-1.5 text-xs font-bold bg-teal-50 text-teal-700 rounded-xl hover:bg-teal-100 transition border border-teal-200 flex items-center gap-1"
          >
            <UserCheck className="w-3.5 h-3.5" />
            إكمال الطلب
          </button>
        </div>
      </header>

      {/* Message Stream */}
      <div
        ref={scrollContainerRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto p-6 space-y-4 bg-gradient-to-b from-[#F8FAFC] to-[#F1F5F9]"
      >
        {isFetchingMore && (
          <div className="text-center py-2 text-xs text-teal-700 animate-pulse font-medium">
            جاري تحميل الرسائل الأقدم...
          </div>
        )}

        {isLoadingMessages ? (
          <div className="text-center text-xs text-slate-400 py-10 animate-pulse">
            جاري تحميل الرسائل...
          </div>
        ) : (
          [...activeMessages]
            .sort((a, b) => new Date(a.created_at || 0).getTime() - new Date(b.created_at || 0).getTime())
            .map((msg) => {
            const isAgent = msg.sender_type === 'agent';
            const isPending = msg.delivery_status === 'pending';
            const isFailed = msg.delivery_status === 'failed';

            const media = resolveMedia(msg);

            return (
              <div
                key={msg.id}
                className={`flex flex-col ${isAgent ? 'items-start' : 'items-end'}`}
              >
                <div
                  className={`max-w-lg px-4 py-3 rounded-2xl text-xs font-medium leading-relaxed shadow-xs ${
                    isFailed
                      ? 'bg-rose-50 text-rose-800 border border-rose-200 rounded-br-xs'
                      : isAgent
                      ? 'bg-teal-600 text-white rounded-2xl rounded-tl-xs shadow-xs'
                      : 'bg-white text-slate-800 border border-slate-200/80 rounded-2xl rounded-tr-xs shadow-xs'
                  }`}
                >
                  {/* Native Audio Waveform Player */}
                  {media.isAudio && media.url && (
                    <CustomAudioPlayer url={media.url} />
                  )}

                  {/* HTML5 Video Player */}
                  {media.isVideo && media.url && (
                    <div className="relative overflow-hidden rounded-2xl max-w-sm mt-1 mb-1">
                      <video
                        controls
                        src={media.url}
                        className="w-full max-h-72 object-cover rounded-2xl border border-slate-200/80 shadow-xs"
                      />
                    </div>
                  )}

                  {/* Inline Image Preview */}
                  {media.isImage && media.url && (
                    <div className="relative group cursor-pointer overflow-hidden rounded-2xl max-w-sm mt-1 mb-1">
                      <img
                        src={media.url}
                        alt="مرفق صورة"
                        className="w-full max-h-72 object-cover rounded-2xl transition-transform duration-200 group-hover:scale-[1.02] border border-slate-200/80 shadow-xs"
                        onClick={() => setPreviewImage(media.url)}
                        onError={(e) => {
                          if (media.url && !media.url.endsWith('.jpg')) {
                            (e.target as HTMLImageElement).src = `${media.url}.jpg`;
                          }
                        }}
                      />
                    </div>
                  )}

                  {/* Document Download Card for non-audio, non-image files */}
                  {media.isDoc && media.url && (
                    <div className="flex items-center justify-between gap-3 bg-slate-50 p-2.5 rounded-xl border border-slate-200 text-slate-800 my-1">
                      <div className="flex items-center gap-2">
                        <FileText className="w-5 h-5 text-teal-600" />
                        <span className="text-xs font-semibold truncate max-w-[150px]">
                          {media.fileName}
                        </span>
                      </div>
                      <a
                        href={media.url}
                        target="_blank"
                        rel="noreferrer"
                        className="p-1.5 rounded-lg bg-teal-600 text-white hover:bg-teal-700"
                      >
                        <Download className="w-3.5 h-3.5" />
                      </a>
                    </div>
                  )}

                  {/* Text Message Content */}
                  {msg.text && msg.text !== 'مرفق وسائط' && !msg.text.startsWith('image-') && !msg.text.startsWith('/uploads/') && (
                    <p className="whitespace-pre-wrap">{msg.text}</p>
                  )}
                  {(!msg.text || msg.text === 'مرفق وسائط') && !media.url && (
                    <div className="flex items-center gap-2 py-1 text-xs">
                      <Mic className="w-4 h-4 text-teal-200 animate-pulse" />
                      <span>ملاحظة صوتية...</span>
                    </div>
                  )}

                  <div
                    className={`flex items-center gap-1 mt-1.5 text-[10px] ${
                      isAgent ? 'text-teal-100 justify-start' : 'text-slate-400 justify-end'
                    }`}
                  >
                    <span>{formatMessageTime(msg.created_at)}</span>
                    {isPending && <Clock className="w-3 h-3 text-amber-300 animate-spin" />}
                    {isFailed && <AlertTriangle className="w-3.5 h-3.5 text-rose-500" />}
                    {isAgent && !isPending && !isFailed && (
                      <CheckCheck className="w-3.5 h-3.5 text-teal-200" />
                    )}
                  </div>
                </div>

                {isFailed && (
                  <div className="flex items-center gap-2 mt-1 px-1">
                    <span className="text-[10px] text-rose-600 font-bold">
                      {typeof msg.error_message === 'string'
                        ? msg.error_message
                        : (typeof (msg as any).error === 'string'
                            ? (msg as any).error
                            : ((msg as any).error?.message || (msg as any).error?.detail || 'فشلت عملية الإرسال'))}
                    </span>
                    <button
                      onClick={() => retryMessage(msg.id)}
                      className="flex items-center gap-1 text-[10px] bg-teal-50 text-teal-700 hover:bg-teal-100 px-2 py-0.5 rounded border border-teal-200 font-bold"
                    >
                      <RotateCcw className="w-3 h-3" />
                      إعادة المحاولة
                    </button>
                    <button
                      onClick={() => deleteMessage(msg.id)}
                      className="flex items-center gap-1 text-[10px] bg-rose-50 text-rose-700 hover:bg-rose-100 px-2 py-0.5 rounded border border-rose-200 font-bold"
                    >
                      <Trash2 className="w-3 h-3" />
                      حذف
                    </button>
                  </div>
                )}
              </div>
            );
          })
        )}

        {isCustomerTyping && (
          <div className="flex items-end gap-2 justify-end">
            <div className="bg-white border border-slate-200 px-4 py-2.5 rounded-2xl rounded-bl-xs text-xs text-slate-500 flex items-center gap-1.5 shadow-xs">
              <span className="w-1.5 h-1.5 bg-teal-600 rounded-full animate-bounce" />
              <span className="w-1.5 h-1.5 bg-teal-600 rounded-full animate-bounce [animation-delay:0.2s]" />
              <span className="w-1.5 h-1.5 bg-teal-600 rounded-full animate-bounce [animation-delay:0.4s]" />
              <span className="text-[11px] mr-1 font-medium">يكتب الآن...</span>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Image Lightbox Preview Modal */}
      {previewImage && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-md z-50 flex items-center justify-center p-4">
          <div className="relative max-w-5xl max-h-[90vh] flex flex-col items-center">
            <div className="absolute top-4 right-4 flex items-center gap-2 z-10">
              <a
                href={previewImage}
                download
                target="_blank"
                rel="noreferrer"
                className="p-2 rounded-full bg-white/90 text-slate-800 hover:bg-white shadow-md transition"
                title="تحميل الصورة"
              >
                <Download className="w-5 h-5" />
              </a>
              <button
                onClick={() => setPreviewImage(null)}
                className="p-2 rounded-full bg-white/90 text-slate-800 hover:bg-white shadow-md transition"
                title="إغلاق"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <img
              src={previewImage}
              alt="Large preview"
              className="max-w-full max-h-[85vh] rounded-2xl object-contain shadow-2xl border border-white/10"
            />
          </div>
        </div>
      )}

      {/* Hidden File Input */}
      <input
        ref={fileInputRef}
        type="file"
        onChange={handleFileUpload}
        className="hidden"
        accept="image/*,audio/*,video/*,application/pdf,.doc,.docx"
      />

      {/* Input Bar & Live Audio Recording UI */}
      <footer className="p-4 bg-transparent relative z-20 flex justify-center">
        {/* Canned Responses Popup */}
        {showCannedPicker && (
          <div className="absolute bottom-16 right-6 bg-white/95 backdrop-blur-md border border-slate-200 rounded-2xl p-2 shadow-xl z-30 w-80 space-y-1">
            <div className="text-[11px] font-bold text-teal-800 px-2 py-1 flex items-center gap-1 border-b border-slate-100">
              <Zap className="w-3.5 h-3.5 text-teal-600" />
              الردود السريعة الجاهزة:
            </div>
            {CANNED_RESPONSES.map((resp, i) => (
              <button
                key={i}
                onClick={() => {
                  setDraftText(resp);
                  setShowCannedPicker(false);
                }}
                className="w-full text-right text-xs text-slate-700 hover:bg-teal-50 hover:text-teal-900 p-2 rounded-xl transition font-medium"
              >
                {resp}
              </button>
            ))}
          </div>
        )}

        {/* Live Audio Recorder Dock Bar */}
        {isRecording ? (
          <div className="w-full max-w-3xl flex items-center justify-between gap-4 bg-rose-50 border border-rose-200 p-3 rounded-full shadow-md animate-pulse">
            <div className="flex items-center gap-3 pr-2">
              <div className="w-3 h-3 bg-rose-600 rounded-full animate-ping" />
              <span className="text-xs font-bold text-rose-800">
                جاري تسجيل الملاحظة الصوتية: {formatSeconds(recordingSeconds)}
              </span>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={cancelRecording}
                className="p-2 rounded-full bg-white text-rose-600 hover:bg-rose-100 transition shadow-xs"
                title="إلغاء التسجيل"
              >
                <Trash2 className="w-4 h-4" />
              </button>

              <button
                type="button"
                onClick={stopAndSendRecording}
                className="p-2 px-4 rounded-full bg-teal-600 text-white hover:bg-teal-700 transition font-bold text-xs flex items-center gap-1 shadow-xs"
              >
                <Send className="w-4 h-4 rotate-180" />
                إرسال التسجيل
              </button>
            </div>
          </div>
        ) : (
          /* Modern Floating Pill Dock Input Bar */
          <div className="w-full max-w-3xl bg-white/90 backdrop-blur-lg border border-slate-200 rounded-full px-4 py-2 shadow-sm flex items-center gap-3">
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="p-2 rounded-full text-slate-500 hover:text-teal-700 hover:bg-slate-100 transition"
                title="إرفاق ملف أو صورة"
              >
                <Plus className="w-4 h-4" />
              </button>

              {/* Live Voice Recorder Mic Trigger */}
              <button
                type="button"
                onClick={startRecording}
                className="p-2 rounded-full text-slate-500 hover:text-rose-600 hover:bg-rose-50 transition"
                title="تسجيل ملاحظة صوتية مباشرة"
              >
                <Mic className="w-4 h-4" />
              </button>

              <button
                type="button"
                onClick={() => setShowCannedPicker(!showCannedPicker)}
                className="p-2 rounded-full text-slate-500 hover:text-teal-700 hover:bg-slate-100 transition"
                title="ردود سريعة"
              >
                <Zap className="w-4 h-4" />
              </button>
            </div>

            {/* Input Textarea */}
            <textarea
              value={draftText}
              onChange={(e) => setDraftText(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="اكتب ردك هنا... (Enter للإرسال)"
              rows={1}
              className="flex-1 bg-transparent text-slate-900 text-xs px-2 py-1.5 focus:outline-none resize-none font-medium placeholder-slate-400"
            />

            {/* Send Button */}
            <button
              onClick={handleSend}
              disabled={!draftText.trim()}
              className={`p-2.5 rounded-full font-bold flex items-center justify-center transition shadow-xs ${
                draftText.trim()
                  ? 'bg-teal-600 text-white hover:bg-teal-700 active:scale-95'
                  : 'bg-slate-200 text-slate-400 cursor-not-allowed'
              }`}
            >
              <Send className="w-4 h-4 rotate-180" />
            </button>
          </div>
        )}
      </footer>
    </main>
  );
};
