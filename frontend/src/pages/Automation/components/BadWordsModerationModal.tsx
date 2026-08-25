import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import {
  ShieldAlert,
  X,
  Plus,
  Trash2,
  Bell,
  Mail,
  Check,
  Search,
  History,
  AlertTriangle,
  Sparkles,
  Save,
  RotateCcw,
} from 'lucide-react';
import { moderationApi } from '../../../services/api';
import { ModerationConfig, ModerationAuditLog } from '../../../types/crm';

interface BadWordsModerationModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const COMMON_SWEAR_PRESETS = [
  'كلب', 'حيوان', 'غبي', 'حمار', 'يا حيوان', 'يا كلب', 'يا غبي', 'زفت',
  'قذر', 'سافل', 'حقير', 'وسخ', 'ابن الكلب', 'يلعن', 'لعنة', 'لعنك',
  'تفو', 'منحط', 'تافه', 'نصاب', 'حرامي', 'سرقة', 'نصب', 'احتيال',
  'فاشل', 'يا فاشل', 'كذاب', 'يا كذاب', 'حقراء', 'سفلة', 'وقح'
];

const SPAM_SCAM_PRESETS = [
  'نصابين', 'شركة نصابة', 'سرقة فلوس', 'ارخص منكم', 'اشتري من برة',
  'هبلغ عنكم', 'حماية المستهلك', 'حساب بنكي', 'فيزا مسروقة'
];

export const BadWordsModerationModal: React.FC<BadWordsModerationModalProps> = ({
  isOpen,
  onClose,
}) => {
  const [activeTab, setActiveTab] = useState<'words' | 'logs'>('words');
  const [isActive, setIsActive] = useState(true);
  const [badWords, setBadWords] = useState<string[]>([]);
  const [newWordInput, setNewWordInput] = useState('');
  const [searchFilter, setSearchFilter] = useState('');
  const [notifyToast, setNotifyToast] = useState(true);
  const [notifyEmail, setNotifyEmail] = useState(true);
  const [adminEmail, setAdminEmail] = useState('admin@luxira.com');
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [logs, setLogs] = useState<ModerationAuditLog[]>([]);
  const [isLoadingLogs, setIsLoadingLogs] = useState(false);
  const [saveSuccessMsg, setSaveSuccessMsg] = useState(false);

  useEffect(() => {
    if (isOpen) {
      loadConfig();
    }
  }, [isOpen]);

  const loadConfig = async () => {
    setIsLoading(true);
    try {
      const cfg = await moderationApi.getConfig();
      setIsActive(cfg.is_active ?? true);
      setBadWords(cfg.bad_words || []);
      setNotifyToast(cfg.notify_admin_toast ?? true);
      setNotifyEmail(cfg.notify_admin_email ?? true);
      setAdminEmail(cfg.admin_alert_email || 'luxiraholding@gmail.com');
    } catch (e) {
      console.error('Failed to load moderation config:', e);
    } finally {
      setIsLoading(false);
    }
  };

  const loadLogs = async () => {
    setIsLoadingLogs(true);
    try {
      const data = await moderationApi.getAuditLogs(50);
      setLogs(data || []);
    } catch (e) {
      console.error('Failed to load moderation logs:', e);
    } finally {
      setIsLoadingLogs(false);
    }
  };

  const persistConfig = async (overrides: Partial<{
    isActive: boolean;
    badWords: string[];
    notifyToast: boolean;
    notifyEmail: boolean;
    adminEmail: string;
  }> = {}) => {
    const payload = {
      is_active: overrides.isActive !== undefined ? overrides.isActive : isActive,
      bad_words: overrides.badWords !== undefined ? overrides.badWords : badWords,
      notify_admin_toast: overrides.notifyToast !== undefined ? overrides.notifyToast : notifyToast,
      notify_admin_email: overrides.notifyEmail !== undefined ? overrides.notifyEmail : notifyEmail,
      admin_alert_email: (overrides.adminEmail !== undefined ? overrides.adminEmail : adminEmail).trim(),
    };
    setIsSaving(true);
    try {
      const saved = await moderationApi.updateConfig(payload);
      if (saved) {
        setIsActive(saved.is_active ?? true);
        setBadWords(saved.bad_words || []);
        setNotifyToast(saved.notify_admin_toast ?? true);
        setNotifyEmail(saved.notify_admin_email ?? true);
        if (overrides.adminEmail !== undefined) {
          setAdminEmail(saved.admin_alert_email || 'luxiraholding@gmail.com');
        }
      }
      setSaveSuccessMsg(true);
      setTimeout(() => setSaveSuccessMsg(false), 3000);
    } catch (e: any) {
      console.error('Failed to save moderation config:', e);
    } finally {
      setIsSaving(false);
    }
  };

  const handleAddWord = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!newWordInput.trim()) return;

    // Split by newlines, commas, or Arabic commas to support multi-line pasting/typing
    const rawTokens = newWordInput
      .split(/[\r\n,،]+/)
      .map((w) => w.trim())
      .filter((w) => w.length > 0);

    if (rawTokens.length === 0) return;

    const existingSet = new Set(badWords);
    const newItems: string[] = [];
    rawTokens.forEach((token) => {
      if (!existingSet.has(token)) {
        existingSet.add(token);
        newItems.push(token);
      }
    });

    if (newItems.length > 0) {
      const updated = [...newItems, ...badWords];
      setBadWords(updated);
      setNewWordInput('');
      persistConfig({ badWords: updated });
    } else {
      setNewWordInput('');
    }
  };

  const handleRemoveWord = (wordToRemove: string) => {
    const updated = badWords.filter((w) => w !== wordToRemove);
    setBadWords(updated);
    persistConfig({ badWords: updated });
  };

  const handleAddPresets = (presets: string[]) => {
    const combined = Array.from(new Set([...badWords, ...presets]));
    setBadWords(combined);
    persistConfig({ badWords: combined });
  };

  const handleClearAll = () => {
    if (window.confirm('هل أنت متأكد من مسح جميع الكلمات المحظورة؟')) {
      setBadWords([]);
      persistConfig({ badWords: [] });
    }
  };

  const handleToggleIsActive = () => {
    const nextVal = !isActive;
    setIsActive(nextVal);
    persistConfig({ isActive: nextVal });
  };

  const handleToggleNotifyToast = () => {
    const nextVal = !notifyToast;
    setNotifyToast(nextVal);
    persistConfig({ notifyToast: nextVal });
  };

  const handleToggleNotifyEmail = () => {
    const nextVal = !notifyEmail;
    setNotifyEmail(nextVal);
    persistConfig({ notifyEmail: nextVal });
  };

  const handleSave = async () => {
    await persistConfig();
  };

  if (!isOpen || typeof document === 'undefined') return null;

  const filteredWords = badWords.filter((w) =>
    w.toLowerCase().includes(searchFilter.toLowerCase().trim())
  );

  return createPortal(
    <div
      className="fixed inset-0 bg-slate-950/60 backdrop-blur-sm z-[9999] flex items-center justify-center p-4 select-none animate-in fade-in duration-150 dir-rtl text-right"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-3xl max-w-2xl w-full p-6 shadow-2xl border border-slate-100 space-y-5 animate-in zoom-in-95 duration-150 my-auto max-h-[90vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 pb-3.5 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-rose-100 text-rose-700 flex items-center justify-center font-bold shadow-md border border-rose-200">
              <ShieldAlert className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-base font-black text-slate-900 flex items-center gap-2">
                <span>فلترة الكلمات السيئة والمحظورة (Bad Words Moderation)</span>
                <span className="text-[10px] bg-rose-50 text-rose-700 font-extrabold px-2 py-0.5 rounded-full border border-rose-200">
                  {badWords.length} كلمة
                </span>
              </h3>
              <p className="text-xs text-slate-500 font-medium mt-0.5">
                رصد الشتائم والألفاظ غير اللائقة وإطلاق إنذارات فورية حمراء وإيميلات للأدمن
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-xl transition"
            title="إغلاق"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex items-center gap-2 border-b border-slate-100 pb-2 shrink-0">
          <button
            onClick={() => setActiveTab('words')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition flex items-center gap-1.5 ${
              activeTab === 'words'
                ? 'bg-rose-600 text-white shadow-xs'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            <ShieldAlert className="w-4 h-4" />
            <span>قائمة الكلمات وقواعد الرصد</span>
          </button>
          <button
            onClick={() => {
              setActiveTab('logs');
              loadLogs();
            }}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition flex items-center gap-1.5 ${
              activeTab === 'logs'
                ? 'bg-rose-600 text-white shadow-xs'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            <History className="w-4 h-4" />
            <span>سجل الانتهاكات والإنذارات</span>
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="overflow-y-auto flex-1 pr-1 space-y-4">
          {activeTab === 'words' ? (
            <>
              {/* Master Activation Toggle & Alert Channels Card */}
              <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200/80 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="text-xs font-black text-slate-900">تفعيل نظام فحص المحادثات الحي</h4>
                    <p className="text-[11px] text-slate-500 font-medium">
                      فحص كافة الرسائل الواردة من العملاء والصادرة من الموظفين تلقائياً
                    </p>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={isActive}
                      onChange={handleToggleIsActive}
                      className="sr-only peer"
                    />
                    <div className="w-11 h-6 bg-slate-300 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-rose-600" />
                  </label>
                </div>

                <div className="pt-3 border-t border-slate-200/60 grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                  <label className="flex items-center gap-2 p-2 bg-white rounded-xl border border-slate-200 cursor-pointer hover:bg-slate-50">
                    <input
                      type="checkbox"
                      checked={notifyToast}
                      onChange={handleToggleNotifyToast}
                      className="rounded text-rose-600 focus:ring-rose-500"
                    />
                    <Bell className="w-4 h-4 text-rose-600" />
                    <span className="font-bold text-slate-800">إشعار فوري أحمر على شاشة الأدمن</span>
                  </label>

                  <label className="flex items-center gap-2 p-2 bg-white rounded-xl border border-slate-200 cursor-pointer hover:bg-slate-50">
                    <input
                      type="checkbox"
                      checked={notifyEmail}
                      onChange={handleToggleNotifyEmail}
                      className="rounded text-rose-600 focus:ring-rose-500"
                    />
                    <Mail className="w-4 h-4 text-rose-600" />
                    <span className="font-bold text-slate-800">إرسال إيميل للأدمن عند الحذف أو الرصد</span>
                  </label>
                </div>

                {notifyEmail && (
                  <div className="pt-2">
                    <label className="block text-[11px] font-bold text-slate-700 mb-1">
                      بريد الأدمن لاستقبال الإشعارات:
                    </label>
                    <input
                      type="email"
                      value={adminEmail}
                      onChange={(e) => setAdminEmail(e.target.value)}
                      placeholder="admin@luxira.com"
                      className="w-full bg-white text-xs font-semibold text-slate-800 px-3 py-2 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-rose-500/20 focus:border-rose-500"
                    />
                  </div>
                )}
              </div>

              {/* Add Word Form & Quick Presets */}
              <div className="space-y-2.5">
                <div className="space-y-1.5">
                  <div className="flex gap-2 items-start">
                    <textarea
                      rows={2}
                      value={newWordInput}
                      onChange={(e) => setNewWordInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                          e.preventDefault();
                          handleAddWord();
                        }
                      }}
                      placeholder="اكتب أو الصق عدة كلمات/عبارات (سطر جديد لكل كلمة أو مفصولة بفواصل)..."
                      className="flex-1 bg-slate-50 text-xs font-medium text-slate-900 p-3 rounded-xl border border-slate-200 focus:bg-white focus:outline-none focus:ring-2 focus:ring-rose-500/20 focus:border-rose-500 resize-none"
                    />
                    <button
                      type="button"
                      onClick={() => handleAddWord()}
                      disabled={!newWordInput.trim()}
                      className="px-4 py-3 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold transition flex items-center gap-1.5 shadow-xs disabled:opacity-50 cursor-pointer h-full self-stretch justify-center"
                    >
                      <Plus className="w-4 h-4" />
                      <span>إضافة وحفظ تلقائي</span>
                    </button>
                  </div>
                  <p className="text-[10px] text-slate-400 font-medium">
                    💡 يمكنك كتابة أو لصق قائمة كاملة من الكلمات وسطر جديد لكل كلمة لإضافتها كلها معاً وحفظها تلقائياً.
                  </p>
                </div>

                {/* Preset Chips */}
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-[11px] font-bold text-slate-500 flex items-center gap-1 ml-1">
                    <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                    قوالب جاهزة:
                  </span>
                  <button
                    type="button"
                    onClick={() => handleAddPresets(COMMON_SWEAR_PRESETS)}
                    className="text-[10px] bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 px-2.5 py-1 rounded-lg font-bold transition cursor-pointer"
                  >
                    + شتائم وألفاظ غير لائقة
                  </button>
                  <button
                    type="button"
                    onClick={() => handleAddPresets(SPAM_SCAM_PRESETS)}
                    className="text-[10px] bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 px-2.5 py-1 rounded-lg font-bold transition cursor-pointer"
                  >
                    + كلمات الاحتيال والسبام
                  </button>
                  <button
                    type="button"
                    onClick={handleClearAll}
                    className="text-[10px] bg-slate-100 hover:bg-slate-200 text-slate-600 border border-slate-200 px-2.5 py-1 rounded-lg font-bold transition mr-auto cursor-pointer"
                  >
                    مسح الكل
                  </button>
                </div>
              </div>

              {/* Bad Words List View */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="relative flex-1 max-w-xs">
                    <input
                      type="text"
                      value={searchFilter}
                      onChange={(e) => setSearchFilter(e.target.value)}
                      placeholder="بحث في الكلمات المحظورة..."
                      className="w-full bg-slate-50 text-xs px-3 py-1.5 pr-8 rounded-xl border border-slate-200 focus:outline-none focus:border-rose-500 font-medium"
                    />
                    <Search className="w-3.5 h-3.5 text-slate-400 absolute right-2.5 top-2.5" />
                  </div>
                  <span className="text-[11px] text-slate-400 font-semibold">
                    المعروض: {filteredWords.length} من {badWords.length}
                  </span>
                </div>

                <div className="p-3 bg-slate-50 rounded-2xl border border-slate-200/80 min-h-[140px] max-h-[220px] overflow-y-auto flex flex-wrap gap-1.5 content-start">
                  {filteredWords.length === 0 ? (
                    <div className="w-full py-8 text-center text-slate-400 text-xs font-medium">
                      لا توجد كلمات محظورة مطابقة. أضف كلمات أعلاه أو اختر قالباً جاهزاً.
                    </div>
                  ) : (
                    filteredWords.map((word) => (
                      <span
                        key={word}
                        className="inline-flex items-center gap-1.5 bg-white text-rose-800 border border-rose-200/80 px-2.5 py-1 rounded-xl text-xs font-bold shadow-2xs group hover:border-rose-300 transition"
                      >
                        <span>{word}</span>
                        <button
                          type="button"
                          onClick={() => handleRemoveWord(word)}
                          className="text-slate-300 hover:text-rose-600 rounded-full p-0.5 transition"
                          title="حذف الكلمة"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </span>
                    ))
                  )}
                </div>
              </div>
            </>
          ) : (
            /* Audit Logs View */
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-extrabold text-slate-800 flex items-center gap-1.5">
                  <History className="w-4 h-4 text-rose-600" />
                  <span>سجل رصد الكلمات وحذف الرسائل</span>
                </h4>
                <button
                  onClick={loadLogs}
                  disabled={isLoadingLogs}
                  className="text-xs text-rose-600 hover:text-rose-700 font-bold flex items-center gap-1"
                >
                  <RotateCcw className={`w-3.5 h-3.5 ${isLoadingLogs ? 'animate-spin' : ''}`} />
                  <span>تحديث السجل</span>
                </button>
              </div>

              {isLoadingLogs ? (
                <div className="p-8 text-center text-xs text-slate-400 font-bold">جاري تحميل السجل...</div>
              ) : logs.length === 0 ? (
                <div className="p-8 text-center text-xs text-slate-400 font-medium bg-slate-50 rounded-2xl border border-slate-200">
                  لم يتم تسجيل أي انتهاكات أو عمليات حذف مؤخراً.
                </div>
              ) : (
                <div className="space-y-2 max-h-[350px] overflow-y-auto">
                  {logs.map((log) => {
                    const isDeletion = log.action === 'message.deleted';
                    const pl = log.payload || {};
                    return (
                      <div
                        key={log.id}
                        className={`p-3 rounded-2xl border text-xs space-y-1.5 ${
                          isDeletion
                            ? 'bg-rose-50/60 border-rose-200/80 text-rose-950'
                            : 'bg-amber-50/60 border-amber-200/80 text-amber-950'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span
                            className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold border ${
                              isDeletion
                                ? 'bg-rose-100 text-rose-800 border-rose-300'
                                : 'bg-amber-100 text-amber-800 border-amber-300'
                            }`}
                          >
                            {isDeletion ? '🗑️ تم حذف رسالة' : '⚠️ رصد كلمة محظورة'}
                          </span>
                          <span className="text-[10px] text-slate-500 font-semibold font-mono">
                            {log.created_at ? new Date(log.created_at).toLocaleString('ar-EG') : ''}
                          </span>
                        </div>

                        <p className="font-semibold text-slate-800">
                          {isDeletion ? (
                            <>
                              قام <span className="font-bold text-rose-700">{pl.deleted_by_name || 'موظف'}</span> بحذف:{' '}
                              <span className="font-bold bg-white px-2 py-0.5 rounded border border-rose-200 text-rose-900">
                                {pl.deleted_text || '(رسالة فارغة أو مرفق)'}
                              </span>
                            </>
                          ) : (
                            <>
                              قام <span className="font-bold text-amber-800">{pl.sender_name || 'المرسل'}</span> بكتابة:{' '}
                              <span className="font-bold bg-white px-2 py-0.5 rounded border border-amber-200 text-amber-900">
                                {pl.message_text}
                              </span>
                            </>
                          )}
                        </p>

                        <div className="flex items-center justify-between text-[11px] text-slate-500 pt-1 border-t border-slate-200/40">
                          <span>العميل: {pl.customer_name || 'عميل'}</span>
                          {pl.brand && <span>المتجر: {pl.brand}</span>}
                          {pl.channel && <span className="capitalize">{pl.channel}</span>}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-between pt-3 border-t border-slate-100 shrink-0">
          <div>
            {saveSuccessMsg && (
              <span className="text-xs font-bold text-emerald-600 flex items-center gap-1 animate-in fade-in">
                <Check className="w-4 h-4" />
                <span>تم حفظ إعدادات الكلمات المحظورة بنجاح!</span>
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100 transition cursor-pointer"
            >
              إغلاق
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={isSaving}
              className="px-5 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold transition flex items-center gap-2 shadow-md shadow-rose-600/20 disabled:opacity-50 cursor-pointer"
            >
              <Save className="w-4 h-4" />
              <span>{isSaving ? 'جاري الحفظ...' : 'حفظ التغييرات'}</span>
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
};
