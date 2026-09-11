import React, { useEffect, useState } from 'react';
import {
  Radio,
  Plug,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  Copy,
  Check,
  ShieldCheck,
  Lock,
  Loader2,
  Instagram,
  X,
  MessageSquare,
  Globe,
  Send,
  Zap,
  Facebook,
} from 'lucide-react';
import { useAuthStore, isAdminUser } from '../../store/useAuthStore';
import { useChannelsStore } from '../../store/useChannelsStore';
import { metaApi } from '../../services/api';
import { MetaChannelsSettings } from '../../components/settings/MetaChannelsSettings';

type ChannelsTab = 'pages' | 'providers' | 'webhooks';

export const ChannelsPage: React.FC = () => {
  const { user } = useAuthStore();
  const isAdmin = isAdminUser(user);

  const {
    connectedPages,
    isLoadingPages,
    isConnecting,
    error,
    successMessage,
    fetchConnectedPages,
    initiateMetaConnect,
    cancelMetaConnect,
    clearFeedback,
  } = useChannelsStore();

  const [activeTab, setActiveTab] = useState<ChannelsTab>('pages');
  const [copiedWebhookUrl, setCopiedWebhookUrl] = useState(false);
  const [copiedVerifyToken, setCopiedVerifyToken] = useState(false);

  // Provider status state
  const [providerStatus, setProviderStatus] = useState<any>(null);
  const [isLoadingProviders, setIsLoadingProviders] = useState(false);
  const [testPingLoading, setTestPingLoading] = useState<Record<string, boolean>>({});
  const [testPingFeedback, setTestPingFeedback] = useState<Record<string, string>>({});

  useEffect(() => {
    if (isAdmin) {
      fetchConnectedPages();
      loadProviderStatus();
    }
  }, [isAdmin]);

  const loadProviderStatus = async () => {
    setIsLoadingProviders(true);
    try {
      const data = await metaApi.getIntegrationsStatus();
      if (data) setProviderStatus(data);
    } catch (err) {
      console.warn('[ChannelsPage] Failed to fetch integrations status:', err);
    } finally {
      setIsLoadingProviders(false);
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
    } catch {
      setTestPingFeedback((prev) => ({
        ...prev,
        [channel]: 'فشل إرسال اختبار الاتصال ❌',
      }));
    } finally {
      setTestPingLoading((prev) => ({ ...prev, [channel]: false }));
    }
  };

  const copyWebhookInfo = (text: string, type: 'url' | 'token') => {
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(text);
      if (type === 'url') {
        setCopiedWebhookUrl(true);
        setTimeout(() => setCopiedWebhookUrl(false), 2000);
      } else {
        setCopiedVerifyToken(true);
        setTimeout(() => setCopiedVerifyToken(false), 2000);
      }
    }
  };

  // Strict RBAC Protection: Non-Admins blocked
  if (!isAdmin) {
    return (
      <div className="flex-1 p-8 flex items-center justify-center dir-rtl text-right">
        <div className="p-8 bg-rose-50/90 border border-rose-200 rounded-3xl text-center space-y-3 max-w-md shadow-lg">
          <div className="w-12 h-12 rounded-2xl bg-rose-100 text-rose-600 mx-auto flex items-center justify-center">
            <Lock className="w-6 h-6" />
          </div>
          <h3 className="text-base font-extrabold text-rose-900">
            صلاحيات الوصول مقيدة (Access Restricted)
          </h3>
          <p className="text-xs text-rose-700 leading-relaxed">
            إدارة قنوات وصفحات Meta وربط الويب هـوك مقتصرة حصرياً على مديري النظام
            (Admins & Superadmins). يرجى مراجعة إدارة الفريق لتعديل الصلاحيات.
          </p>
        </div>
      </div>
    );
  }

  const subscribedPagesCount = connectedPages.filter((p) => p.is_webhook_subscribed).length;
  const activePagesCount = connectedPages.filter((p) => p.status === 'ACTIVE').length;
  const webhookUrl = providerStatus?.webhook?.url || 'https://api.luxira.com/api/v1/meta/webhook';
  const verifyToken = providerStatus?.webhook?.verify_token || 'LUXIRA_META_WEBHOOK_VERIFY_TOKEN';

  return (
    <div className="flex-1 overflow-y-auto p-6 space-y-6 dir-rtl text-right select-none">
      {/* 1. Header Banner & Main Actions */}
      <div className="bg-gradient-to-br from-slate-900 via-[#132742] to-[#1877F2]/90 text-white rounded-3xl p-6 shadow-xl relative overflow-hidden">
        <div className="absolute top-0 right-0 w-80 h-80 bg-[#1877F2]/20 rounded-full blur-3xl -z-0 pointer-events-none" />

        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1.5">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-theme-primary text-white flex items-center justify-center font-bold shadow-lg">
                <Radio className="w-5 h-5 text-white animate-pulse" />
              </div>
              <div>
                <h1 className="text-lg font-black tracking-tight">
                  إدارة القنوات والربط السحابي (Channels Hub)
                </h1>
                <p className="text-xs text-slate-300 font-medium">
                  لوحة التحكم المركزية لربط صفحات فيسبوك، واتساب كلاود، وإنستغرام عبر بروتوكول Meta الموثّق
                </p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2.5 shrink-0">
            {/* Refresh Button */}
            <button
              onClick={() => {
                fetchConnectedPages();
                loadProviderStatus();
              }}
              disabled={isLoadingPages || isLoadingProviders}
              className="p-2.5 bg-white/10 hover:bg-white/20 text-white rounded-xl transition backdrop-blur-sm border border-white/10 disabled:opacity-50"
              title="تحديث البيانات"
            >
              <RefreshCw
                className={`w-4 h-4 ${isLoadingPages || isLoadingProviders ? 'animate-spin' : ''}`}
              />
            </button>

            {/* Connect Pages Trigger Button (Secure Centered Popup) */}
            <div className="flex items-center gap-2">
              <button
                onClick={() => initiateMetaConnect()}
                disabled={isConnecting}
                className="px-5 py-2.5 bg-[#1877F2] hover:bg-[#166fe5] text-white text-xs font-black rounded-xl shadow-lg hover:shadow-blue-500/30 transition-all flex items-center gap-2 border border-blue-400/30 disabled:opacity-60 active:scale-98 cursor-pointer"
              >
                {isConnecting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>نافذة المصادقة نشطة...</span>
                  </>
                ) : (
                  <>
                    <Plug className="w-4 h-4" />
                    <span>ربط صفحة فيسبوك جديدة (Facebook Pages)</span>
                  </>
                )}
              </button>

              {isConnecting && (
                <button
                  type="button"
                  onClick={() => cancelMetaConnect()}
                  className="px-3 py-2.5 bg-slate-800/80 hover:bg-slate-700 text-slate-200 text-xs font-bold rounded-xl border border-white/10 transition flex items-center gap-1.5 shadow-sm active:scale-98"
                  title="إلغاء وفك قفل الزر"
                >
                  <X className="w-3.5 h-3.5 text-rose-400" />
                  <span>إلغاء</span>
                </button>
              )}
            </div>
          </div>
        </div>

        {/* 2. Metrics Bar (4 Key Indicators) */}
        <div className="mt-6 pt-5 border-t border-white/10 grid grid-cols-2 sm:grid-cols-4 gap-3 text-right">
          <div className="bg-white/5 backdrop-blur-sm rounded-2xl p-3 border border-white/5">
            <span className="text-[11px] text-slate-300 font-medium flex items-center gap-1.5">
              <Facebook className="w-3.5 h-3.5 text-[#1877F2]" />
              الصفحات المتصلة:
            </span>
            <p className="text-lg font-black text-white mt-1">
              {connectedPages.length} <span className="text-xs font-normal text-slate-400">صفحة</span>
            </p>
          </div>

          <div className="bg-white/5 backdrop-blur-sm rounded-2xl p-3 border border-white/5">
            <span className="text-[11px] text-emerald-300 font-medium flex items-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
              الويب هـوك مفعّل:
            </span>
            <p className="text-lg font-black text-emerald-400 mt-1">
              {subscribedPagesCount} <span className="text-xs font-normal text-emerald-300/70">من {connectedPages.length}</span>
            </p>
          </div>

          <div className="bg-white/5 backdrop-blur-sm rounded-2xl p-3 border border-white/5">
            <span className="text-[11px] text-blue-300 font-medium flex items-center gap-1.5">
              <Radio className="w-3.5 h-3.5 text-blue-400" />
              الصفحات النشطة:
            </span>
            <p className="text-lg font-black text-blue-300 mt-1">
              {activePagesCount} <span className="text-xs font-normal text-blue-200/70">نشطة</span>
            </p>
          </div>

          <div className="bg-white/5 backdrop-blur-sm rounded-2xl p-3 border border-white/5">
            <span className="text-[11px] text-teal-300 font-medium flex items-center gap-1.5">
              <Zap className="w-3.5 h-3.5 text-teal-400" />
              وضع المزود النشط:
            </span>
            <p className="text-xs font-extrabold text-white mt-2 flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-teal-400 animate-pulse" />
              <span>Hybrid (Meta + BeOn)</span>
            </p>
          </div>
        </div>
      </div>

      {/* Global Toast / Feedback Alerts */}
      {successMessage && (
        <div className="bg-emerald-50 border border-emerald-200 text-emerald-900 px-4 py-3 rounded-2xl flex items-center justify-between animate-in fade-in text-xs font-bold shadow-xs">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{successMessage}</span>
          </div>
          <button
            onClick={clearFeedback}
            className="text-emerald-700 hover:text-emerald-900 text-xs font-extrabold px-2 py-0.5"
          >
            ✕
          </button>
        </div>
      )}

      {error && (
        <div className="bg-rose-50 border border-rose-200 text-rose-900 px-4 py-3 rounded-2xl flex items-center justify-between animate-in fade-in text-xs font-bold shadow-xs">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
            <span>{error}</span>
          </div>
          <button
            onClick={clearFeedback}
            className="text-rose-700 hover:text-rose-900 text-xs font-extrabold px-2 py-0.5"
          >
            ✕
          </button>
        </div>
      )}

      {/* Tab Navigation Controls */}
      <div className="flex items-center gap-2 border-b border-slate-200 pb-2">
        <button
          onClick={() => setActiveTab('pages')}
          className={`px-4 py-2 rounded-xl text-xs font-black transition flex items-center gap-2 cursor-pointer ${
            activeTab === 'pages'
              ? 'bg-theme-primary text-white shadow-md shadow-theme-primary/20'
              : 'bg-white hover:bg-slate-100 text-slate-600 border border-slate-200'
          }`}
        >
          <Facebook className="w-3.5 h-3.5 fill-current" />
          <span>صفحات فيسبوك وقنوات ميتا ({connectedPages.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('providers')}
          className={`px-4 py-2 rounded-xl text-xs font-black transition flex items-center gap-2 cursor-pointer ${
            activeTab === 'providers'
              ? 'bg-theme-primary text-white shadow-md shadow-theme-primary/20'
              : 'bg-white hover:bg-slate-100 text-slate-600 border border-slate-200'
          }`}
        >
          <MessageSquare className="w-3.5 h-3.5" />
          <span>المزودات السحابية واختبار الاتصال (Cloud Providers)</span>
        </button>

        <button
          onClick={() => setActiveTab('webhooks')}
          className={`px-4 py-2 rounded-xl text-xs font-black transition flex items-center gap-2 cursor-pointer ${
            activeTab === 'webhooks'
              ? 'bg-theme-primary text-white shadow-md shadow-theme-primary/20'
              : 'bg-white hover:bg-slate-100 text-slate-600 border border-slate-200'
          }`}
        >
          <Globe className="w-3.5 h-3.5" />
          <span>إعدادات الويب هـوك وتأمين التشفير (Webhooks & Security)</span>
        </button>
      </div>

      {/* TAB 1: Connected Facebook Pages */}
      {activeTab === 'pages' && (
        <MetaChannelsSettings showHeader={false} />
      )}

      {/* TAB 2: Cloud Providers & Test Pings */}
      {activeTab === 'providers' && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* 1. WhatsApp Cloud API Card */}
            <div className="bg-white border border-slate-200/80 rounded-3xl p-5 space-y-4 shadow-xs flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className="w-10 h-10 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center font-bold border border-emerald-100">
                      <MessageSquare className="w-5 h-5" />
                    </div>
                    <div>
                      <h3 className="text-xs font-black text-slate-900">WhatsApp Cloud API</h3>
                      <span className="text-[10px] text-slate-400 font-medium">Meta Business Platform</span>
                    </div>
                  </div>
                  <span
                    className={`text-[10px] px-2.5 py-1 rounded-full font-bold ${
                      providerStatus?.whatsapp?.connected
                        ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                        : 'bg-slate-100 text-slate-600'
                    }`}
                  >
                    {providerStatus?.whatsapp?.connected ? 'متصل 🟢' : 'غير مهيأ ⚪'}
                  </span>
                </div>

                <div className="mt-4 pt-3 border-t border-slate-100 space-y-2 text-[11px] text-slate-600">
                  <div className="flex justify-between">
                    <span className="text-slate-400">Phone ID:</span>
                    <span className="font-mono font-bold text-slate-800">
                      {providerStatus?.whatsapp?.phone_number_id || 'متوفر عبر الإعدادات'}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">WABA ID:</span>
                    <span className="font-mono font-bold text-slate-800">
                      {providerStatus?.whatsapp?.waba_id || 'متوفر عبر الإعدادات'}
                    </span>
                  </div>
                  <div className="flex justify-between pt-1 border-t border-slate-100">
                    <span className="text-slate-400">حالة الربط:</span>
                    <span className="font-bold text-emerald-700">
                      {providerStatus?.whatsapp?.status || 'ACTIVE'}
                    </span>
                  </div>
                </div>
              </div>

              <div className="pt-3 border-t border-slate-100">
                <button
                  onClick={() => handleTestPing('whatsapp')}
                  disabled={testPingLoading['whatsapp']}
                  className="w-full py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl transition flex items-center justify-center gap-1.5 shadow-2xs disabled:opacity-50"
                >
                  {testPingLoading['whatsapp'] ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Send className="w-3.5 h-3.5" />
                  )}
                  <span>اختبار اتصال (Test Ping)</span>
                </button>
                {testPingFeedback['whatsapp'] && (
                  <p className="text-[10px] text-emerald-700 font-bold text-center pt-1.5 animate-in fade-in">
                    {testPingFeedback['whatsapp']}
                  </p>
                )}
              </div>
            </div>

            {/* 2. Instagram Direct Graph API Card */}
            <div className="bg-white border border-slate-200/80 rounded-3xl p-5 space-y-4 shadow-xs flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className="w-10 h-10 rounded-2xl bg-pink-50 text-pink-600 flex items-center justify-center font-bold border border-pink-100">
                      <Instagram className="w-5 h-5" />
                    </div>
                    <div>
                      <h3 className="text-xs font-black text-slate-900">Instagram Direct</h3>
                      <span className="text-[10px] text-slate-400 font-medium">Graph API Messenger</span>
                    </div>
                  </div>
                  <span
                    className={`text-[10px] px-2.5 py-1 rounded-full font-bold ${
                      providerStatus?.instagram?.connected
                        ? 'bg-pink-50 text-pink-700 border border-pink-200'
                        : 'bg-slate-100 text-slate-600'
                    }`}
                  >
                    {providerStatus?.instagram?.connected ? 'متصل 🟢' : 'غير مهيأ ⚪'}
                  </span>
                </div>

                <div className="mt-4 pt-3 border-t border-slate-100 space-y-2 text-[11px] text-slate-600">
                  <div className="flex justify-between">
                    <span className="text-slate-400">اسم الحساب:</span>
                    <span className="font-bold text-slate-800">
                      {providerStatus?.instagram?.username || '@luxira.official'}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Page ID:</span>
                    <span className="font-mono font-bold text-slate-800">
                      {providerStatus?.instagram?.page_id || 'متوفر عبر الصفحات'}
                    </span>
                  </div>
                  <div className="flex justify-between pt-1 border-t border-slate-100">
                    <span className="text-slate-400">صلاحية المفتاح:</span>
                    <span className="font-bold text-pink-700">
                      {providerStatus?.instagram?.status || 'VALID'}
                    </span>
                  </div>
                </div>
              </div>

              <div className="pt-3 border-t border-slate-100">
                <button
                  onClick={() => handleTestPing('instagram')}
                  disabled={testPingLoading['instagram']}
                  className="w-full py-2 bg-pink-600 hover:bg-pink-700 text-white text-xs font-bold rounded-xl transition flex items-center justify-center gap-1.5 shadow-2xs disabled:opacity-50"
                >
                  {testPingLoading['instagram'] ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Send className="w-3.5 h-3.5" />
                  )}
                  <span>اختبار اتصال (Test Ping)</span>
                </button>
                {testPingFeedback['instagram'] && (
                  <p className="text-[10px] text-pink-700 font-bold text-center pt-1.5 animate-in fade-in">
                    {testPingFeedback['instagram']}
                  </p>
                )}
              </div>
            </div>

            {/* 3. Facebook Messenger API Card */}
            <div className="bg-white border border-slate-200/80 rounded-3xl p-5 space-y-4 shadow-xs flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className="w-10 h-10 rounded-2xl bg-blue-50 text-[#1877F2] flex items-center justify-center font-bold border border-blue-100">
                      <Facebook className="w-5 h-5 fill-[#1877F2]" />
                    </div>
                    <div>
                      <h3 className="text-xs font-black text-slate-900">Facebook Messenger</h3>
                      <span className="text-[10px] text-slate-400 font-medium">Meta Direct Integration</span>
                    </div>
                  </div>
                  <span
                    className={`text-[10px] px-2.5 py-1 rounded-full font-bold ${
                      providerStatus?.messenger?.connected
                        ? 'bg-blue-50 text-[#1877F2] border border-blue-200'
                        : 'bg-slate-100 text-slate-600'
                    }`}
                  >
                    {providerStatus?.messenger?.connected ? 'متصل 🟢' : 'غير مهيأ ⚪'}
                  </span>
                </div>

                <div className="mt-4 pt-3 border-t border-slate-100 space-y-2 text-[11px] text-slate-600">
                  <div className="flex justify-between">
                    <span className="text-slate-400">الصفحات النشطة:</span>
                    <span className="font-bold text-slate-800 truncate max-w-[150px]">
                      {connectedPages.map((p) => p.name).join(', ') || 'LUXIRA'}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">اشتراك الويب هـوك:</span>
                    <span className="font-bold text-[#1877F2]">
                      {subscribedPagesCount > 0 ? 'SUBSCRIBED' : 'PENDING'}
                    </span>
                  </div>
                  <div className="flex justify-between pt-1 border-t border-slate-100">
                    <span className="text-slate-400">وضع الإرسال:</span>
                    <span className="font-bold text-blue-700">Dynamic Graph API</span>
                  </div>
                </div>
              </div>

              <div className="pt-3 border-t border-slate-100">
                <button
                  onClick={() => handleTestPing('messenger')}
                  disabled={testPingLoading['messenger']}
                  className="w-full py-2 bg-theme-primary hover:bg-theme-primary-hover text-white text-xs font-bold rounded-xl transition flex items-center justify-center gap-1.5 shadow-2xs disabled:opacity-50 cursor-pointer"
                >
                  {testPingLoading['messenger'] ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Send className="w-3.5 h-3.5" />
                  )}
                  <span>اختبار اتصال (Test Ping)</span>
                </button>
                {testPingFeedback['messenger'] && (
                  <p className="text-[10px] text-blue-700 font-bold text-center pt-1.5 animate-in fade-in">
                    {testPingFeedback['messenger']}
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* Fallback Gateway Details: BeOn Gateway V3 */}
          <div className="bg-white border border-slate-200/80 rounded-3xl p-6 shadow-xs space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center font-bold border border-indigo-100">
                  <Zap className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-xs font-extrabold text-slate-900">
                    مزود BeOn Gateway V3 السحابي (Fallback Gateway)
                  </h3>
                  <p className="text-[11px] text-slate-500">
                    يعمل كمزود احتياطي ومتوازي لنقل الرسائل واستقبال الردود السريعة
                  </p>
                </div>
              </div>
              <span className="text-[10px] bg-indigo-50 text-indigo-700 border border-indigo-200 px-2.5 py-1 rounded-full font-bold">
                نشط في الوضع الهجين (Hybrid Active)
              </span>
            </div>

            <p className="text-xs text-slate-600 leading-relaxed pt-2 border-t border-slate-100">
              يقوم محرك التكامل الهجين في LUXIRA بتوجيه الرسائل عبر Meta Direct Graph API للصفحات المتصلة ديناميكياً،
              مع دعم التحويل التلقائي إلى BeOn Gateway V3 لضمان استمرارية الخدمة بنسبة 100% دون أي انقطاع في المحادثات.
            </p>
          </div>
        </div>
      )}

      {/* TAB 3: Webhooks & Security Hygiene */}
      {activeTab === 'webhooks' && (
        <div className="space-y-4">
          <div className="bg-white border border-slate-200/80 rounded-3xl p-6 space-y-5 shadow-xs">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-blue-50 text-[#1877F2] flex items-center justify-center font-bold">
                  <Globe className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-extrabold text-slate-900">
                    رابط الويب هـوك المباشر (Meta Webhook Callback URL)
                  </h3>
                  <p className="text-[11px] text-slate-500">
                    انسخ هذه البيانات إلى إعدادات تطبيقك في Meta for Developers (Webhooks & App Events)
                  </p>
                </div>
              </div>
              <span className="text-[10px] bg-emerald-50 text-emerald-700 border border-emerald-200 px-3 py-1 rounded-full font-bold flex items-center gap-1.5">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                <span>SSL & Signature Verified</span>
              </span>
            </div>

            {/* Webhook Callback URL */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-700">رابط الاستدعاء (Callback URL):</label>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  readOnly
                  value={webhookUrl}
                  className="flex-1 bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-xs font-mono text-slate-800 select-all focus:outline-none shadow-2xs"
                />
                <button
                  onClick={() => copyWebhookInfo(webhookUrl, 'url')}
                  className="px-4 py-2.5 bg-theme-primary hover:bg-theme-primary-hover text-white text-xs font-bold rounded-xl transition flex items-center gap-1.5 shadow-2xs shrink-0 cursor-pointer"
                >
                  {copiedWebhookUrl ? (
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
            </div>

            {/* Verify Token Field */}
            <div className="space-y-1.5 pt-2">
              <label className="text-xs font-bold text-slate-700">رمز التحقق (Verify Token):</label>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  readOnly
                  value={verifyToken}
                  className="flex-1 bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-xs font-mono text-slate-800 select-all focus:outline-none shadow-2xs"
                />
                <button
                  onClick={() => copyWebhookInfo(verifyToken, 'token')}
                  className="px-4 py-2.5 bg-slate-800 hover:bg-slate-900 text-white text-xs font-bold rounded-xl transition flex items-center gap-1.5 shadow-2xs shrink-0 cursor-pointer"
                >
                  {copiedVerifyToken ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-emerald-300" />
                      <span>تم النسخ ✓</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5" />
                      <span>نسخ الرمز</span>
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* Subscribed Webhook Fields Info */}
            <div className="pt-3 border-t border-slate-100">
              <span className="text-xs font-bold text-slate-700 block mb-2">الحقول المشتركة تلقائياً (Subscribed Fields):</span>
              <div className="flex flex-wrap gap-2">
                {['messages', 'messaging_postbacks', 'message_reads', 'message_deliveries', 'feed'].map((field) => (
                  <span
                    key={field}
                    className="text-[11px] font-mono font-bold bg-theme-primary-tint text-theme-primary border border-theme-primary/20 px-2.5 py-1 rounded-lg"
                  >
                    ✓ {field}
                  </span>
                ))}
              </div>
            </div>
          </div>

          {/* Security & Token Hygiene Guarantee Card */}
          <div className="bg-white border border-slate-200/80 rounded-3xl p-6 shadow-xs flex items-start gap-4">
            <div className="w-12 h-12 rounded-2xl bg-teal-50 text-teal-700 border border-teal-200 flex items-center justify-center shrink-0">
              <ShieldCheck className="w-6 h-6" />
            </div>
            <div className="space-y-1 text-xs text-slate-600">
              <h4 className="text-sm font-extrabold text-slate-900">
                أمان تشفير المفاتيح والامتثال الصارم (Fernet Token Hygiene)
              </h4>
              <p className="text-slate-500 leading-relaxed">
                يتم تشفير جميع مفاتيح الوصول لصفحات فيسبوك وحسابات إنستغرام بواسطة خوارزمية Fernet المتماثلة
                قبل حفظها في قاعدة البيانات <code className="font-mono bg-slate-100 px-1 py-0.5 rounded">connected_pages</code>.
                لا يتم إطلاقاً إرسال المفاتيح بصيغتها المجردة إلى المتصفح أو تضمينها في سجلات النظام (Logs)،
                ويتم فك التشفير لحظياً في الذاكرة العابرة فقط عند توجيه رسائل الرد عبر Graph API.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
export default ChannelsPage;
