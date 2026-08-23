import React from 'react';

interface MessageReactionPickerProps {
  onSelect: (emoji: string) => void;
  onClose: () => void;
  isAgentMessage?: boolean;
}

const COMMON_EMOJIS = ['❤️', '😂', '👍', '😮', '😢', '🙏'];

export const MessageReactionPicker: React.FC<MessageReactionPickerProps> = ({
  onSelect,
  onClose,
  isAgentMessage = false,
}) => {
  return (
    <div
      className={`absolute bottom-full mb-1.5 z-50 flex items-center gap-1 bg-white/95 backdrop-blur-md px-2 py-1 rounded-full shadow-xl border border-slate-200/90 animate-in fade-in zoom-in-95 duration-100 ${
        isAgentMessage ? 'left-0' : 'right-0'
      }`}
      onClick={(e) => e.stopPropagation()}
    >
      {COMMON_EMOJIS.map((emoji) => (
        <button
          key={emoji}
          type="button"
          onClick={() => {
            onSelect(emoji);
            onClose();
          }}
          className="text-base hover:scale-125 active:scale-95 transition-transform p-1 rounded-full hover:bg-slate-100 flex items-center justify-center cursor-pointer"
        >
          {emoji}
        </button>
      ))}
    </div>
  );
};
