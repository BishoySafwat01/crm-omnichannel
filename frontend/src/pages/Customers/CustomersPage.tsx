import React, { useEffect, useState, useRef } from 'react';
import {
  Database,
  Search,
  Download,
  Filter,
  RefreshCw,
  ChevronRight,
  ChevronLeft,
  UserCheck,
  Tag,
  MapPin,
  Mail,
  Phone,
  Shield,
  Layers,
  Sparkles,
  X,
  Edit3,
  Save,
  Clock,
  FileText,
  CheckCircle2,
  AlertCircle,
  Trash2,
  Plus,
  User as UserIcon,
} from 'lucide-react';
import {
  adminCustomerApi,
  AdminCustomerList,
  CustomerStats,
  MOCK_BRANDS,
  customerApi,
  CustomerNote,
} from '../../services/api';
import { Customer } from '../../types/crm';

export const CustomerDataHub: React.FC = () => {
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [debouncedQuery, setDebouncedQuery] = useState<string>('');
  const [selectedBrand, setSelectedBrand] = useState<string>('all');
  const [selectedStage, setSelectedStage] = useState<string>('all');
  const [selectedTier, setSelectedTier] = useState<string>('all');
  const [selectedSkinType, setSelectedSkinType] = useState<string>('all');
  const [selectedCountry, setSelectedCountry] = useState<string>('all');
  const [availableCountries, setAvailableCountries] = useState<string[]>([]);
  const [page, setPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(50);

  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isExporting, setIsExporting] = useState<boolean>(false);
  const [data, setData] = useState<AdminCustomerList | null>(null);
  const [stats, setStats] = useState<CustomerStats | null>(null);

  // Customer 360 Drawer State
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [drawerTab, setDrawerTab] = useState<'details' | 'timeline' | 'notes'>('details');
  const [editForm, setEditForm] = useState<Partial<Customer>>({});
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [saveSuccess, setSaveSuccess] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Timeline & Notes state
  const [timelineEvents, setTimelineEvents] = useState<any[]>([]);
  const [isLoadingTimeline, setIsLoadingTimeline] = useState<boolean>(false);
  const [notes, setNotes] = useState<CustomerNote[]>([]);
  const [isLoadingNotes, setIsLoadingNotes] = useState<boolean>(false);
  const [newNoteText, setNewNoteText] = useState<string>('');
  const [isAddingNote, setIsAddingNote] = useState<boolean>(false);

  // 1. Debounce Search Input (300ms)
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(searchQuery);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // 2. Load Available Countries on mount
  useEffect(() => {
    customerApi.getLocations().then((locs) => {
      if (locs && locs.length > 0) {
        setAvailableCountries(locs);
      }
    }).catch((err) => console.warn('[DataHub] Failed to fetch countries:', err));
  }, []);

  const fetchCustomers = async () => {
    setIsLoading(true);
    try {
      const [listRes, statsRes] = await Promise.all([
        adminCustomerApi.listCustomers({
          query: debouncedQuery,
          brand: selectedBrand,
          stage: selectedStage,
          tier: selectedTier,
          skin_type: selectedSkinType,
          country: selectedCountry,
          page,
          page_size: pageSize,
        }),
        adminCustomerApi.getStats(),
      ]);

      setData(listRes);
      setStats(statsRes);
    } catch (err) {
      console.error('[DataHub] Error fetching customer hub data:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchCustomers();
  }, [debouncedQuery, selectedBrand, selectedStage, selectedTier, selectedSkinType, selectedCountry, page, pageSize]);

  // Load customer timeline & notes when drawer opens
  useEffect(() => {
    if (selectedCustomer) {
      setEditForm({
        display_name: selectedCustomer.display_name || '',
        phone: selectedCustomer.phone || '',
        email: selectedCustomer.email || '',
        location: selectedCustomer.location || selectedCustomer.country || '',
        country: selectedCustomer.country || selectedCustomer.location || '',
        tier: selectedCustomer.tier || 'درجة أولى',
        skin_type: selectedCustomer.skin_type || 'عادية',
        stage: selectedCustomer.stage || 'جديد',
      });
      setSaveSuccess(null);
      setSaveError(null);

      // Fetch timeline
      setIsLoadingTimeline(true);
      customerApi.getTimeline(selectedCustomer.id, 1).then((res) => {
        setTimelineEvents(res.items || []);
      }).catch((e) => console.warn('[DataHub] Failed to load timeline:', e))
        .finally(() => setIsLoadingTimeline(false));

      // Fetch notes
      setIsLoadingNotes(true);
      customerApi.getNotes(selectedCustomer.id).then((n) => {
        setNotes(n || []);
      }).catch((e) => console.warn('[DataHub] Failed to load notes:', e))
        .finally(() => setIsLoadingNotes(false));
    }
  }, [selectedCustomer]);

  const handleSaveCustomer = async () => {
    if (!selectedCustomer) return;
    setIsSaving(true);
    setSaveSuccess(null);
    setSaveError(null);

    try {
      const updated = await customerApi.updateCustomer(selectedCustomer.id, editForm);
      setSelectedCustomer(updated);
      setSaveSuccess('تم تحديث وحفظ بيانات العميل بنجاح في قاعدة البيانات وتوثيق التدقيق.');

      // Update in table list locally
      if (data) {
        setData({
          ...data,
          items: data.items.map((item) => (item.id === updated.id ? { ...item, ...updated } : item)),
        });
      }

      // Refresh timeline to reflect new edit event
      customerApi.getTimeline(selectedCustomer.id, 1).then((res) => {
        setTimelineEvents(res.items || []);
      }).catch(() => {});

      // Refresh aggregate stats
      adminCustomerApi.getStats().then(setStats).catch(() => {});
    } catch (err: any) {
      setSaveError(err.message || 'فشل حفظ التعديلات في السيرفر');
    } finally {
      setIsSaving(false);
    }
  };

  const handleAddNote = async () => {
    if (!selectedCustomer || !newNoteText.trim()) return;
    setIsAddingNote(true);
    try {
      await customerApi.addNote(selectedCustomer.id, newNoteText.trim());
      setNewNoteText('');
      const updatedNotes = await customerApi.getNotes(selectedCustomer.id);
      setNotes(updatedNotes);
      // Refresh timeline to show note event
      customerApi.getTimeline(selectedCustomer.id, 1).then((res) => {
        setTimelineEvents(res.items || []);
      }).catch(() => {});
    } catch (err: any) {
      alert('فشل إضافة الملاحظة: ' + (err.message || 'حدث خطأ'));
    } finally {
      setIsAddingNote(false);
    }
  };

  const handleDeleteNote = async (noteId: string) => {
    if (!selectedCustomer) return;
    try {
      await customerApi.deleteNote(selectedCustomer.id, noteId);
      setNotes((prev) => prev.filter((n) => n.id !== noteId));
    } catch (err: any) {
      alert('فشل حذف الملاحظة: ' + (err.message || 'غير مصرح'));
    }
  };

  const handleExportCsv = async () => {
    setIsExporting(true);
    try {
      await adminCustomerApi.downloadExportCsv({
        brand: selectedBrand,
        stage: selectedStage,
        tier: selectedTier,
      });
    } catch (err) {
      console.error('[DataHub] Error downloading CSV export:', err);
    } finally {
      setIsExporting(false);
    }
  };

  const stageBadgeMap: Record<string, string> = {
    جديد: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    'قيد المتابعة': 'bg-blue-50 text-blue-700 border-blue-200',
    'تم البيع': 'bg-teal-50 text-teal-800 border-teal-200',
    ملغي: 'bg-rose-50 text-rose-700 border-rose-200',
  };

  const tierBadgeMap: Record<string, string> = {
    'درجة أولى': 'bg-amber-50 text-amber-800 border-amber-200',
    'درجة ثانية': 'bg-slate-100 text-slate-700 border-slate-200',
  };

  return (
    <div className="flex-1 bg-slate-50/60 overflow-y-auto p-6 space-y-6" dir="rtl">
      {/* Header Toolbar */}
      <div className="bg-white/80 backdrop-blur-md rounded-2xl p-5 border border-slate-200/80 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-tr from-teal-600 to-teal-700 text-white flex items-center justify-center shadow-md">
            <Database className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold text-slate-900 tracking-tight">قاعدة بيانات العملاء وإدارة السجلات</h1>
              <span className="bg-teal-50 text-teal-800 text-xs px-2.5 py-0.5 rounded-full font-bold border border-teal-200">
                إجمالي {stats?.total_customers || data?.total || 0} عميل
              </span>
            </div>
            <p className="text-xs text-slate-500 font-medium">
              مركز بيانات العملاء الموحد، تصفية الحقول المتقدمة، والتصدير المباشر بصيغة CSV
            </p>
          </div>
        </div>

        {/* Actions Toolbar */}
        <div className="flex items-center gap-3">
          <button
            onClick={fetchCustomers}
            disabled={isLoading}
            className="p-2.5 bg-white hover:bg-slate-100 text-slate-700 border border-slate-200/80 rounded-xl transition-all shadow-xs flex items-center justify-center disabled:opacity-50"
            title="تحديث البيانات"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin text-teal-600' : ''}`} />
          </button>

          <button
            onClick={handleExportCsv}
            disabled={isExporting}
            className="px-4 py-2.5 bg-gradient-to-r from-teal-600 to-teal-700 hover:from-teal-700 hover:to-teal-800 text-white text-xs font-bold rounded-xl shadow-xs transition-all flex items-center gap-2 disabled:opacity-50"
          >
            <Download className={`w-4 h-4 ${isExporting ? 'animate-bounce' : ''}`} />
            <span>{isExporting ? 'جاري التصدير...' : 'تصدير CSV'}</span>
          </button>
        </div>
      </div>

      {/* Search & Filter Bar */}
      <div className="bg-white/80 backdrop-blur-md rounded-2xl p-4 border border-slate-200/80 shadow-xs space-y-3">
        <div className="flex flex-col md:flex-row items-center gap-3">
          {/* Search Input */}
          <div className="relative flex-1 w-full">
            <Search className="w-4 h-4 text-slate-400 absolute right-3.5 top-3" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setPage(1);
              }}
              placeholder="البحث باسم العميل، رقم الهاتف، أو البريد الإلكتروني..."
              className="w-full pl-4 pr-10 py-2 bg-slate-50 border border-slate-200/80 rounded-xl text-xs text-slate-800 focus:outline-hidden focus:border-teal-500 font-medium"
            />
          </div>

          {/* Filter Dropdowns */}
          <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
            {/* Brand Filter */}
            <div className="flex items-center gap-1 bg-slate-50 px-2.5 py-1.5 rounded-xl border border-slate-200/80 text-xs">
              <span className="text-slate-400 font-bold text-[11px]">البراند:</span>
              <select
                value={selectedBrand}
                onChange={(e) => {
                  setSelectedBrand(e.target.value);
                  setPage(1);
                }}
                className="bg-transparent text-slate-800 font-bold focus:outline-hidden cursor-pointer"
              >
                <option value="all">الكل</option>
                {MOCK_BRANDS.map((b) => (
                  <option key={b.id} value={b.name}>
                    {b.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Stage Filter */}
            <div className="flex items-center gap-1 bg-slate-50 px-2.5 py-1.5 rounded-xl border border-slate-200/80 text-xs">
              <span className="text-slate-400 font-bold text-[11px]">المرحلة:</span>
              <select
                value={selectedStage}
                onChange={(e) => {
                  setSelectedStage(e.target.value);
                  setPage(1);
                }}
                className="bg-transparent text-slate-800 font-bold focus:outline-hidden cursor-pointer"
              >
                <option value="all">الكل</option>
                <option value="جديد">جديد</option>
                <option value="قيد المتابعة">قيد المتابعة</option>
                <option value="تم البيع">تم البيع</option>
                <option value="ملغي">ملغي</option>
              </select>
            </div>

            {/* Tier Filter */}
            <div className="flex items-center gap-1 bg-slate-50 px-2.5 py-1.5 rounded-xl border border-slate-200/80 text-xs">
              <span className="text-slate-400 font-bold text-[11px]">الدرجة:</span>
              <select
                value={selectedTier}
                onChange={(e) => {
                  setSelectedTier(e.target.value);
                  setPage(1);
                }}
                className="bg-transparent text-slate-800 font-bold focus:outline-hidden cursor-pointer"
              >
                <option value="all">الكل</option>
                <option value="درجة أولى">درجة أولى</option>
                <option value="درجة ثانية">درجة ثانية</option>
              </select>
            </div>

            {/* Skin Type Filter */}
            <div className="flex items-center gap-1 bg-slate-50 px-2.5 py-1.5 rounded-xl border border-slate-200/80 text-xs">
              <span className="text-slate-400 font-bold text-[11px]">البشرة:</span>
              <select
                value={selectedSkinType}
                onChange={(e) => {
                  setSelectedSkinType(e.target.value);
                  setPage(1);
                }}
                className="bg-transparent text-slate-800 font-bold focus:outline-hidden cursor-pointer"
              >
                <option value="all">الكل</option>
                <option value="دهنية">دهنية</option>
                <option value="جافة">جافة</option>
                <option value="مختلطة">مختلطة</option>
                <option value="عادية">عادية</option>
                <option value="حساسة">حساسة</option>
              </select>
            </div>

            {/* Country / Location Filter */}
            <div className="flex items-center gap-1 bg-slate-50 px-2.5 py-1.5 rounded-xl border border-slate-200/80 text-xs">
              <span className="text-slate-400 font-bold text-[11px]">الدولة:</span>
              <select
                value={selectedCountry}
                onChange={(e) => {
                  setSelectedCountry(e.target.value);
                  setPage(1);
                }}
                className="bg-transparent text-slate-800 font-bold focus:outline-hidden cursor-pointer"
              >
                <option value="all">الكل</option>
                {availableCountries.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>
      </div>

      {/* Data Grid Table */}
      <div className="bg-white/80 backdrop-blur-md rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-right text-xs">
            <thead className="bg-slate-100/80 border-b border-slate-200 text-slate-600 font-bold uppercase tracking-wider">
              <tr>
                <th className="px-4 py-3">اسم العميل</th>
                <th className="px-4 py-3">البراند / المتجر</th>
                <th className="px-4 py-3">القناة</th>
                <th className="px-4 py-3">الموقع</th>
                <th className="px-4 py-3">الدرجة والمرحلة</th>
                <th className="px-4 py-3">الموظف المعين</th>
                <th className="px-4 py-3">آخر رد وتفاعل</th>
                <th className="px-4 py-3">تاريخ التسجيل</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-medium">
              {isLoading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i} className="animate-pulse">
                    <td className="px-4 py-3.5"><div className="h-4 bg-slate-200 rounded-md w-32"></div></td>
                    <td className="px-4 py-3.5"><div className="h-4 bg-slate-200 rounded-md w-16"></div></td>
                    <td className="px-4 py-3.5"><div className="h-4 bg-slate-200 rounded-md w-20"></div></td>
                    <td className="px-4 py-3.5"><div className="h-4 bg-slate-200 rounded-md w-20"></div></td>
                    <td className="px-4 py-3.5"><div className="h-4 bg-slate-200 rounded-md w-24"></div></td>
                    <td className="px-4 py-3.5"><div className="h-4 bg-slate-200 rounded-md w-24"></div></td>
                    <td className="px-4 py-3.5"><div className="h-4 bg-slate-200 rounded-md w-28"></div></td>
                    <td className="px-4 py-3.5"><div className="h-4 bg-slate-200 rounded-md w-20"></div></td>
                  </tr>
                ))
              ) : data?.items && data.items.length > 0 ? (
                data.items.map((cust) => {
                  const stageBadge = stageBadgeMap[cust.stage || 'جديد'] || 'bg-slate-100 text-slate-700 border-slate-200';
                  const tierBadge = tierBadgeMap[cust.tier || 'درجة أولى'] || 'bg-slate-100 text-slate-700 border-slate-200';
                  const brandStyle = cust.brand === 'RAWAA' ? 'bg-amber-50 text-amber-800 border-amber-200' : cust.brand === 'SHE & HE' ? 'bg-rose-50 text-rose-800 border-rose-200' : 'bg-purple-50 text-purple-800 border-purple-200';
                  const chanStyle = cust.channel === 'whatsapp' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : cust.channel === 'instagram' ? 'bg-pink-50 text-pink-700 border-pink-200' : 'bg-blue-50 text-blue-700 border-blue-200';

                  return (
                    <tr
                      key={cust.id}
                      onClick={() => setSelectedCustomer(cust)}
                      className="hover:bg-teal-50/40 transition-colors cursor-pointer group"
                      title="انقر لعرض وتعديل ملف العميل وسجل التدقيق والأنشطة"
                    >
                      <td className="px-4 py-3.5">
                        <div className="flex items-center gap-2.5">
                          <div className="w-8 h-8 rounded-full bg-teal-600 text-white font-bold text-xs flex items-center justify-center shadow-xs shrink-0 group-hover:ring-2 group-hover:ring-teal-500/30 transition-all">
                            {cust.avatar_url ? (
                              <img src={cust.avatar_url} alt="" className="w-full h-full rounded-full object-cover" />
                            ) : (
                              (cust.display_name || 'ع').charAt(0)
                            )}
                          </div>
                          <div>
                            <div className="font-bold text-slate-900 group-hover:text-teal-800 transition-colors">{cust.display_name || 'عميل غير معرف'}</div>
                            <div className="text-[11px] text-slate-400 font-mono">{cust.phone || cust.email || '-'}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3.5">
                        <span className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold border ${brandStyle}`}>
                          {cust.brand || 'LAVVA'}
                        </span>
                      </td>
                      <td className="px-4 py-3.5">
                        <span className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold border ${chanStyle}`}>
                          {cust.channel ? (cust.channel.charAt(0).toUpperCase() + cust.channel.slice(1)) : 'Messenger'}
                        </span>
                      </td>
                      <td className="px-4 py-3.5 text-slate-600">
                        {cust.location || cust.country ? (
                          <span className="inline-flex items-center gap-1">
                            <MapPin className="w-3 h-3 text-slate-400" />
                            <span>{cust.location || cust.country}</span>
                          </span>
                        ) : (
                          '-'
                        )}
                      </td>
                      <td className="px-4 py-3.5">
                        <div className="flex flex-col gap-1">
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border w-fit ${tierBadge}`}>
                            {cust.tier || 'درجة أولى'}
                          </span>
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border w-fit ${stageBadge}`}>
                            {cust.stage || 'جديد'}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3.5">
                        {cust.assigned_agent_name ? (
                          <span className="font-bold text-slate-800 flex items-center gap-1">
                            <UserIcon className="w-3 h-3 text-teal-600" />
                            <span>{cust.assigned_agent_name}</span>
                          </span>
                        ) : (
                          <span className="text-slate-400 italic">غير معين</span>
                        )}
                      </td>
                      <td className="px-4 py-3.5">
                        <div>
                          {cust.last_agent_name ? (
                            <span className="font-bold text-teal-800 text-[11px]">
                              {cust.last_agent_name}
                            </span>
                          ) : (
                            <span className="text-slate-400 text-[11px]">لا يوجد رد</span>
                          )}
                          <div className="text-[10px] text-slate-400">
                            {cust.last_activity_at ? new Date(cust.last_activity_at).toLocaleDateString('ar-EG', { hour: '2-digit', minute: '2-digit' }) : '-'}
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3.5 text-slate-500 text-[11px]">
                        {cust.created_at ? new Date(cust.created_at).toLocaleDateString('ar-EG') : '-'}
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={8} className="px-4 py-12 text-center text-slate-500">
                    <UserCheck className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                    <p className="font-bold text-sm">لم يتم العثور على أي عملاء يطابقون خيارات البحث الحالية</p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Bar */}
        <div className="px-6 py-4 bg-slate-50/80 border-t border-slate-200/80 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2 text-xs font-bold text-slate-600">
            <span>عرض الصفحة</span>
            <span className="text-teal-800">{data?.page || 1}</span>
            <span>من إجمالي</span>
            <span className="text-teal-800">{data?.total_pages || 1}</span>
            <span>صفحة (إجمالي {data?.total || 0} عميل)</span>
          </div>

          <div className="flex items-center gap-3">
            {/* Page Size Selector */}
            <div className="flex items-center gap-1.5 text-xs text-slate-600">
              <span className="font-bold">عدد السجلات:</span>
              <select
                value={pageSize}
                onChange={(e) => {
                  setPageSize(Number(e.target.value));
                  setPage(1);
                }}
                className="bg-white border border-slate-200/80 rounded-lg px-2 py-1 font-bold focus:outline-hidden cursor-pointer"
              >
                <option value={25}>25</option>
                <option value={50}>50</option>
                <option value={100}>100</option>
              </select>
            </div>

            {/* Pagination Buttons */}
            <div className="flex items-center gap-1">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1 || isLoading}
                className="p-1.5 rounded-lg bg-white border border-slate-200/80 text-slate-700 hover:bg-slate-100 disabled:opacity-40 transition-all"
                title="الصفحة السابقة"
              >
                <ChevronRight className="w-4 h-4" />
              </button>

              <button
                onClick={() => setPage((p) => Math.min(data?.total_pages || 1, p + 1))}
                disabled={!data || page >= data.total_pages || isLoading}
                className="p-1.5 rounded-lg bg-white border border-slate-200/80 text-slate-700 hover:bg-slate-100 disabled:opacity-40 transition-all"
                title="الصفحة التالية"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Customer 360 & Edit Drawer Modal */}
      {selectedCustomer && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex justify-end transition-opacity">
          <div className="w-full max-w-xl bg-white h-full shadow-2xl flex flex-col border-r border-slate-200 animate-in slide-in-from-left duration-200" dir="rtl">
            {/* Drawer Header */}
            <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-teal-600 text-white font-bold text-sm flex items-center justify-center shadow-xs">
                  {selectedCustomer.avatar_url ? (
                    <img src={selectedCustomer.avatar_url} alt="" className="w-full h-full rounded-full object-cover" />
                  ) : (
                    (selectedCustomer.display_name || 'ع').charAt(0)
                  )}
                </div>
                <div>
                  <h3 className="font-bold text-slate-900 text-base">{selectedCustomer.display_name || 'عميل'}</h3>
                  <span className="text-[11px] text-slate-500 font-mono">ID: {selectedCustomer.id}</span>
                </div>
              </div>
              <button
                onClick={() => setSelectedCustomer(null)}
                className="p-2 hover:bg-slate-200/60 rounded-xl text-slate-500 hover:text-slate-800 transition-colors"
                title="إغلاق"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* CRM Context Overview Cards */}
            <div className="p-4 bg-gradient-to-b from-slate-50 to-white border-b border-slate-200/80">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-xs">
                <div className="bg-white p-2.5 rounded-xl border border-slate-200 shadow-2xs">
                  <span className="text-[10px] text-slate-400 font-bold block mb-0.5">المتجر / البراند</span>
                  <span className="font-bold text-purple-700">{selectedCustomer.brand || 'LAVVA'}</span>
                </div>
                <div className="bg-white p-2.5 rounded-xl border border-slate-200 shadow-2xs">
                  <span className="text-[10px] text-slate-400 font-bold block mb-0.5">القناة</span>
                  <span className="font-bold text-blue-700">
                    {selectedCustomer.channel ? (selectedCustomer.channel.charAt(0).toUpperCase() + selectedCustomer.channel.slice(1)) : 'Messenger'}
                  </span>
                </div>
                <div className="bg-white p-2.5 rounded-xl border border-slate-200 shadow-2xs">
                  <span className="text-[10px] text-slate-400 font-bold block mb-0.5">المسؤول الحالي</span>
                  <span className="font-bold text-slate-800 truncate block">
                    {selectedCustomer.assigned_agent_name || 'غير معين'}
                  </span>
                </div>
                <div className="bg-white p-2.5 rounded-xl border border-slate-200 shadow-2xs">
                  <span className="text-[10px] text-slate-400 font-bold block mb-0.5">آخر موظف رد</span>
                  <span className="font-bold text-teal-800 truncate block">
                    {selectedCustomer.last_agent_name || 'لا يوجد'}
                  </span>
                </div>
              </div>
            </div>

            {/* Tabs Navigation */}
            <div className="flex items-center border-b border-slate-200 px-5 gap-4 bg-white text-xs font-bold">
              <button
                onClick={() => setDrawerTab('details')}
                className={`py-3 flex items-center gap-1.5 border-b-2 transition-colors ${
                  drawerTab === 'details'
                    ? 'border-teal-600 text-teal-800'
                    : 'border-transparent text-slate-500 hover:text-slate-800'
                }`}
              >
                <Edit3 className="w-4 h-4" />
                <span>تعديل البيانات</span>
              </button>

              <button
                onClick={() => setDrawerTab('timeline')}
                className={`py-3 flex items-center gap-1.5 border-b-2 transition-colors ${
                  drawerTab === 'timeline'
                    ? 'border-teal-600 text-teal-800'
                    : 'border-transparent text-slate-500 hover:text-slate-800'
                }`}
              >
                <Clock className="w-4 h-4" />
                <span>سجل الأنشطة والتدقيق</span>
              </button>

              <button
                onClick={() => setDrawerTab('notes')}
                className={`py-3 flex items-center gap-1.5 border-b-2 transition-colors ${
                  drawerTab === 'notes'
                    ? 'border-teal-600 text-teal-800'
                    : 'border-transparent text-slate-500 hover:text-slate-800'
                }`}
              >
                <FileText className="w-4 h-4" />
                <span>ملاحظات الفريق</span>
                {notes.length > 0 && (
                  <span className="bg-slate-100 text-slate-700 text-[10px] px-1.5 py-0.2 rounded-full">
                    {notes.length}
                  </span>
                )}
              </button>
            </div>

            {/* Drawer Body Content */}
            <div className="flex-1 overflow-y-auto p-5 space-y-4">
              {/* Tab 1: Edit Details Form */}
              {drawerTab === 'details' && (
                <div className="space-y-4 text-xs">
                  {saveSuccess && (
                    <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                      <span>{saveSuccess}</span>
                    </div>
                  )}

                  {saveError && (
                    <div className="p-3 bg-rose-50 border border-rose-200 text-rose-800 rounded-xl flex items-center gap-2">
                      <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                      <span>{saveError}</span>
                    </div>
                  )}

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-slate-600 font-bold mb-1">اسم العميل</label>
                      <input
                        type="text"
                        value={editForm.display_name || ''}
                        onChange={(e) => setEditForm({ ...editForm, display_name: e.target.value })}
                        className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-medium text-slate-900 focus:outline-hidden focus:border-teal-500"
                      />
                    </div>

                    <div>
                      <label className="block text-slate-600 font-bold mb-1">رقم الهاتف</label>
                      <input
                        type="text"
                        value={editForm.phone || ''}
                        onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })}
                        className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-medium text-slate-900 focus:outline-hidden focus:border-teal-500 dir-ltr text-right"
                      />
                    </div>

                    <div>
                      <label className="block text-slate-600 font-bold mb-1">البريد الإلكتروني</label>
                      <input
                        type="email"
                        value={editForm.email || ''}
                        onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
                        className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-medium text-slate-900 focus:outline-hidden focus:border-teal-500"
                      />
                    </div>

                    <div>
                      <label className="block text-slate-600 font-bold mb-1">الموقع / الدولة</label>
                      <input
                        type="text"
                        value={editForm.location || editForm.country || ''}
                        onChange={(e) => setEditForm({ ...editForm, location: e.target.value, country: e.target.value })}
                        className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-medium text-slate-900 focus:outline-hidden focus:border-teal-500"
                      />
                    </div>

                    <div>
                      <label className="block text-slate-600 font-bold mb-1">المرحلة الحالية</label>
                      <select
                        value={editForm.stage || 'جديد'}
                        onChange={(e) => setEditForm({ ...editForm, stage: e.target.value })}
                        className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-900 focus:outline-hidden focus:border-teal-500"
                      >
                        <option value="جديد">جديد</option>
                        <option value="قيد المتابعة">قيد المتابعة</option>
                        <option value="تم البيع">تم البيع</option>
                        <option value="ملغي">ملغي</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-slate-600 font-bold mb-1">درجة العميل</label>
                      <select
                        value={editForm.tier || 'درجة أولى'}
                        onChange={(e) => setEditForm({ ...editForm, tier: e.target.value })}
                        className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-900 focus:outline-hidden focus:border-teal-500"
                      >
                        <option value="درجة أولى">درجة أولى</option>
                        <option value="درجة ثانية">درجة ثانية</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-slate-600 font-bold mb-1">نوع البشرة</label>
                      <select
                        value={editForm.skin_type || 'عادية'}
                        onChange={(e) => setEditForm({ ...editForm, skin_type: e.target.value })}
                        className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-900 focus:outline-hidden focus:border-teal-500"
                      >
                        <option value="عادية">عادية</option>
                        <option value="دهنية">دهنية</option>
                        <option value="جافة">جافة</option>
                        <option value="مختلطة">مختلطة</option>
                        <option value="حساسة">حساسة</option>
                      </select>
                    </div>
                  </div>

                  <div className="pt-4 border-t border-slate-100 flex items-center justify-end gap-2">
                    <button
                      onClick={handleSaveCustomer}
                      disabled={isSaving}
                      className="px-5 py-2.5 bg-teal-600 hover:bg-teal-700 text-white rounded-xl font-bold shadow-xs transition-all flex items-center gap-2 disabled:opacity-50"
                    >
                      <Save className="w-4 h-4" />
                      <span>{isSaving ? 'جاري الحفظ...' : 'حفظ التعديلات وتوثيق التدقيق'}</span>
                    </button>
                  </div>
                </div>
              )}

              {/* Tab 2: Activity & Audit Timeline */}
              {drawerTab === 'timeline' && (
                <div className="space-y-3">
                  <div className="p-3 bg-slate-50 rounded-xl border border-slate-200/80 text-xs text-slate-600 font-medium">
                    سجل تاريخي موثق لكل العمليات، الرسائل المتبادلة، وتعديلات الفريق لهذا العميل.
                  </div>

                  {isLoadingTimeline ? (
                    <div className="py-8 text-center text-slate-400 font-medium text-xs">جاري تحميل سجل الأنشطة...</div>
                  ) : timelineEvents.length > 0 ? (
                    <div className="space-y-2.5">
                      {timelineEvents.map((ev, idx) => (
                        <div key={ev.id || idx} className="p-3.5 bg-slate-50/70 rounded-xl border border-slate-200/70 flex items-start gap-3">
                          <div className="w-2.5 h-2.5 rounded-full bg-teal-600 mt-1.5 shrink-0" />
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-bold text-slate-900">{ev.summary}</p>
                            {ev.details?.text && (
                              <p className="text-[11px] text-slate-600 bg-white/80 p-2 rounded-lg border border-slate-200/60 mt-1.5 font-medium whitespace-pre-wrap">
                                {ev.details.text}
                              </p>
                            )}
                            <div className="flex items-center gap-2 mt-1 text-[11px] text-slate-500">
                              <span>{ev.created_at ? new Date(ev.created_at).toLocaleString('ar-EG') : '-'}</span>
                              <span>•</span>
                              <span className="font-mono text-teal-700 font-medium">{ev.channel || 'system'}</span>
                              {ev.details?.brand && (
                                <>
                                  <span>•</span>
                                  <span className="text-purple-700 font-bold text-[10px]">{ev.details.brand}</span>
                                </>
                              )}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="py-8 text-center text-slate-400 text-xs font-medium">
                      لا توجد سجلات أنشطة مسجلة لهذا العميل حتى الآن.
                    </div>
                  )}
                </div>
              )}

              {/* Tab 3: Internal Notes */}
              {drawerTab === 'notes' && (
                <div className="space-y-4">
                  {/* Add Note Form */}
                  <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200/80 space-y-2">
                    <label className="block text-xs font-bold text-slate-700">إضافة ملاحظة جديدة للفريق:</label>
                    <textarea
                      value={newNoteText}
                      onChange={(e) => setNewNoteText(e.target.value)}
                      placeholder="اكتب تفاصيل أو ملاحظات هامة حول هذا العميل..."
                      rows={3}
                      className="w-full p-2.5 bg-white border border-slate-200 rounded-lg text-xs font-medium text-slate-900 focus:outline-hidden focus:border-teal-500"
                    />
                    <div className="flex justify-end">
                      <button
                        onClick={handleAddNote}
                        disabled={isAddingNote || !newNoteText.trim()}
                        className="px-4 py-1.5 bg-teal-600 hover:bg-teal-700 text-white rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 disabled:opacity-50"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>{isAddingNote ? 'جاري الإضافة...' : 'إضافة الملاحظة'}</span>
                      </button>
                    </div>
                  </div>

                  {/* Notes List */}
                  {isLoadingNotes ? (
                    <div className="py-8 text-center text-slate-400 text-xs font-medium">جاري تحميل الملاحظات...</div>
                  ) : notes.length > 0 ? (
                    <div className="space-y-2.5">
                      {notes.map((note) => (
                        <div key={note.id} className="p-3.5 bg-white rounded-xl border border-slate-200 shadow-2xs space-y-1.5">
                          <div className="flex items-center justify-between text-[11px]">
                            <span className="font-bold text-teal-800 flex items-center gap-1">
                              <UserIcon className="w-3 h-3" />
                              {note.author_name || 'موظف الدعم'}
                            </span>
                            <div className="flex items-center gap-2">
                              <span className="text-slate-400 font-mono">
                                {note.created_at ? new Date(note.created_at).toLocaleString('ar-EG') : ''}
                              </span>
                              <button
                                onClick={() => handleDeleteNote(note.id)}
                                className="text-slate-400 hover:text-rose-600 transition-colors p-0.5"
                                title="حذف الملاحظة"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>
                          <p className="text-xs text-slate-700 font-medium whitespace-pre-wrap leading-relaxed">
                            {note.text}
                          </p>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="py-8 text-center text-slate-400 text-xs font-medium">
                      لا توجد أي ملاحظات داخلية مسجلة بعد.
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export { CustomerDataHub as CustomersPage };
export default CustomerDataHub;

