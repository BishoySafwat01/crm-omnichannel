import React, { useEffect, useState } from 'react';
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
} from 'lucide-react';
import { useAuthStore, isAdminUser } from '../../store/useAuthStore';
import { useChannelsStore } from '../../store/useChannelsStore';

export const MetaChannelsSettings: React.FC = () => {
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

  const [copiedId, setCopiedId] = useState<string | null>(null);

  useEffect(() => {
    if (isAdmin) {
      fetchConnectedPages();
    }
  }, [isAdmin]);

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

  const subscribedPagesCount = connectedPages.filter(
    (p) => p.is_webhook_subscribed
  ).length;
  const activePagesCount = connectedPages.filter(
    (p) => p.status === 'ACTIVE'
  ).length;

  return (
    <div className="space-y-6 dir-rtl text-right">
      {/* Header Banner & Connection Trigger */}
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
              className="p-2.5 bg-white/10 hover:bg-white/20 text-white rounded-xl transition backdrop-blur-sm border border-white/10 disabled:opacity-50"
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
                className="px-5 py-2.5 bg-[#1877F2] hover:bg-[#166fe5] text-white text-xs font-black rounded-xl shadow-lg hover:shadow-blue-500/25 transition-all flex items-center gap-2 border border-blue-400/30 disabled:opacity-60 active:scale-98"
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

      {/* Feedback Alerts */}
      {successMessage && (
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

      {error && (
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
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-black text-slate-800 flex items-center gap-2">
            <Layers className="w-4 h-4 text-[#1877F2]" />
            قائمة الصفحات المعتمدة في النظام ({connectedPages.length})
          </h3>
          <span className="text-[11px] text-slate-400 font-medium">
            محدثة لحظياً من قاعدة البيانات
          </span>
        </div>

        {isLoadingPages && connectedPages.length === 0 ? (
          <div className="p-12 text-center bg-white border border-slate-200/80 rounded-3xl space-y-2">
            <Loader2 className="w-7 h-7 text-[#1877F2] animate-spin mx-auto" />
            <p className="text-xs text-slate-500 font-medium">
              جارٍ تحميل وتدقيق الصفحات المتصلة...
            </p>
          </div>
        ) : connectedPages.length === 0 ? (
          <div className="bg-white border-2 border-dashed border-slate-200 rounded-3xl p-10 text-center space-y-4">
            <div className="w-14 h-14 rounded-2xl bg-blue-50 text-[#1877F2] mx-auto flex items-center justify-center">
              <Facebook className="w-7 h-7 fill-[#1877F2]" />
            </div>
            <div className="space-y-1">
              <h4 className="text-sm font-extrabold text-slate-800">
                لا توجد صفحات فيسبوك متصلة حتى الآن
              </h4>
              <p className="text-xs text-slate-500 max-w-sm mx-auto">
                اضغط على زر "ربط صفحات فيسبوك" بالكامل لإتمام مصادقة OAuth واختيار
                الصفحات التابعة لعلاماتك التجارية.
              </p>
            </div>
            <div className="inline-flex items-center gap-2">
              <button
                onClick={() => initiateMetaConnect()}
                disabled={isConnecting}
                className="px-5 py-2.5 bg-[#1877F2] hover:bg-[#166fe5] text-white text-xs font-bold rounded-xl shadow-md transition inline-flex items-center gap-2 disabled:opacity-60"
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
                  className="px-3 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl border border-slate-300 transition inline-flex items-center gap-1.5 shadow-xs"
                  title="إلغاء وفك قفل الزر"
                >
                  <X className="w-3.5 h-3.5 text-rose-500" />
                  <span>إلغاء</span>
                </button>
              )}
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {connectedPages.map((page) => {
              const isSubscribed = page.is_webhook_subscribed;
              const isActive = page.status === 'ACTIVE';

              return (
                <div
                  key={page.id}
                  className="bg-white border border-slate-200/80 rounded-2xl p-4 shadow-xs hover:shadow-md transition-all space-y-3 flex flex-col justify-between relative overflow-hidden"
                >
                  {/* Top: Name, Category, Live Indicator */}
                  <div>
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-blue-50 border border-blue-100 flex items-center justify-center text-[#1877F2] shrink-0 font-bold">
                          <Facebook className="w-5 h-5 fill-[#1877F2]" />
                        </div>
                        <div>
                          <h4 className="text-sm font-extrabold text-slate-900 leading-tight">
                            {page.name}
                          </h4>
                          <span className="text-[11px] text-slate-400 font-medium">
                            {page.category || 'Business Page'}
                          </span>
                        </div>
                      </div>

                      {/* Active Status Badge */}
                      <span
                        className={`text-[10px] px-2.5 py-1 rounded-full font-black flex items-center gap-1.5 ${
                          isActive
                            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                            : 'bg-slate-100 text-slate-600 border border-slate-200'
                        }`}
                      >
                        <Radio
                          className={`w-2.5 h-2.5 ${
                            isActive
                              ? 'text-emerald-500 animate-pulse'
                              : 'text-slate-400'
                          }`}
                        />
                        <span>{isActive ? 'نشط (Active)' : 'غير نشط'}</span>
                      </span>
                    </div>

                    {/* Identifiers & Details */}
                    <div className="mt-3.5 pt-3 border-t border-slate-100 space-y-1.5 text-xs text-slate-600">
                      {/* Page ID with quick copy */}
                      <div className="flex items-center justify-between">
                        <span className="text-slate-400 text-[11px]">
                          معرف الصفحة (Page ID):
                        </span>
                        <div className="flex items-center gap-1.5 font-mono text-[11px] font-bold text-slate-800">
                          <span>{page.page_id}</span>
                          <button
                            onClick={() =>
                              copyToClipboard(page.page_id, page.id)
                            }
                            className="p-1 rounded text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition"
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
                      <div className="flex items-center justify-between pt-1">
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
                    </div>
                  </div>

                  {/* Footer: Date & Live Receiving Indicator */}
                  <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-[10px] text-slate-400 font-medium">
                    <span>
                      تاريخ الربط:{' '}
                      {page.created_at
                        ? new Date(page.created_at).toLocaleDateString('ar-EG')
                        : 'حديثاً'}
                    </span>
                    <span className="flex items-center gap-1 text-slate-500 font-semibold">
                      <Sparkles className="w-3 h-3 text-[#1877F2]" />
                      مزامنة ديناميكية
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Security & Token Hygiene Guarantee */}
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
    </div>
  );
};
export default MetaChannelsSettings;
