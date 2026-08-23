import React, { useEffect, useState } from 'react';
import { X, Check, Copy, Plug, MessageSquare, Instagram, Facebook, Globe, ShieldCheck, RefreshCw, Send, Loader2 } from 'lucide-react';
import { useCrmStore } from '../store/useCrmStore';
import { metaApi } from '../services/api';

export const IntegrationsModal: React.FC = () => {
  const { isIntegrationsModalOpen, setIsIntegrationsModalOpen } = useCrmStore();
  const [copiedUrl, setCopiedUrl] = useState(false);
  const [loading, setLoading] = useState(false);
  const [statusData, setStatusData] = useState<any>(null);
  const [testPingLoading, setTestPingLoading] = useState<Record<string, boolean>>({});
  const [testPingFeedback, setTestPingFeedback] = useState<Record<string, string>>({});

  useEffect(() => {
    if (isIntegrationsModalOpen) {
      loadStatus();
    }
  }, [isIntegrationsModalOpen]);

  const loadStatus = async () => {
    setLoading(true);
    try {
      const data = await metaApi.getIntegrationsStatus();
      if (data) setStatusData(data);
    } catch (e) {
      console.error('Failed to load integration status:', e);
    } finally {
      setLoading(false);
    }
  };

  const handleTestPing = async (channel: string) => {
    setTestPingLoading((prev) => ({ ...prev, [channel]: true }));
    setTestPingFeedback((prev) => ({ ...prev, [channel]: '' }));
    try {
      const res = await metaApi.sendTestPing(channel);
      setTestPingFeedback((prev) => ({
        ...prev,
        [channel]: res.message || 'تم إرسال اختبار الاتصال بنجاح ✨',
      }));
      setTimeout(() => {
        setTestPingFeedback((prev) => ({ ...prev, [channel]: '' }));
      }, 4000);
    } catch (err: any) {
      setTestPingFeedback((prev) => ({
        ...prev,
        [channel]: 'فشل إرسال اختبار الاتصال ❌',
      }));
    } finally {
      setTestPingLoading((prev) => ({ ...prev, [channel]: false }));
    }
  };

  if (!isIntegrationsModalOpen) return null;

  const webhookUrl = statusData?.webhook?.url || 'https://api.luxira.com/api/v1/meta/webhook';
  const verifyTokenConfigured: boolean = statusData?.webhook?.verify_token_configured ?? false;

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedUrl(true);
    setTimeout(() => setCopiedUrl(false), 2000);
  };

  return (
    <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white/95 backdrop-blur-2xl border border-white/80 shadow-2xl rounded-3xl max-w-2xl w-full p-6 space-y-5 animate-in fade-in zoom-in-95 duration-150 dir-rtl text-right">
        
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 pb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-[#1A73E8] to-teal-500 text-white flex items-center justify-center font-bold shadow-md">
              <Plug className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-extrabold text-slate-900">مركز ربط القنوات والويب هـوك (Omnichannel Hub)</h2>
              <p className="text-xs text-slate-500 font-medium">إدارة الربط المباشر مع Meta API, WhatsApp Cloud & Instagram Direct</p>
            </div>
          </div>

          <button
            onClick={() => setIsIntegrationsModalOpen(false)}
            className="p-2 rounded-full text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Integration Cards Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          
          {/* 1. WhatsApp Cloud API Card */}
          <div className="bg-emerald-50/50 border border-emerald-200/60 rounded-2xl p-3.5 space-y-2 relative overflow-hidden flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <MessageSquare className="w-4 h-4 text-emerald-600" />
                  <h3 className="text-xs font-bold text-slate-900">WhatsApp Cloud</h3>
                </div>
                <span className={`text-[10px] px-2 py-0.5 rounded-full font-extrabold ${statusData?.whatsapp?.connected ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-600'}`}>
                  {statusData?.whatsapp?.connected ? 'متصل 🟢' : 'غير مهيأ ⚪'}
                </span>
              </div>

              <div className="space-y-1 text-[11px] text-slate-600 pt-2">
                <div className="flex justify-between">
                  <span className="text-slate-400">Phone ID:</span>
                  <span className={`font-bold ${statusData?.whatsapp?.phone_number_id_configured ? 'text-emerald-700' : 'text-slate-400'}`}>
                    {statusData?.whatsapp?.phone_number_id_configured ? 'مهيأ ✓' : 'غير مهيأ'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">WABA ID:</span>
                  <span className={`font-bold ${statusData?.whatsapp?.waba_id_configured ? 'text-emerald-700' : 'text-slate-400'}`}>
                    {statusData?.whatsapp?.waba_id_configured ? 'مهيأ ✓' : 'غير مهيأ'}
                  </span>
                </div>
                <div className="flex justify-between pt-1 border-t border-emerald-100">
                  <span className="text-slate-400">Status:</span>
                  <span className="font-bold text-emerald-700">{statusData?.whatsapp?.status || 'UNCONFIGURED'}</span>
                </div>
              </div>
            </div>

            <div className="pt-2 border-t border-emerald-100/60">
              <button
                onClick={() => handleTestPing('whatsapp')}
                disabled={testPingLoading['whatsapp']}
                className="w-full py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-bold rounded-xl transition flex items-center justify-center gap-1.5 shadow-2xs"
              >
                {testPingLoading['whatsapp'] ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Send className="w-3.5 h-3.5" />
                )}
                <span>اختبار اتصال (Test Ping)</span>
              </button>
              {testPingFeedback['whatsapp'] && (
                <p className="text-[10px] text-emerald-700 font-bold text-center pt-1 animate-in fade-in">
                  {testPingFeedback['whatsapp']}
                </p>
              )}
            </div>
          </div>

          {/* 2. Instagram Direct Graph API Card */}
          <div className="bg-pink-50/50 border border-pink-200/60 rounded-2xl p-3.5 space-y-2 relative overflow-hidden flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Instagram className="w-4 h-4 text-pink-600" />
                  <h3 className="text-xs font-bold text-slate-900">Instagram Direct</h3>
                </div>
                <span className={`text-[10px] px-2 py-0.5 rounded-full font-extrabold ${statusData?.instagram?.connected ? 'bg-pink-100 text-pink-800' : 'bg-slate-100 text-slate-600'}`}>
                  {statusData?.instagram?.connected ? 'متصل 🟢' : 'غير مهيأ ⚪'}
                </span>
              </div>

              <div className="space-y-1 text-[11px] text-slate-600 pt-2">
                <div className="flex justify-between">
                  <span className="text-slate-400">الصفحة:</span>
                  <span className="font-bold text-slate-800">{statusData?.instagram?.username || '@luxira.official'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Page ID:</span>
                  <span className={`font-bold ${statusData?.instagram?.page_id_configured ? 'text-pink-700' : 'text-slate-400'}`}>
                    {statusData?.instagram?.page_id_configured ? 'مهيأ ✓' : 'غير مهيأ'}
                  </span>
                </div>
                <div className="flex justify-between pt-1 border-t border-pink-100">
                  <span className="text-slate-400">Token Status:</span>
                  <span className="font-bold text-pink-700">{statusData?.instagram?.status || 'VALID'}</span>
                </div>
              </div>
            </div>

            <div className="pt-2 border-t border-pink-100/60">
              <button
                onClick={() => handleTestPing('instagram')}
                disabled={testPingLoading['instagram']}
                className="w-full py-1.5 bg-pink-600 hover:bg-pink-700 text-white text-[11px] font-bold rounded-xl transition flex items-center justify-center gap-1.5 shadow-2xs"
              >
                {testPingLoading['instagram'] ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Send className="w-3.5 h-3.5" />
                )}
                <span>اختبار اتصال (Test Ping)</span>
              </button>
              {testPingFeedback['instagram'] && (
                <p className="text-[10px] text-pink-700 font-bold text-center pt-1 animate-in fade-in">
                  {testPingFeedback['instagram']}
                </p>
              )}
            </div>
          </div>

          {/* 3. Facebook Messenger API Card */}
          <div className="bg-blue-50/50 border border-blue-200/60 rounded-2xl p-3.5 space-y-2 relative overflow-hidden flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Facebook className="w-4 h-4 text-[#1A73E8]" />
                  <h3 className="text-xs font-bold text-slate-900">Messenger</h3>
                </div>
                <span className={`text-[10px] px-2 py-0.5 rounded-full font-extrabold ${statusData?.messenger?.connected ? 'bg-blue-100 text-blue-800' : 'bg-slate-100 text-slate-600'}`}>
                  {statusData?.messenger?.connected ? 'متصل 🟢' : 'غير مهيأ ⚪'}
                </span>
              </div>

              <div className="space-y-1 text-[11px] text-slate-600 pt-2">
                <div className="flex justify-between">
                  <span className="text-slate-400">الصفحات:</span>
                  <span className="font-bold text-slate-800">{statusData?.messenger?.pages?.join(' / ') || 'LAVVA / LUXIRA'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Page ID:</span>
                  <span className={`font-bold ${statusData?.messenger?.page_id_configured ? 'text-blue-700' : 'text-slate-400'}`}>
                    {statusData?.messenger?.page_id_configured ? 'مهيأ ✓' : 'غير مهيأ'}
                  </span>
                </div>
                <div className="flex justify-between pt-1 border-t border-blue-100">
                  <span className="text-slate-400">Webhook:</span>
                  <span className="font-bold text-blue-700">{statusData?.messenger?.status || 'SUBSCRIBED'}</span>
                </div>
              </div>
            </div>

            <div className="pt-2 border-t border-blue-100/60">
              <button
                onClick={() => handleTestPing('messenger')}
                disabled={testPingLoading['messenger']}
                className="w-full py-1.5 bg-[#1A73E8] hover:bg-[#1557B0] text-white text-[11px] font-bold rounded-xl transition flex items-center justify-center gap-1.5 shadow-2xs"
              >
                {testPingLoading['messenger'] ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Send className="w-3.5 h-3.5" />
                )}
                <span>اختبار اتصال (Test Ping)</span>
              </button>
              {testPingFeedback['messenger'] && (
                <p className="text-[10px] text-blue-700 font-bold text-center pt-1 animate-in fade-in">
                  {testPingFeedback['messenger']}
                </p>
              )}
            </div>
          </div>

        </div>

        {/* Live Webhook Configuration Box */}
        <div className="bg-slate-50 border border-slate-200/80 rounded-2xl p-4 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-extrabold text-slate-800 flex items-center gap-2">
              <Globe className="w-4 h-4 text-[#1A73E8]" />
              رابط الويب هـوك المباشر (Meta Callback Webhook URL)
            </span>
            <span className="text-[10px] bg-emerald-50 text-emerald-700 border border-emerald-200 px-2.5 py-0.5 rounded-full font-bold flex items-center gap-1">
              <ShieldCheck className="w-3 h-3 text-emerald-600" />
              SSL & Signature Secured
            </span>
          </div>

          {/* Webhook URL Input with Copy Button */}
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <input
                type="text"
                readOnly
                value={webhookUrl}
                className="flex-1 bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-mono text-slate-800 focus:outline-none shadow-2xs select-all"
              />
              <button
                onClick={() => copyToClipboard(webhookUrl)}
                className="px-4 py-2 bg-[#1A73E8] hover:bg-[#1557B0] text-white text-xs font-bold rounded-xl transition shadow-2xs flex items-center gap-1.5 shrink-0"
              >
                {copiedUrl ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-emerald-300" />
                    <span>تم النسخ ✓</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" />
                    <span>نسخ الرابط</span>
                  </>
                )}
              </button>
            </div>

            {/* Verify Token Status (value intentionally never exposed) */}
            <div className="flex items-center justify-between text-xs pt-2 border-t border-slate-200/60">
              <span className="text-slate-500 font-medium">رمز التحقق (Verify Token):</span>
              <span className={`px-2.5 py-1 rounded-lg font-bold text-[11px] border ${verifyTokenConfigured ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-slate-100 border-slate-200 text-slate-500'}`}>
                {verifyTokenConfigured ? 'مهيأ ✓ Configured' : 'غير مهيأ ✗ Not configured'}
              </span>
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-between pt-2 border-t border-slate-100">
          <span className="text-[11px] text-slate-400 font-medium flex items-center gap-1">
            <RefreshCw className="w-3 h-3 text-slate-400" />
            تتم مزامنة الأحداث مباشرة عبر WebSockets & Meta Graph API v19.0
          </span>
          <button
            onClick={() => setIsIntegrationsModalOpen(false)}
            className="px-5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl transition"
          >
            إغلاق
          </button>
        </div>

      </div>
    </div>
  );
};
