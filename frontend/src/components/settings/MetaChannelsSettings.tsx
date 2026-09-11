import React, { useEffect, useState, useMemo } from 'react';
import {
  Facebook,
  Plug,
  RefreshCw,
  CheckCircle2,
  Clock,
  AlertCircle,
  Copy,
  Check,
  ShieldCheck,
  Radio,
  Layers,
  Lock,
  Loader2,
  Instagram,
  Sparkles,
  X,
  Search,
  Trash2,
  Power,
  Tag,
} from 'lucide-react';
import { useAuthStore, isAdminUser } from '../../store/useAuthStore';
import { useChannelsStore } from '../../store/useChannelsStore';
import { useBrandStore } from '../../store/useBrandStore';

export interface MetaChannelsSettingsProps {
  showHeader?: boolean;
  showSecurityCard?: boolean;
}

export const MetaChannelsSettings: React.FC<MetaChannelsSettingsProps> = ({
  showHeader = true,
  showSecurityCard = true,
}) => {
  const { user } = useAuthStore();
  const isAdmin = isAdminUser(user);
  const brands = useBrandStore((state) => state.brands);

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

  const [searchQuery, setSearchQuery] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [pageToDelete, setPageToDelete] = useState<{ id: string; name: string } | null>(null);

  // Page-to-Brand association mapping (persisted in localStorage)
  const [pageBrandMap, setPageBrandMap] = useState<Record<string, string>>(() => {
    try {
      const stored = localStorage.getItem('crm_page_brand_associations');
      return stored ? JSON.parse(stored) : {};
    } catch {
      return {};
    }
  });

  useEffect(() => {
    if (isAdmin) {
      fetchConnectedPages();
    }
  }, [isAdmin]);

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

  // 1. Strict RBAC Gate for Non-Admins
  if (!isAdmin) {
    return (
      <div className="p-8 bg-rose-50/80 border border-rose-200 rounded-3xl text-center space-y-3 dir-rtl">
        <div className="w-12 h-12 rounded-2xl bg-rose-100 text-rose-600 mx-auto flex items-center justify-center">
          <Lock className="w-6 h-6" />
        </div>
        <h3 className="text-base font-extrabold text-rose-900">
          صلاحيات الوصول مقيدة (Access Restricted)
        </h3>
        <p className="text-xs text-rose-700 max-w-md mx-auto leading-relaxed">
          إدارة قنوات وصفحات Meta وربط الويب هـوك مقتصرة حصرياً على مديري النظام
          (Admins & Superadmins). يرجى مراجعة إدارة الفريق لتعديل الصلاحيات.
        </p>
      </div>
    );
  }

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

  const subscribedPagesCount = connectedPages.filter(
    (p) => p.is_webhook_subscribed
  ).length;
  const activePagesCount = connectedPages.filter(
    (p) => p.status === 'ACTIVE'
  ).length;

  return (
    <div className="space-y-6 dir-rtl text-right">
      {/* Header Banner & Connection Trigger */}
      {showHeader && (
        <div className="bg-gradient-to-br from-slate-900 via-[#182a4d] to-[#1877F2]/90 text-white rounded-3xl p-6 shadow-xl relative overflow-hidden">
          {/* Subtle decorative background blur */}
          <div className="absolute top-0 right-0 w-64 h-64 bg-[#1877F2]/20 rounded-full blur-3xl -z-0 pointer-events-none" />

          <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="space-y-1.5">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-[#1877F2] text-white flex items-center justify-center font-bold shadow-md">
                  <Facebook className="w-5 h-5 fill-white" />
                </div>
                <h2 className="text-lg font-black tracking-tight">
                  إدارة صفحات فيسبوك وقنوات ميتا الديناميكية
                </h2>
              </div>
              <p className="text-xs text-slate-300 max-w-xl leading-relaxed">
                اربط صفحات عملك عبر بروتوكول Meta OAuth 2.0 الموثّق. يتم استيراد
                الصفحات وتشفير مفاتيح الوصول وتفعيل اشتراكات الويب هـوك (Webhooks)
                تلقائياً لاستقبال الرسائل فوراً.
              </p>
            </div>

            <div className="flex items-center gap-2.5 shrink-0">
              {/* Refresh Button */}
              <button
                onClick={() => fetchConnectedPages()}
                disabled={isLoadingPages}
                className="p-2.5 bg-white/10 hover:bg-white/20 text-white rounded-xl transition backdrop-blur-sm border border-white/10 disabled:opacity-50 cursor-pointer"
                title="تحديث قائمة الصفحات"
              >
                <RefreshCw
                  className={`w-4 h-4 ${isLoadingPages ? 'animate-spin' : ''}`}
                />
              </button>

              {/* Connect Button & Manual Cancel Action */}
              <div className="flex items-center gap-2">
                <button
                  onClick={() => initiateMetaConnect()}
                  disabled={isConnecting}
                  className="px-5 py-2.5 bg-[#1877F2] hover:bg-[#166fe5] text-white text-xs font-black rounded-xl shadow-lg hover:shadow-blue-500/25 transition-all flex items-center gap-2 border border-blue-400/30 disabled:opacity-60 active:scale-98 cursor-pointer"
                >
                  {isConnecting ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>جارٍ التحويل إلى فيسبوك...</span>
                    </>
                  ) : (
                    <>
                      <Plug className="w-4 h-4" />
                      <span>ربط صفحات فيسبوك (Connect Pages)</span>
                    </>
                  )}
                </button>

                {isConnecting && (
                  <button
                    type="button"
                    onClick={() => cancelMetaConnect()}
                    className="px-3 py-2.5 bg-slate-800/80 hover:bg-slate-700 text-slate-200 text-xs font-bold rounded-xl border border-white/10 transition flex items-center gap-1.5 shadow-sm active:scale-98 cursor-pointer"
                    title="إلغاء وفك قفل الزر"
                  >
                    <X className="w-3.5 h-3.5 text-rose-400" />
                    <span>إلغاء</span>
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Quick Stats Strip */}
          <div className="mt-5 pt-4 border-t border-white/10 grid grid-cols-3 gap-3 text-center md:text-right">
            <div>
              <span className="text-[11px] text-slate-300 font-medium">
                الصفحات المتصلة:
              </span>
              <p className="text-base font-black text-white">
                {connectedPages.length}
              </p>
            </div>
            <div>
              <span className="text-[11px] text-emerald-300 font-medium">
                الويب هـوك مفعّل:
              </span>
              <p className="text-base font-black text-emerald-400">
                {subscribedPagesCount}
              </p>
            </div>
            <div>
              <span className="text-[11px] text-blue-300 font-medium">
                الصفحات النشطة:
              </span>
              <p className="text-base font-black text-blue-300">
                {activePagesCount}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Feedback Alerts */}
      {showHeader && successMessage && (
        <div className="bg-emerald-50 border border-emerald-200 text-emerald-900 px-4 py-3 rounded-2xl flex items-center justify-between animate-in fade-in text-xs font-bold">
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

      {showHeader && error && (
        <div className="bg-rose-50 border border-rose-200 text-rose-900 px-4 py-3 rounded-2xl flex items-center justify-between animate-in fade-in text-xs font-bold">
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

      {/* Connected Pages Section */}
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
              className="w-full bg-white border border-slate-200/80 rounded-2xl pr-10 pl-4 py-2 text-xs font-medium text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-theme-primary/20 focus:border-theme-primary shadow-2xs"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          <div className="flex items-center gap-2">
            <span className="text-[11px] text-slate-400 font-medium">
              قائمة الصفحات المعتمدة ({filteredPages.length}) • تحديث لحظي
            </span>
          </div>
        </div>

        {isLoadingPages && connectedPages.length === 0 ? (
          <div className="p-14 text-center bg-white border border-slate-200/80 rounded-3xl space-y-3">
            <Loader2 className="w-8 h-8 text-theme-primary animate-spin mx-auto" />
            <p className="text-xs text-slate-500 font-bold">
              جارٍ تحميل وتدقيق الصفحات المتصلة...
            </p>
          </div>
        ) : filteredPages.length === 0 ? (
          <div className="bg-white border-2 border-dashed border-slate-200 rounded-3xl p-10 text-center space-y-4">
            <div className="w-14 h-14 rounded-2xl bg-blue-50 text-[#1877F2] mx-auto flex items-center justify-center">
              <Facebook className="w-7 h-7 fill-[#1877F2]" />
            </div>
            <div className="space-y-1 max-w-md mx-auto">
              <h4 className="text-sm font-extrabold text-slate-800">
                {searchQuery
                  ? 'لا توجد صفحات مطابقة لنتيجة البحث'
                  : 'لا توجد صفحات فيسبوك متصلة حتى الآن'}
              </h4>
              <p className="text-xs text-slate-500 leading-relaxed">
                {searchQuery
                  ? 'جرب البحث بمعرف أو اسم مختلف.'
                  : 'اضغط على زر "ربط صفحات فيسبوك" لإتمام مصادقة OAuth واختيار الصفحات التابعة لعلاماتك التجارية.'}
              </p>
            </div>
            {!searchQuery && (
              <div className="inline-flex items-center gap-2">
                <button
                  onClick={() => initiateMetaConnect()}
                  disabled={isConnecting}
                  className="px-5 py-2.5 bg-[#1877F2] hover:bg-[#166fe5] text-white text-xs font-bold rounded-xl shadow-md transition inline-flex items-center gap-2 disabled:opacity-60 cursor-pointer"
                >
                  {isConnecting ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>جارٍ التحويل إلى فيسبوك...</span>
                    </>
                  ) : (
                    <>
                      <Plug className="w-4 h-4" />
                      <span>بدء عملية الربط الآن</span>
                    </>
                  )}
                </button>

                {isConnecting && (
                  <button
                    type="button"
                    onClick={() => cancelMetaConnect()}
                    className="px-3 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl border border-slate-300 transition inline-flex items-center gap-1.5 shadow-xs cursor-pointer"
                    title="إلغاء وفك قفل الزر"
                  >
                    <X className="w-3.5 h-3.5 text-rose-500" />
                    <span>إلغاء</span>
                  </button>
                )}
              </div>
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
              const selectedBrand = pageBrandMap[page.page_id] || page.name || 'Default';

              return (
                <div
                  key={page.id}
                  className="bg-white border border-slate-200/80 rounded-3xl p-5 shadow-xs hover:shadow-md transition-all space-y-4 flex flex-col justify-between relative overflow-hidden"
                >
                  {/* Top: Name, Category, Status Toggle */}
                  <div>
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-11 h-11 rounded-2xl bg-blue-50 border border-blue-100 flex items-center justify-center text-[#1877F2] shrink-0 font-bold shadow-2xs">
                          <Facebook className="w-5 h-5 fill-[#1877F2]" />
                        </div>
                        <div className="min-w-0">
                          <h4 className="text-sm font-extrabold text-slate-900 truncate">
                            {page.name}
                          </h4>
                          <span className="text-[11px] text-slate-400 font-medium">
                            {page.category || 'Business Page'}
                          </span>
                        </div>
                      </div>

                      {/* Active Status Toggle Badge */}
                      <button
                        onClick={() => togglePageStatus(page.page_id, page.status)}
                        disabled={isStatusToggling}
                        className={`text-[11px] px-3 py-1 rounded-full font-black flex items-center gap-1.5 transition border cursor-pointer ${
                          isActive
                            ? 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100'
                            : 'bg-slate-100 text-slate-600 border-slate-200 hover:bg-slate-200'
                        }`}
                        title="اضغط لتغيير حالة تشغيل الصفحة"
                      >
                        {isStatusToggling ? (
                          <Loader2 className="w-3 h-3 animate-spin text-slate-600" />
                        ) : (
                          <Power
                            className={`w-3 h-3 ${isActive ? 'text-emerald-500' : 'text-slate-400'}`}
                          />
                        )}
                        <span>{isActive ? 'نشط (Active)' : 'معطل (Inactive)'}</span>
                      </button>
                    </div>

                    {/* Identifiers & Details */}
                    <div className="mt-4 pt-3.5 border-t border-slate-100 space-y-2 text-xs text-slate-600">
                      {/* Page ID with quick copy */}
                      <div className="flex items-center justify-between">
                        <span className="text-slate-400 text-[11px]">
                          معرف الصفحة (Page ID):
                        </span>
                        <div className="flex items-center gap-1.5 font-mono text-[11px] font-bold text-slate-800 bg-slate-50 px-2 py-0.5 rounded-lg border border-slate-200/60">
                          <span>{page.page_id}</span>
                          <button
                            onClick={() =>
                              copyToClipboard(page.page_id, page.id)
                            }
                            className="p-1 rounded text-slate-400 hover:text-slate-700 hover:bg-white transition cursor-pointer"
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

                      {/* Instagram Business Account if linked */}
                      {page.instagram_business_account_id && (
                        <div className="flex items-center justify-between">
                          <span className="text-slate-400 text-[11px] flex items-center gap-1">
                            <Instagram className="w-3 h-3 text-pink-600" />
                            حساب إنستغرام:
                          </span>
                          <span className="font-mono text-[11px] font-bold text-pink-700 bg-pink-50 px-2 py-0.5 rounded-md border border-pink-100">
                            {page.instagram_business_account_id}
                          </span>
                        </div>
                      )}

                      {/* Webhook Status */}
                      <div className="flex items-center justify-between pt-0.5">
                        <span className="text-slate-400 text-[11px]">
                          حالة الويب هـوك (Webhook):
                        </span>
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
                          {page.name && !brands.some((b) => b.name.toLowerCase() === page.name.toLowerCase()) && (
                            <option value={page.name}>{page.name}</option>
                          )}
                          {brands.filter((b) => b.id !== 'all').map((b) => (
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
                        className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-[11px] font-bold rounded-xl transition flex items-center gap-1.5 border border-slate-200/80 disabled:opacity-50 cursor-pointer"
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
                        className="px-3 py-1.5 bg-theme-primary-tint text-theme-primary text-[11px] font-bold rounded-xl transition flex items-center gap-1.5 border border-theme-primary/20 hover:bg-theme-primary-tint/80 disabled:opacity-50 cursor-pointer"
                        title="سحب واستيراد المحادثات والرسائل التاريخية من فيسبوك"
                      >
                        {isSyncing ? (
                          <Loader2 className="w-3 h-3 animate-spin text-theme-primary" />
                        ) : (
                          <Sparkles className="w-3 h-3 text-theme-primary" />
                        )}
                        <span>مزامنة المحادثات</span>
                      </button>
                    </div>

                    {/* Disconnect Action Button */}
                    <button
                      onClick={() => setPageToDelete({ id: page.page_id, name: page.name })}
                      disabled={isDeleting}
                      className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition disabled:opacity-50 cursor-pointer"
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
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl transition cursor-pointer"
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
                className="px-5 py-2 bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold rounded-xl transition shadow-md shadow-rose-500/20 cursor-pointer"
              >
                نعم، إلغاء الربط الآن
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Security & Token Hygiene Guarantee */}
      {showSecurityCard && (
        <div className="bg-slate-50 border border-slate-200/80 rounded-2xl p-4 flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-teal-50 text-teal-700 border border-teal-200 flex items-center justify-center shrink-0">
            <ShieldCheck className="w-5 h-5" />
          </div>
          <div className="text-xs text-slate-600 space-y-0.5">
            <p className="font-extrabold text-slate-800">
              أمان التشفير وعزل المفاتيح (Token Hygiene & Encryption):
            </p>
            <p className="text-[11px] text-slate-500">
              يتم تخزين مفاتيح الوصول لصفحات فيسبوك مشفرة بالكامل بواسطة مفتاح تشفير
              Fernet المتماثل على قاعدة البيانات. لا يتم أبداً تمرير المفاتيح بصيغتها
              المجردة أو كشفها على واجهة المستخدم.
            </p>
          </div>
        </div>
      )}
    </div>
  );
};
export default MetaChannelsSettings;
