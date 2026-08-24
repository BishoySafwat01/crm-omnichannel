import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { Ban, Check, X, AlertTriangle, User } from 'lucide-react';
import { ChannelBadgeIcon } from '../../pages/Chat/components/ConversationList';

interface BlockCustomerModalProps {
  isOpen: boolean;
  mode?: 'block' | 'unblock';
  customerName: string;
  brandName?: string | null;
  channel?: string;
  currentReason?: string | null;
  onClose: () => void;
  onConfirm: (reason: string) => Promise<void> | void;
}

const PRESET_REASONS = [
  'سبام وإعلانات مزعجة',
  'إساءة استخدام أو لغة غير لائقة',
  'عميل وهمي / غير جاد',
  'طلب العميل إيقاف التواصل',
  'مخالفة سياسات المتجر',
];

export const BlockCustomerModal: React.FC<BlockCustomerModalProps> = ({
  isOpen,
  mode = 'block',
  customerName,
  brandName,
  channel,
  currentReason,
  onClose,
  onConfirm,
}) => {
  const [reason, setReason] = useState(mode === 'block' ? 'سبام وإعلانات مزعجة' : '');
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isOpen || typeof document === 'undefined') return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      await onConfirm(reason.trim() || 'حظر يدوي من المشرف');
      onClose();
    } catch (err) {
      console.error(err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const isBlockMode = mode === 'block';

  return createPortal(
    <div
      className="fixed inset-0 bg-slate-950/60 backdrop-blur-sm z-[9999] flex items-center justify-center p-4 select-none animate-in fade-in duration-150 dir-rtl text-right"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-100 space-y-5 animate-in zoom-in-95 duration-150 my-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 pb-3.5">
          <div className="flex items-center gap-3">
            <div
              className={`w-10 h-10 rounded-2xl flex items-center justify-center font-bold shadow-md ${
                isBlockMode
                  ? 'bg-rose-100 text-rose-700 border border-rose-200'
                  : 'bg-emerald-100 text-emerald-700 border border-emerald-200'
              }`}
            >
              {isBlockMode ? <Ban className="w-5 h-5" /> : <Check className="w-5 h-5" />}
            </div>
            <div>
              <h3 className="text-sm font-black text-slate-900">
                {isBlockMode ? 'تأكيد حظر العميل' : 'إلغاء حظر العميل'}
              </h3>
              <p className="text-[11px] text-slate-500 font-medium mt-0.5">
                {isBlockMode
                  ? 'تقييد التواصل ومنع إرسال واستقبال الرسائل'
                  : 'إعادة تمكين التواصل والمحادثة مع العميل'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-xl transition"
            title="إغلاق"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Customer Badge Pill */}
        <div className="flex items-center justify-between p-3 bg-slate-50 rounded-2xl border border-slate-200/70">
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-8 h-8 rounded-full bg-[#1A73E8] text-white flex items-center justify-center text-xs font-bold shrink-0 shadow-2xs">
              <User className="w-4 h-4" />
            </div>
            <div className="truncate">
              <span className="text-xs font-extrabold text-slate-900 block truncate">{customerName}</span>
              {brandName && <span className="text-[10px] text-slate-500 font-semibold">متجر: {brandName}</span>}
            </div>
          </div>
          {channel && (
            <div className="shrink-0 flex items-center gap-1 bg-white px-2 py-1 rounded-xl border border-slate-200 text-[10px] font-bold text-slate-700">
              <ChannelBadgeIcon channel={channel} className="w-3.5 h-3.5" />
              <span className="capitalize">{channel}</span>
            </div>
          )}
        </div>

        {isBlockMode ? (
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Warning Alert */}
            <div className="p-3 bg-amber-50 border border-amber-200/80 rounded-2xl text-amber-900 text-xs font-semibold flex items-start gap-2.5">
              <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              <p className="leading-relaxed">
                عند حظر العميل، لن يتمكن من إرسال رسائل جديدة وسيتم قفل صندوق الردود تلقائياً.
              </p>
            </div>

            {/* Quick Reason Chips */}
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-2">سبب الحظر (اختر أو اكتب):</label>
              <div className="flex flex-wrap gap-1.5 mb-2.5">
                {PRESET_REASONS.map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => setReason(preset)}
                    className={`text-[11px] px-2.5 py-1 rounded-xl font-bold transition border ${
                      reason === preset
                        ? 'bg-rose-600 text-white border-rose-600 shadow-2xs'
                        : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    {preset}
                  </button>
                ))}
              </div>

              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="اكتب تفاصيل إضافية عن سبب الحظر هنا..."
                rows={2}
                className="w-full bg-slate-50 text-xs text-slate-900 p-3 rounded-2xl border border-slate-200 focus:bg-white focus:outline-none focus:ring-2 focus:ring-rose-500/20 focus:border-rose-500 font-medium resize-none"
              />
            </div>

            {/* Actions */}
            <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2.5 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100 transition"
              >
                إلغاء
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className="px-5 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold transition flex items-center gap-2 shadow-md shadow-rose-600/20 disabled:opacity-50 cursor-pointer"
              >
                <Ban className="w-4 h-4" />
                <span>{isSubmitting ? 'جاري الحظر...' : 'تأكيد حظر العميل'}</span>
              </button>
            </div>
          </form>
        ) : (
          <div className="space-y-4">
            <div className="p-3.5 bg-emerald-50 border border-emerald-200 rounded-2xl text-emerald-900 text-xs font-semibold flex items-start gap-2.5">
              <Check className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
              <div>
                <p className="font-bold">هل أنت متأكد من رغبتك في إلغاء حظر العميل؟</p>
                <p className="text-[11px] text-emerald-700 font-medium mt-1">
                  سيتم فتح صندوق الردود والسماح بإرسال واستقبال الرسائل بشكل طبيعي فوراً.
                </p>
                {currentReason && (
                  <p className="text-[10px] text-slate-500 font-medium mt-1.5 pt-1.5 border-t border-emerald-200/60">
                    سبب الحظر السابق: {currentReason}
                  </p>
                )}
              </div>
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2.5 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100 transition"
              >
                إلغاء
              </button>
              <button
                type="button"
                onClick={handleSubmit}
                disabled={isSubmitting}
                className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition flex items-center gap-2 shadow-md shadow-emerald-600/20 disabled:opacity-50 cursor-pointer"
              >
                <Check className="w-4 h-4" />
                <span>{isSubmitting ? 'جاري التنفيذ...' : 'تأكيد إلغاء الحظر'}</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>,
    document.body
  );
};
