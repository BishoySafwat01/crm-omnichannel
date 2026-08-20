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
    is_active: true,
  });
  const [modalError, setModalError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  // Audit Logs State
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [loadingAudit, setLoadingAudit] = useState<boolean>(false);
  const [auditActionFilter, setAuditActionFilter] = useState<string>('all');
  const [auditPage, setAuditPage] = useState<number>(1);
  const [totalAuditLogs, setTotalAuditLogs] = useState<number>(0);
  const [totalAuditPages, setTotalAuditPages] = useState<number>(1);

  const availableBrands = MOCK_BRANDS.filter((b) => b.id !== 'all').map((b) => b.id);

  useEffect(() => {
    fetchMembers();
  }, []);

  useEffect(() => {
    if (activeTab === 'audit') {
      fetchAuditLogs();
    }
  }, [activeTab, auditActionFilter, auditPage]);

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
    if (action.includes('login')) {
      return <span className="px-2 py-0.5 rounded bg-blue-50 text-blue-700 text-xs font-bold border border-blue-200">{action}</span>;
    }
    if (action.includes('created')) {
      return <span className="px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 text-xs font-bold border border-emerald-200">{action}</span>;
    }
    if (action.includes('assigned')) {
      return <span className="px-2 py-0.5 rounded bg-amber-50 text-amber-700 text-xs font-bold border border-amber-200">{action}</span>;
    }
    if (action.includes('deactivated')) {
      return <span className="px-2 py-0.5 rounded bg-rose-50 text-rose-700 text-xs font-bold border border-rose-200">{action}</span>;
    }
    return <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-700 text-xs font-bold border border-slate-200">{action}</span>;
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
          <div className="bg-white rounded-xl p-3 border border-slate-200/80 shadow-xs flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                <Filter className="w-3.5 h-3.5 text-teal-600" />
                <span>نوع الإجراء:</span>
              </label>
              <select
                value={auditActionFilter}
                onChange={(e) => {
                  setAuditActionFilter(e.target.value);
                  setAuditPage(1);
                }}
                className="bg-slate-50 text-xs font-bold text-slate-800 px-3 py-1.5 rounded-lg border border-slate-200 focus:bg-white focus:outline-none"
              >
                <option value="all">كل الإجراءات</option>
                <option value="auth.login">تسجيل الدخول (auth.login)</option>
                <option value="user.created">إنشاء عضو (user.created)</option>
                <option value="user.updated">تعديل عضو (user.updated)</option>
                <option value="user.deactivated">تعطيل عضو (user.deactivated)</option>
                <option value="conversation.assigned">إسناد محادثة (conversation.assigned)</option>
                <option value="data.exported">تصدير بيانات (data.exported)</option>
              </select>
            </div>

            <button
              onClick={fetchAuditLogs}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold text-slate-600 hover:bg-slate-100 border border-slate-200 flex items-center gap-1.5 transition"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loadingAudit ? 'animate-spin' : ''}`} />
              <span>تحديث السجل</span>
            </button>
          </div>

          {/* Audit Table */}
          <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
            {loadingAudit ? (
              <div className="p-12 text-center text-xs text-slate-500 font-semibold flex items-center justify-center gap-2">
                <RefreshCw className="w-4 h-4 animate-spin text-teal-600" />
                <span>جاري تحميل سجل التدقيق والعمليات...</span>
              </div>
            ) : auditLogs.length === 0 ? (
              <div className="p-12 text-center space-y-2">
                <FileText className="w-10 h-10 text-slate-300 mx-auto" />
                <p className="text-xs font-bold text-slate-700">لا يوجد سجلات تدقيق مسجلة حتى الآن</p>
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
                      <th className="py-3.5 px-4">تفاصيل الباي لود Payload</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-xs">
                    {auditLogs.map((log) => (
                      <tr key={log.id} className="hover:bg-slate-50/60 transition-colors">
                        <td className="py-3.5 px-4 font-mono text-[11px] text-slate-600 dir-ltr text-right">
                          {new Date(log.created_at).toLocaleString('ar-EG')}
                        </td>
                        <td className="py-3.5 px-4">
                          {log.user_name ? (
                            <div>
                              <p className="font-bold text-slate-900">{log.user_name}</p>
                              <p className="text-[11px] text-slate-500">{log.user_email}</p>
                            </div>
                          ) : (
                            <span className="text-slate-400 font-mono text-[11px]">النظام / أوتوماتيكي</span>
                          )}
                        </td>
                        <td className="py-3.5 px-4">{getActionBadge(log.action)}</td>
                        <td className="py-3.5 px-4">
                          <span className="px-2 py-0.5 bg-slate-100 text-slate-800 text-[11px] font-semibold rounded border border-slate-200">
                            {log.resource_type} {log.resource_id ? `#${log.resource_id.slice(0, 8)}` : ''}
                          </span>
                        </td>
                        <td className="py-3.5 px-4 max-w-xs">
                          <pre className="text-[10px] font-mono bg-slate-50 p-1.5 rounded border border-slate-200 overflow-x-auto text-slate-700">
                            {log.payload ? JSON.stringify(log.payload) : '{}'}
                          </pre>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Pagination Footer */}
            {totalAuditPages > 1 && (
              <div className="p-4 border-t border-slate-100 flex items-center justify-between text-xs text-slate-600 bg-slate-50/50">
                <span>
                  عرض الصفحة {auditPage} من {totalAuditPages} (إجمالي {totalAuditLogs} سجل)
                </span>
                <div className="flex items-center gap-2">
                  <button
                    disabled={auditPage <= 1}
                    onClick={() => setAuditPage((p) => Math.max(1, p - 1))}
                    className="p-1.5 rounded-lg border border-slate-200 hover:bg-white disabled:opacity-30"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                  <button
                    disabled={auditPage >= totalAuditPages}
                    onClick={() => setAuditPage((p) => p + 1)}
                    className="p-1.5 rounded-lg border border-slate-200 hover:bg-white disabled:opacity-30"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}
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
