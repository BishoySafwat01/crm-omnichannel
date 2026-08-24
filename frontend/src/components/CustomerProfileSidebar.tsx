import React, { useState, useEffect } from 'react';
import { useCrmStore } from '../store/useCrmStore';
import { useAuthStore } from '../store/useAuthStore';
import {
  User, Phone, Mail, MapPin, Edit2, Check, X,
  Sparkles, Copy, Send, History, FileText, Trash2, ExternalLink,
  Ban, ShieldAlert, ShieldCheck, AlertCircle
} from 'lucide-react';
import { SALES_SCRIPTS, SalesScript } from '../data/salesScripts';
import { customerApi, CustomerNote, CustomerTimelineEvent } from '../services/api';
import { UserAvatar } from './UserAvatar';
import { ConversationAvatar } from './ConversationAvatar';
import { useCustomerPresence } from '../hooks/useCustomerPresence';

export const CustomerProfileSidebar: React.FC = () => {
  const { conversations, activeConversationId, updateCustomerProfile, setDraftText, isTyping, blockCustomer, unblockCustomer } = useCrmStore();
  const { user } = useAuthStore();
  const isAdmin = user?.role === 'admin' || (user?.role as any) === 'ADMIN';

  const [isBlockModalOpen, setIsBlockModalOpen] = useState(false);
  const [blockReason, setBlockReason] = useState('');
  const [isBlockActionLoading, setIsBlockActionLoading] = useState(false);

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

  const isCustomerTyping = Boolean(activeConversation ? isTyping[activeConversation.id] : false);
  const presence = useCustomerPresence(
    customer?.last_activity_at || activeConversation?.last_activity_at || activeConversation?.last_customer_message_at || activeConversation?.last_message_at,
    isCustomerTyping
  );

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
      <aside className="w-80 md:w-88 bg-white/70 backdrop-blur-xl border border-white/60 shadow-[0_4px_20px_-2px_rgba(0,0,0,0.03)] rounded-2xl shrink-0 h-[calc(100vh-80px)] flex-col hidden lg:flex relative z-10 items-center justify-center p-6 text-center text-slate-400 space-y-2">
        <User className="w-8 h-8 text-slate-300 mx-auto mb-1" />
        <p className="text-xs font-extrabold text-slate-700">لا توجد محادثة محددة</p>
        <p className="text-[11px] text-slate-400 font-medium">اختر محادثة لعرض بيانات وتفاصيل العميل</p>
      </aside>
    );
  }

  const handleSaveContact = async () => {
    if (customer?.id) {
      const locVal = formData.location.trim() || undefined;
      await updateCustomerProfile(customer.id, {
        display_name: formData.display_name.trim() || customer.display_name,
        phone: formData.phone.trim() || undefined,
        email: formData.email.trim() || undefined,
        location: locVal,
        country: locVal,
      });
    }
    setIsEditing(false);
  };

  const handleBlockCustomer = async () => {
    if (!customer?.id) return;
    try {
      setIsBlockActionLoading(true);
      await blockCustomer(customer.id, blockReason.trim() || undefined);
      setIsBlockModalOpen(false);
      setBlockReason('');
      if (customer.id) {
        await loadTimeline(customer.id);
      }
    } catch (err: any) {
      alert(err?.message || 'فشل حظر العميل');
    } finally {
      setIsBlockActionLoading(false);
    }
  };

  const handleUnblockCustomer = async () => {
    if (!customer?.id) return;
    if (!window.confirm('هل أنت متأكد من رغبتك في إلغاء حظر هذا العميل؟')) return;
    try {
      setIsBlockActionLoading(true);
      await unblockCustomer(customer.id);
      if (customer.id) {
        await loadTimeline(customer.id);
      }
    } catch (err: any) {
      alert(err?.message || 'فشل إلغاء حظر العميل');
    } finally {
      setIsBlockActionLoading(false);
    }
  };

  const handleSelectAttribute = (key: 'skin_type' | 'tier' | 'stage', value: string) => {
    if (customer?.id) {
      updateCustomerProfile(customer.id, { [key]: value });
    }
  };

  const currentSkin = customer?.skin_type || 'عادية';
  const currentTier = customer?.tier || 'درجة أولى';
  const currentStage = customer?.stage || 'جديد';

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

  const formatJoinDate = (isoStr?: string) => {
    if (!isoStr) return 'غير متوفر';
    try {
      const d = new Date(isoStr);
      return d.toLocaleDateString('ar-EG', { year: 'numeric', month: 'long' });
    } catch {
      return 'غير متوفر';
    }
  };

  const formattedLocation = customer?.country
    ? (customer?.city ? `${customer.city} - ${customer.country}` : customer.country)
    : (customer?.location || 'غير محدد');

  const customerOrder = (customer as any)?.metadata_?.order || (customer as any)?.order;

  return (
    <aside className="w-80 md:w-88 bg-white/70 backdrop-blur-xl border border-white/60 shadow-[0_4px_20px_-2px_rgba(0,0,0,0.03)] rounded-2xl shrink-0 h-[calc(100vh-80px)] flex flex-col hidden lg:flex relative z-10 overflow-hidden p-3.5 space-y-3.5">
      {/* Scrollable Container with 3 Distinct Glass Cards */}
      <div className="flex-1 overflow-y-auto space-y-3.5 scrollbar-none pr-0.5">
        
        {/* CARD 1: بيانات العميل (Customer Info Glass Card) */}
        <div className="bg-white/80 backdrop-blur-md rounded-2xl p-4 border border-white/80 shadow-2xs space-y-3">
          <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
            <h4 className="text-xs font-extrabold text-slate-800 flex items-center gap-1.5">
              <User className="w-4 h-4 text-[#1A73E8]" />
              <span>بيانات العميل</span>
            </h4>
            {!isEditing ? (
              <button
                onClick={() => setIsEditing(true)}
                className="text-[11px] font-bold text-[#1A73E8] hover:underline transition flex items-center gap-0.5"
              >
                <Edit2 className="w-3 h-3" />
                <span>تعديل</span>
              </button>
            ) : (
              <div className="flex items-center gap-1">
                <button
                  onClick={handleSaveContact}
                  className="text-teal-700 hover:bg-teal-50 p-1 rounded-lg transition"
                >
                  <Check className="w-3.5 h-3.5 font-bold" />
                </button>
                <button
                  onClick={() => setIsEditing(false)}
                  className="text-rose-600 hover:bg-rose-50 p-1 rounded-lg transition"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
          </div>

          {/* Centered Avatar & Status */}
          <div className="flex flex-col items-center text-center py-1">
            <div className="mb-2">
              <ConversationAvatar
                customerName={customer.display_name || 'عميل'}
                customerAvatarUrl={customer.avatar_url}
                brandId={activeConversation?.brand_id}
                brandName={activeConversation?.brand || activeConversation?.brand_name}
                channel={activeConversation?.channel}
                size="xl"
                showPresenceDot={true}
                presenceDotColor={presence.dotColor}
                presenceStatusText={presence.statusText}
              />
            </div>

            {isEditing ? (
              <input
                type="text"
                value={formData.display_name}
                onChange={(e) => setFormData({ ...formData, display_name: e.target.value })}
                placeholder="اسم العميل"
                className="w-full text-xs font-bold text-center border border-blue-300 rounded-xl px-2.5 py-1 focus:outline-none focus:ring-2 focus:ring-[#1A73E8]/20 bg-blue-50/40"
              />
            ) : (
              <h3 className="font-extrabold text-sm text-slate-900">{customer.display_name || 'عميل غير مسمى'}</h3>
            )}

            <span className={`text-xs font-bold mt-0.5 ${presence.colorClass}`}>{presence.statusText}</span>
          </div>

          {/* Contact Information Fields */}
          <div className="space-y-2 pt-1 border-t border-slate-100 text-xs">
            {/* Phone */}
            <div className="flex items-center gap-2.5 text-slate-700">
              <Phone className="w-3.5 h-3.5 text-[#1A73E8] shrink-0" />
              {isEditing ? (
                <input
                  type="text"
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  placeholder="رقم الهاتف"
                  className="w-full rounded-lg border border-slate-200 bg-white px-2 py-0.5 text-xs focus:ring-1 focus:ring-[#1A73E8] outline-none"
                />
              ) : (
                <span className="font-mono text-slate-800 font-semibold">{customer.phone || 'غير مسجل'}</span>
              )}
            </div>

            {/* Email */}
            <div className="flex items-center gap-2.5 text-slate-700">
              <Mail className="w-3.5 h-3.5 text-[#1A73E8] shrink-0" />
              {isEditing ? (
                <input
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  placeholder="البريد الإلكتروني"
                  className="w-full rounded-lg border border-slate-200 bg-white px-2 py-0.5 text-xs focus:ring-1 focus:ring-[#1A73E8] outline-none"
                />
              ) : (
                <span className="font-medium text-slate-700 truncate">{customer.email || 'غير مسجل'}</span>
              )}
            </div>

            {/* Location */}
            <div className="flex items-center gap-2.5 text-slate-700">
              <MapPin className="w-3.5 h-3.5 text-[#1A73E8] shrink-0" />
              {isEditing ? (
                <input
                  type="text"
                  value={formData.location}
                  onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                  placeholder="الموقع"
                  className="w-full rounded-lg border border-slate-200 bg-white px-2 py-0.5 text-xs focus:ring-1 focus:ring-[#1A73E8] outline-none"
                />
              ) : (
                <span className="font-semibold text-slate-800">{formattedLocation}</span>
              )}
            </div>

            {/* Join Date */}
            <div className="flex items-center gap-2.5 text-slate-700">
              <History className="w-3.5 h-3.5 text-[#1A73E8] shrink-0" />
              <span className="font-medium text-slate-500 text-[11px]">العميل منذ: {formatJoinDate(customer.created_at)}</span>
            </div>
          </div>

          {/* Blocked Status Banner & Actions */}
          {customer.is_blocked ? (
            <div className="mt-2 bg-rose-50/90 border border-rose-200 rounded-xl p-2.5 space-y-2 text-xs">
              <div className="flex items-center gap-1.5 font-extrabold text-rose-700">
                <Ban className="w-4 h-4 text-rose-600 shrink-0" />
                <span>⛔ العميل محظور حالياً</span>
              </div>
              {customer.blocked_reason && (
                <div className="text-[11px] text-rose-800 bg-white/80 p-2 rounded-lg border border-rose-100/80 leading-relaxed">
                  <span className="font-bold text-rose-900 block mb-0.5">سبب الحظر:</span>
                  {customer.blocked_reason}
                </div>
              )}
              {isAdmin ? (
                <button
                  onClick={handleUnblockCustomer}
                  disabled={isBlockActionLoading}
                  className="w-full py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-lg transition text-xs flex items-center justify-center gap-1.5 shadow-xs disabled:opacity-50"
                >
                  <ShieldCheck className="w-3.5 h-3.5" />
                  <span>إلغاء حظر العميل (مشرف)</span>
                </button>
              ) : (
                <p className="text-[10px] text-rose-500 text-center font-medium">
                  تم الحظر من قِبل الإدارة. للمشرفين فقط صلاحية فك الحظر.
                </p>
              )}
            </div>
          ) : (
            isAdmin && (
              <button
                onClick={() => setIsBlockModalOpen(true)}
                className="w-full mt-2 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200/80 text-xs font-bold rounded-xl transition text-center flex items-center justify-center gap-1.5"
              >
                <Ban className="w-3.5 h-3.5 text-rose-600" />
                <span>حظر العميل (مشرف)</span>
              </button>
            )
          )}

          <button className="w-full mt-1.5 py-1.5 bg-[#E8F0FE] hover:bg-blue-100 text-[#1A73E8] border border-[#1A73E8]/20 text-xs font-bold rounded-xl transition text-center">
            عرض الملف الشخصي الكامل
          </button>
        </div>

        {/* Modal: حظر العميل (Admin Block Confirmation) */}
        {isBlockModalOpen && (
          <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl p-5 w-full max-w-sm shadow-2xl border border-slate-100 space-y-4 animate-in fade-in zoom-in-95 duration-150">
              <div className="flex items-center gap-2.5 text-rose-600 border-b border-slate-100 pb-3">
                <div className="w-9 h-9 rounded-xl bg-rose-50 flex items-center justify-center shrink-0">
                  <ShieldAlert className="w-5 h-5 text-rose-600" />
                </div>
                <div>
                  <h3 className="font-extrabold text-sm text-slate-900">تأكيد حظر العميل</h3>
                  <p className="text-[11px] text-slate-500 font-medium">{customer.display_name}</p>
                </div>
              </div>

              <p className="text-xs text-slate-600 leading-relaxed font-medium">
                عند حظر هذا العميل، سيتم إيقاف إرسال واستقبال الرسائل معه وإشعار فريق العمل. لن يتمكن الموظفون من مراسلته حتى يتم فك الحظر بواسطة مشرف.
              </p>

              <div className="space-y-1.5">
                <label className="text-[11px] font-bold text-slate-700 block">سبب الحظر (اختياري):</label>
                <textarea
                  value={blockReason}
                  onChange={(e) => setBlockReason(e.target.value)}
                  placeholder="مثال: إساءة متكررة / عميل احتيالي / بناءً على طلب الإدارة..."
                  rows={2}
                  className="w-full text-xs rounded-xl border border-slate-200 p-2 focus:ring-2 focus:ring-rose-500/20 focus:border-rose-500 outline-none resize-none"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  onClick={() => {
                    setIsBlockModalOpen(false);
                    setBlockReason('');
                  }}
                  disabled={isBlockActionLoading}
                  className="px-3.5 py-1.5 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100 transition"
                >
                  إلغاء
                </button>
                <button
                  onClick={handleBlockCustomer}
                  disabled={isBlockActionLoading}
                  className="px-4 py-1.5 rounded-xl text-xs font-bold bg-rose-600 hover:bg-rose-700 text-white transition flex items-center gap-1.5 shadow-sm disabled:opacity-50"
                >
                  <Ban className="w-3.5 h-3.5" />
                  <span>{isBlockActionLoading ? 'جاري الحظر...' : 'تأكيد الحظر'}</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* CARD 2: تفاصيل الطلب (Order Info Glass Card) */}
        <div className="bg-white/80 backdrop-blur-md rounded-2xl p-4 border border-white/80 shadow-2xs space-y-3">
          <div className="flex items-center justify-between border-b border-slate-100 pb-2">
            <h4 className="text-xs font-extrabold text-slate-800 flex items-center gap-1.5">
              <Sparkles className="w-4 h-4 text-amber-500" />
              <span>تفاصيل الطلب الحالي</span>
            </h4>
            {customerOrder?.status && (
              <span className="text-[10px] bg-amber-50 text-amber-800 font-bold px-2 py-0.5 rounded-full border border-amber-200">
                {customerOrder.status}
              </span>
            )}
          </div>

          {customerOrder ? (
            <div className="space-y-2 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-slate-500 font-medium">رقم الطلب:</span>
                <span className="font-extrabold text-slate-900 font-mono">#{customerOrder.id || customerOrder.number}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-500 font-medium">تاريخ الطلب:</span>
                <span className="font-semibold text-slate-700">{customerOrder.date || 'اليوم'}</span>
              </div>
              <div className="flex items-center justify-between pt-1 border-t border-slate-100">
                <span className="text-slate-600 font-bold">إجمالي المبلغ:</span>
                <span className="font-extrabold text-[#1A73E8] text-sm">{customerOrder.amount || '0.00 EGP'}</span>
              </div>
              <button className="w-full mt-2 py-1.5 bg-[#E8F0FE] hover:bg-blue-100 text-[#1A73E8] border border-[#1A73E8]/20 text-xs font-bold rounded-xl transition flex items-center justify-center gap-1.5">
                <span>عرض تفاصيل الطلب</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </button>
            </div>
          ) : (
            <div className="p-3 text-center text-xs text-slate-400 font-medium space-y-2">
              <p>لا توجد طلبات مسجلة حالياً</p>
              <button
                type="button"
                className="w-full py-1.5 bg-[#E8F0FE] hover:bg-blue-100 text-[#1A73E8] border border-[#1A73E8]/20 text-xs font-bold rounded-xl transition flex items-center justify-center gap-1.5"
              >
                <span>+ تسجيل طلب جديد</span>
              </button>
            </div>
          )}
        </div>

        {/* CARD 3: ملاحظات الفريق (Internal Team Notes Glass Card) */}
        <div className="bg-white/80 backdrop-blur-md rounded-2xl p-4 border border-white/80 shadow-2xs space-y-3">
          <div className="flex items-center justify-between border-b border-slate-100 pb-2">
            <h4 className="text-xs font-extrabold text-slate-800 flex items-center gap-1.5">
              <FileText className="w-4 h-4 text-[#1A73E8]" />
              <span>ملاحظات فريق العمل</span>
            </h4>
          </div>

          {/* Add Note Quick Input */}
          <form onSubmit={handleAddNoteSubmit} className="space-y-2">
            <textarea
              value={newNoteText}
              onChange={(e) => setNewNoteText(e.target.value)}
              placeholder="أضف ملاحظة خاصة بفريق الدعم..."
              rows={2}
              className="w-full text-xs p-2.5 rounded-xl border border-slate-200 focus:border-[#1A73E8] focus:outline-none bg-slate-50 font-medium placeholder-slate-400"
            />
            <button
              type="submit"
              disabled={!newNoteText.trim() || isSubmittingNote}
              className="w-full bg-[#1A73E8] text-white text-xs font-bold py-1.5 px-3 rounded-xl hover:bg-[#1557B0] disabled:opacity-50 transition shadow-2xs flex items-center justify-center gap-1.5"
            >
              <Send className="w-3.5 h-3.5" />
              <span>إضافة ملاحظة</span>
            </button>
          </form>

          {/* Notes Feed */}
          <div className="space-y-2 pt-1">
            {notes.length === 0 ? (
              <div className="p-4 text-center text-xs text-slate-400 font-medium">لا توجد ملاحظات سابقة</div>
            ) : (
              notes.map((n) => (
                <div key={n.id} className="bg-slate-50/80 p-2.5 rounded-xl border border-slate-100 space-y-1">
                  <div className="flex items-center justify-between text-[10px]">
                    <span className="font-bold text-slate-800 bg-white px-2 py-0.5 rounded-md border border-slate-200/60">
                      {n.author_name || 'موظف الدعم'}
                    </span>
                    <div className="flex items-center gap-1.5">
                      <span className="text-slate-400">{formatEventTime(n.created_at)}</span>
                      <button
                        type="button"
                        onClick={() => handleDeleteNoteClick(n.id)}
                        className="text-rose-500 hover:text-rose-700 transition"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                  <p className="text-xs text-slate-800 font-medium leading-relaxed">{n.text}</p>
                </div>
              ))
            )}
          </div>
        </div>

      </div>
    </aside>
  );
};
