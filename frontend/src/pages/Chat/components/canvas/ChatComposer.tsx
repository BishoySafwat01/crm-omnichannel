import React, { useState, useEffect, useRef } from 'react';
import {
  Send,
  Zap,
  Paperclip,
  FileText,
  Trash2,
  X,
  Mic,
  AlertCircle,
  Image as ImageIcon,
  Video,
  Loader2,
  CornerUpLeft,
  Edit2,
  Check,
  Ban,
} from 'lucide-react';
import { useCrmStore } from '../../../../store/useCrmStore';
import { Conversation, Message } from '../../../../types/crm';
import { CANNED_RESPONSES } from '../../constants/chatConstants';

export interface StagedMediaItem {
  file: File;
  previewUrl?: string;
  type: 'image' | 'video' | 'audio' | 'doc';
  name: string;
  size: number;
}

export interface ChatComposerProps {
  activeConv: Conversation;
  onOpenBlockModal: (mode: 'block' | 'unblock') => void;
  scrollToBottom: (behavior?: ScrollBehavior) => void;
}

export const ChatComposer: React.FC<ChatComposerProps> = ({
  activeConv,
  onOpenBlockModal,
  scrollToBottom,
}) => {
  const {
    draftText,
    setDraftText,
    sendMessage,
    uploadAndSendMedia,
    replyingToMessage,
    setReplyingToMessage,
    editingMessage,
    setEditingMessage,
    editMessage,
  } = useCrmStore();

  const [showCannedPicker, setShowCannedPicker] = useState(false);
  const [showAttachmentMenu, setShowAttachmentMenu] = useState(false);
  const [editInputText, setEditInputText] = useState('');
  const [isSubmittingEdit, setIsSubmittingEdit] = useState(false);

  // Isolated Local State for Composer Keystroke Performance (Zero Typing Lag)
  const [localDraftText, setLocalDraftText] = useState('');

  // Staged Media / Attachment State
  const [stagedMedia, setStagedMedia] = useState<StagedMediaItem | null>(null);
  const [isUploadingMedia, setIsUploadingMedia] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  // Live Voice Recording State
  const [isRecording, setIsRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const recordingTimerRef = useRef<any>(null);

  // Textarea Refs for auto-focus restoration
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const editTextareaRef = useRef<HTMLTextAreaElement>(null);

  // File Inputs Refs
  const imageInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);
  const docInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // DEF-AI-02 Reactive Bridge: Sync external draftText (Smart Replies, Canned Responses) into localDraftText
  useEffect(() => {
    if (draftText && draftText.trim() !== '') {
      setLocalDraftText(draftText);
      setDraftText('');
      textareaRef.current?.focus();
    }
  }, [draftText, setDraftText]);

  useEffect(() => {
    if (editingMessage) {
      setLocalDraftText(editingMessage.text || '');
      setEditInputText(editingMessage.text || '');
      setTimeout(() => editTextareaRef.current?.focus(), 0);
    } else {
      setEditInputText('');
      setTimeout(() => textareaRef.current?.focus(), 0);
    }
  }, [editingMessage]);

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
    if (!mediaRecorderRef.current || !activeConv?.id) return;

    clearInterval(recordingTimerRef.current);
    const mediaRecorder = mediaRecorderRef.current;

    mediaRecorder.onstop = async () => {
      mediaRecorder.stream.getTracks().forEach((track) => track.stop());

      if (!audioChunksRef.current || audioChunksRef.current.length === 0) {
        alert('لم يتم التقاط أي صوت. يرجى التحدث في الميكروفون وإعادة المحاولة.');
        setIsRecording(false);
        setRecordingSeconds(0);
        return;
      }

      const rawMime = mediaRecorder.mimeType || 'audio/webm';
      const cleanMime = rawMime.split(';')[0].trim() || 'audio/webm';
      const ext = cleanMime.includes('ogg')
        ? '.ogg'
        : cleanMime.includes('mp4')
        ? '.m4a'
        : cleanMime.includes('wav')
        ? '.wav'
        : '.webm';
      const audioBlob = new Blob(audioChunksRef.current, { type: rawMime || cleanMime });
      const audioFile = new File([audioBlob], `voice_${Date.now()}${ext}`, { type: cleanMime });

      setIsRecording(false);
      setRecordingSeconds(0);
      setTimeout(() => scrollToBottom('auto'), 50);

      setIsUploadingMedia(true);
      uploadAndSendMedia(audioFile)
        .catch((err) => {
          console.error('Failed to send voice note:', err);
        })
        .finally(() => {
          setIsUploadingMedia(false);
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
    const isVoice =
      fileNameLower.startsWith('voice_') ||
      file.type.startsWith('audio/') ||
      ['ogg', 'opus', 'mp3', 'm4a', 'wav', 'aac'].some((ext) => fileNameLower.endsWith(ext));
    const isVideo =
      !isVoice &&
      (file.type.startsWith('video/') ||
        ['mp4', 'mov', 'avi', 'mkv', 'ogv'].some((ext) => fileNameLower.endsWith(ext)) ||
        (fileNameLower.endsWith('.webm') && !fileNameLower.includes('voice')));
    const isImage =
      !isVoice &&
      !isVideo &&
      (file.type.startsWith('image/') ||
        ['png', 'jpg', 'jpeg', 'webp', 'gif', 'svg'].some((ext) => fileNameLower.endsWith(ext)));
    const isAudio = isVoice || (!isVideo && !isImage && file.type.startsWith('audio/'));
    const mediaType: 'image' | 'video' | 'audio' | 'doc' = isAudio
      ? 'audio'
      : isVideo
      ? 'video'
      : isImage
      ? 'image'
      : 'doc';

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
    if (!activeConv?.id) return;

    if (stagedMedia) {
      const fileToSend = stagedMedia.file;
      const textToSend = localDraftText.trim();
      if (stagedMedia.previewUrl) URL.revokeObjectURL(stagedMedia.previewUrl);

      setStagedMedia(null);
      setLocalDraftText('');
      setDraftText('');
      setShowCannedPicker(false);
      setUploadError(null);
      setTimeout(() => scrollToBottom('auto'), 50);

      setIsUploadingMedia(true);
      uploadAndSendMedia(fileToSend, textToSend)
        .catch((err) => {
          setUploadError(typeof err === 'string' ? err : 'فشل رفع المرفق');
        })
        .finally(() => {
          setIsUploadingMedia(false);
        });
      return;
    }

    if (!localDraftText.trim()) return;
    const textToSend = localDraftText.trim();
    setLocalDraftText('');
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

  const formatSeconds = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  return (
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
            className="text-rose-500 hover:text-rose-800 text-xs font-bold cursor-pointer"
          >
            ✕
          </button>
        </div>
      )}

      {/* Canned Responses Popover Menu */}
      {showCannedPicker && (
        <div className="mb-2 p-2 bg-white/95 backdrop-blur-xl border border-slate-200/80 rounded-2xl shadow-xl space-y-1 animate-in fade-in zoom-in-95 duration-150 text-right">
          <div className="flex items-center justify-between px-2 py-1 border-b border-slate-100">
            <span className="text-[11px] font-bold text-slate-500 flex items-center gap-1">
              <Zap className="w-3.5 h-3.5 text-amber-500" />
              ردود سريعة جاهزة (Canned Responses)
            </span>
            <button
              type="button"
              onClick={() => setShowCannedPicker(false)}
              className="text-slate-400 hover:text-slate-600 text-xs font-bold cursor-pointer"
            >
              ✕
            </button>
          </div>
          <div className="flex flex-col gap-1 max-h-48 overflow-y-auto">
            {CANNED_RESPONSES.map((resp, i) => (
              <button
                key={i}
                type="button"
                onClick={() => {
                  setLocalDraftText(resp);
                  setShowCannedPicker(false);
                }}
                className="text-right text-xs p-2 rounded-xl hover:bg-theme-primary-tint text-slate-700 hover:text-theme-primary transition font-medium cursor-pointer"
              >
                {resp}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Rounded All-in-One Floating Dock Composer Box or Blocked Customer Notice */}
      {activeConv.customer?.is_blocked ? (
        <div className="border border-rose-200 bg-rose-50/95 backdrop-blur-md rounded-2xl p-4 shadow-sm flex items-center justify-between gap-4 text-right animate-in fade-in">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-rose-100 text-rose-700 flex items-center justify-center font-bold border border-rose-200 shrink-0">
              <Ban className="w-5 h-5" />
            </div>
            <div>
              <h4 className="text-xs font-extrabold text-rose-900">هذا العميل محظور حالياً (Blocked)</h4>
              <p className="text-[11px] text-rose-700 font-medium mt-0.5">
                {activeConv.customer.blocked_reason
                  ? `سبب الحظر: ${activeConv.customer.blocked_reason}`
                  : 'تم إيقاف استقبال وإرسال الرسائل مع هذا العميل.'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => onOpenBlockModal('unblock')}
            className="px-4 py-2 bg-white hover:bg-rose-100 text-rose-700 text-xs font-bold rounded-xl border border-rose-300 transition shadow-2xs shrink-0 cursor-pointer"
          >
            فك الحظر (Unblock)
          </button>
        </div>
      ) : (
        <div className="border border-slate-200/80 focus-within:border-theme-primary focus-within:ring-2 focus-within:ring-theme-primary/20 bg-white/95 backdrop-blur-md rounded-2xl p-2.5 transition shadow-[0_10px_30px_-4px_rgba(0,0,0,0.06)] space-y-1.5 relative">
          {/* Staged Reply Preview Bar */}
          {replyingToMessage && !editingMessage && (
            <div className="flex items-center justify-between p-2 px-3 bg-theme-primary-tint/80 rounded-xl border border-theme-primary/20 animate-in fade-in duration-150">
              <div className="flex items-center gap-2.5 overflow-hidden">
                <CornerUpLeft className="w-4 h-4 text-theme-primary shrink-0" />
                <div className="text-right truncate">
                  <span className="text-[10px] font-bold text-theme-primary block">
                    الرد على{' '}
                    {replyingToMessage.sender_name ||
                      (replyingToMessage.sender_type === 'customer'
                        ? activeConv?.customer_display_name || 'العميل'
                        : 'موظف الدعم')}
                  </span>
                  <p className="text-xs text-slate-700 truncate font-medium">
                    {replyingToMessage.text || replyingToMessage.attachments?.[0]?.title || 'مرفق وسائط'}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setReplyingToMessage(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-theme-primary-tint transition cursor-pointer"
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
                  <div className="w-12 h-12 rounded-lg bg-theme-primary-tint text-theme-primary border border-theme-primary/20 flex items-center justify-center font-bold shrink-0">
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
                className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition cursor-pointer"
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
                  className="text-slate-400 hover:text-slate-700 text-xs font-bold p-1 rounded-lg hover:bg-slate-100 cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              <textarea
                ref={editTextareaRef}
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
                  className="px-3 py-1.5 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100 transition cursor-pointer"
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
                  className="px-3 py-1.5 rounded-xl bg-white hover:bg-rose-100 text-rose-700 text-xs font-bold transition flex items-center gap-1 border border-rose-200 shadow-2xs cursor-pointer"
                  title="إلغاء التسجيل"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>إلغاء</span>
                </button>

                <button
                  type="button"
                  onClick={stopAndSendRecording}
                  disabled={isUploadingMedia}
                  className="px-3.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition flex items-center gap-1.5 shadow-xs disabled:opacity-50 cursor-pointer"
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
              ref={textareaRef}
              value={localDraftText}
              onChange={(e) => setLocalDraftText(e.target.value)}
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
                    className={`p-1.5 rounded-full transition cursor-pointer ${
                      showAttachmentMenu
                        ? 'bg-theme-primary-tint text-theme-primary'
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
                        className="w-full text-right px-3 py-2 rounded-xl text-xs font-semibold text-slate-700 hover:bg-emerald-50 hover:text-emerald-800 flex items-center gap-2.5 transition cursor-pointer"
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
                        className="w-full text-right px-3 py-2 rounded-xl text-xs font-semibold text-slate-700 hover:bg-indigo-50 hover:text-indigo-800 flex items-center gap-2.5 transition cursor-pointer"
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
                        className="w-full text-right px-3 py-2 rounded-xl text-xs font-semibold text-slate-700 hover:bg-theme-primary-tint hover:text-theme-primary flex items-center gap-2.5 transition cursor-pointer"
                      >
                        <FileText className="w-4 h-4 text-theme-primary" />
                        <span>إرفاق ملف / مستند (PDF, Word)</span>
                      </button>
                    </div>
                  )}
                </div>

                {/* Microphone / Voice Note Trigger */}
                <button
                  type="button"
                  onClick={startRecording}
                  className="p-1.5 rounded-full text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition cursor-pointer"
                  title="تسجيل رسالة صوتية (Voice Note)"
                >
                  <Mic className="w-4 h-4" />
                </button>

                {/* Canned Responses Trigger */}
                <button
                  type="button"
                  onClick={() => setShowCannedPicker(!showCannedPicker)}
                  className="p-1.5 rounded-full text-slate-400 hover:text-theme-primary hover:bg-theme-primary-tint transition cursor-pointer"
                  title="ردود جاهزة"
                >
                  <Zap className="w-4 h-4" />
                </button>
              </div>

              {/* Send Button */}
              <button
                type="button"
                onClick={handleSend}
                disabled={(!localDraftText.trim() && !stagedMedia) || isUploadingMedia}
                className={`px-3 py-2 rounded-xl font-bold text-xs transition flex items-center gap-1.5 ${
                  localDraftText.trim() || stagedMedia
                    ? 'bg-theme-primary hover:bg-theme-primary-hover text-white shadow-xs active:scale-95 cursor-pointer'
                    : 'bg-slate-100 text-slate-400 cursor-not-allowed'
                }`}
                title="إرسال"
              >
                {isUploadingMedia ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <>
                    <span>إرسال</span>
                    <Send className="w-3.5 h-3.5 rotate-180" />
                  </>
                )}
              </button>
            </div>
          )}
        </div>
      )}
    </footer>
  );
};
