import React, { useEffect, useState, useMemo } from 'react';
import {
  Layers,
  Facebook,
  Radio,
  Plug,
  RefreshCw,
  CheckCircle2,
  Clock,
  AlertCircle,
  Copy,
  Check,
  ShieldCheck,
  Lock,
  Loader2,
  Instagram,
  Sparkles,
  X,
  MessageSquare,
  Globe,
  Send,
  Search,
  Trash2,
  Power,
  Zap,
  Tag,
  ExternalLink,
  ChevronDown,
} from 'lucide-react';
import { useAuthStore, isAdminUser } from '../../store/useAuthStore';
import { useChannelsStore } from '../../store/useChannelsStore';
import { metaApi } from '../../services/api';
import { MOCK_BRANDS } from '../../constants/brands';

type ChannelsTab = 'pages' | 'providers' | 'webhooks';

export const ChannelsPage: React.FC = () => {
  const { user } = useAuthStore();
  const isAdmin = isAdminUser(user);

  const {
    connectedPages,
    isLoadingPages,
    isConnecting,
    actionLoadingMap,
    error,
    successMessage,
    fetchConnectedPages,
    initiateMetaConnect,
    cancelMetaConnect,
    subscribePageWebhook,
    togglePageStatus,
    disconnectPage,
    syncPageHistory,
    clearFeedback,
  } = useChannelsStore();

  const [activeTab, setActiveTab] = useState<ChannelsTab>('pages');
  const [searchQuery, setSearchQuery] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [copiedWebhookUrl, setCopiedWebhookUrl] = useState(false);
  const [copiedVerifyToken, setCopiedVerifyToken] = useState(false);

  // Provider status state
  const [providerStatus, setProviderStatus] = useState<any>(null);
  const [isLoadingProviders, setIsLoadingProviders] = useState(false);
  const [testPingLoading, setTestPingLoading] = useState<Record<string, boolean>>({});
  const [testPingFeedback, setTestPingFeedback] = useState<Record<string, string>>({});

  // Page-to-Brand association mapping (saved in localStorage for persistence)
  const [pageBrandMap, setPageBrandMap] = useState<Record<string, string>>(() => {
    try {
      const stored = localStorage.getItem('crm_page_brand_associations');
      return stored ? JSON.parse(stored) : {};
    } catch {
      return {};
    }
  });

  // Disconnect confirmation modal state
  const [pageToDelete, setPageToDelete] = useState<{ id: string; name: string } | null>(null);

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

  const handleBrandChange = (pageId: string, brandId: string) => {
    const updated = { ...pageBrandMap, [pageId]: brandId };
    setPageBrandMap(updated);
    try {
      localStorage.setItem('crm_page_brand_associations', JSON.stringify(updated));
    } catch {}
  };

  const copyToClipboard = (text: string, id: string) => {
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(text);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
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

  const filteredPages = useMemo(() => {
    if (!searchQuery.trim()) return connectedPages;
    const q = searchQuery.toLowerCase();
    return connectedPages.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        p.page_id.toLowerCase().includes(q) ||
        (p.category && p.category.toLowerCase().includes(q))
    );
  }, [connectedPages, searchQuery]);

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
              <div className="w-10 h-10 rounded-2xl bg-[#1877F2] text-white flex items-center justify-center font-bold shadow-lg">
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
          className={`px-4 py-2 rounded-xl text-xs font-black transition flex items-center gap-2 ${
            activeTab === 'pages'
              ? 'bg-[#1877F2] text-white shadow-md shadow-blue-500/20'
              : 'bg-white hover:bg-slate-100 text-slate-600 border border-slate-200'
          }`}
        >
          <Facebook className="w-3.5 h-3.5 fill-current" />
          <span>صفحات فيسبوك وقنوات ميتا ({connectedPages.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('providers')}
          className={`px-4 py-2 rounded-xl text-xs font-black transition flex items-center gap-2 ${
            activeTab === 'providers'
              ? 'bg-teal-600 text-white shadow-md shadow-teal-500/20'
              : 'bg-white hover:bg-slate-100 text-slate-600 border border-slate-200'
          }`}
        >
          <MessageSquare className="w-3.5 h-3.5" />
          <span>المزودات السحابية واختبار الاتصال (Cloud Providers)</span>
        </button>

        <button
          onClick={() => setActiveTab('webhooks')}
          className={`px-4 py-2 rounded-xl text-xs font-black transition flex items-center gap-2 ${
            activeTab === 'webhooks'
              ? 'bg-slate-900 text-white shadow-md'
              : 'bg-white hover:bg-slate-100 text-slate-600 border border-slate-200'
          }`}
        >
          <Globe className="w-3.5 h-3.5" />
          <span>إعدادات الويب هـوك وتأمين التشفير (Webhooks & Security)</span>
        </button>
      </div>

      {/* TAB 1: Connected Facebook Pages */}
      {activeTab === 'pages' && (
        <div className="space-y-4">
          {/* Subheader & Search filter */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="relative flex-1 max-w-md">
              <Search className="w-4 h-4 text-slate-400 absolute right-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="البحث باسم الصفحة أو معرف Page ID..."
                className="w-full bg-white border border-slate-200/80 rounded-2xl pr-10 pl-4 py-2 text-xs font-medium text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-[#1877F2]/20 focus:border-[#1877F2] shadow-2xs"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            <div className="flex items-center gap-2">
              <span className="text-[11px] text-slate-400 font-medium">
                يتم تحديث البيانات وتشفير المفاتيح لحظياً في قاعدة البيانات
              </span>
            </div>
          </div>

          {/* Page Cards Grid */}
          {isLoadingPages && connectedPages.length === 0 ? (
            <div className="p-16 text-center bg-white border border-slate-200/80 rounded-3xl space-y-3">
              <Loader2 className="w-8 h-8 text-[#1877F2] animate-spin mx-auto" />
              <p className="text-xs text-slate-500 font-bold">جارٍ تحميل قائمة الصفحات المتصلة...</p>
            </div>
          ) : filteredPages.length === 0 ? (
            <div className="bg-white border-2 border-dashed border-slate-200 rounded-3xl p-12 text-center space-y-4 shadow-xs">
              <div className="w-16 h-16 rounded-3xl bg-blue-50 text-[#1877F2] mx-auto flex items-center justify-center">
                <Facebook className="w-8 h-8 fill-[#1877F2]" />
              </div>
              <div className="space-y-1 max-w-md mx-auto">
                <h3 className="text-sm font-extrabold text-slate-800">
                  {searchQuery ? 'لا توجد صفحات مطابقة لنتيجة البحث' : 'لا توجد صفحات فيسبوك متصلة حتى الآن'}
                </h3>
                <p className="text-xs text-slate-500 leading-relaxed">
                  {searchQuery
                    ? 'جرب البحث بمعرف أو اسم مختلف.'
                    : 'ابدأ بالضغط على زر "ربط صفحة فيسبوك جديدة" أعلاه لفتح نافذة OAuth الآمنة واختيار الصفحات المصرح بها.'}
                </p>
              </div>

              {!searchQuery && (
                <button
                  onClick={() => initiateMetaConnect()}
                  disabled={isConnecting}
                  className="px-5 py-2.5 bg-[#1877F2] hover:bg-[#166fe5] text-white text-xs font-bold rounded-xl shadow-md transition inline-flex items-center gap-2"
                >
                  <Plug className="w-4 h-4" />
                  <span>بدء عملية الربط الآن</span>
                </button>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {filteredPages.map((page) => {
                const isSubscribed = page.is_webhook_subscribed;
                const isActive = page.status === 'ACTIVE';
                const isSubscribing = actionLoadingMap[`sub_${page.page_id}`];
                const isStatusToggling = actionLoadingMap[`status_${page.page_id}`];
                const isSyncing = actionLoadingMap[`sync_${page.page_id}`];
                const isDeleting = actionLoadingMap[`del_${page.page_id}`];
                const selectedBrand = pageBrandMap[page.page_id] || 'LAVVA';

                return (
                  <div
                    key={page.id}
                    className="bg-white border border-slate-200/80 rounded-3xl p-5 shadow-xs hover:shadow-md transition-all space-y-4 flex flex-col justify-between relative overflow-hidden"
                  >
                    {/* Top Row: Avatar, Page Name, Category & Status Pill */}
                    <div>
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="w-12 h-12 rounded-2xl bg-blue-50 border border-blue-100 flex items-center justify-center text-[#1877F2] shrink-0 font-bold shadow-2xs">
                            <Facebook className="w-6 h-6 fill-[#1877F2]" />
                          </div>
                          <div className="min-w-0">
                            <h3 className="text-sm font-extrabold text-slate-900 truncate">
                              {page.name}
                            </h3>
                            <span className="text-[11px] text-slate-400 font-medium">
                              {page.category || 'Business Page'}
                            </span>
                          </div>
                        </div>

                        {/* Status Toggle Badge */}
                        <button
                          onClick={() => togglePageStatus(page.page_id, page.status)}
                          disabled={isStatusToggling}
                          className={`text-[11px] px-3 py-1 rounded-full font-extrabold flex items-center gap-1.5 transition border cursor-pointer ${
                            isActive
                              ? 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100'
                              : 'bg-slate-100 text-slate-600 border-slate-200 hover:bg-slate-200'
                          }`}
                          title="اضغط لتغيير حالة تشغيل الصفحة"
                        >
                          {isStatusToggling ? (
                            <Loader2 className="w-3 h-3 animate-spin text-slate-600" />
                          ) : (
                            <Power className={`w-3 h-3 ${isActive ? 'text-emerald-500' : 'text-slate-400'}`} />
                          )}
                          <span>{isActive ? 'نشط (Active)' : 'معطل (Inactive)'}</span>
                        </button>
                      </div>

                      {/* Detail Metrics & IDs */}
                      <div className="mt-4 pt-3.5 border-t border-slate-100 space-y-2 text-xs text-slate-600">
                        {/* Page ID with quick copy */}
                        <div className="flex items-center justify-between">
                          <span className="text-slate-400 text-[11px]">معرف الصفحة (Page ID):</span>
                          <div className="flex items-center gap-1.5 font-mono text-[11px] font-bold text-slate-800 bg-slate-50 px-2 py-0.5 rounded-lg border border-slate-200/60">
                            <span>{page.page_id}</span>
                            <button
                              onClick={() => copyToClipboard(page.page_id, page.id)}
                              className="p-1 rounded text-slate-400 hover:text-slate-700 hover:bg-white transition"
                              title="نسخ معرف الصفحة"
                            >
                              {copiedId === page.id ? (
                                <Check className="w-3 h-3 text-emerald-600" />
                              ) : (
                                <Copy className="w-3 h-3" />
                              )}
                            </button>
                          </div>
                        </div>

                        {/* Linked Instagram Account if exists */}
                        {page.instagram_business_account_id && (
                          <div className="flex items-center justify-between">
                            <span className="text-slate-400 text-[11px] flex items-center gap-1">
                              <Instagram className="w-3 h-3 text-pink-600" />
                              حساب إنستغرام المرتبط:
                            </span>
                            <span className="font-mono text-[11px] font-bold text-pink-700 bg-pink-50 px-2 py-0.5 rounded-md border border-pink-100">
                              {page.instagram_business_account_id}
                            </span>
                          </div>
                        )}

                        {/* Webhook Subscription Status */}
                        <div className="flex items-center justify-between pt-0.5">
                          <span className="text-slate-400 text-[11px]">اشتراك الويب هـوك:</span>
                          {isSubscribed ? (
                            <span className="text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 px-2 py-0.5 rounded-full flex items-center gap-1">
                              <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                              <span>مفعّل تلقائياً (Subscribed)</span>
                            </span>
                          ) : (
                            <span className="text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200 px-2 py-0.5 rounded-full flex items-center gap-1">
                              <Clock className="w-3 h-3 text-amber-600" />
                              <span>معلق (Pending Subscription)</span>
                            </span>
                          )}
                        </div>

                        {/* Brand Association Selector */}
                        <div className="flex items-center justify-between pt-1 border-t border-slate-100">
                          <span className="text-slate-400 text-[11px] flex items-center gap-1">
                            <Tag className="w-3 h-3 text-slate-400" />
                            ربط العلامة التجارية (Brand):
                          </span>
                          <select
                            value={selectedBrand}
                            onChange={(e) => handleBrandChange(page.page_id, e.target.value)}
                            className="bg-slate-50 text-[11px] font-bold text-slate-700 px-2.5 py-1 rounded-xl border border-slate-200 focus:outline-none cursor-pointer"
                          >
                            {MOCK_BRANDS.filter((b) => b.id !== 'all').map((b) => (
                              <option key={b.id} value={b.name}>
                                {b.name}
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>
                    </div>

                    {/* Bottom Action Controls: Sync Webhook, Pull History & Disconnect */}
                    <div className="pt-3 border-t border-slate-100 flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {/* Sync Webhook Button */}
                        <button
                          onClick={() => subscribePageWebhook(page.page_id)}
                          disabled={isSubscribing}
                          className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-[11px] font-bold rounded-xl transition flex items-center gap-1.5 border border-slate-200/80 disabled:opacity-50"
                          title="تحديث وإعادة تفعيل اشتراك الويب هـوك عبر Meta Graph API"
                        >
                          {isSubscribing ? (
                            <Loader2 className="w-3 h-3 animate-spin text-slate-600" />
                          ) : (
                            <RefreshCw className="w-3 h-3 text-slate-500" />
                          )}
                          <span>تحديث الويب هـوك</span>
                        </button>

                        {/* Pull History Button */}
                        <button
                          onClick={() => syncPageHistory(page.page_id)}
                          disabled={isSyncing}
                          className="px-3 py-1.5 bg-blue-50 hover:bg-blue-100 text-[#1877F2] text-[11px] font-bold rounded-xl transition flex items-center gap-1.5 border border-blue-200/60 disabled:opacity-50"
                          title="سحب واستيراد المحادثات والرسائل التاريخية من فيسبوك"
                        >
                          {isSyncing ? (
                            <Loader2 className="w-3 h-3 animate-spin text-[#1877F2]" />
                          ) : (
                            <Sparkles className="w-3 h-3 text-[#1877F2]" />
                          )}
                          <span>مزامنة المحادثات</span>
                        </button>
                      </div>

                      {/* Disconnect Action Button */}
                      <button
                        onClick={() => setPageToDelete({ id: page.page_id, name: page.name })}
                        disabled={isDeleting}
                        className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition disabled:opacity-50"
                        title="إلغاء ربط الصفحة وحذفها من النظام"
                      >
                        {isDeleting ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin text-rose-600" />
                        ) : (
                          <Trash2 className="w-3.5 h-3.5" />
                        )}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
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
                  className="w-full py-2 bg-[#1877F2] hover:bg-blue-700 text-white text-xs font-bold rounded-xl transition flex items-center justify-center gap-1.5 shadow-2xs disabled:opacity-50"
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
                  className="px-4 py-2.5 bg-[#1877F2] hover:bg-blue-700 text-white text-xs font-bold rounded-xl transition flex items-center gap-1.5 shadow-2xs shrink-0"
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
                  className="px-4 py-2.5 bg-slate-800 hover:bg-slate-900 text-white text-xs font-bold rounded-xl transition flex items-center gap-1.5 shadow-2xs shrink-0"
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
                    className="text-[11px] font-mono font-bold bg-blue-50 text-[#1877F2] border border-blue-200/60 px-2.5 py-1 rounded-lg"
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

      {/* Disconnect Confirmation Modal */}
      {pageToDelete && (
        <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-sm z-[9999] flex items-center justify-center p-4 dir-rtl text-right animate-in fade-in duration-150">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 space-y-4 shadow-2xl border border-slate-200 animate-in zoom-in-95 duration-150">
            <div className="w-12 h-12 rounded-2xl bg-rose-50 text-rose-600 flex items-center justify-center mx-auto border border-rose-100">
              <Trash2 className="w-6 h-6" />
            </div>
            <div className="text-center space-y-1">
              <h3 className="text-base font-black text-slate-900">تأكيد إلغاء ربط الصفحة</h3>
              <p className="text-xs text-slate-500 leading-relaxed">
                هل أنت متأكد من رغبتك في إلغاء ربط الصفحة <strong className="text-slate-800 font-extrabold">{pageToDelete.name}</strong>؟
                سيتم حذف مفاتيح الوصول الخاصة بها وإيقاف استلام الرسائل عبرها.
              </p>
            </div>
            <div className="flex items-center justify-center gap-3 pt-2">
              <button
                type="button"
                onClick={() => setPageToDelete(null)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl transition"
              >
                إلغاء التراجع
              </button>
              <button
                type="button"
                onClick={async () => {
                  const pid = pageToDelete.id;
                  setPageToDelete(null);
                  await disconnectPage(pid);
                }}
                className="px-5 py-2 bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold rounded-xl transition shadow-md shadow-rose-500/20"
              >
                نعم، إلغاء الربط الآن
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
export default ChannelsPage;
