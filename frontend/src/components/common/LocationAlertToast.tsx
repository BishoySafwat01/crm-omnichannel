import React, { useEffect } from 'react';
import { MapPin, MapPinOff, Globe, X } from 'lucide-react';
import { LocationAlert } from '../../types/crm';

interface LocationAlertToastProps {
  alerts: LocationAlert[];
  onDismiss: (id: string) => void;
}

export const LocationAlertToast: React.FC<LocationAlertToastProps> = ({
  alerts,
  onDismiss,
}) => {
  useEffect(() => {
    if (!alerts || alerts.length === 0) return;

    const timers = alerts.map((alert) =>
      setTimeout(() => {
        onDismiss(alert.id);
      }, 4500)
    );

    return () => {
      timers.forEach((t) => clearTimeout(t));
    };
  }, [alerts, onDismiss]);

  if (!alerts || alerts.length === 0) return null;

  return (
    <div className="fixed top-20 left-6 z-[99999] flex flex-col gap-2.5 max-w-sm w-full pointer-events-none select-none dir-rtl text-right">
      {alerts.map((alert) => {
        const isDetected = alert.type === 'detected';

        return (
          <div
            key={alert.id}
            className={`pointer-events-auto backdrop-blur-xl shadow-2xl rounded-2xl p-4 space-y-2 animate-in slide-in-from-top-4 fade-in duration-200 border transition-all ${
              isDetected
                ? 'bg-emerald-950/95 text-emerald-50 border-emerald-500/60 shadow-emerald-950/50'
                : 'bg-slate-950/95 text-slate-100 border-emerald-500/30 shadow-slate-950/50'
            }`}
          >
            {/* Header */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="flex h-3 w-3 relative">
                  <span
                    className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${
                      isDetected ? 'bg-emerald-400' : 'bg-emerald-600'
                    }`}
                  />
                  <span
                    className={`relative inline-flex rounded-full h-3 w-3 ${
                      isDetected ? 'bg-emerald-500' : 'bg-emerald-400'
                    }`}
                  />
                </span>
                <div
                  className={`flex items-center gap-1.5 font-black text-xs ${
                    isDetected ? 'text-emerald-400' : 'text-emerald-300'
                  }`}
                >
                  {isDetected ? (
                    <MapPin className="w-4 h-4 text-emerald-400 animate-bounce" />
                  ) : (
                    <MapPinOff className="w-4 h-4 text-emerald-300" />
                  )}
                  <span>{isDetected ? 'تم التعرف علي الموقع' : 'لم يتم التعرف علي الموقع'}</span>
                </div>
              </div>

              <button
                onClick={() => onDismiss(alert.id)}
                className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-white/10 transition cursor-pointer"
                title="إغلاق الإشعار"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Body */}
            <div className="text-xs space-y-1">
              {isDetected ? (
                <div className="p-2 bg-emerald-900/40 border border-emerald-500/30 rounded-xl text-emerald-200 font-bold flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <Globe className="w-4 h-4 text-emerald-400" />
                    <span>الموقع المسجل:</span>
                  </div>
                  <span className="bg-emerald-500/20 text-emerald-300 px-2 py-0.5 rounded-lg text-xs font-black border border-emerald-400/40">
                    {alert.location || 'محدد'}
                  </span>
                </div>
              ) : (
                <p className="text-slate-300 text-xs font-medium leading-relaxed">
                  لم يتم العثور على اسم دولة أو عنوان واضح في المحتوى.
                </p>
              )}

              {alert.customerName && (
                <div className="flex items-center justify-between text-[11px] text-slate-400 pt-0.5">
                  <span>العميل: <span className="text-slate-200 font-bold">{alert.customerName}</span></span>
                  <span className="text-emerald-400 font-medium">نظام التتبع الجغرافي</span>
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
};
