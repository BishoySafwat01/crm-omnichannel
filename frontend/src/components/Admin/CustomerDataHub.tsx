import React, { useEffect, useState } from 'react';
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
} from 'lucide-react';
import {
  adminCustomerApi,
  AdminCustomerList,
  CustomerStats,
  MOCK_BRANDS,
} from '../../services/api';
import { Customer } from '../../types/crm';


export const CustomerDataHub: React.FC = () => {
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedBrand, setSelectedBrand] = useState<string>('all');
  const [selectedStage, setSelectedStage] = useState<string>('all');
  const [selectedTier, setSelectedTier] = useState<string>('all');
  const [selectedSkinType, setSelectedSkinType] = useState<string>('all');
  const [page, setPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(50);

  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isExporting, setIsExporting] = useState<boolean>(false);
  const [data, setData] = useState<AdminCustomerList | null>(null);
  const [stats, setStats] = useState<CustomerStats | null>(null);

  const fetchCustomers = async () => {
    setIsLoading(true);
    try {
      const [listRes, statsRes] = await Promise.all([
        adminCustomerApi.listCustomers({
          query: searchQuery,
          brand: selectedBrand,
          stage: selectedStage,
          tier: selectedTier,
          skin_type: selectedSkinType,
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
  }, [searchQuery, selectedBrand, selectedStage, selectedTier, selectedSkinType, page, pageSize]);

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
                <th className="px-4 py-3">الهاتف</th>
                <th className="px-4 py-3">البريد الإلكتروني</th>
                <th className="px-4 py-3">الموقع / الدولة</th>
                <th className="px-4 py-3">الدرجة</th>
                <th className="px-4 py-3">نوع البشرة</th>
                <th className="px-4 py-3">المرحلة الحالية</th>
                <th className="px-4 py-3">تاريخ التسجيل</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-medium">
              {isLoading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i} className="animate-pulse">
                    <td className="px-4 py-3.5"><div className="h-4 bg-slate-200 rounded-md w-32"></div></td>
                    <td className="px-4 py-3.5"><div className="h-4 bg-slate-200 rounded-md w-24"></div></td>
                    <td className="px-4 py-3.5"><div className="h-4 bg-slate-200 rounded-md w-36"></div></td>
                    <td className="px-4 py-3.5"><div className="h-4 bg-slate-200 rounded-md w-20"></div></td>
                    <td className="px-4 py-3.5"><div className="h-4 bg-slate-200 rounded-md w-16"></div></td>
                    <td className="px-4 py-3.5"><div className="h-4 bg-slate-200 rounded-md w-16"></div></td>
                    <td className="px-4 py-3.5"><div className="h-4 bg-slate-200 rounded-md w-20"></div></td>
                    <td className="px-4 py-3.5"><div className="h-4 bg-slate-200 rounded-md w-24"></div></td>
                  </tr>
                ))
              ) : data?.items && data.items.length > 0 ? (
                data.items.map((cust) => {
                  const stageBadge = stageBadgeMap[cust.stage || 'جديد'] || 'bg-slate-100 text-slate-700 border-slate-200';
                  const tierBadge = tierBadgeMap[cust.tier || 'درجة أولى'] || 'bg-slate-100 text-slate-700 border-slate-200';

                  return (
                    <tr key={cust.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="px-4 py-3.5">
                        <div className="flex items-center gap-2.5">
                          <div className="w-8 h-8 rounded-full bg-teal-600 text-white font-bold text-xs flex items-center justify-center shadow-xs shrink-0">
                            {cust.avatar_url ? (
                              <img src={cust.avatar_url} alt="" className="w-full h-full rounded-full object-cover" />
                            ) : (
                              (cust.display_name || 'ع').charAt(0)
                            )}
                          </div>
                          <span className="font-bold text-slate-900">{cust.display_name || 'عميل غير معرف'}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3.5 text-slate-700 dir-ltr text-right font-mono">{cust.phone || '-'}</td>
                      <td className="px-4 py-3.5 text-slate-700 font-mono">{cust.email || '-'}</td>
                      <td className="px-4 py-3.5 text-slate-600">
                        {cust.location ? (
                          <span className="inline-flex items-center gap-1">
                            <MapPin className="w-3 h-3 text-slate-400" />
                            <span>{cust.location}</span>
                          </span>
                        ) : (
                          '-'
                        )}
                      </td>
                      <td className="px-4 py-3.5">
                        <span className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold border ${tierBadge}`}>
                          {cust.tier || 'درجة أولى'}
                        </span>
                      </td>
                      <td className="px-4 py-3.5 text-slate-600">{cust.skin_type || 'عادية'}</td>
                      <td className="px-4 py-3.5">
                        <span className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold border ${stageBadge}`}>
                          {cust.stage || 'جديد'}
                        </span>
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
    </div>
  );
};

export default CustomerDataHub;
