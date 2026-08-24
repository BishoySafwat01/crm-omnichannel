import React, { useState } from 'react';
import { Search, X, Forward, Check, MessageSquare, AlertCircle } from 'lucide-react';
import { useCrmStore } from '../../../store/useCrmStore';
import { Conversation, Message } from '../../../types/crm';

interface ForwardMessageModalProps {
  isOpen: boolean;
  message: Message | null;
  onClose: () => void;
}

export const ForwardMessageModal: React.FC<ForwardMessageModalProps> = ({
  isOpen,
  message,
  onClose,
}) => {
  const { conversations, activeConversationId, forwardMessage } = useCrmStore();
  const [search, setSearch] = useState('');
  const [selectedConvId, setSelectedConvId] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen || !message) return null;

  const filteredConversations = conversations.filter((c) => {
    // Exclude current conversation from forward targets
    if (c.id === activeConversationId) return false;
    const q = search.toLowerCase().trim();
    if (!q) return true;
    const name = (c.customer_display_name || c.customer?.display_name || '').toLowerCase();
    const brand = (c.brand || '').toLowerCase();
    const channel = (c.channel || '').toLowerCase();
    return name.includes(q) || brand.includes(q) || channel.includes(q);
  });

  const handleConfirmForward = async () => {
    if (!selectedConvId) return;
    setIsSubmitting(true);
    setError(null);
    try {
      await forwardMessage(selectedConvId);
      onClose();
    } catch (err: any) {
      setError(err?.message || 'فشل إعادة توجيه الرسالة');
    } finally {
      setIsSubmitting(false);
    }
  };

  const messagePreviewText =
    message.text ||
    (message.attachments && message.attachments.length > 0
      ? message.attachments[0].title || 'مرفق وسائط'
      : message.media_url || 'مرفق');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150">
      <div
        className="bg-white rounded-3xl shadow-2xl border border-slate-200/80 w-full max-w-lg overflow-hidden flex flex-col max-h-[85vh] animate-in zoom-in-95 duration-150"
        dir="rtl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/70">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-2xl bg-indigo-50 text-indigo-600 border border-indigo-200 flex items-center justify-center shadow-xs">
              <Forward className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-black text-slate-900">إعادة توجيه الرسالة</h3>
              <p className="text-[11px] text-slate-500 font-medium">اختر المحادثة الهدف لإرسال الرسالة إليها</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full hover:bg-slate-200 text-slate-400 hover:text-slate-700 flex items-center justify-center transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Message Preview Strip */}
        <div className="p-3.5 mx-5 mt-4 rounded-2xl bg-indigo-50/60 border border-indigo-100 flex items-start gap-2.5">
          <MessageSquare className="w-4 h-4 text-indigo-600 shrink-0 mt-0.5" />
          <div className="text-xs">
            <span className="font-bold text-indigo-900 block mb-0.5">معاينة الرسالة:</span>
            <p className="text-indigo-800 line-clamp-2 leading-relaxed">{messagePreviewText}</p>
          </div>
        </div>

        {/* Search Box */}
        <div className="px-5 pt-3">
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="البحث باسم العميل، البراند، أو القناة..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full bg-slate-50 text-xs font-semibold pr-9 pl-4 py-2.5 rounded-xl border border-slate-200 focus:bg-white focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 transition"
            />
          </div>
        </div>

        {error && (
          <div className="mx-5 mt-3 p-3 bg-rose-50 border border-rose-200 text-rose-700 rounded-xl text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Conversations List */}
        <div className="p-5 flex-1 overflow-y-auto space-y-2 min-h-[220px]">
          {filteredConversations.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 text-slate-400">
              <MessageSquare className="w-8 h-8 stroke-1 mb-2 text-slate-300" />
              <p className="text-xs font-bold">لا توجد محادثات مطابقة</p>
            </div>
          ) : (
            filteredConversations.map((conv) => {
              const isSelected = selectedConvId === conv.id;
              const customerName = conv.customer_display_name || conv.customer?.display_name || 'عميل';
              return (
                <div
                  key={conv.id}
                  onClick={() => setSelectedConvId(conv.id)}
                  className={`p-3 rounded-2xl border transition-all cursor-pointer flex items-center justify-between ${
                    isSelected
                      ? 'bg-indigo-50/80 border-indigo-300 shadow-xs'
                      : 'bg-white hover:bg-slate-50 border-slate-200/80'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-slate-100 text-slate-700 border border-slate-200 flex items-center justify-center font-bold text-sm">
                      {customerName.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <p className="text-xs font-bold text-slate-900">{customerName}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-[10px] font-bold px-1.5 py-0.2 rounded bg-slate-100 text-slate-600 uppercase border border-slate-200">
                          {conv.brand || 'LAVVA'}
                        </span>
                        <span className="text-[10px] font-bold px-1.5 py-0.2 rounded bg-indigo-50 text-indigo-700 uppercase border border-indigo-200">
                          {conv.channel}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="w-6 h-6 rounded-full border flex items-center justify-center transition-all ${isSelected ? 'bg-indigo-600 border-indigo-600 text-white' : 'border-slate-300'}">
                    {isSelected && <Check className="w-3.5 h-3.5 text-indigo-600" />}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-100 bg-slate-50 flex items-center justify-end gap-2.5">
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-200 transition"
          >
            إلغاء
          </button>
          <button
            type="button"
            disabled={!selectedConvId || isSubmitting}
            onClick={handleConfirmForward}
            className="px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold transition shadow-xs disabled:opacity-50 flex items-center gap-2"
          >
            <Forward className="w-4 h-4" />
            <span>{isSubmitting ? 'جاري الإرسال...' : 'إعادة توجيه'}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
