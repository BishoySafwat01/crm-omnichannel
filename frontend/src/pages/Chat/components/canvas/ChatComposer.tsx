import React, { useState, useEffect, useRef } from 'react';
import {
  Send,
  Paperclip,
  Image as ImageIcon,
  Video,
  FileText,
  Mic,
  X,
  Loader2,
  Sparkles,
} from 'lucide-react';
import { useCrmStore } from '../../../../store/useCrmStore';
import { Message, Attachment } from '../../../../types/crm';

export interface ChatComposerProps {
  onSendMessage: (text: string, attachments?: Attachment[]) => Promise<void>;
  isRecording?: boolean;
  onStartRecording?: () => void;
  stagedMedia?: { file: File; previewUrl: string; type: 'image' | 'video' | 'file' | 'audio' } | null;
  onClearStagedMedia?: () => void;
  isUploadingMedia?: boolean;
  smartReplies?: string[];
  onSelectSmartReply?: (reply: string) => void;
}

export const ChatComposer: React.FC<ChatComposerProps> = ({
  onSendMessage,
  isRecording = false,
  onStartRecording,
  stagedMedia,
  onClearStagedMedia,
  isUploadingMedia = false,
  smartReplies = [],
  onSelectSmartReply,
}) => {
  const [localDraftText, setLocalDraftText] = useState('');
  const [showAttachmentMenu, setShowAttachmentMenu] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Zustand Global Draft State (Reactive Bridge for Smart Replies & Templates)
  const draftText = useCrmStore((state) => state.draftText);
  const setDraftText = useCrmStore((state) => state.setDraftText);
  const replyingToMessage = useCrmStore((state) => state.replyingToMessage);
  const setReplyingToMessage = useCrmStore((state) => state.setReplyingToMessage);
  const editingMessage = useCrmStore((state) => state.editingMessage);
  const setEditingMessage = useCrmStore((state) => state.setEditingMessage);
  const editMessage = useCrmStore((state) => state.editMessage);

  // DEF-AI-02 Resolution: Ingest external smart reply or canned response drafts
  useEffect(() => {
    if (draftText && draftText.trim() !== '') {
      setLocalDraftText(draftText);
      // Clear global draft store after syncing to prevent stale overwrites on future keystrokes
      setDraftText('');
      textareaRef.current?.focus();
    }
  }, [draftText, setDraftText]);

  // Sync editing message text into local state
  useEffect(() => {
    if (editingMessage && editingMessage.text) {
      setLocalDraftText(editingMessage.text);
      textareaRef.current?.focus();
    }
  }, [editingMessage]);

  const handleSend = async () => {
    const textToSend = localDraftText.trim();
    if (!textToSend && !stagedMedia) return;

    if (editingMessage) {
      if (textToSend) {
        await editMessage(editingMessage.id, textToSend);
        setEditingMessage(null);
        setLocalDraftText('');
      }
      return;
    }

    setLocalDraftText('');
    await onSendMessage(textToSend);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="p-3 bg-white/80 backdrop-blur-md border-t border-slate-100 shrink-0 space-y-2">
      {/* Replying To Message Banner */}
      {replyingToMessage && (
        <div className="flex items-center justify-between bg-blue-50/90 border-r-4 border-r-[#1A73E8] border border-blue-200 px-3 py-1.5 rounded-xl text-xs text-blue-950">
          <div className="flex items-center gap-2 truncate">
            <span className="font-bold text-[#1A73E8]">رد على {replyingToMessage.sender_name || 'رسالة'}:</span>
            <span className="text-slate-600 truncate">{replyingToMessage.text || 'مرفق وسائط'}</span>
          </div>
          <button
            type="button"
            onClick={() => setReplyingToMessage(null)}
            className="text-slate-400 hover:text-slate-600 p-0.5 rounded-full cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Editing Message Banner */}
      {editingMessage && (
        <div className="flex items-center justify-between bg-amber-50/90 border-r-4 border-r-amber-500 border border-amber-200 px-3 py-1.5 rounded-xl text-xs text-amber-950">
          <div className="flex items-center gap-2 truncate">
            <span className="font-bold text-amber-700">تعديل الرسالة:</span>
            <span className="text-slate-600 truncate">{editingMessage.text}</span>
          </div>
          <button
            type="button"
            onClick={() => {
              setEditingMessage(null);
              setLocalDraftText('');
            }}
            className="text-slate-400 hover:text-slate-600 p-0.5 rounded-full cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Staged Media Thumbnail */}
      {stagedMedia && (
        <div className="relative inline-block border border-slate-200 rounded-xl p-1 bg-white shadow-2xs">
          {stagedMedia.type === 'image' && (
            <img src={stagedMedia.previewUrl} alt="Preview" className="h-20 w-auto rounded-lg object-cover" />
          )}
          {stagedMedia.type === 'video' && (
            <video src={stagedMedia.previewUrl} className="h-20 w-auto rounded-lg object-cover" />
          )}
          {stagedMedia.type === 'file' && (
            <div className="h-16 px-4 flex items-center gap-2 bg-slate-50 rounded-lg text-xs font-semibold text-slate-700">
              <FileText className="w-5 h-5 text-[#1A73E8]" />
              <span>{stagedMedia.file.name}</span>
            </div>
          )}
          <button
            type="button"
            onClick={onClearStagedMedia}
            className="absolute -top-2 -right-2 bg-rose-500 text-white rounded-full p-1 shadow-md hover:bg-rose-600 cursor-pointer"
            title="إلغاء المرفق"
          >
            <X className="w-3 h-3" />
          </button>
        </div>
      )}

      {/* Isolated Textarea with keystroke performance protection */}
      <div className="bg-slate-50/90 border border-slate-200/80 rounded-2xl p-2.5 focus-within:ring-2 focus-within:ring-[#1A73E8]/20 focus-within:border-[#1A73E8] focus-within:bg-white transition-all shadow-2xs">
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

        {/* Controls Bar */}
        <div className="flex items-center justify-between pt-1 border-t border-slate-100 relative">
          <div className="flex items-center gap-1 relative">
            <button
              type="button"
              onClick={() => setShowAttachmentMenu(!showAttachmentMenu)}
              className="p-1.5 rounded-full text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition cursor-pointer"
              title="إرفاق وسائط"
            >
              <Paperclip className="w-4 h-4" />
            </button>

            {onStartRecording && (
              <button
                type="button"
                onClick={onStartRecording}
                className="p-1.5 rounded-full text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition cursor-pointer"
                title="تسجيل رسالة صوتية"
              >
                <Mic className="w-4 h-4" />
              </button>
            )}
          </div>

          <button
            type="button"
            onClick={handleSend}
            disabled={(!localDraftText.trim() && !stagedMedia) || isUploadingMedia}
            className="px-4 py-1.5 rounded-xl bg-[#1A73E8] hover:bg-[#1557B0] text-white text-xs font-bold transition flex items-center gap-1.5 shadow-xs disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
          >
            {isUploadingMedia ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Send className="w-3.5 h-3.5 rotate-180" />
            )}
            <span>{editingMessage ? 'تعديل' : 'إرسال'}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
