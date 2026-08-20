import React, { useEffect, useState } from 'react';
import {
  BarChart3,
  TrendingUp,
  Clock,
  Bot,
  MessageSquare,
  RefreshCw,
  Zap,
  Filter,
  CheckCircle2,
  AlertCircle,
  Activity,
  Layers,
  ArrowUpRight,
} from 'lucide-react';
import {
  analyticsApi,
  AnalyticsOverview,
  ChannelDistribution,
  BrandVolume,
  PeakHours,
  SlaMetrics,
  MOCK_BRANDS,
} from '../../services/api';

export const ExecutiveDashboard: React.FC = () => {
  const [selectedBrand, setSelectedBrand] = useState<string>('all');
  const [selectedDays, setSelectedDays] = useState<number>(30);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  const [overview, setOverview] = useState<AnalyticsOverview | null>(null);
  const [channels, setChannels] = useState<ChannelDistribution | null>(null);
  const [brands, setBrands] = useState<BrandVolume | null>(null);
  const [peakHours, setPeakHours] = useState<PeakHours | null>(null);
  const [slaMetrics, setSlaMetrics] = useState<SlaMetrics | null>(null);

  const loadData = async () => {
    setIsLoading(true);
    try {
      const [ovData, chData, brData, pkData, slaData] = await Promise.all([
        analyticsApi.getOverview(selectedBrand, selectedDays),
        analyticsApi.getChannels(selectedBrand),
        analyticsApi.getBrands(),
        analyticsApi.getPeakHours(selectedBrand, selectedDays),
        analyticsApi.getSla(selectedBrand),
      ]);

      setOverview(ovData);
      setChannels(chData);
      setBrands(brData);
      setPeakHours(pkData);
      setSlaMetrics(slaData);
    } catch (err) {
      console.error('[Dashboard] Error loading analytics:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [selectedBrand, selectedDays]);

  const maxPeakCount = peakHours?.hours
    ? Math.max(...peakHours.hours.map((h) => h.message_count), 1)
    : 1;

  const channelColorMap: Record<string, { bg: string; text: string; bar: string }> = {
    messenger: { bg: 'bg-blue-50', text: 'text-blue-700', bar: 'bg-blue-600' },
    instagram: { bg: 'bg-pink-50', text: 'text-pink-700', bar: 'bg-gradient-to-r from-fuchsia-600 to-pink-600' },
    whatsapp: { bg: 'bg-emerald-50', text: 'text-emerald-700', bar: 'bg-emerald-600' },
  };

  const channelLabelMap: Record<string, string> = {
    messenger: 'ماسنجر (Facebook)',
    instagram: 'إنستغرام Direct',
    whatsapp: 'واتساب Business',
  };

  return (
    <div className="flex-1 bg-slate-50/60 overflow-y-auto p-6 space-y-6" dir="rtl">
      {/* Header Toolbar */}
      <div className="bg-white/80 backdrop-blur-md rounded-2xl p-5 border border-slate-200/80 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-tr from-teal-600 to-teal-700 text-white flex items-center justify-center shadow-md">
            <Activity className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-900 tracking-tight">لوحة المؤشرات والتحليلات التنفيذية</h1>
            <p className="text-xs text-slate-500 font-medium">
              تحليلات الأداء التشغيلي لمجموعة Luxira Holding ومؤشرات سرعة الرد ومعدلات الأتمتة
            </p>
          </div>
        </div>

        {/* Filter Controls */}
        <div className="flex flex-wrap items-center gap-3">
          {/* Brand Selector */}
          <div className="flex items-center gap-2 bg-slate-100/80 px-3 py-1.5 rounded-xl border border-slate-200/80 text-xs font-semibold">
            <Filter className="w-3.5 h-3.5 text-slate-500" />
            <select
              value={selectedBrand}
              onChange={(e) => setSelectedBrand(e.target.value)}
              className="bg-transparent text-slate-700 focus:outline-hidden font-bold cursor-pointer"
            >
              <option value="all">كل البراندات (الكل)</option>
              {MOCK_BRANDS.map((b) => (
                <option key={b.id} value={b.name}>
                  {b.name}
                </option>
              ))}
            </select>
          </div>

          {/* Days Range Selector */}
          <div className="flex items-center bg-slate-100/80 p-1 rounded-xl border border-slate-200/80 text-xs font-semibold">
            {[
              { days: 7, label: '7 أيام' },
              { days: 30, label: '30 يوم' },
              { days: 90, label: '90 يوم' },
            ].map((item) => (
              <button
                key={item.days}
                onClick={() => setSelectedDays(item.days)}
                className={`px-3 py-1.5 rounded-lg transition-all text-xs font-bold ${
                  selectedDays === item.days
                    ? 'bg-white text-teal-800 shadow-xs border border-slate-200/80'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>

          {/* Refresh Action Button */}
          <button
            onClick={loadData}
            disabled={isLoading}
            className="p-2 bg-white hover:bg-slate-100 text-slate-700 border border-slate-200/80 rounded-xl transition-all shadow-xs flex items-center justify-center disabled:opacity-50"
            title="تحديث البيانات"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin text-teal-600' : ''}`} />
          </button>
        </div>
      </div>

      {/* Top KPI Metrics Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Conversations Card */}
        <div className="bg-white/80 backdrop-blur-md p-5 rounded-2xl border border-slate-200/80 shadow-xs flex flex-col justify-between space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500">إجمالي المحادثات</span>
            <div className="w-9 h-9 rounded-xl bg-teal-50 text-teal-700 flex items-center justify-center">
              <MessageSquare className="w-4 h-4" />
            </div>
          </div>
          <div>
            <div className="text-3xl font-extrabold text-slate-900 tracking-tight">
              {overview?.total_conversations.toLocaleString() || '0'}
            </div>
            <div className="flex items-center gap-1.5 mt-1 text-[11px] text-slate-500 font-medium">
              <span>الوارد: {overview?.total_inbound_messages || 0}</span>
              <span>•</span>
              <span>الصادر: {overview?.total_outbound_messages || 0}</span>
            </div>
          </div>
        </div>

        {/* Pending SLA Conversations */}
        <div className="bg-white/80 backdrop-blur-md p-5 rounded-2xl border border-slate-200/80 shadow-xs flex flex-col justify-between space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500">محادثات تنتظر الرد</span>
            <div className="w-9 h-9 rounded-xl bg-amber-50 text-amber-700 flex items-center justify-center">
              <AlertCircle className="w-4 h-4" />
            </div>
          </div>
          <div>
            <div className="text-3xl font-extrabold text-slate-900 tracking-tight">
              {overview?.unresolved_conversations || '0'}
            </div>
            <div className="mt-1 text-[11px] text-amber-700 font-bold flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse"></span>
              <span>محادثات قيد الانتظار تتطلب التدخل</span>
            </div>
          </div>
        </div>

        {/* Average First Response Time */}
        <div className="bg-white/80 backdrop-blur-md p-5 rounded-2xl border border-slate-200/80 shadow-xs flex flex-col justify-between space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500">متوسط وقت الرد الأول</span>
            <div className="w-9 h-9 rounded-xl bg-blue-50 text-blue-700 flex items-center justify-center">
              <Clock className="w-4 h-4" />
            </div>
          </div>
          <div>
            <div className="text-3xl font-extrabold text-slate-900 tracking-tight flex items-baseline gap-1">
              <span>{slaMetrics?.avg_first_response_minutes.toFixed(1) || '0.0'}</span>
              <span className="text-sm font-bold text-slate-500">دقيقة</span>
            </div>
            <div className="mt-1 text-[11px] text-blue-700 font-bold">
              مقياس سرعة استجابة فريق خدمة العملاء
            </div>
          </div>
        </div>

        {/* Automation Resolution Rate */}
        <div className="bg-white/80 backdrop-blur-md p-5 rounded-2xl border border-slate-200/80 shadow-xs flex flex-col justify-between space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500">معدل حل الأتمتة</span>
            <div className="w-9 h-9 rounded-xl bg-indigo-50 text-indigo-700 flex items-center justify-center">
              <Bot className="w-4 h-4" />
            </div>
          </div>
          <div>
            <div className="text-3xl font-extrabold text-slate-900 tracking-tight flex items-baseline gap-1">
              <span>%{overview?.automation_resolution_rate.toFixed(1) || '0.0'}</span>
            </div>
            <div className="mt-1 text-[11px] text-indigo-700 font-bold">
              تم تنفيذ {overview?.automation_resolutions || 0} رد تلقائي ناجح
            </div>
          </div>
        </div>
      </div>

      {/* Main Grid: Channels & Brand Volume */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Channel Share Distribution */}
        <div className="bg-white/80 backdrop-blur-md p-6 rounded-2xl border border-slate-200/80 shadow-xs space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div className="flex items-center gap-2">
              <BarChart3 className="w-5 h-5 text-teal-600" />
              <h2 className="text-base font-bold text-slate-900">توزيع القنوات (Channel Share)</h2>
            </div>
            <span className="text-xs font-bold text-slate-500">
              إجمالي {channels?.total || 0} محادثة
            </span>
          </div>

          <div className="space-y-4">
            {channels?.channels && channels.channels.length > 0 ? (
              channels.channels.map((ch) => {
                const styles = channelColorMap[ch.channel] || {
                  bg: 'bg-slate-50',
                  text: 'text-slate-700',
                  bar: 'bg-slate-600',
                };
                const label = channelLabelMap[ch.channel] || ch.channel;
                return (
                  <div key={ch.channel} className="space-y-1.5">
                    <div className="flex items-center justify-between text-xs font-bold">
                      <span className="text-slate-800">{label}</span>
                      <span className="text-slate-500">
                        {ch.count} محادثة ({ch.percentage.toFixed(1)}%)
                      </span>
                    </div>
                    <div className="w-full h-3 bg-slate-100 rounded-full overflow-hidden">
                      <div
                        className={`h-full ${styles.bar} transition-all duration-500 rounded-full`}
                        style={{ width: `${Math.min(100, Math.max(2, ch.percentage))}%` }}
                      ></div>
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="text-center py-6 text-xs text-slate-500">لا توجد بيانات قنوات متاحة حالياً</div>
            )}
          </div>
        </div>

        {/* Brand Volume Comparison */}
        <div className="bg-white/80 backdrop-blur-md p-6 rounded-2xl border border-slate-200/80 shadow-xs space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div className="flex items-center gap-2">
              <Layers className="w-5 h-5 text-teal-600" />
              <h2 className="text-base font-bold text-slate-900">حجم العمليات حسب البراند (Brand Volume)</h2>
            </div>
            <span className="text-xs font-bold text-slate-500">مقارنة براندات مجموعة Luxira</span>
          </div>

          <div className="space-y-3">
            {brands?.brands && brands.brands.length > 0 ? (
              brands.brands.map((b) => (
                <div
                  key={b.brand}
                  className="flex items-center justify-between p-3 rounded-xl bg-slate-50/80 border border-slate-200/60 hover:border-slate-300 transition-all"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-teal-600 text-white font-bold text-xs flex items-center justify-center shadow-xs">
                      {b.brand.charAt(0)}
                    </div>
                    <div>
                      <div className="text-xs font-bold text-slate-900">{b.brand}</div>
                      <div className="text-[11px] text-slate-500">
                        {b.total_messages} رسالة مسجلة
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-4 text-left">
                    <div>
                      <span className="text-xs font-extrabold text-slate-800">
                        {b.total_conversations}
                      </span>
                      <span className="text-[10px] text-slate-500 block font-medium">محادثات</span>
                    </div>
                    {b.active_unread > 0 && (
                      <span className="bg-red-500 text-white text-[10px] px-2 py-0.5 rounded-full font-bold">
                        {b.active_unread} غير مقروء
                      </span>
                    )}
                  </div>
                </div>
              ))
            ) : (
              <div className="text-center py-6 text-xs text-slate-500">لا توجد بيانات براندات متاحة</div>
            )}
          </div>
        </div>
      </div>

      {/* Peak Inflow Hours & SLA Compliance Section */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Peak Inflow Hours Heatmap (2 Cols) */}
        <div className="lg:col-span-2 bg-white/80 backdrop-blur-md p-6 rounded-2xl border border-slate-200/80 shadow-xs space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div className="flex items-center gap-2">
              <Zap className="w-5 h-5 text-amber-500" />
              <h2 className="text-base font-bold text-slate-900">خريطة ساعات الذروة (24-Hour Peak Inflow)</h2>
            </div>
            {peakHours?.peak_count ? (
              <div className="bg-amber-50 border border-amber-200 text-amber-800 px-3 py-1 rounded-full text-xs font-bold flex items-center gap-1">
                <Clock className="w-3.5 h-3.5" />
                <span>
                  أعلى تدفق: الساعة {peakHours.peak_hour}:00 ({peakHours.peak_count} رسائل)
                </span>
              </div>
            ) : null}
          </div>

          {/* 24-Hour Histogram Bar Heatmap */}
          <div className="pt-4">
            <div className="h-44 flex items-end justify-between gap-1 border-b border-slate-200 pb-2">
              {peakHours?.hours && peakHours.hours.length > 0 ? (
                peakHours.hours.map((item) => {
                  const heightPct = Math.max(8, (item.message_count / maxPeakCount) * 100);
                  const isPeak = item.hour === peakHours.peak_hour && item.message_count > 0;
                  return (
                    <div
                      key={item.hour}
                      className="flex-1 flex flex-col items-center gap-1 group relative cursor-pointer"
                    >
                      {/* Tooltip on hover */}
                      <div className="opacity-0 group-hover:opacity-100 transition-opacity absolute -top-8 bg-slate-900 text-white text-[10px] px-2 py-0.5 rounded shadow pointer-events-none whitespace-nowrap z-10 font-bold">
                        {item.message_count} رسائل ({item.hour}:00)
                      </div>

                      {/* Bar fill */}
                      <div
                        className={`w-full rounded-t-sm transition-all duration-300 ${
                          isPeak
                            ? 'bg-gradient-to-t from-amber-500 to-amber-400 shadow-md'
                            : item.message_count > 0
                            ? 'bg-teal-600 hover:bg-teal-500'
                            : 'bg-slate-200/60'
                        }`}
                        style={{ height: `${heightPct}%` }}
                      ></div>
                    </div>
                  );
                })
              ) : (
                <div className="w-full text-center text-xs text-slate-500">لا توجد بيانات ساعات متاحة</div>
              )}
            </div>

            {/* Hour axis labels */}
            <div className="flex justify-between text-[10px] text-slate-400 font-bold pt-2 px-1">
              <span>00:00</span>
              <span>04:00</span>
              <span>08:00</span>
              <span>12:00</span>
              <span>16:00</span>
              <span>20:00</span>
              <span>23:00</span>
            </div>
          </div>
        </div>

        {/* SLA Performance Card (1 Col) */}
        <div className="bg-white/80 backdrop-blur-md p-6 rounded-2xl border border-slate-200/80 shadow-xs flex flex-col justify-between space-y-4">
          <div className="border-b border-slate-100 pb-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5 text-emerald-600" />
              <h2 className="text-base font-bold text-slate-900">مؤشرات مستوى الخدمة (SLA)</h2>
            </div>
          </div>

          <div className="flex-1 flex flex-col items-center justify-center text-center p-4 space-y-3">
            {/* Compliance Gauge representation */}
            <div className="relative w-32 h-32 flex items-center justify-center">
              <div className="w-32 h-32 rounded-full border-8 border-slate-100 flex items-center justify-center">
                <div className="text-center">
                  <span className="text-3xl font-extrabold text-slate-900">
                    %{slaMetrics?.sla_compliance_rate.toFixed(0) || '0'}
                  </span>
                  <span className="block text-[10px] font-bold text-slate-500">نسبة الالتزام</span>
                </div>
              </div>
            </div>

            <div className="space-y-1">
              <div className="text-xs font-bold text-slate-800">
                الهدف: الرد في أقل من 15 دقيقة
              </div>
              <div className="text-[11px] text-slate-500 font-medium">
                تم تقييم {slaMetrics?.total_evaluated || 0} محادثة ({slaMetrics?.within_sla_count || 0} ضمن SLA)
              </div>
            </div>
          </div>

          <div className="p-3 bg-emerald-50 rounded-xl border border-emerald-200/60 text-xs text-emerald-800 font-semibold flex items-center gap-2">
            <TrendingUp className="w-4 h-4 shrink-0 text-emerald-600" />
            <span>الأداء مستقر ضمن المعايير القياسية لخدمة العملاء</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ExecutiveDashboard;
