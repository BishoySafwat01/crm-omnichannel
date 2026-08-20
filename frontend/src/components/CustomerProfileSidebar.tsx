import React, { useState, useEffect } from 'react';
import { useCrmStore } from '../store/useCrmStore';
import {
  User, Phone, Mail, MapPin, Edit2, Check, X,
  Sparkles, Copy, Send, History, FileText, Trash2, Clock, MessageSquare, Tag, AlertTriangle
} from 'lucide-react';
import { SALES_SCRIPTS, SalesScript } from '../data/salesScripts';
import { customerApi, CustomerNote, CustomerTimelineEvent } from '../services/api';

export const CustomerProfileSidebar: React.FC = () => {
  const { conversations, activeConversationId, updateCustomerProfile, setDraftText } = useCrmStore();

  const activeConversation = conversations.find((c) => c.id === activeConversationId);
  const customer = activeConversation?.customer || (activeConversation ? {
    id: activeConversation.customer_id || '',
    display_name: activeConversation.customer_display_name || 'عميل بدون اسم',
    phone: '',
    email: '',
    location: '',
    tier: 'درجة أولى',
    skin_type: 'عادية',
    stage: 'جديد',
    tags: [],
    created_at: '',
    updated_at: '',
  } : null);

  // Tab & Edit States
  const [activeSidebarTab, setActiveSidebarTab] = useState<'profile' | 'timeline' | 'notes'>('profile');
  const [isEditing, setIsEditing] = useState(false);
  const [formData, setFormData] = useState({
    display_name: '',
    phone: '',
    email: '',
    location: '',
  });
  const [copiedScriptId, setCopiedScriptId] = useState<string | null>(null);

  // Customer 360 Notes & Timeline State
  const [notes, setNotes] = useState<CustomerNote[]>([]);
  const [newNoteText, setNewNoteText] = useState('');
  const [isSubmittingNote, setIsSubmittingNote] = useState(false);
  const [timelineEvents, setTimelineEvents] = useState<CustomerTimelineEvent[]>([]);
  const [isLoadingTimeline, setIsLoadingTimeline] = useState(false);

  useEffect(() => {
    if (customer) {
      setFormData({
        display_name: customer.display_name || '',
        phone: customer.phone || '',
        email: customer.email || '',
        location: customer.location || '',
      });
      setIsEditing(false);

      if (customer.id) {
        loadNotes(customer.id);
        loadTimeline(customer.id);
      }
    }
  }, [customer?.id, customer?.display_name, customer?.phone, customer?.email, customer?.location]);

  const loadNotes = async (custId: string) => {
    try {
      const data = await customerApi.getNotes(custId);
      setNotes(data || []);
    } catch (e) {
      console.error('Failed to load customer notes:', e);
    }
  };

  const loadTimeline = async (custId: string) => {
    setIsLoadingTimeline(true);
    try {
      const data = await customerApi.getTimeline(custId);
      setTimelineEvents(data?.items || []);
    } catch (e) {
      console.error('Failed to load customer timeline:', e);
    } finally {
      setIsLoadingTimeline(false);
    }
  };

  const handleAddNoteSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newNoteText.trim() || !customer?.id || isSubmittingNote) return;

    setIsSubmittingNote(true);
    try {
      await customerApi.addNote(customer.id, newNoteText.trim());
      setNewNoteText('');
      await loadNotes(customer.id);
      await loadTimeline(customer.id);
    } catch (e) {
      alert('تعذر إضافة الملاحظة');
    } finally {
      setIsSubmittingNote(false);
    }
  };

  const handleDeleteNoteClick = async (noteId: string) => {
    if (!customer?.id || !confirm('هل أنت تأكد من حذف هذه الملاحظة؟')) return;
    try {
      await customerApi.deleteNote(customer.id, noteId);
      await loadNotes(customer.id);
      await loadTimeline(customer.id);
    } catch (e) {
      alert('تعذر حذف الملاحظة');
    }
  };

  if (!customer || !activeConversation) {
    return (
      <aside className="w-72 md:w-80 bg-white/90 backdrop-blur-md border-r border-slate-200/80 p-6 shrink-0 h-full hidden lg:flex flex-col justify-center items-center text-slate-400 text-xs">
        <User className="w-10 h-10 text-slate-300 mb-2" />
        <span>اختر محادثة لعرض ملف العميل</span>
      </aside>
    );
  }

  const handleSaveContact = async () => {
    if (customer.id) {
      await updateCustomerProfile(customer.id, {
        display_name: formData.display_name.trim() || customer.display_name,
        phone: formData.phone.trim() || undefined,
        email: formData.email.trim() || undefined,
        location: formData.location.trim() || undefined,
      });
    }
    setIsEditing(false);
  };

  const handleSelectAttribute = (key: 'skin_type' | 'tier' | 'stage', value: string) => {
    if (customer.id) {
      updateCustomerProfile(customer.id, { [key]: value });
    }
  };

  const currentSkin = customer.skin_type || 'عادية';
  const currentTier = customer.tier || 'درجة أولى';
  const currentStage = customer.stage || 'جديد';

  const relevantScripts = SALES_SCRIPTS.filter(
    (s) => s.filterKey === currentSkin || s.filterKey === currentStage || s.filterKey === currentTier
  );

  const handleCopyScript = (script: SalesScript) => {
    navigator.clipboard.writeText(script.text);
    setCopiedScriptId(script.id);
    setTimeout(() => setCopiedScriptId(null), 2000);
  };

  const handleInjectScript = (script: SalesScript) => {
    setDraftText(script.text);
  };

  const formatEventTime = (isoStr: string) => {
    if (!isoStr) return '';
    const d = new Date(isoStr);
    return `${d.toLocaleDateString('ar-EG')} ${d.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' })}`;
  };

  return (
    <aside className="w-72 md:w-80 bg-slate-50/90 backdrop-blur-md border-r border-slate-200/80 shrink-0 h-full flex flex-col hidden lg:flex relative z-10 overflow-hidden">
      {/* 1. STICKY TOP CARD: Customer Avatar & Basic Info (Never Scrolls Away) */}
      <div className="shrink-0 p-4 border-b border-slate-200/80 bg-white/95 shadow-xs">
        <div className="flex flex-col items-center text-center relative">
          <div className="relative mb-2">
            {activeConversation.customer_avatar_url || customer.avatar_url ? (
              <img
                src={activeConversation.customer_avatar_url || customer.avatar_url}
                alt=""
                className="h-16 w-16 rounded-full object-cover shadow-sm ring-4 ring-teal-500/10"
              />
            ) : (
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-teal-100 text-teal-800 font-bold text-xl ring-4 ring-teal-500/10 shadow-xs">
                {(formData.display_name || customer.display_name || 'U').charAt(0).toUpperCase()}
              </div>
            )}
          </div>

          {isEditing ? (
            <input
              type="text"
              value={formData.display_name}
              onChange={(e) => setFormData({ ...formData, display_name: e.target.value })}
              placeholder="اسم العميل"
              className="w-full text-xs font-bold text-center border border-teal-300 rounded-lg px-2 py-1 focus:outline-none focus:ring-2 focus:ring-teal-500 bg-teal-50/40"
            />
          ) : (
            <h3 className="font-bold text-xs text-slate-900">{customer.display_name || 'عميل بدون اسم'}</h3>
          )}

          <span className="text-[11px] text-teal-700 font-semibold mt-1">
            {activeConversation.brand || activeConversation.brand_name || 'LUXIRA'} • {activeConversation.channel}
          </span>
        </div>
      </div>

      {/* Tab Selector Bar */}
      <div className="flex items-center justify-around bg-slate-100/90 border-b border-slate-200/80 p-1 text-[11px] font-bold">
        <button
          onClick={() => setActiveSidebarTab('profile')}
          className={`flex-1 py-1.5 rounded-lg transition-all flex items-center justify-center gap-1 ${
            activeSidebarTab === 'profile'
              ? 'bg-white text-teal-800 shadow-xs border border-slate-200/80 font-bold'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <User className="w-3 h-3 text-teal-600" />
          <span>الملف</span>
        </button>
        <button
          onClick={() => setActiveSidebarTab('timeline')}
          className={`flex-1 py-1.5 rounded-lg transition-all flex items-center justify-center gap-1 ${
            activeSidebarTab === 'timeline'
              ? 'bg-white text-teal-800 shadow-xs border border-slate-200/80 font-bold'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <History className="w-3 h-3 text-teal-600" />
          <span>التايم لاين</span>
        </button>
        <button
          onClick={() => setActiveSidebarTab('notes')}
          className={`flex-1 py-1.5 rounded-lg transition-all flex items-center justify-center gap-1 ${
            activeSidebarTab === 'notes'
              ? 'bg-white text-teal-800 shadow-xs border border-slate-200/80 font-bold'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <FileText className="w-3 h-3 text-teal-600" />
          <span>الملاحظات ({notes.length})</span>
        </button>
      </div>

      {/* 2. SCROLLABLE BODY */}
      <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-4">
        {activeSidebarTab === 'timeline' ? (
          /* Customer 360 Timeline Feed */
          <div className="space-y-3">
            <div className="flex items-center justify-between border-b border-slate-200/80 pb-2">
              <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                <History className="w-4 h-4 text-teal-600" /> سجّل التفاعلات (360 Timeline)
              </span>
              <button
                onClick={() => customer.id && loadTimeline(customer.id)}
                className="text-[10px] text-teal-700 font-bold hover:underline"
              >
                تحديث
              </button>
            </div>

            {isLoadingTimeline ? (
              <div className="p-6 text-center text-xs text-slate-400">جاري تحميل التايم لاين...</div>
            ) : timelineEvents.length === 0 ? (
              <div className="p-6 text-center text-xs text-slate-400">لا توجد أحداث سابقة في التايم لاين</div>
            ) : (
              <div className="relative border-r-2 border-slate-200 pr-3 space-y-3 my-2">
                {timelineEvents.map((evt) => (
                  <div key={evt.id} className="relative group">
                    <span className="absolute -right-4.5 top-1 w-2.5 h-2.5 rounded-full bg-teal-500 ring-4 ring-white" />
                    <div className="bg-white p-2.5 rounded-xl border border-slate-200/80 shadow-2xs space-y-1">
                      <div className="flex items-center justify-between text-[10px]">
                        <span className="font-bold text-teal-800 bg-teal-50 px-1.5 py-0.2 rounded border border-teal-200/60">
                          {evt.channel}
                        </span>
                        <span className="text-slate-400">{formatEventTime(evt.created_at)}</span>
                      </div>
                      <p className="text-xs font-bold text-slate-900">{evt.summary}</p>
                      {evt.details?.text && (
                        <p className="text-[11px] text-slate-600 bg-slate-50 p-1.5 rounded border border-slate-100">
                          "{evt.details.text}"
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : activeSidebarTab === 'notes' ? (
          /* Internal Agent Notes Tab */
          <div className="space-y-3">
            <div className="flex items-center justify-between border-b border-slate-200/80 pb-2">
              <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                <FileText className="w-4 h-4 text-teal-600" /> الملاحظات الداخلية للفريق
              </span>
            </div>

            {/* Add Note Form */}
            <form onSubmit={handleAddNoteSubmit} className="space-y-2">
              <textarea
                value={newNoteText}
                onChange={(e) => setNewNoteText(e.target.value)}
                placeholder="أضف ملاحظة خاصة لموظفي الدعم..."
                rows={2}
                className="w-full text-xs p-2.5 rounded-xl border border-slate-200 focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20 bg-white focus:outline-none"
              />
              <button
                type="submit"
                disabled={!newNoteText.trim() || isSubmittingNote}
                className="w-full bg-teal-600 text-white text-xs font-bold py-1.5 px-3 rounded-xl hover:bg-teal-700 disabled:opacity-50 transition shadow-xs flex items-center justify-center gap-1"
              >
                <Send className="w-3.5 h-3.5" />
                <span>إضافة ملاحظة</span>
              </button>
            </form>

            {/* Notes List */}
            <div className="space-y-2 pt-2">
              {notes.length === 0 ? (
                <div className="p-6 text-center text-xs text-slate-400">لا توجد ملاحظات داخلية مضافة بعد</div>
              ) : (
                notes.map((n) => (
                  <div key={n.id} className="bg-white p-3 rounded-2xl border border-slate-200/80 shadow-2xs space-y-1.5">
                    <div className="flex items-center justify-between text-[10px]">
                      <span className="font-bold text-slate-800 bg-slate-100 px-2 py-0.5 rounded-full">
                        {n.author_name || 'موظف الدعم'}
                      </span>
                      <div className="flex items-center gap-2">
                        <span className="text-slate-400">{formatEventTime(n.created_at)}</span>
                        <button
                          type="button"
                          onClick={() => handleDeleteNoteClick(n.id)}
                          className="text-rose-500 hover:text-rose-700 transition"
                          title="حذف الملاحظة"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                    <p className="text-xs text-slate-800 leading-relaxed font-medium">{n.text}</p>
                  </div>
                ))
              )}
            </div>
          </div>
        ) : (
          /* Profile Details Tab */
          <>
        {/* Contact Details with Click-to-Edit */}
        <div className="rounded-2xl bg-white border border-slate-200/80 p-3.5 space-y-2.5 shadow-xs">
          <div className="flex items-center justify-between border-b border-slate-100 pb-2">
            <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
              <User className="h-3.5 w-3.5 text-teal-600"/> بيانات التواصل
            </span>
            {!isEditing ? (
              <button
                onClick={() => setIsEditing(true)}
                className="flex items-center gap-1 text-[11px] font-bold text-teal-700 hover:text-teal-800 transition"
              >
                <Edit2 className="h-3 w-3"/> تعديل
              </button>
            ) : (
              <div className="flex items-center gap-1.5">
                <button
                  onClick={handleSaveContact}
                  className="text-emerald-700 hover:bg-emerald-50 p-1 rounded-md transition"
                  title="حفظ التعديلات"
                >
                  <Check className="h-3.5 w-3.5 font-bold"/>
                </button>
                <button
                  onClick={() => setIsEditing(false)}
                  className="text-rose-600 hover:bg-rose-50 p-1 rounded-md transition"
                  title="إلغاء"
                >
                  <X className="h-3.5 w-3.5"/>
                </button>
              </div>
            )}
          </div>

          {/* Location */}
          <div className="flex items-center gap-2 text-xs text-slate-700">
            <MapPin className="h-3.5 w-3.5 text-teal-600 shrink-0"/>
            {isEditing ? (
              <input
                type="text"
                value={formData.location}
                onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                placeholder="الموقع / الدولة"
                className="w-full rounded-md border border-slate-300 bg-slate-50 px-2 py-0.5 text-xs focus:ring-1 focus:ring-teal-500 outline-none"
              />
            ) : (
              <span className="font-semibold text-slate-800">{customer.location || 'غير ذلك'}</span>
            )}
          </div>

          {/* Phone */}
          <div className="flex items-center gap-2 text-xs text-slate-700">
            <Phone className="h-3.5 w-3.5 text-teal-600 shrink-0"/>
            {isEditing ? (
              <input
                type="text"
                value={formData.phone}
                onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                placeholder="رقم الهاتف"
                className="w-full rounded-md border border-slate-300 bg-slate-50 px-2 py-0.5 text-xs focus:ring-1 focus:ring-teal-500 outline-none"
              />
            ) : (
              <span className={customer.phone ? "text-slate-800 font-mono" : "text-slate-400"}>
                {customer.phone || 'غير مسجل'}
              </span>
            )}
          </div>

          {/* Email */}
          <div className="flex items-center gap-2 text-xs text-slate-700">
            <Mail className="h-3.5 w-3.5 text-teal-600 shrink-0"/>
            {isEditing ? (
              <input
                type="email"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                placeholder="البريد الإلكتروني"
                className="w-full rounded-md border border-slate-300 bg-slate-50 px-2 py-0.5 text-xs focus:ring-1 focus:ring-teal-500 outline-none"
              />
            ) : (
              <span className={customer.email ? "text-slate-800 truncate" : "text-slate-400"}>
                {customer.email || 'غير مسجل'}
              </span>
            )}
          </div>

          {isEditing && (
            <button
              onClick={handleSaveContact}
              className="w-full mt-2 py-1 bg-teal-600 text-white rounded-lg text-xs font-bold hover:bg-teal-700 transition shadow-xs"
            >
              حفظ البيانات
            </button>
          )}
        </div>

        {/* Google Material 3 Segmented Classifications */}
        <div className="space-y-3.5 pt-1">
          {/* Tier */}
          <div>
            <label className="text-[11px] font-bold text-slate-600 block mb-1.5">تقييم العميل (الدرجة)</label>
            <div className="grid grid-cols-3 gap-1.5">
              {['درجة أولى', 'درجة ثانية', 'درجة ثالثة'].map((tier) => (
                <button
                  key={tier}
                  onClick={() => handleSelectAttribute('tier', tier)}
                  className={`py-1.5 px-2 rounded-xl text-[11px] font-semibold transition-all text-center border ${
                    currentTier === tier
                      ? 'bg-indigo-600 text-white border-indigo-600 shadow-xs font-bold'
                      : 'bg-white text-slate-700 hover:bg-slate-100 border-slate-200 font-medium'
                  }`}
                >
                  {tier}
                </button>
              ))}
            </div>
          </div>

          {/* Skin Type */}
          <div>
            <label className="text-[11px] font-bold text-slate-600 block mb-1.5">نوع البشرة</label>
            <div className="grid grid-cols-4 gap-1">
              {['دهنية', 'جافة', 'مختلطة', 'عادية'].map((skin) => (
                <button
                  key={skin}
                  onClick={() => handleSelectAttribute('skin_type', skin)}
                  className={`py-1.5 px-1 rounded-xl text-[11px] font-semibold transition-all text-center border ${
                    currentSkin === skin
                      ? 'bg-teal-600 text-white border-teal-600 shadow-xs font-bold'
                      : 'bg-white text-slate-700 hover:bg-slate-100 border-slate-200 font-medium'
                  }`}
                >
                  {skin}
                </button>
              ))}
            </div>
          </div>

          {/* Sales Stage */}
          <div>
            <label className="text-[11px] font-bold text-slate-600 block mb-1.5">مرحلة الشراء والطلب</label>
            <div className="grid grid-cols-4 gap-1">
              {['جديد', 'قيد المتابعة', 'تم البيع', 'ملغى'].map((stage) => (
                <button
                  key={stage}
                  onClick={() => handleSelectAttribute('stage', stage)}
                  className={`py-1.5 px-1 rounded-xl text-[11px] font-semibold transition-all text-center border ${
                    currentStage === stage
                      ? 'bg-amber-600 text-white border-amber-600 shadow-xs font-bold'
                      : 'bg-white text-slate-700 hover:bg-slate-100 border-slate-200 font-medium'
                  }`}
                >
                  {stage}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Smart Dynamic Sales Scripts */}
        <div className="pt-3 border-t border-slate-200/80 space-y-2.5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
              <Sparkles className="h-3.5 w-3.5 text-amber-500"/> القوالب الذكية المقترحة
            </span>
            <span className="text-[10px] bg-teal-100 text-teal-800 px-2 py-0.5 rounded-full font-bold">
              {currentSkin}
            </span>
          </div>

          <div className="space-y-2">
            {relevantScripts.map((script) => (
              <div key={script.id} className="rounded-xl border border-slate-200/80 bg-white p-3 space-y-2 shadow-xs hover:border-teal-300 transition">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold text-slate-800">{script.title}</h4>
                  <span className="text-[9px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 font-bold">
                    {script.filterKey}
                  </span>
                </div>
                <p className="text-[10px] text-slate-600 leading-relaxed font-sans">{script.text}</p>
                <div className="flex items-center gap-1.5 pt-1">
                  <button
                    onClick={() => handleInjectScript(script)}
                    className="flex-1 py-1 px-2 rounded-lg bg-teal-600 text-white text-[10px] font-bold hover:bg-teal-700 transition text-center shadow-xs flex items-center justify-center gap-1"
                  >
                    <Send className="w-3 h-3" />
                    <span>إدراج في الشات</span>
                  </button>
                  <button
                    onClick={() => handleCopyScript(script)}
                    className="p-1 px-2 rounded-lg border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-600 transition flex items-center justify-center gap-1 text-[10px] font-bold"
                    title="نسخ القالب"
                  >
                    <Copy className="h-3.5 w-3.5 text-slate-500"/>
                    <span>{copiedScriptId === script.id ? 'تم!' : 'نسخ'}</span>
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
        </>
        )}
      </div>
    </aside>
  );
};
