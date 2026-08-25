import React, { useState, useRef, useEffect } from 'react';
import {
  Reply,
  Copy,
  Smile,
  Forward,
  Edit2,
  Trash2,
  Pin,
  Check,
  MoreVertical,
} from 'lucide-react';
import { Message } from '../../../types/crm';
import { useAuthStore } from '../../../store/useAuthStore';
import { useCrmStore } from '../../../store/useCrmStore';
import { MessageReactionPicker } from './MessageReactionPicker';

interface MessageActionsMenuProps {
  message: Message;
  isAgentMessage: boolean;
}

export const MessageActionsMenu: React.FC<MessageActionsMenuProps> = ({
  message,
  isAgentMessage,
}) => {
  const { user } = useAuthStore();
  const {
    setReplyingToMessage,
    setEditingMessage,
    setIsForwardModalOpen,
    deleteMessage,
    toggleReaction,
    togglePin,
  } = useCrmStore();

  const [showPicker, setShowPicker] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const [copied, setCopied] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

  // Close menus when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setShowPicker(false);
        setShowDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Determine permissions based on UserRole and Ownership
  const role = user?.role || 'agent';
  const isSuperadminOrAdmin = role === 'admin';
  const isSupervisor = role === 'supervisor';
  const isOwner = Boolean(
    user?.id && message.sender_user_id && message.sender_user_id === user.id
  );

  const isDeleted = Boolean(message.is_deleted);
  const isTextMessage =
    message.message_type === 'text' && Boolean(message.text && !message.text.startsWith('/uploads/'));

  // Can Edit: Only active text messages, sent by agent.
  // Agent can only edit own; Supervisor/Admin can edit any agent text message.
  const canEdit =
    !isDeleted &&
    isTextMessage &&
    isAgentMessage &&
    (isOwner || isSupervisor || isSuperadminOrAdmin);

  // Can Delete: Any active message can be deleted by team members with chat access
  const canDelete = !isDeleted;

  // Copy handler
  const handleCopy = async () => {
    const textToCopy =
      message.text ||
      message.attachments?.[0]?.title ||
      message.media_url ||
      '';
    if (!textToCopy) return;

    try {
      await navigator.clipboard.writeText(textToCopy);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.warn('Failed to copy message:', err);
    }
  };

  const handleReply = () => {
    setReplyingToMessage(message);
  };

  const handleForward = () => {
    setIsForwardModalOpen(true, message);
  };

  const handleEdit = () => {
    setEditingMessage(message);
  };

  const handleDelete = () => {
    deleteMessage(message.id);
  };

  const handleTogglePin = () => {
    togglePin(message.id);
  };

  const handleReactionSelect = (emoji: string) => {
    toggleReaction(message.id, emoji);
  };

  if (isDeleted) {
    return null;
  }

  return (
    <div
      ref={menuRef}
      className={`relative inline-flex items-center gap-0.5 bg-white/95 backdrop-blur-md px-1.5 py-0.5 rounded-full border border-slate-200/90 shadow-sm transition-all duration-150 ${
        isAgentMessage ? 'flex-row' : 'flex-row-reverse'
      }`}
      onClick={(e) => e.stopPropagation()}
    >
      {/* Reaction Picker Popup (Opens upward) */}
      {showPicker && (
        <MessageReactionPicker
          onSelect={handleReactionSelect}
          onClose={() => setShowPicker(false)}
          isAgentMessage={isAgentMessage}
        />
      )}

      {/* 1. Quick Reaction Button */}
      <button
        type="button"
        onClick={() => {
          setShowPicker(!showPicker);
          setShowDropdown(false);
        }}
        className="p-1 rounded-full text-slate-400 hover:text-amber-500 hover:bg-slate-100 transition cursor-pointer"
        title="تفاعل بإيموجي"
      >
        <Smile className="w-3.5 h-3.5" />
      </button>

      {/* 2. Quick Reply Button */}
      <button
        type="button"
        onClick={handleReply}
        className="p-1 rounded-full text-slate-400 hover:text-[#1A73E8] hover:bg-slate-100 transition cursor-pointer"
        title="رد على الرسالة"
      >
        <Reply className="w-3.5 h-3.5" />
      </button>

      {/* 3. More Actions Dropdown Trigger */}
      <button
        type="button"
        onClick={() => {
          setShowDropdown(!showDropdown);
          setShowPicker(false);
        }}
        className="p-1 rounded-full text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition cursor-pointer"
        title="خيارات إضافية"
      >
        <MoreVertical className="w-3.5 h-3.5" />
      </button>

      {/* Dropdown Menu (Opens upward cleanly so it never pushes layout down) */}
      {showDropdown && (
        <div
          className={`absolute bottom-full mb-1.5 z-50 min-w-[140px] bg-white rounded-xl shadow-xl border border-slate-200/90 py-1 text-xs font-medium text-slate-700 animate-in fade-in zoom-in-95 duration-100 ${
            isAgentMessage ? 'left-0' : 'right-0'
          }`}
          dir="rtl"
        >
          {/* Copy */}
          <button
            type="button"
            onClick={() => {
              handleCopy();
              setShowDropdown(false);
            }}
            className="w-full px-3 py-1.5 flex items-center gap-2 hover:bg-slate-50 text-right transition cursor-pointer"
          >
            {copied ? (
              <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
            ) : (
              <Copy className="w-3.5 h-3.5 text-slate-500 shrink-0" />
            )}
            <span>{copied ? 'تم النسخ!' : 'نسخ النص'}</span>
          </button>

          {/* Forward */}
          <button
            type="button"
            onClick={() => {
              handleForward();
              setShowDropdown(false);
            }}
            className="w-full px-3 py-1.5 flex items-center gap-2 hover:bg-slate-50 text-right transition cursor-pointer"
          >
            <Forward className="w-3.5 h-3.5 text-slate-500 shrink-0" />
            <span>إعادة توجيه</span>
          </button>

          {/* Pin / Unpin */}
          <button
            type="button"
            onClick={() => {
              handleTogglePin();
              setShowDropdown(false);
            }}
            className="w-full px-3 py-1.5 flex items-center gap-2 hover:bg-slate-50 text-right transition cursor-pointer"
          >
            <Pin className="w-3.5 h-3.5 text-slate-500 shrink-0" />
            <span>{message.is_pinned ? 'إلغاء التثبيت' : 'تثبيت الرسالة'}</span>
          </button>

          {/* Edit (if authorized) */}
          {canEdit && (
            <button
              type="button"
              onClick={() => {
                handleEdit();
                setShowDropdown(false);
              }}
              className="w-full px-3 py-1.5 flex items-center gap-2 hover:bg-amber-50 text-amber-700 text-right transition cursor-pointer font-semibold"
            >
              <Edit2 className="w-3.5 h-3.5 shrink-0" />
              <span>تعديل</span>
            </button>
          )}

          {/* Delete (if authorized) */}
          {canDelete && (
            <>
              <div className="my-1 border-t border-slate-100" />
              <button
                type="button"
                onClick={() => {
                  handleDelete();
                  setShowDropdown(false);
                }}
                className="w-full px-3 py-1.5 flex items-center gap-2 hover:bg-rose-50 text-rose-600 text-right transition cursor-pointer font-semibold"
              >
                <Trash2 className="w-3.5 h-3.5 shrink-0" />
                <span>حذف</span>
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
};
