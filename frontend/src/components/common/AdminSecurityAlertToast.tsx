import React, { useEffect } from 'react';
import { ShieldAlert, Trash2, AlertTriangle, X, ExternalLink, MessageSquare } from 'lucide-react';
import { AdminSecurityAlert } from '../../types/crm';
import { useCrmStore } from '../../store/useCrmStore';

interface AdminSecurityAlertToastProps {
  alerts: AdminSecurityAlert[];
  onDismiss: (id: string) => void;
  onNavigateToChat?: (conversationId: string) => void;
}

export const AdminSecurityAlertToast: React.FC<AdminSecurityAlertToastProps> = ({
  alerts,
  onDismiss,
  onNavigateToChat,
}) => {
  const { setActiveConversationId } = useCrmStore();

  if (!alerts || alerts.length === 0) return null;

  const handleOpenConversation = (conversationId: string, alertId: string) => {
    if (conversationId) {
      setActiveConversationId(conversationId);
      if (onNavigateToChat) {
        onNavigateToChat(conversationId);
      }
    }
    onDismiss(alertId);
  };

  return (
    <div className="fixed top-18 left-6 z-[99999] flex flex-col gap-2.5 max-w-sm w-full pointer-events-none select-none dir-rtl text-right">
      {alerts.map((alert) => {
        const isDeletion = alert.alert_type === 'message_deleted';
        return (
          <div
            key={alert.id}
            className="pointer-events-auto bg-slate-950/95 text-white backdrop-blur-xl border border-rose-500/50 shadow-2xl rounded-2xl p-4 space-y-2.5 animate-in slide-in-from-top-4 fade-in duration-200"
          >
            {/* Header */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="flex h-3 w-3 relative">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-3 w-3 bg-rose-500" />
                </span>
                <div className="flex items-center gap-1.5 font-black text-xs text-rose-400">
                  {isDeletion ? <Trash2 className="w-4 h-4 text-rose-400" /> : <ShieldAlert className="w-4 h-4 text-amber-400" />}
                  <span>{alert.title || (isDeletion ? 'تم حذف رسالة' : 'رصد كلمة محظورة')}</span>
                </div>
              </div>
              <button
                onClick={() => onDismiss(alert.id)}
                className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-white/10 transition"
                title="إغلاق التنبيه"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Body */}
            <div className="space-y-1.5 text-xs">
              <p className="text-slate-200 font-medium">
                {isDeletion ? (
                  <>
                    قام <span className="font-bold text-rose-300">{alert.actor_name}</span> بحذف رسالة:
                  </>
                ) : (
                  <>
                    قام <span className="font-bold text-amber-300">{alert.actor_name}</span> بكتابة كلمة محظورة:
                  </>
                )}
              </p>

              <div className="p-2 bg-rose-950/70 border border-rose-500/30 rounded-xl text-rose-200 text-xs font-bold leading-relaxed break-words">
                {isDeletion ? alert.deleted_text || '(رسالة فارغة)' : alert.content_snippet || alert.matched_words?.join('، ')}
              </div>

              <div className="flex items-center justify-between text-[11px] text-slate-400 pt-1">
                <span>العميل: <span className="text-slate-200 font-semibold">{alert.customer_name}</span></span>
                {alert.channel && <span className="capitalize">{alert.channel}</span>}
              </div>
            </div>

            {/* Action */}
            <div className="flex items-center justify-end gap-2 pt-1 border-t border-white/10">
              <button
                onClick={() => handleOpenConversation(alert.conversation_id, alert.id)}
                className="w-full py-1.5 bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs rounded-xl transition flex items-center justify-center gap-1.5 shadow-md shadow-rose-600/30 cursor-pointer"
              >
                <MessageSquare className="w-3.5 h-3.5" />
                <span>فتح المحادثة والتحقق</span>
                <ExternalLink className="w-3 h-3" />
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
};
