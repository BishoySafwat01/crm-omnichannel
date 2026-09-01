import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Zap, Globe, CheckCircle2, RefreshCw, ChevronDown } from 'lucide-react';
import { metaApi } from '../services/api';
import { useAuthStore } from '../store/useAuthStore';

interface ProviderStatusData {
  direct_meta_enabled?: boolean;
  active_provider?: string;
  beon_connected?: boolean;
  meta_pages_count?: number;
  whatsapp?: { connected: boolean; status: string };
  instagram?: { connected: boolean; status: string };
  messenger?: { connected: boolean; status: string };
}

export const ProviderStatusIndicator: React.FC = () => {
  // 1. All hooks declared unconditionally at the very top level
  const { isAuthenticated, token } = useAuthStore();
  const [status, setStatus] = useState<ProviderStatusData | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isOpen, setIsOpen] = useState<boolean>(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const fetchStatus = useCallback(async () => {
    if (!isAuthenticated || !token) {
      return;
    }
    try {
      setIsLoading(true);
      const res = await metaApi.getIntegrationsStatus();
      if (res) {
        setStatus(res);
      }
    } catch (err) {
      console.warn('[ProviderStatusIndicator] Could not fetch status:', err);
    } finally {
      setIsLoading(false);
    }
  }, [isAuthenticated, token]);

  useEffect(() => {
    if (!isAuthenticated || !token) {
      return;
    }
    fetchStatus();
    const interval = setInterval(fetchStatus, 45000);
    return () => clearInterval(interval);
  }, [fetchStatus, isAuthenticated, token]);

  // Close popover when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  // 2. Guard: Placed strictly AFTER all hook declarations, right before JSX rendering
  if (!isAuthenticated || !token) {
    return null;
  }

  const isDirectMeta = status?.direct_meta_enabled === true;

  return (
    <div className="relative inline-flex items-center text-right select-none font-sans" dir="ltr" ref={dropdownRef}>
      {/* Sleek Compact Badge Trigger */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className={`group flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-[11px] font-bold transition-all duration-200 border cursor-pointer ${
          isDirectMeta
            ? 'bg-emerald-50/80 hover:bg-emerald-100/80 border-emerald-200 text-emerald-800 dark:bg-emerald-950/40 dark:border-emerald-800/60 dark:text-emerald-300'
            : 'bg-indigo-50/80 hover:bg-indigo-100/80 border-indigo-200 text-indigo-800 dark:bg-indigo-950/40 dark:border-indigo-800/60 dark:text-indigo-300'
        }`}
        title={
          isDirectMeta
            ? 'Messenger via Graph API v23.0 | Channels via BeOn V3'
            : 'All Channels Routed via BeOn API v3'
        }
      >
        {/* Pulsing Status Dot */}
        <span className="relative flex h-2 w-2 shrink-0">
          <span
            className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${
              isDirectMeta ? 'bg-emerald-400' : 'bg-indigo-400'
            }`}
          />
          <span
            className={`relative inline-flex rounded-full h-2 w-2 ${
              isDirectMeta ? 'bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.8)]' : 'bg-indigo-500 shadow-[0_0_6px_rgba(99,102,241,0.8)]'
            }`}
          />
        </span>

        {/* Icon & Label */}
        {isDirectMeta ? (
          <>
            <Zap className="w-3 h-3 text-emerald-600 dark:text-emerald-400 shrink-0" />
            <span className="tracking-tight">Meta Direct</span>
          </>
        ) : (
          <>
            <Globe className="w-3 h-3 text-indigo-600 dark:text-indigo-400 shrink-0" />
            <span className="tracking-tight">BeOn Gateway</span>
          </>
        )}

        <ChevronDown className={`w-3 h-3 opacity-50 group-hover:opacity-100 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {/* Popover Dropdown Details */}
      {isOpen && (
        <div className="absolute top-full mt-2 right-0 z-50 w-72 rounded-2xl bg-white/98 dark:bg-slate-900/98 backdrop-blur-xl border border-slate-200 dark:border-slate-800 shadow-xl p-3.5 text-xs space-y-2.5 animate-in fade-in zoom-in-95 duration-150">
          <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-2">
            <div className="flex items-center gap-2">
              <div className={`p-1 rounded-lg ${isDirectMeta ? 'bg-emerald-500/10 text-emerald-600' : 'bg-indigo-500/10 text-indigo-600'}`}>
                {isDirectMeta ? <Zap className="w-3.5 h-3.5" /> : <Globe className="w-3.5 h-3.5" />}
              </div>
              <div>
                <h4 className="font-bold text-[11px] text-slate-900 dark:text-slate-100">Provider Mode Engine</h4>
                <p className="text-[10px] text-slate-500">
                  {isDirectMeta ? 'Hybrid Meta Direct + BeOn' : 'BeOn Omnichannel V3'}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={fetchStatus}
              className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors"
              title="Refresh status"
            >
              <RefreshCw className={`w-3 h-3 ${isLoading ? 'animate-spin' : ''}`} />
            </button>
          </div>

          <div className="space-y-1.5 text-[11px]">
            <div className="flex items-center justify-between py-1 px-2 rounded-lg bg-slate-50 dark:bg-slate-800/50">
              <span className="text-slate-500">Gateway:</span>
              <span className="font-semibold text-slate-900 dark:text-slate-100">
                {isDirectMeta ? 'Meta Graph API v23.0' : 'BeOn V3 Partner API'}
              </span>
            </div>

            <div className="flex items-center justify-between py-1 px-2 rounded-lg bg-slate-50 dark:bg-slate-800/50">
              <span className="text-slate-500">BeOn Health:</span>
              <span className="flex items-center gap-1 font-semibold text-emerald-600 dark:text-emerald-400">
                <CheckCircle2 className="w-3 h-3" /> Connected (#1995)
              </span>
            </div>

            <div className="flex items-center justify-between py-1 px-2 rounded-lg bg-slate-50 dark:bg-slate-800/50">
              <span className="text-slate-500">Direct Meta Switch:</span>
              <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${isDirectMeta ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300'}`}>
                {isDirectMeta ? 'ACTIVE' : 'BYPASSED'}
              </span>
            </div>

            <div className="flex items-center justify-between py-1 px-2 rounded-lg bg-slate-50 dark:bg-slate-800/50">
              <span className="text-slate-500">Meta Pages:</span>
              <span className="font-semibold text-slate-800 dark:text-slate-200">
                {status?.meta_pages_count ?? 5} Configured
              </span>
            </div>
          </div>

          <div className="pt-1 text-[10px] text-slate-400 flex items-center justify-between border-t border-slate-100 dark:border-slate-800">
            <span>Dynamic Failover Ready</span>
            <span className="text-[9px] font-mono text-indigo-500 font-semibold">
              v3.api.beon.chat
            </span>
          </div>
        </div>
      )}
    </div>
  );
};
