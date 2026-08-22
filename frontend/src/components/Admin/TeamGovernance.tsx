import React, { useEffect, useState } from 'react';
import {
  Users,
  UserPlus,
  Shield,
  Clock,
  Activity,
  CheckCircle,
  XCircle,
  Edit,
  Trash2,
  Lock,
  Mail,
  User as UserIcon,
  Tag,
  Search,
  Filter,
  RefreshCw,
  FileText,
  Building,
  X,
  Check,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { teamApi, TeamMember, AuditLog } from '../../services/api';
import { MOCK_BRANDS } from '../../services/api';

export const TeamGovernance: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'roster' | 'audit'>('roster');

  // Team Roster State
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [loadingMembers, setLoadingMembers] = useState<boolean>(true);
  const [searchMemberQuery, setSearchMemberQuery] = useState<string>('');

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [editingMember, setEditingMember] = useState<TeamMember | null>(null);
  const [formData, setFormData] = useState({
    email: '',
    password: '',
    full_name: '',
    role: 'agent',
    brand_access: ['LAVVA'] as string[],
    channel_access: ['ALL'] as string[],
    is_active: true,
  });
  const [availableChannels, setAvailableChannels] = useState<string[]>([
    'messenger',
    'instagram',
    'whatsapp',
    'tiktok',
  ]);
  const [modalError, setModalError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  // Audit Logs State
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [loadingAudit, setLoadingAudit] = useState<boolean>(false);
  const [auditActionFilter, setAuditActionFilter] = useState<string>('all');
  const [searchAuditQuery, setSearchAuditQuery] = useState<string>('');
  const [auditPage, setAuditPage] = useState<number>(1);
  const [totalAuditLogs, setTotalAuditLogs] = useState<number>(0);
  const [totalAuditPages, setTotalAuditPages] = useState<number>(1);
  const [selectedAuditLog, setSelectedAuditLog] = useState<AuditLog | null>(null);

  const availableBrands = MOCK_BRANDS.filter((b) => b.id !== 'all').map((b) => b.id);

  useEffect(() => {
    fetchMembers();
    teamApi.listSupportedChannels().then((chans) => {
      if (chans && chans.length > 0) setAvailableChannels(chans);
    }).catch(() => {});
  }, []);

  useEffect(() => {
    if (activeTab === 'audit') {
      const handler = setTimeout(() => {
        fetchAuditLogs();
      }, 250);
      return () => clearTimeout(handler);
    }
  }, [activeTab, auditActionFilter, searchAuditQuery, auditPage]);

  const fetchMembers = async () => {
    setLoadingMembers(true);
    try {
      const data = await teamApi.listMembers();
      setMembers(data);
    } catch (err) {
      console.error('Failed to fetch team members:', err);
    } finally {
      setLoadingMembers(false);
    }
  };

  const fetchAuditLogs = async () => {
    setLoadingAudit(true);
    try {
      const res = await teamApi.listAuditLogs({
        action: auditActionFilter !== 'all' ? auditActionFilter : undefined,
        search: searchAuditQuery.trim() ? searchAuditQuery.trim() : undefined,
        page: auditPage,
        page_size: 20,
      });
      setAuditLogs(res.items);
      setTotalAuditLogs(res.total);
      setTotalAuditPages(res.total_pages);
    } catch (err) {
      console.error('Failed to fetch audit logs:', err);
    } finally {
      setLoadingAudit(false);
    }
  };

  const handleOpenAddModal = () => {
    setEditingMember(null);
    setFormData({
      email: '',
      password: '',
      full_name: '',
      role: 'agent',
      brand_access: ['LAVVA'],
      channel_access: ['ALL'],
      is_active: true,
    });
    setModalError(null);
    setIsModalOpen(true);
  };

  const handleOpenEditModal = (member: TeamMember) => {
    setEditingMember(member);
    setFormData({
      email: member.email,
      password: '',
      full_name: member.full_name,
      role: member.role,
      brand_access: Array.isArray(member.brand_access) ? member.brand_access : ['LAVVA'],
      channel_access: Array.isArray(member.channel_access) && member.channel_access.length > 0 ? member.channel_access : ['ALL'],
      is_active: member.is_active,
    });
    setModalError(null);
    setIsModalOpen(true);
  };

  const handleToggleBrandAccess = (brandId: string) => {
    setFormData((prev) => {
      let updated: string[];
      if (brandId === 'ALL' || brandId === 'الكل') {
        updated = prev.brand_access.includes('ALL') ? [] : ['ALL'];
      } else {
        const filtered = prev.brand_access.filter((b) => b !== 'ALL' && b !== 'الكل');
        if (filtered.includes(brandId)) {
          updated = filtered.filter((b) => b !== brandId);
        } else {
          updated = [...filtered, brandId];
        }
      }
      return { ...prev, brand_access: updated };
    });
  };

  const handleToggleChannelAccess = (channelId: string) => {
    setFormData((prev) => {
      let updated: string[];
      const isAllToggle = channelId.toUpperCase() === 'ALL' || channelId === 'الكل';
      const hasAll = prev.channel_access.some((c) => c.toUpperCase() === 'ALL' || c === 'الكل');

      if (isAllToggle) {
        updated = hasAll ? [] : ['ALL'];
      } else {
        const filtered = prev.channel_access.filter((c) => c.toUpperCase() !== 'ALL' && c !== 'الكل');
        const normChan = channelId.toLowerCase();
        if (filtered.map((x) => x.toLowerCase()).includes(normChan)) {
          updated = filtered.filter((c) => c.toLowerCase() !== normChan);
        } else {
          updated = [...filtered, normChan];
        }
      }
      return { ...prev, channel_access: updated };
    });
  };

  const handleSubmitForm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.full_name.trim()) {
      setModalError('يرجى إدخال الاسم الكامل.');
      return;
    }
    if (!editingMember && !formData.password.trim()) {
      setModalError('يرجى إدخال كلمة المرور.');
      return;
    }

    setIsSubmitting(true);
    setModalError(null);

    try {
      if (editingMember) {
        await teamApi.updateMember(editingMember.id, {
          full_name: formData.full_name,
          role: formData.role,
          brand_access: formData.brand_access,
          channel_access: formData.channel_access,
          is_active: formData.is_active,
          password: formData.password.trim() ? formData.password : undefined,
        });
      } else {
        await teamApi.createMember({
          email: formData.email,
          password: formData.password,
          full_name: formData.full_name,
          role: formData.role,
          brand_access: formData.brand_access,
          channel_access: formData.channel_access,
          is_active: formData.is_active,
        });
      }

      setIsModalOpen(false);
      fetchMembers();
    } catch (err: any) {
      setModalError(err.message || 'حدث خطأ أثناء حفظ البيانات.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeactivateMember = async (member: TeamMember) => {
    if (member.email.toLowerCase() === 'admin@luxira.com') {
      alert('لا يمكن إيقاف حساب المدير الرئيسي للنظام.');
      return;
    }
    if (!window.confirm(`هل أنت تأكد من إيقاف/تغيير حالة حساب "${member.full_name}"؟`)) {
      return;
    }

    try {
      await teamApi.updateMember(member.id, { is_active: !member.is_active });
      fetchMembers();
    } catch (err: any) {
      alert(err.message || 'فشل تغيير حالة الحساب');
    }
  };

  const filteredMembers = members.filter(
    (m) =>
      m.full_name.toLowerCase().includes(searchMemberQuery.toLowerCase()) ||
      m.email.toLowerCase().includes(searchMemberQuery.toLowerCase()) ||
      m.role.toLowerCase().includes(searchMemberQuery.toLowerCase())
  );

  const getRoleBadge = (role: string) => {
    switch (role.toLowerCase()) {
      case 'admin':
        return (
          <span className="px-2.5 py-1 rounded-full bg-purple-100 text-purple-800 text-[11px] font-bold border border-purple-200 flex items-center gap-1 w-max">
            <Shield className="w-3 h-3 text-purple-600" />
            <span>مدير النظام</span>
          </span>
        );
      case 'supervisor':
        return (
          <span className="px-2.5 py-1 rounded-full bg-blue-100 text-blue-800 text-[11px] font-bold border border-blue-200 flex items-center gap-1 w-max">
            <UserIcon className="w-3 h-3 text-blue-600" />
            <span>مشرف فريق</span>
          </span>
        );
      default:
        return (
          <span className="px-2.5 py-1 rounded-full bg-teal-100 text-teal-800 text-[11px] font-bold border border-teal-200 flex items-center gap-1 w-max">
            <Users className="w-3 h-3 text-teal-600" />
            <span>موظف خدمة عملاء</span>
          </span>
        );
    }
  };

  const getActionBadge = (action: string) => {
    switch (action) {
      case 'auth.login':
        return <span className="px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 text-[11px] font-bold border border-blue-200">تسجيل دخول</span>;
      case 'auth.logout':
        return <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 text-[11px] font-bold border border-slate-200">تسجيل خروج</span>;
      case 'user.created':
        return <span className="px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 text-[11px] font-bold border border-emerald-200">إنشاء عضو</span>;
      case 'user.updated':
        return <span className="px-2 py-0.5 rounded-full bg-cyan-50 text-cyan-700 text-[11px] font-bold border border-cyan-200">تعديل عضو</span>;
      case 'user.activated':
        return <span className="px-2 py-0.5 rounded-full bg-teal-50 text-teal-700 text-[11px] font-bold border border-teal-200">تفعيل حساب</span>;
      case 'user.deactivated':
        return <span className="px-2 py-0.5 rounded-full bg-rose-50 text-rose-700 text-[11px] font-bold border border-rose-200">تعطيل حساب</span>;
      case 'conversation.assigned':
        return <span className="px-2 py-0.5 rounded-full bg-amber-50 text-amber-800 text-[11px] font-bold border border-amber-200">إسناد محادثة</span>;
      case 'conversation.unassigned':
        return <span className="px-2 py-0.5 rounded-full bg-orange-50 text-orange-800 text-[11px] font-bold border border-orange-200">إلغاء إسناد</span>;
      case 'conversation.status_changed':
        return <span className="px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 text-[11px] font-bold border border-indigo-200">تغيير حالة المحادثة</span>;
      case 'conversation.priority_changed':
        return <span className="px-2 py-0.5 rounded-full bg-violet-50 text-violet-700 text-[11px] font-bold border border-violet-200">تغيير الأولوية</span>;
      case 'message.sent':
        return <span className="px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 text-[11px] font-bold border border-emerald-200">إرسال رسالة</span>;
      case 'message.media_sent':
        return <span className="px-2 py-0.5 rounded-full bg-purple-50 text-purple-700 text-[11px] font-bold border border-purple-200">إرسال وسائط</span>;
      case 'customer.created':
        return <span className="px-2 py-0.5 rounded-full bg-sky-50 text-sky-700 text-[11px] font-bold border border-sky-200">إنشاء عميل</span>;
      case 'customer.updated':
        return <span className="px-2 py-0.5 rounded-full bg-sky-50 text-sky-700 text-[11px] font-bold border border-sky-200">تعديل عميل</span>;
      case 'customer.stage_changed':
        return <span className="px-2 py-0.5 rounded-full bg-blue-50 text-blue-800 text-[11px] font-bold border border-blue-200">تغيير مرحلة العميل</span>;
      case 'customer.tier_changed':
        return <span className="px-2 py-0.5 rounded-full bg-amber-50 text-amber-800 text-[11px] font-bold border border-amber-200">تغيير درجة العميل</span>;
      case 'customer.note_created':
        return <span className="px-2 py-0.5 rounded-full bg-teal-50 text-teal-700 text-[11px] font-bold border border-teal-200">إضافة ملاحظة</span>;
      case 'customer.note_deleted':
        return <span className="px-2 py-0.5 rounded-full bg-rose-50 text-rose-700 text-[11px] font-bold border border-rose-200">حذف ملاحظة</span>;
      case 'automation.created':
        return <span className="px-2 py-0.5 rounded-full bg-fuchsia-50 text-fuchsia-700 text-[11px] font-bold border border-fuchsia-200">إنشاء أتمتة</span>;
      case 'automation.updated':
      case 'automation.enabled':
      case 'automation.disabled':
        return <span className="px-2 py-0.5 rounded-full bg-pink-50 text-pink-700 text-[11px] font-bold border border-pink-200">تعديل أتمتة</span>;
      case 'automation.deleted':
        return <span className="px-2 py-0.5 rounded-full bg-rose-50 text-rose-700 text-[11px] font-bold border border-rose-200">حذف أتمتة</span>;
      case 'media.uploaded':
        return <span className="px-2 py-0.5 rounded-full bg-purple-50 text-purple-700 text-[11px] font-bold border border-purple-200">رفع وسائط</span>;
      default:
        return <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 text-[11px] font-bold border border-slate-200">{action}</span>;
    }
  };

  const renderPayloadSummary = (log: AuditLog) => {
    const p = log.payload || {};
    if (log.action === 'message.sent' || log.action === 'message.media_sent') {
      return (
        <span className="text-slate-700 font-medium">
          {p.message_type === 'text' ? 'نص' : p.message_type || 'وسائط'}
          {p.channel ? ` • ${p.channel}` : ''}
          {p.brand ? ` • ${p.brand}` : ''}
          {p.filename ? ` • ملف: ${p.filename}` : ''}
        </span>
      );
    }
    if (log.action.startsWith('user.')) {
      if (p.changes) {
        const changedFields = Object.keys(p.changes).join(', ');
        return <span className="text-slate-700 font-medium">{p.email || ''} • تعديل: {changedFields}</span>;
      }
      return <span className="text-slate-700 font-medium">{p.full_name || p.email || '-'} {p.role ? `(${p.role})` : ''}</span>;
    }
    if (log.action.startsWith('customer.')) {
      if (p.changes) {
        const changesSummary = Object.entries(p.changes)
          .map(([k, v]: any) => `${k}: ${v?.new || v?.to || JSON.stringify(v)}`)
          .join(' • ');
        return <span className="text-slate-700 font-medium">{p.customer_name ? `${p.customer_name}: ` : ''}{changesSummary}</span>;
      }
      if (p.note_id) {
        return <span className="text-slate-700 font-medium">ملاحظة #{p.note_id.slice(0, 8)}</span>;
      }
      return <span className="text-slate-700 font-medium">{p.customer_name || '-'}</span>;
    }
    if (log.action === 'conversation.status_changed') {
      return <span className="text-slate-700 font-medium">من {p.previous_status || '-'} إلى {p.new_status || '-'} {p.brand ? `• ${p.brand}` : ''}</span>;
    }
    if (log.action === 'conversation.priority_changed') {
      return <span className="text-slate-700 font-medium">الأولوية: من {p.previous_priority || '-'} إلى {p.new_priority || '-'}</span>;
    }
    if (log.action === 'conversation.assigned' || log.action === 'conversation.unassigned') {
      return <span className="text-slate-700 font-medium">{p.reason ? `السبب: ${p.reason}` : p.assigned_to_user_id ? 'تم الإسناد' : 'إلغاء الإسناد'}</span>;
    }
    if (log.action.startsWith('automation.')) {
      return <span className="text-slate-700 font-medium">{p.name || ''} {p.trigger_type ? `• ${p.trigger_type}` : ''}</span>;
    }
    if (log.action.startsWith('auth.')) {
      return <span className="text-slate-700 font-medium">{p.email || ''} {p.role ? `(${p.role})` : ''}</span>;
    }
    return <span className="text-slate-600 font-mono text-[10px] truncate max-w-xs block">{JSON.stringify(p)}</span>;
  };

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-[#F8FAFC] overflow-y-auto p-6 space-y-6" dir="rtl">
      {/* Header Banner */}
      <div className="bg-white rounded-2xl p-6 border border-slate-200/80 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-teal-600 to-teal-700 text-white flex items-center justify-center font-bold shadow-md">
            <Users className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-slate-900 tracking-tight">حَوْكَمَةُ وَإِدَارَةُ الفَرِيقِ والمشرفين</h1>
            <p className="text-xs text-slate-500 font-medium mt-0.5">
              إدارة صَلاحِيَات الموظفين، تَتَبُّع المَسْؤُولِيَات، سَجَلُّ العَمَلِيَات وَمُتَابَعَةُ النَّشَاط
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="bg-slate-100/90 p-1 rounded-xl border border-slate-200 flex items-center gap-1">
            <button
              onClick={() => setActiveTab('roster')}
              className={`px-4 py-2 rounded-lg text-xs font-bold transition flex items-center gap-2 ${
                activeTab === 'roster'
                  ? 'bg-white text-teal-800 shadow-xs border border-slate-200/80'
                  : 'text-slate-600 hover:bg-white/60'
              }`}
            >
              <Users className="w-4 h-4 text-teal-600" />
              <span>فريق العمل ({members.length})</span>
            </button>
            <button
              onClick={() => setActiveTab('audit')}
              className={`px-4 py-2 rounded-lg text-xs font-bold transition flex items-center gap-2 ${
                activeTab === 'audit'
                  ? 'bg-gradient-to-r from-teal-600 to-teal-700 text-white shadow-xs'
                  : 'text-slate-600 hover:bg-white/60'
              }`}
            >
              <FileText className="w-4 h-4" />
              <span>سجل العمليات والتدقيق</span>
            </button>
          </div>

          {activeTab === 'roster' && (
            <button
              onClick={handleOpenAddModal}
              className="px-4 py-2 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-xs font-bold transition flex items-center gap-2 shadow-xs"
            >
              <UserPlus className="w-4 h-4" />
              <span>إضافة عضو جديد</span>
            </button>
          )}
        </div>
      </div>

      {/* Tab 1: Team Roster */}
      {activeTab === 'roster' && (
        <div className="space-y-4">
          {/* Filter Bar */}
          <div className="bg-white rounded-xl p-3 border border-slate-200/80 shadow-xs flex items-center justify-between gap-4">
            <div className="relative flex-1 max-w-md">
              <Search className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchMemberQuery}
                onChange={(e) => setSearchMemberQuery(e.target.value)}
                placeholder="البحث بالاسم، البريد الإلكتروني أو الدور..."
                className="w-full bg-slate-50 text-xs text-slate-800 pr-9 pl-4 py-2 rounded-lg border border-slate-200 focus:bg-white focus:outline-none focus:ring-2 focus:ring-teal-500/20 font-medium"
              />
            </div>
            <button
              onClick={fetchMembers}
              className="px-3 py-2 rounded-lg text-xs font-semibold text-slate-600 hover:bg-slate-100 border border-slate-200 flex items-center gap-1.5 transition"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loadingMembers ? 'animate-spin' : ''}`} />
              <span>تحديث القائمة</span>
            </button>
          </div>

          {/* Roster Table */}
          <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
            {loadingMembers ? (
              <div className="p-12 text-center text-xs text-slate-500 font-semibold flex items-center justify-center gap-2">
                <RefreshCw className="w-4 h-4 animate-spin text-teal-600" />
                <span>جاري تحميل قائمة أعضاء الفريق...</span>
              </div>
            ) : filteredMembers.length === 0 ? (
              <div className="p-12 text-center space-y-2">
                <Users className="w-10 h-10 text-slate-300 mx-auto" />
                <p className="text-xs font-bold text-slate-700">لم يتم العثور على أعضاء مطابقين</p>
                <p className="text-[11px] text-slate-500">قم بإضافة أعضاء جدد أو تغيير كلمة البحث.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-right border-collapse">
                  <thead>
                    <tr className="bg-slate-50/80 text-[11px] font-bold text-slate-500 border-b border-slate-200/80">
                      <th className="py-3.5 px-4">العضو والمستخدم</th>
                      <th className="py-3.5 px-4">الدور الوظيفي</th>
                      <th className="py-3.5 px-4">البراندات المصرحة</th>
                      <th className="py-3.5 px-4">القنوات المصرحة</th>
                      <th className="py-3.5 px-4">الحالة والنشاط</th>
                      <th className="py-3.5 px-4">المحادثات النشطة</th>
                      <th className="py-3.5 px-4 text-center">الإجراءات</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-xs">
                    {filteredMembers.map((member) => (
                      <tr key={member.id} className="hover:bg-slate-50/60 transition-colors">
                        <td className="py-3.5 px-4">
                          <div className="flex items-center gap-3">
                            <div className="w-9 h-9 rounded-xl bg-teal-50 text-teal-700 border border-teal-200/80 flex items-center justify-center font-bold shadow-xs">
                              {member.full_name ? member.full_name.charAt(0).toUpperCase() : 'U'}
                            </div>
                            <div>
                              <p className="font-bold text-slate-900">{member.full_name}</p>
                              <p className="text-[11px] text-slate-500 font-medium">{member.email}</p>
                            </div>
                          </div>
                        </td>
                        <td className="py-3.5 px-4">{getRoleBadge(member.role)}</td>
                        <td className="py-3.5 px-4">
                          <div className="flex flex-wrap gap-1 max-w-xs">
                            {Array.isArray(member.brand_access) && member.brand_access.includes('ALL') ? (
                              <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-800 text-[10px] font-extrabold border border-slate-200">
                                كل البراندات (ALL)
                              </span>
                            ) : Array.isArray(member.brand_access) && member.brand_access.length > 0 ? (
                              member.brand_access.map((b) => (
                                <span
                                  key={b}
                                  className="px-2 py-0.5 rounded bg-teal-50 text-teal-800 text-[10px] font-bold border border-teal-200"
                                >
                                  {b}
                                </span>
                              ))
                            ) : (
                              <span className="text-[11px] text-slate-400">لا يوجد براندات</span>
                            )}
                          </div>
                        </td>
                        <td className="py-3.5 px-4">
                          <div className="flex flex-wrap gap-1 max-w-xs">
                            {Array.isArray(member.channel_access) && (member.channel_access.includes('ALL') || member.channel_access.includes('all')) ? (
                              <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-800 text-[10px] font-extrabold border border-slate-200">
                                كل القنوات (ALL)
                              </span>
                            ) : Array.isArray(member.channel_access) && member.channel_access.length > 0 ? (
                              member.channel_access.map((ch) => (
                                <span
                                  key={ch}
                                  className="px-2 py-0.5 rounded bg-blue-50 text-blue-800 text-[10px] font-bold border border-blue-200 uppercase"
                                >
                                  {ch}
                                </span>
                              ))
                            ) : (
                              <span className="text-[11px] text-slate-400">لا يوجد قنوات</span>
                            )}
                          </div>
                        </td>
                        <td className="py-3.5 px-4">
                          <div className="flex items-center gap-2">
                            {member.is_active ? (
                              <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 text-[11px] font-bold border border-emerald-200">
                                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                                <span>نشط</span>
                              </span>
                            ) : (
                              <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-slate-100 text-slate-600 text-[11px] font-bold border border-slate-200">
                                <span className="w-2 h-2 rounded-full bg-slate-400"></span>
                                <span>غير نشط</span>
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="py-3.5 px-4">
                          <span className="px-2.5 py-1 rounded-lg bg-teal-50 text-teal-800 font-bold border border-teal-200 text-xs inline-block">
                            {member.active_conversations_count || 0} محادثة
                          </span>
                        </td>
                        <td className="py-3.5 px-4">
                          <div className="flex items-center justify-center gap-1.5">
                            <button
                              onClick={() => handleOpenEditModal(member)}
                              className="p-1.5 rounded-lg text-slate-600 hover:text-teal-700 hover:bg-teal-50 transition"
                              title="تعديل البيانات"
                            >
                              <Edit className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => handleDeactivateMember(member)}
                              disabled={member.email.toLowerCase() === 'admin@luxira.com'}
                              className="p-1.5 rounded-lg text-slate-500 hover:text-rose-600 hover:bg-rose-50 transition disabled:opacity-30"
                              title={member.is_active ? 'إيقاف الحساب' : 'تفعيل الحساب'}
                            >
                              <Activity className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Tab 2: System Audit Logs */}
      {activeTab === 'audit' && (
        <div className="space-y-4">
          {/* Audit Controls */}
          <div className="bg-white rounded-2xl p-4 border border-slate-200/80 shadow-xs flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-3 flex-1">
              {/* Search */}
              <div className="relative flex-1 min-w-[200px] max-w-md">
                <Search className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={searchAuditQuery}
                  onChange={(e) => {
                    setSearchAuditQuery(e.target.value);
                    setAuditPage(1);
                  }}
                  placeholder="بحث في الإجراءات، الموظفين، أو معرف العنصر..."
                  className="w-full pl-3 pr-9 py-2 bg-slate-50 rounded-xl border border-slate-200 text-xs font-medium text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-teal-500/20"
                />
                {searchAuditQuery && (
                  <button
                    onClick={() => setSearchAuditQuery('')}
                    className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              {/* Action Filter */}
              <div className="flex items-center gap-2">
                <Filter className="w-3.5 h-3.5 text-teal-600 shrink-0" />
                <select
                  value={auditActionFilter}
                  onChange={(e) => {
                    setAuditActionFilter(e.target.value);
                    setAuditPage(1);
                  }}
                  className="bg-slate-50 text-xs font-bold text-slate-800 px-3 py-2 rounded-xl border border-slate-200 focus:bg-white focus:outline-none cursor-pointer"
                >
                  <option value="all">كل الإجراءات</option>
                  <optgroup label="المصادقة والحسابات">
                    <option value="auth.login">تسجيل الدخول (auth.login)</option>
                    <option value="auth.logout">تسجيل الخروج (auth.logout)</option>
                  </optgroup>
                  <optgroup label="فريق العمل والمستخدمين">
                    <option value="user.created">إنشاء عضو (user.created)</option>
                    <option value="user.updated">تعديل عضو (user.updated)</option>
                    <option value="user.activated">تفعيل حساب (user.activated)</option>
                    <option value="user.deactivated">تعطيل حساب (user.deactivated)</option>
                  </optgroup>
                  <optgroup label="المحادثات والرسائل">
                    <option value="message.sent">إرسال رسالة نصية (message.sent)</option>
                    <option value="message.media_sent">إرسال وسائط (message.media_sent)</option>
                    <option value="conversation.assigned">إسناد محادثة (conversation.assigned)</option>
                    <option value="conversation.unassigned">إلغاء إسناد (conversation.unassigned)</option>
                    <option value="conversation.status_changed">تغيير حالة محادثة (conversation.status_changed)</option>
                    <option value="conversation.priority_changed">تغيير الأولوية (conversation.priority_changed)</option>
                  </optgroup>
                  <optgroup label="العملاء والملاحظات">
                    <option value="customer.updated">تعديل عميل (customer.updated)</option>
                    <option value="customer.stage_changed">تغيير مرحلة عميل (customer.stage_changed)</option>
                    <option value="customer.tier_changed">تغيير درجة عميل (customer.tier_changed)</option>
                    <option value="customer.note_created">إضافة ملاحظة (customer.note_created)</option>
                    <option value="customer.note_deleted">حذف ملاحظة (customer.note_deleted)</option>
                  </optgroup>
                  <optgroup label="الأتمتة والوسائط">
                    <option value="automation.created">إنشاء أتمتة (automation.created)</option>
                    <option value="automation.updated">تعديل أتمتة (automation.updated)</option>
                    <option value="automation.deleted">حذف أتمتة (automation.deleted)</option>
                    <option value="media.uploaded">رفع وسائط (media.uploaded)</option>
                  </optgroup>
                </select>
              </div>
            </div>

            <button
              onClick={fetchAuditLogs}
              className="px-4 py-2 rounded-xl text-xs font-bold text-slate-700 bg-slate-50 hover:bg-slate-100 border border-slate-200 flex items-center justify-center gap-2 transition shrink-0"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loadingAudit ? 'animate-spin' : ''}`} />
              <span>تحديث السجل</span>
            </button>
          </div>

          {/* Audit Table */}
          <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
            {loadingAudit ? (
              <div className="p-16 text-center text-xs text-slate-500 font-semibold flex flex-col items-center justify-center gap-3">
                <RefreshCw className="w-6 h-6 animate-spin text-teal-600" />
                <span>جاري تحميل سجل العمليات والتدقيق...</span>
              </div>
            ) : auditLogs.length === 0 ? (
              <div className="p-16 text-center space-y-2">
                <FileText className="w-10 h-10 text-slate-300 mx-auto mb-2" />
                <p className="text-sm font-bold text-slate-700">لا توجد سجلات تدقيق مطابقة</p>
                <p className="text-xs text-slate-400">جرّب تغيير خيارات البحث أو التصفية</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-right border-collapse">
                  <thead>
                    <tr className="bg-slate-50/80 text-[11px] font-bold text-slate-500 border-b border-slate-200/80">
                      <th className="py-3.5 px-4">التاريخ والوقت</th>
                      <th className="py-3.5 px-4">المنفذ / المستخدم</th>
                      <th className="py-3.5 px-4">نوع الإجراء</th>
                      <th className="py-3.5 px-4">نوع العنصر Target</th>
                      <th className="py-3.5 px-4">تفاصيل وملخص العملية</th>
                      <th className="py-3.5 px-4 text-center">الإجراءات</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-xs">
                    {auditLogs.map((log) => (
                      <tr
                        key={log.id}
                        onClick={() => setSelectedAuditLog(log)}
                        className="hover:bg-teal-50/30 transition-colors cursor-pointer group"
                      >
                        <td className="py-3.5 px-4 font-mono text-[11px] text-slate-600 dir-ltr text-right whitespace-nowrap">
                          {new Date(log.created_at).toLocaleString('ar-EG')}
                        </td>
                        <td className="py-3.5 px-4">
                          {log.user_name ? (
                            <div>
                              <p className="font-bold text-slate-900 group-hover:text-teal-800 transition-colors">{log.user_name}</p>
                              <p className="text-[11px] text-slate-500 font-mono">{log.user_email}</p>
                            </div>
                          ) : (
                            <span className="text-slate-400 font-mono text-[11px]">النظام / أوتوماتيكي</span>
                          )}
                        </td>
                        <td className="py-3.5 px-4 whitespace-nowrap">{getActionBadge(log.action)}</td>
                        <td className="py-3.5 px-4 whitespace-nowrap">
                          <span className="px-2 py-0.5 bg-slate-100 text-slate-800 text-[11px] font-semibold rounded-md border border-slate-200">
                            {log.resource_type} {log.resource_id ? `#${log.resource_id.slice(0, 8)}` : ''}
                          </span>
                        </td>
                        <td className="py-3.5 px-4 max-w-sm">
                          <div className="truncate text-xs">
                            {renderPayloadSummary(log)}
                          </div>
                        </td>
                        <td className="py-3.5 px-4 text-center">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedAuditLog(log);
                            }}
                            className="px-2.5 py-1 rounded-lg text-xs font-bold bg-slate-100 hover:bg-teal-100 text-slate-700 hover:text-teal-800 border border-slate-200 transition"
                          >
                            عرض التفاصيل
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Pagination Footer */}
            {totalAuditPages > 1 && (
              <div className="p-4 border-t border-slate-100 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-600 bg-slate-50/50">
                <span className="font-medium">
                  عرض الصفحة <span className="font-bold text-teal-800">{auditPage}</span> من <span className="font-bold text-teal-800">{totalAuditPages}</span> (إجمالي {totalAuditLogs} سجل)
                </span>
                <div className="flex items-center gap-2">
                  <button
                    disabled={auditPage <= 1}
                    onClick={() => setAuditPage((p) => Math.max(1, p - 1))}
                    className="p-1.5 rounded-lg border border-slate-200 hover:bg-white disabled:opacity-30 transition"
                    title="الصفحة السابقة"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                  <button
                    disabled={auditPage >= totalAuditPages}
                    onClick={() => setAuditPage((p) => p + 1)}
                    className="p-1.5 rounded-lg border border-slate-200 hover:bg-white disabled:opacity-30 transition"
                    title="الصفحة التالية"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Audit Log Detail Modal */}
      {selectedAuditLog && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-xl w-full p-6 shadow-2xl border border-slate-200 space-y-4 animate-in fade-in zoom-in-95 duration-150" dir="rtl">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-teal-100 text-teal-700 flex items-center justify-center font-bold">
                  <FileText className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900">تفاصيل سجل العملية والتدقيق</h3>
                  <span className="text-[11px] text-slate-400 font-mono">ID: {selectedAuditLog.id}</span>
                </div>
              </div>
              <button
                onClick={() => setSelectedAuditLog(null)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3 text-xs max-h-[70vh] overflow-y-auto">
              <div className="grid grid-cols-2 gap-3 p-3 bg-slate-50 rounded-xl border border-slate-200/80">
                <div>
                  <span className="text-slate-400 font-bold block text-[10px] mb-0.5">نوع الإجراء</span>
                  <div>{getActionBadge(selectedAuditLog.action)}</div>
                </div>
                <div>
                  <span className="text-slate-400 font-bold block text-[10px] mb-0.5">توقيت التنفيذ</span>
                  <span className="font-mono text-slate-800 dir-ltr text-right block">
                    {new Date(selectedAuditLog.created_at).toLocaleString('ar-EG')}
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 font-bold block text-[10px] mb-0.5">المستخدم المنفذ</span>
                  <span className="font-bold text-slate-900 block">
                    {selectedAuditLog.user_name || 'النظام'}
                  </span>
                  {selectedAuditLog.user_email && (
                    <span className="text-slate-500 text-[11px] font-mono block">
                      {selectedAuditLog.user_email}
                    </span>
                  )}
                </div>
                <div>
                  <span className="text-slate-400 font-bold block text-[10px] mb-0.5">العنصر والهدف</span>
                  <span className="font-bold text-slate-800 block">
                    {selectedAuditLog.resource_type}
                  </span>
                  {selectedAuditLog.resource_id && (
                    <span className="text-slate-500 text-[11px] font-mono block">
                      #{selectedAuditLog.resource_id}
                    </span>
                  )}
                </div>
              </div>

              {selectedAuditLog.ip_address && (
                <div className="p-2.5 bg-slate-50 rounded-xl border border-slate-200/80 flex items-center justify-between">
                  <span className="text-slate-500 font-bold">عنوان IP:</span>
                  <span className="font-mono text-slate-800">{selectedAuditLog.ip_address}</span>
                </div>
              )}

              {/* Payload Structured Details */}
              <div className="space-y-1.5">
                <span className="text-slate-700 font-bold block">تفاصيل البيانات (Payload):</span>
                <pre className="p-3 bg-slate-900 text-teal-300 font-mono text-[11px] rounded-xl overflow-x-auto whitespace-pre-wrap leading-relaxed max-h-60">
                  {JSON.stringify(selectedAuditLog.payload || {}, null, 2)}
                </pre>
              </div>
            </div>

            <div className="flex justify-end pt-3 border-t border-slate-100">
              <button
                onClick={() => setSelectedAuditLog(null)}
                className="px-5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition"
              >
                إغلاق
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add / Edit Member Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-teal-100 text-teal-700 flex items-center justify-center font-bold">
                  {editingMember ? <Edit className="w-4 h-4" /> : <UserPlus className="w-4 h-4" />}
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900">
                    {editingMember ? `تعديل بيانات العضو: ${editingMember.full_name}` : 'إضافة عضو جديد للفريق'}
                  </h3>
                  <p className="text-[11px] text-slate-500">تحديد الدور، الصلاحيات، والبراندات المصرحة</p>
                </div>
              </div>
              <button onClick={() => setIsModalOpen(false)} className="p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSubmitForm} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">الاسم الكامل:</label>
                <input
                  type="text"
                  required
                  value={formData.full_name}
                  onChange={(e) => setFormData({ ...formData, full_name: e.target.value })}
                  placeholder="مثال: عمر خالد - خدمة عملاء"
                  className="w-full bg-slate-50 text-xs text-slate-900 p-2.5 rounded-xl border border-slate-200 focus:bg-white focus:outline-none focus:ring-2 focus:ring-teal-500/20 font-medium"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">البريد الإلكتروني:</label>
                <input
                  type="email"
                  required
                  disabled={!!editingMember}
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  placeholder="agent@luxira.com"
                  className="w-full bg-slate-50 text-xs text-slate-900 p-2.5 rounded-xl border border-slate-200 focus:bg-white focus:outline-none focus:ring-2 focus:ring-teal-500/20 font-medium disabled:opacity-60"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  كلمة المرور {editingMember && '(اتركها فارغة إذا لم ترد التغيير)'}:
                </label>
                <input
                  type="password"
                  required={!editingMember}
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  placeholder="******"
                  className="w-full bg-slate-50 text-xs text-slate-900 p-2.5 rounded-xl border border-slate-200 focus:bg-white focus:outline-none focus:ring-2 focus:ring-teal-500/20 font-medium"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">الدور الوظيفي:</label>
                <select
                  value={formData.role}
                  onChange={(e) => setFormData({ ...formData, role: e.target.value })}
                  className="w-full bg-slate-50 text-xs font-bold text-slate-900 p-2.5 rounded-xl border border-slate-200 focus:bg-white focus:outline-none"
                >
                  <option value="agent">موظف خدمة عملاء (agent)</option>
                  <option value="supervisor">مشرف فريق (supervisor)</option>
                  <option value="admin">مدير النظام (admin)</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">البراندات المصرحة (Brand Access):</label>
                <div className="grid grid-cols-2 gap-2 max-h-36 overflow-y-auto p-2 bg-slate-50 rounded-xl border border-slate-200">
                  <label className="flex items-center gap-2 text-xs font-bold text-slate-800 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={formData.brand_access.includes('ALL')}
                      onChange={() => handleToggleBrandAccess('ALL')}
                      className="rounded text-teal-600 focus:ring-teal-500"
                    />
                    <span>كل البراندات (ALL)</span>
                  </label>

                  {availableBrands.map((b) => (
                    <label key={b} className="flex items-center gap-2 text-xs font-medium text-slate-700 cursor-pointer">
                      <input
                        type="checkbox"
                        disabled={formData.brand_access.includes('ALL')}
                        checked={formData.brand_access.includes('ALL') || formData.brand_access.includes(b)}
                        onChange={() => handleToggleBrandAccess(b)}
                        className="rounded text-teal-600 focus:ring-teal-500"
                      />
                      <span>{b}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">القنوات المصرح بها (Authorized Channels):</label>
                <div className="grid grid-cols-2 gap-2 max-h-36 overflow-y-auto p-2 bg-slate-50 rounded-xl border border-slate-200">
                  <label className="flex items-center gap-2 text-xs font-bold text-slate-800 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={formData.channel_access.includes('ALL') || formData.channel_access.includes('all')}
                      onChange={() => handleToggleChannelAccess('ALL')}
                      className="rounded text-teal-600 focus:ring-teal-500"
                    />
                    <span>كل القنوات (ALL)</span>
                  </label>

                  {availableChannels.map((c) => {
                    const isAll = formData.channel_access.includes('ALL') || formData.channel_access.includes('all');
                    const isChecked = isAll || formData.channel_access.map((x) => x.toLowerCase()).includes(c.toLowerCase());
                    const labelMap: Record<string, string> = {
                      messenger: 'Messenger (ماسنجر)',
                      instagram: 'Instagram (إنستغرام)',
                      whatsapp: 'WhatsApp (واتساب)',
                      tiktok: 'TikTok (تيك توك)',
                    };
                    return (
                      <label key={c} className="flex items-center gap-2 text-xs font-medium text-slate-700 cursor-pointer">
                        <input
                          type="checkbox"
                          disabled={isAll}
                          checked={isChecked}
                          onChange={() => handleToggleChannelAccess(c)}
                          className="rounded text-teal-600 focus:ring-teal-500"
                        />
                        <span>{labelMap[c.toLowerCase()] || c}</span>
                      </label>
                    );
                  })}
                </div>
              </div>

              <div className="flex items-center gap-2 pt-2">
                <input
                  type="checkbox"
                  id="is_active_check"
                  checked={formData.is_active}
                  onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
                  className="rounded text-teal-600 focus:ring-teal-500 w-4 h-4"
                />
                <label htmlFor="is_active_check" className="text-xs font-bold text-slate-800 cursor-pointer">
                  حساب نشط ومفعل
                </label>
              </div>

              {modalError && (
                <div className="p-3 bg-rose-50 text-rose-800 rounded-xl text-xs font-semibold border border-rose-200">
                  {modalError}
                </div>
              )}

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-100 transition"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-4 py-2 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-xs font-bold transition flex items-center gap-1.5 shadow-xs disabled:opacity-50"
                >
                  <Check className="w-4 h-4" />
                  <span>{isSubmitting ? 'جاري الحفظ...' : editingMember ? 'حفظ التعديلات' : 'إنشاء العضو'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
