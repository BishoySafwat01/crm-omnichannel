import React, { useEffect } from 'react';
import { MapPin, Globe, X } from 'lucide-react';
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
    <div className="fixed bottom-6 left-6 z-[99999] flex flex-col gap-2.5 max-w-sm w-full pointer-events-none select-none dir-rtl text-right">
      {alerts.map((alert) => {
        return (
          <div
            key={alert.id}
            className="pointer-events-auto bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border border-slate-200/80 dark:border-slate-800 shadow-xl shadow-slate-900/10 dark:shadow-black/40 rounded-2xl p-4 space-y-2.5 animate-in slide-in-from-bottom-5 fade-in duration-300 transition-all"
          >
            {/* Header */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="flex items-center justify-center w-8 h-8 rounded-xl bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200/60 dark:border-emerald-800/40 text-emerald-600 dark:text-emerald-400">
                  <MapPin className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="text-xs font-bold text-slate-800 dark:text-slate-100">
                    تم التعرف على الموقع
                  </h4>
                  {alert.customerName && (
                    <p className="text-[11px] text-slate-500 dark:text-slate-400">
                      العميل: <span className="font-semibold text-slate-700 dark:text-slate-200">{alert.customerName}</span>
                    </p>
                  )}
                </div>
              </div>

              <button
                onClick={() => onDismiss(alert.id)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer"
                title="إغلاق الإشعار"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Location Pill */}
            {alert.location && (
              <div className="flex items-center justify-between pt-1 border-t border-slate-100 dark:border-slate-800/70">
                <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
                  الموقع المسجل:
                </span>
                <span className="inline-flex items-center gap-1.5 bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200/70 dark:border-emerald-800/50 text-emerald-700 dark:text-emerald-300 px-2.5 py-0.5 rounded-full text-xs font-bold">
                  <Globe className="w-3 h-3 text-emerald-600 dark:text-emerald-400" />
                  {alert.location}
                </span>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};
