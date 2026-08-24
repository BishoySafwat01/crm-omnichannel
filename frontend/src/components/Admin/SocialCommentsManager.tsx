import React, { useState, useEffect, useCallback } from 'react';
import {
  MessageSquare,
  Bot,
  Trash2,
  EyeOff,
  Eye,
  Send,
  Sparkles,
  ShieldAlert,
  ShieldCheck,
  Filter,
  Search,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  Sliders,
  Play,
  Share2,
  ChevronDown,
  ExternalLink,
  MessageCircle,
  Clock,
  ThumbsUp,
  Flame,
  X,
  Plus,
  Tag,
  Zap,
  ArrowRight,
  Activity,
  Check,
  Loader2,
} from 'lucide-react';
import {
  MOCK_BRANDS,
  socialCommentsApi,
  SocialCommentItem,
  CommentStats,
  ModerationSettings,
  ModerationLog,
} from '../../services/api';

const MOCK_POSTS = [
  { id: 'all', title: 'جميع المنشورات والإعلانات' },
  { id: 'post-1', title: '👗 عرض الصيف الحصري: خصم 40% على الفساتين' },
  { id: 'post-2', title: '👑 تشكيلة العطور الملكية الفاخرة لعام 2026' },
  { id: 'post-3', title: '✨ سيروم الهيالورونيك وفيتامين C لنضارة البشرة' },
];

export const SocialCommentsManager: React.FC = () => {
  const [comments, setComments] = useState<SocialCommentItem[]>([]);
  const [stats, setStats] = useState<CommentStats>({
    total_comments: 0,
    auto_deleted_or_hidden: 0,
    auto_replied_dms: 0,
    positive_rate: 50,
    active_auto_delete_enabled: true,
  });
  const [logs, setLogs] = useState<ModerationLog[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSavingSettings, setIsSavingSettings] = useState(false);

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [platformFilter, setPlatformFilter] = useState<string>('all');
  const [sentimentFilter, setSentimentFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [selectedPostId, setSelectedPostId] = useState<string>('all');
  const [selectedBrand, setSelectedBrand] = useState<string>('all');

  // Modals state
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
  const [isSimulatorModalOpen, setIsSimulatorModalOpen] = useState(false);
  const [isLogsModalOpen, setIsLogsModalOpen] = useState(false);
  const [replyModalComment, setReplyModalComment] = useState<SocialCommentItem | null>(null);
  const [replyText, setReplyText] = useState('');
  const [replyAsDm, setReplyAsDm] = useState(true);
  const [isSubmittingReply, setIsSubmittingReply] = useState(false);
  const [actionNotification, setActionNotification] = useState<string | null>(null);

  // Settings state
  const [settings, setSettings] = useState<ModerationSettings>({
    auto_delete_negative: true,
    auto_hide_spam: true,
    auto_reply_inquiries: true,
    strictness_level: 'strict',
    action_for_negative: 'delete_and_dm',
    negative_keywords: ['نصابين', 'سيء', 'زفت', 'سرقة', 'كذابين', 'مقلب', 'غالي جدا', 'خامة رديئة', 'حرامية'],
    inquiry_keywords: ['بكام', 'السعر', 'التفاصيل', 'شحن', 'توصيل', 'عايز اطلب', 'كم السعر'],
    inquiry_reply_text: 'أهلاً بك! تم إرسال كافة التفاصيل والأسعار في رسالة خاصة 💌',
    inquiry_dm_text: 'أهلاً بك يا فندم! يسعدنا تواصلك معنا، إليك كافة التفاصيل والعروض الخاصة المتاحة اليوم...',
    negative_dm_apology_text: 'نعتذر جداً عن أي تجربة غير مرضية واجهتك، هدفنا رضاك التام ويسعدنا حل المشكلة فوراً...',
  });

  const [newNegativeKeyword, setNewNegativeKeyword] = useState('');

  // Simulator state
  const [simulatorInput, setSimulatorInput] = useState('');
  const [simulatorResult, setSimulatorResult] = useState<{
    sentiment: string;
    confidence: number;
    decision: string;
    actionType: string;
  } | null>(null);
  const [isSimulating, setIsSimulating] = useState(false);

  // Show Toast Notification
  const triggerNotification = (msg: string) => {
    setActionNotification(msg);
    setTimeout(() => {
      setActionNotification(null);
    }, 3500);
  };

  // Fetch comments from backend API
  const fetchCommentsData = useCallback(async () => {
    setIsLoading(true);
    try {
      const [resComments, resStats, resSettings] = await Promise.all([
        socialCommentsApi.getComments({
          brand: selectedBrand,
          platform: platformFilter,
          sentiment: sentimentFilter,
          status: statusFilter,
          search: searchQuery,
        }),
        socialCommentsApi.getStats(),
        socialCommentsApi.getSettings(selectedBrand),
      ]);

      setComments(resComments.items || []);
      setStats(resStats);
      if (resSettings) {
        setSettings(resSettings);
      }
    } catch (err) {
      console.error('Failed to load social comments from API:', err);
    } finally {
      setIsLoading(false);
    }
  }, [selectedBrand, platformFilter, sentimentFilter, statusFilter, searchQuery]);

  useEffect(() => {
    fetchCommentsData();
  }, [fetchCommentsData]);

  // Fetch logs when logs modal is opened
  const fetchLogs = async () => {
    try {
      const res = await socialCommentsApi.getLogs();
      setLogs(res || []);
    } catch (e) {
      console.error('Failed to load moderation logs:', e);
    }
  };

  // Action: Delete comment
  const handleDeleteComment = async (commentId: string) => {
    try {
      await socialCommentsApi.updateCommentStatus(
        commentId,
        'auto_deleted',
        'تم الحذف يدوياً بواسطة مشرف النظام'
      );
      triggerNotification('تم حذف التعليق بنجاح من الصفحة 🗑️');
      fetchCommentsData();
    } catch (err) {
      triggerNotification('حدث خطأ أثناء محاولة حذف التعليق');
    }
  };

  // Action: Toggle Hide/Show
  const handleToggleHide = async (comment: SocialCommentItem) => {
    const nextStatus = comment.moderation_status === 'auto_hidden' ? 'active' : 'auto_hidden';
    const reason = nextStatus === 'auto_hidden' ? 'تم الإخفاء عن الجمهور' : 'تمت إعادة إظهار التعليق';
    try {
      await socialCommentsApi.updateCommentStatus(comment.id, nextStatus, reason);
      triggerNotification('تم تحديث حالة إظهار/إخفاء التعليق 🛡️');
      fetchCommentsData();
    } catch (err) {
      triggerNotification('حدث خطأ أثناء تحديث حالة التعليق');
    }
  };

  // Action: Restore comment
  const handleRestoreComment = async (commentId: string) => {
    try {
      await socialCommentsApi.updateCommentStatus(commentId, 'active', 'تمت استعادة التعليق');
      triggerNotification('تمت استعادة التعليق وإلغاء حظره ✅');
      fetchCommentsData();
    } catch (err) {
      triggerNotification('حدث خطأ أثناء استعادة التعليق');
    }
  };

  // Action: Send reply
  const handleSendReply = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!replyModalComment || !replyText.trim()) return;

    setIsSubmittingReply(true);
    try {
      await socialCommentsApi.replyToComment(
        replyModalComment.id,
        replyText.trim(),
        replyAsDm,
        replyText.trim()
      );
      setIsSubmittingReply(false);
      setReplyModalComment(null);
      setReplyText('');
      triggerNotification('تم إرسال الرد بنجاح وحفظه في النظام 💬');
      fetchCommentsData();
    } catch (err) {
      setIsSubmittingReply(false);
      triggerNotification('حدث خطأ أثناء إرسال الرد');
    }
  };

  // Action: Save Settings
  const handleSaveSettings = async () => {
    setIsSavingSettings(true);
    try {
      const updated = await socialCommentsApi.updateSettings(settings, selectedBrand);
      setSettings(updated);
      setIsSavingSettings(false);
      setIsSettingsModalOpen(false);
      triggerNotification('تم حفظ وتطبيق إعدادات الذكاء الاصطناعي بنجاح ⚙️');
      fetchCommentsData();
    } catch (err) {
      setIsSavingSettings(false);
      triggerNotification('حدث خطأ أثناء حفظ الإعدادات');
    }
  };

  // Action: Toggle AI Auto Moderation
  const handleToggleAiModeration = async () => {
    const nextState = !settings.auto_delete_negative;
    const newSettings = { ...settings, auto_delete_negative: nextState };
    setSettings(newSettings);
    try {
      await socialCommentsApi.updateSettings(newSettings, selectedBrand);
      triggerNotification(
        nextState ? 'تم تفعيل الحماية التلقائية بالـ AI 🛡️' : 'تم إيقاف الحماية التلقائية مؤقتاً ⏸️'
      );
      fetchCommentsData();
    } catch (e) {
      triggerNotification('فشل تحديث حالة الحماية التلقائية');
    }
  };

  // Action: Run AI Simulation
  const handleRunSimulation = async () => {
    if (!simulatorInput.trim()) return;
    setIsSimulating(true);

    try {
      const res = await socialCommentsApi.simulateAi(simulatorInput.trim(), selectedBrand);
      let actionType = 'allow';
      if (res.sentiment === 'negative' || res.sentiment === 'spam') actionType = 'delete';
      if (res.sentiment === 'neutral_inquiry') actionType = 'reply';

      setSimulatorResult({
        sentiment: res.sentiment,
        confidence: res.sentiment_score,
        decision: `${res.matched_action}: ${res.decision_reason}`,
        actionType: actionType,
      });
    } catch (e) {
      triggerNotification('حدث خطأ في محاكاة الفحص');
    } finally {
      setIsSimulating(false);
    }
  };

  // Add Negative Keyword
  const handleAddNegativeKeyword = () => {
    const trimmed = newNegativeKeyword.trim();
    if (trimmed && !settings.negative_keywords.includes(trimmed)) {
      setSettings({
        ...settings,
        negative_keywords: [...settings.negative_keywords, trimmed],
      });
      setNewNegativeKeyword('');
    }
  };

  const handleRemoveNegativeKeyword = (kw: string) => {
    setSettings({
      ...settings,
      negative_keywords: settings.negative_keywords.filter((k) => k !== kw),
    });
  };

  const formatRelativeTime = (isoString?: string) => {
    if (!isoString) return 'الآن';
    const diff = Math.floor((Date.now() - new Date(isoString).getTime()) / 1000);
    if (diff < 60) return 'منذ لحظات';
    if (diff < 3600) return `منذ ${Math.floor(diff / 60)} دقيقة`;
    if (diff < 86400) return `منذ ${Math.floor(diff / 3600)} ساعة`;
    return `منذ ${Math.floor(diff / 86400)} يوم`;
  };

  return (
    <div className="flex-1 bg-slate-50/50 p-6 overflow-y-auto" dir="rtl">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Toast Notification Alert */}
        {actionNotification && (
          <div className="fixed bottom-6 left-6 z-50 bg-slate-900 text-white px-5 py-3 rounded-2xl shadow-2xl flex items-center gap-3 border border-slate-700 animate-in slide-in-from-bottom-5 duration-200">
            <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
            <span className="text-xs font-bold">{actionNotification}</span>
          </div>
        )}

        {/* Header Title & Quick Actions */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-6 rounded-3xl border border-slate-200/80 shadow-xs">
          <div className="flex items-center gap-3.5">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-[#1A73E8] to-indigo-600 text-white flex items-center justify-center shadow-lg shadow-blue-500/20">
              <MessageCircle className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2.5">
                <h1 className="text-xl font-black text-slate-900 tracking-tight">
                  إدارة التعليقات والأتمتة الذكية (AI Auto-Moderation)
                </h1>
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-extrabold bg-[#E8F0FE] text-[#1A73E8] border border-[#1A73E8]/20">
                  Meta Graph v20.0 (Live API)
                </span>
              </div>
              <p className="text-xs text-slate-500 font-medium mt-0.5">
                رصد تعليقات فيسبوك وإنستغرام، الرد الفوري، وحذف التعليقات السلبية والمسيئة تلقائياً بالذكاء الاصطناعي
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            {/* Refresh Button */}
            <button
              onClick={fetchCommentsData}
              disabled={isLoading}
              className="p-2.5 rounded-2xl bg-slate-100 hover:bg-slate-200/80 text-slate-700 transition border border-slate-200/60"
              title="تحديث البيانات"
            >
              <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin text-[#1A73E8]' : ''}`} />
            </button>

            {/* AI Sandbox Simulator Trigger */}
            <button
              onClick={() => setIsSimulatorModalOpen(true)}
              className="px-3.5 py-2 rounded-2xl bg-indigo-50 hover:bg-indigo-100/80 text-indigo-700 text-xs font-bold transition flex items-center gap-1.5 border border-indigo-200/60 shadow-2xs"
            >
              <Sparkles className="w-4 h-4 text-indigo-600" />
              <span>محاكي فحص AI</span>
            </button>

            {/* AI Audit Logs Modal Trigger */}
            <button
              onClick={() => {
                fetchLogs();
                setIsLogsModalOpen(true);
              }}
              className="px-3.5 py-2 rounded-2xl bg-slate-100 hover:bg-slate-200/80 text-slate-700 text-xs font-bold transition flex items-center gap-1.5 border border-slate-200/60 shadow-2xs"
            >
              <Activity className="w-4 h-4 text-slate-600" />
              <span>سجل العمليات ({stats.auto_deleted_or_hidden + stats.auto_replied_dms})</span>
            </button>
          </div>
        </div>

        {/* Global Protection Banner Switch */}
        <div
          className={`p-5 rounded-3xl border transition flex flex-col sm:flex-row items-center justify-between gap-4 ${
            settings.auto_delete_negative
              ? 'bg-gradient-to-r from-emerald-50 via-teal-50 to-emerald-50/50 border-emerald-200/80 text-emerald-950'
              : 'bg-gradient-to-r from-amber-50 to-orange-50 border-amber-200 text-amber-950'
          }`}
        >
          <div className="flex items-center gap-3.5">
            <div
              className={`w-11 h-11 rounded-2xl flex items-center justify-center shrink-0 ${
                settings.auto_delete_negative ? 'bg-emerald-600 text-white' : 'bg-amber-600 text-white'
              }`}
            >
              {settings.auto_delete_negative ? (
                <ShieldCheck className="w-6 h-6" />
              ) : (
                <ShieldAlert className="w-6 h-6" />
              )}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-black">
                  {settings.auto_delete_negative
                    ? 'الحذف التلقائي للتعليقات السلبية بالـ AI: مُفعّل ونشط 🛡️'
                    : 'الحذف التلقائي متوقف مؤقتاً (وضع المراقبة فقط) ⚠️'}
                </h3>
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              </div>
              <p className="text-xs text-slate-600 font-medium mt-0.5">
                {settings.auto_delete_negative
                  ? 'يتم فحص التعليقات فور وصولها من فيسبوك وإنستغرام، حذف الشتائم والتعليقات السلبية فورياً، وإرسال تفاصيل الأسعار في الخاص تلقائياً.'
                  : 'لن يتم حذف أي تعليق تلقائياً حتى تعيد تفعيل الحماية الفورية.'}
              </p>
            </div>
          </div>

          <button
            onClick={handleToggleAiModeration}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition shrink-0 ${
              settings.auto_delete_negative
                ? 'bg-emerald-100 hover:bg-emerald-200 text-emerald-800 border border-emerald-300'
                : 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs'
            }`}
          >
            {settings.auto_delete_negative ? 'إيقاف مؤقت' : 'تفعيل الحماية الفورية الآن'}
          </button>
        </div>

        {/* KPI Stats Cards (4 Columns) */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold text-slate-500">إجمالي التعليقات الواردة</p>
              <div className="flex items-baseline gap-2 mt-1">
                <h3 className="text-2xl font-black text-slate-900">{stats.total_comments}</h3>
                <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded-md">
                  +18% اليوم
                </span>
              </div>
            </div>
            <div className="w-10 h-10 rounded-xl bg-blue-50 text-[#1A73E8] flex items-center justify-center font-bold">
              <MessageSquare className="w-5 h-5" />
            </div>
          </div>

          <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold text-slate-500">حُذفت / أُخفيت بالـ AI</p>
              <div className="flex items-baseline gap-2 mt-1">
                <h3 className="text-2xl font-black text-rose-600">{stats.auto_deleted_or_hidden}</h3>
                <span className="text-[10px] font-bold text-rose-600 bg-rose-50 px-1.5 py-0.5 rounded-md">
                  حماية السمعة 🛡️
                </span>
              </div>
            </div>
            <div className="w-10 h-10 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center font-bold">
              <Trash2 className="w-5 h-5" />
            </div>
          </div>

          <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold text-slate-500">ردود تلقائية بالخاص</p>
              <div className="flex items-baseline gap-2 mt-1">
                <h3 className="text-2xl font-black text-indigo-600">{stats.auto_replied_dms}</h3>
                <span className="text-[10px] font-bold text-indigo-600 bg-indigo-50 px-1.5 py-0.5 rounded-md">
                  استفسار سعر ⚡
                </span>
              </div>
            </div>
            <div className="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center font-bold">
              <Zap className="w-5 h-5" />
            </div>
          </div>

          <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold text-slate-500">مؤشر الرضا الإيجابي</p>
              <div className="flex items-baseline gap-2 mt-1">
                <h3 className="text-2xl font-black text-emerald-600">{stats.positive_rate}%</h3>
                <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded-md">
                  ممتاز ✨
                </span>
              </div>
            </div>
            <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center font-bold">
              <ThumbsUp className="w-5 h-5" />
            </div>
          </div>
        </div>

        {/* Filter and Search Bar */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs space-y-3">
          <div className="flex flex-col md:flex-row items-center gap-3">
            {/* Search Input */}
            <div className="relative flex-1 w-full">
              <Search className="w-4 h-4 text-slate-400 absolute right-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="ابحث في نص التعليقات، اسم العميل، أو عنوان المنشور..."
                className="w-full bg-slate-50 text-xs font-medium text-slate-900 pr-10 pl-4 py-2.5 rounded-xl border border-slate-200 focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#1A73E8]/20 focus:border-[#1A73E8]"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-xs"
                >
                  ✕
                </button>
              )}
            </div>

            {/* Brand Dropdown */}
            <div className="w-full md:w-48 shrink-0">
              <select
                value={selectedBrand}
                onChange={(e) => setSelectedBrand(e.target.value)}
                className="w-full bg-slate-50 text-xs font-bold text-slate-800 px-3.5 py-2.5 rounded-xl border border-slate-200 focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#1A73E8]/20"
              >
                {MOCK_BRANDS.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Post Selector Dropdown */}
            <div className="w-full md:w-64 shrink-0">
              <select
                value={selectedPostId}
                onChange={(e) => setSelectedPostId(e.target.value)}
                className="w-full bg-slate-50 text-xs font-bold text-slate-800 px-3.5 py-2.5 rounded-xl border border-slate-200 focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#1A73E8]/20 truncate"
              >
                {MOCK_POSTS.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.title}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Quick Filter Badges */}
          <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-slate-100">
            <span className="text-[11px] font-bold text-slate-400 ml-2">تصفية سريعة:</span>

            {/* Platform Filters */}
            <div className="flex items-center gap-1 bg-slate-100/80 p-0.5 rounded-xl">
              <button
                onClick={() => setPlatformFilter('all')}
                className={`px-3 py-1 rounded-lg text-[11px] font-bold transition ${
                  platformFilter === 'all' ? 'bg-white text-slate-900 shadow-2xs' : 'text-slate-600'
                }`}
              >
                الكل
              </button>
              <button
                onClick={() => setPlatformFilter('facebook')}
                className={`px-3 py-1 rounded-lg text-[11px] font-bold transition ${
                  platformFilter === 'facebook'
                    ? 'bg-[#1877F2] text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                فيسبوك (FB)
              </button>
              <button
                onClick={() => setPlatformFilter('instagram')}
                className={`px-3 py-1 rounded-lg text-[11px] font-bold transition ${
                  platformFilter === 'instagram'
                    ? 'bg-gradient-to-r from-purple-600 to-pink-600 text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                إنستغرام (IG)
              </button>
            </div>

            <div className="h-4 w-px bg-slate-200 mx-1" />

            {/* Sentiment Filters */}
            <button
              onClick={() => setSentimentFilter('all')}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition ${
                sentimentFilter === 'all' ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600'
              }`}
            >
              كل المشاعر
            </button>
            <button
              onClick={() => setSentimentFilter('positive')}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition flex items-center gap-1 ${
                sentimentFilter === 'positive'
                  ? 'bg-emerald-600 text-white'
                  : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
              }`}
            >
              <span>🟢 إيجابي</span>
            </button>
            <button
              onClick={() => setSentimentFilter('neutral_inquiry')}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition flex items-center gap-1 ${
                sentimentFilter === 'neutral_inquiry'
                  ? 'bg-blue-600 text-white'
                  : 'bg-blue-50 text-blue-700 hover:bg-blue-100'
              }`}
            >
              <span>💬 استفسار/سعر</span>
            </button>
            <button
              onClick={() => setSentimentFilter('negative')}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition flex items-center gap-1 ${
                sentimentFilter === 'negative'
                  ? 'bg-rose-600 text-white'
                  : 'bg-rose-50 text-rose-700 hover:bg-rose-100'
              }`}
            >
              <span>❌ سلبي (محذوف)</span>
            </button>
            <button
              onClick={() => setSentimentFilter('spam')}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition flex items-center gap-1 ${
                sentimentFilter === 'spam'
                  ? 'bg-purple-600 text-white'
                  : 'bg-purple-50 text-purple-700 hover:bg-purple-100'
              }`}
            >
              <span>🚫 سبام/مخالف</span>
            </button>

            <div className="h-4 w-px bg-slate-200 mx-1" />

            {/* Moderation Status Filters */}
            <span className="text-[11px] font-bold text-slate-400">الحالة:</span>
            <button
              onClick={() => setStatusFilter('all')}
              className={`px-2 py-0.5 rounded-md text-[11px] font-bold ${
                statusFilter === 'all' ? 'text-slate-900 underline' : 'text-slate-500'
              }`}
            >
              الكل
            </button>
            <button
              onClick={() => setStatusFilter('auto_deleted')}
              className={`px-2 py-0.5 rounded-md text-[11px] font-bold ${
                statusFilter === 'auto_deleted' ? 'text-rose-600 underline' : 'text-slate-500'
              }`}
            >
              محذوف بالـ AI 🤖
            </button>
            <button
              onClick={() => setStatusFilter('replied')}
              className={`px-2 py-0.5 rounded-md text-[11px] font-bold ${
                statusFilter === 'replied' ? 'text-indigo-600 underline' : 'text-slate-500'
              }`}
            >
              تم الرد
            </button>
          </div>
        </div>

        {/* Comments Stream Feed List */}
        <div className="space-y-3.5">
          {isLoading ? (
            <div className="bg-white p-12 rounded-3xl border border-slate-200 text-center space-y-3">
              <Loader2 className="w-8 h-8 text-[#1A73E8] animate-spin mx-auto" />
              <p className="text-xs font-bold text-slate-600">جاري تحميل التعليقات الحية من قاعدة البيانات...</p>
            </div>
          ) : comments.length === 0 ? (
            <div className="bg-white p-12 rounded-3xl border border-slate-200 text-center space-y-3">
              <MessageSquare className="w-12 h-12 text-slate-300 mx-auto" />
              <h3 className="text-sm font-bold text-slate-700">لا توجد تعليقات تطابق الفلاتر المحددة</h3>
              <p className="text-xs text-slate-400">جرب تغيير معايير البحث أو اختيار منصة أخرى</p>
            </div>
          ) : (
            comments.map((comment) => {
              const isNegativeOrSpam =
                comment.sentiment === 'negative' || comment.sentiment === 'spam';
              const isAutoDeletedOrHidden =
                comment.moderation_status === 'auto_deleted' ||
                comment.moderation_status === 'auto_hidden';

              return (
                <div
                  key={comment.id}
                  className={`bg-white rounded-3xl border p-5 transition hover:shadow-md relative overflow-hidden ${
                    comment.moderation_status === 'auto_deleted'
                      ? 'border-rose-200 bg-rose-50/20'
                      : comment.moderation_status === 'auto_hidden'
                      ? 'border-purple-200 bg-purple-50/20'
                      : comment.moderation_status === 'replied'
                      ? 'border-blue-200'
                      : 'border-slate-200/80'
                  }`}
                >
                  {/* Top Bar: Author & Post Metadata */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-3">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-2xl bg-gradient-to-tr from-slate-200 to-slate-300 flex items-center justify-center font-black text-slate-700 text-xs shadow-2xs">
                        {comment.author_name.slice(0, 2)}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <h4 className="text-xs font-black text-slate-900">{comment.author_name}</h4>
                          <span
                            className={`px-2 py-0.5 rounded-md text-[10px] font-extrabold flex items-center gap-1 ${
                              comment.platform === 'facebook'
                                ? 'bg-blue-100 text-[#1877F2]'
                                : 'bg-pink-100 text-pink-700'
                            }`}
                          >
                            {comment.platform === 'facebook' ? 'فيسبوك' : 'إنستغرام'}
                          </span>
                          <span className="text-[11px] text-slate-400 font-medium flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            {formatRelativeTime(comment.created_at)}
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-500 font-medium mt-0.5 truncate max-w-md flex items-center gap-1">
                          <span className="text-slate-400 font-bold">📌</span> {comment.post_title}
                        </p>
                      </div>
                    </div>

                    {/* Sentiment & Status Badges */}
                    <div className="flex items-center gap-2">
                      {comment.sentiment === 'negative' && (
                        <span className="px-2.5 py-1 rounded-xl text-[10px] font-extrabold bg-rose-100 text-rose-700 border border-rose-200 flex items-center gap-1">
                          <span>❌ سلبي / هجوم ({comment.sentiment_score}%)</span>
                        </span>
                      )}
                      {comment.sentiment === 'spam' && (
                        <span className="px-2.5 py-1 rounded-xl text-[10px] font-extrabold bg-purple-100 text-purple-700 border border-purple-200">
                          🚫 سبام / روابط مشبوهة
                        </span>
                      )}
                      {comment.sentiment === 'neutral_inquiry' && (
                        <span className="px-2.5 py-1 rounded-xl text-[10px] font-extrabold bg-blue-100 text-blue-700 border border-blue-200">
                          💬 استفسار سعر ({comment.sentiment_score}%)
                        </span>
                      )}
                      {comment.sentiment === 'positive' && (
                        <span className="px-2.5 py-1 rounded-xl text-[10px] font-extrabold bg-emerald-100 text-emerald-700 border border-emerald-200">
                          🟢 إيجابي ({comment.sentiment_score}%)
                        </span>
                      )}

                      {/* Moderation Status Pill */}
                      {comment.moderation_status === 'auto_deleted' && (
                        <span className="px-2.5 py-1 rounded-xl text-[10px] font-black bg-rose-600 text-white shadow-2xs flex items-center gap-1">
                          <Trash2 className="w-3 h-3" />
                          <span>تم الحذف بالـ AI</span>
                        </span>
                      )}
                      {comment.moderation_status === 'auto_hidden' && (
                        <span className="px-2.5 py-1 rounded-xl text-[10px] font-black bg-purple-600 text-white shadow-2xs flex items-center gap-1">
                          <EyeOff className="w-3 h-3" />
                          <span>مُخفى عن الجمهور</span>
                        </span>
                      )}
                      {comment.moderation_status === 'replied' && (
                        <span className="px-2.5 py-1 rounded-xl text-[10px] font-black bg-indigo-50 text-indigo-700 border border-indigo-200">
                          تم الرد
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Comment Body Text */}
                  <div className="py-3">
                    <p
                      className={`text-xs font-semibold leading-relaxed ${
                        isAutoDeletedOrHidden ? 'text-slate-600 italic line-through' : 'text-slate-900'
                      }`}
                    >
                      "{comment.comment_text}"
                    </p>
                  </div>

                  {/* AI Auto-Action Banner or Reply Message */}
                  {comment.ai_action_reason && (
                    <div className="mb-3 p-3 bg-slate-900 text-white rounded-2xl text-[11px] font-bold flex items-center justify-between border border-slate-800">
                      <div className="flex items-center gap-2">
                        <Bot className="w-4 h-4 text-cyan-400 shrink-0" />
                        <span className="text-slate-200">{comment.ai_action_reason}</span>
                      </div>
                      {isAutoDeletedOrHidden && (
                        <button
                          onClick={() => handleRestoreComment(comment.id)}
                          className="px-2.5 py-1 rounded-lg bg-white/10 hover:bg-white/20 text-white text-[10px] font-extrabold transition"
                        >
                          استعادة التعليق وإظهاره
                        </button>
                      )}
                    </div>
                  )}

                  {comment.auto_replied_text && (
                    <div className="mb-3 p-3 bg-[#E8F0FE] rounded-2xl border border-[#1A73E8]/20 space-y-1 text-xs text-slate-800">
                      <div className="flex items-center gap-1.5 font-bold text-[#1A73E8] text-[11px]">
                        <Zap className="w-3.5 h-3.5" />
                        <span>رد النظام المنشور تلقائياً:</span>
                      </div>
                      <p className="font-medium pr-5">{comment.auto_replied_text}</p>
                    </div>
                  )}

                  {/* Action Buttons Footer */}
                  <div className="flex items-center justify-between pt-2 border-t border-slate-100">
                    <div className="flex items-center gap-4 text-xs font-semibold text-slate-400">
                      <span className="flex items-center gap-1">
                        <ThumbsUp className="w-3.5 h-3.5" />
                        {comment.likes_count} إعجاب
                      </span>
                      {comment.is_direct_message_sent && (
                        <span className="text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-md font-bold text-[10px] flex items-center gap-1">
                          <Send className="w-3 h-3" />
                          أُرسلت رسالة بالخاص (DM)
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => {
                          setReplyModalComment(comment);
                          setReplyText(
                            settings.inquiry_reply_text.replace('أهلاً بك', `أهلاً ${comment.author_name}`)
                          );
                        }}
                        className="px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition flex items-center gap-1.5"
                      >
                        <MessageSquare className="w-3.5 h-3.5" />
                        <span>رد على التعليق</span>
                      </button>

                      <button
                        onClick={() => {
                          setReplyModalComment(comment);
                          setReplyAsDm(true);
                          setReplyText(
                            settings.inquiry_dm_text.replace('يا فندم', comment.author_name)
                          );
                        }}
                        className="px-3 py-1.5 rounded-xl bg-blue-50 hover:bg-blue-100 text-[#1A73E8] text-xs font-bold transition flex items-center gap-1.5 border border-blue-200/60"
                      >
                        <Send className="w-3.5 h-3.5" />
                        <span>رسالة خاصة (DM)</span>
                      </button>

                      <button
                        onClick={() => handleToggleHide(comment)}
                        className={`p-1.5 rounded-xl text-xs font-bold transition ${
                          comment.moderation_status === 'auto_hidden'
                            ? 'bg-purple-100 text-purple-700'
                            : 'text-slate-400 hover:text-slate-700 hover:bg-slate-100'
                        }`}
                        title={
                          comment.moderation_status === 'auto_hidden'
                            ? 'إظهار التعليق للعامة'
                            : 'إخفاء التعليق عن الجمهور'
                        }
                      >
                        {comment.moderation_status === 'auto_hidden' ? (
                          <Eye className="w-4 h-4" />
                        ) : (
                          <EyeOff className="w-4 h-4" />
                        )}
                      </button>

                      {comment.moderation_status !== 'auto_deleted' && (
                        <button
                          onClick={() => handleDeleteComment(comment.id)}
                          className="p-1.5 rounded-xl text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition text-xs"
                          title="حذف التعليق نهائياً"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* AI Moderation Settings Modal */}
      {isSettingsModalOpen && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-2xl w-full p-6 shadow-2xl border border-slate-200 space-y-5 animate-in fade-in zoom-in-95 duration-150 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <Sliders className="w-5 h-5 text-[#1A73E8]" />
                <h3 className="text-sm font-bold text-slate-900">
                  إعدادات أتمتة التعليقات وقواعد الذكاء الاصطناعي
                </h3>
              </div>
              <button
                onClick={() => setIsSettingsModalOpen(false)}
                className="p-1 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-xl"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-4">
              {/* Switches Container */}
              <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200/80 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="text-xs font-bold text-slate-900">
                      الحذف التلقائي الفوري للتعليقات المسيئة والسامة (Auto-Delete)
                    </h4>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      حذف أي تعليق يتضمن شتائم، اتهامات بالنصب، أو إساءة فور نشره
                    </p>
                  </div>
                  <button
                    onClick={() =>
                      setSettings({ ...settings, auto_delete_negative: !settings.auto_delete_negative })
                    }
                    className={`w-11 h-6 rounded-full transition-colors p-0.5 flex items-center ${
                      settings.auto_delete_negative ? 'bg-rose-600 justify-end' : 'bg-slate-300 justify-start'
                    }`}
                  >
                    <span className="w-5 h-5 rounded-full bg-white shadow-md block" />
                  </button>
                </div>

                <div className="flex items-center justify-between pt-3 border-t border-slate-200/60">
                  <div>
                    <h4 className="text-xs font-bold text-slate-900">
                      إخفاء الروابط الدعائية والسبام تلقائياً (Anti-Spam)
                    </h4>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      حظر التعليقات التي تحتوي على أرقام هواتف منافسين أو روابط خارجية
                    </p>
                  </div>
                  <button
                    onClick={() => setSettings({ ...settings, auto_hide_spam: !settings.auto_hide_spam })}
                    className={`w-11 h-6 rounded-full transition-colors p-0.5 flex items-center ${
                      settings.auto_hide_spam ? 'bg-purple-600 justify-end' : 'bg-slate-300 justify-start'
                    }`}
                  >
                    <span className="w-5 h-5 rounded-full bg-white shadow-md block" />
                  </button>
                </div>

                <div className="flex items-center justify-between pt-3 border-t border-slate-200/60">
                  <div>
                    <h4 className="text-xs font-bold text-slate-900">
                      الرد التلقائي وإرسال رسالة خاصة على استفسارات الأسعار (Auto-DM)
                    </h4>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      الرد على التعليقات التي تسأل عن السعر أو الشحن وإرسال التفاصيل في مسنجر فوراً
                    </p>
                  </div>
                  <button
                    onClick={() =>
                      setSettings({ ...settings, auto_reply_inquiries: !settings.auto_reply_inquiries })
                    }
                    className={`w-11 h-6 rounded-full transition-colors p-0.5 flex items-center ${
                      settings.auto_reply_inquiries ? 'bg-[#1A73E8] justify-end' : 'bg-slate-300 justify-start'
                    }`}
                  >
                    <span className="w-5 h-5 rounded-full bg-white shadow-md block" />
                  </button>
                </div>
              </div>

              {/* Strictness Level & Action Type */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    درجة حساسية فحص المشاعر (AI Strictness):
                  </label>
                  <select
                    value={settings.strictness_level}
                    onChange={(e) => setSettings({ ...settings, strictness_level: e.target.value as any })}
                    className="w-full bg-slate-50 text-xs font-medium text-slate-900 px-3.5 py-2.5 rounded-xl border border-slate-200 focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#1A73E8]/20"
                  >
                    <option value="strict">صارم جداً (حذف فوري لأي نبرة استياء أو إساءة)</option>
                    <option value="balanced">متوازن (حذف الشتائم والاتهامات المباشرة فقط)</option>
                    <option value="relaxed">مرن (إخفاء الشتائم البذيئة فقط)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    الإجراء التلقائي للتعليق السلبي:
                  </label>
                  <select
                    value={settings.action_for_negative}
                    onChange={(e) => setSettings({ ...settings, action_for_negative: e.target.value as any })}
                    className="w-full bg-slate-50 text-xs font-medium text-slate-900 px-3.5 py-2.5 rounded-xl border border-slate-200 focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#1A73E8]/20"
                  >
                    <option value="delete">حذف فوري نهائي من فيسبوك وإنستغرام</option>
                    <option value="hide">إخفاء عن الجمهور مع بقائه لمديري الصفحة</option>
                    <option value="delete_and_dm">حذف فوري + إرسال رسالة اعتذار وعرض بالخاص</option>
                  </select>
                </div>
              </div>

              {/* Blacklist Negative Keywords Manager */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  الكلمات المحظورة المخصصة (Blacklist Keywords):
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={newNegativeKeyword}
                    onChange={(e) => setNewNegativeKeyword(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleAddNegativeKeyword();
                      }
                    }}
                    placeholder="اكتب الكلمة المسيئة واضغط إضافة (مثل: مقلب، نصابين)..."
                    className="flex-1 bg-slate-50 text-xs font-medium text-slate-900 px-3.5 py-2.5 rounded-xl border border-slate-200 focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#1A73E8]/20"
                  />
                  <button
                    type="button"
                    onClick={handleAddNegativeKeyword}
                    className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold text-xs rounded-xl transition"
                  >
                    إضافة
                  </button>
                </div>

                <div className="flex flex-wrap gap-1.5 mt-2.5">
                  {settings.negative_keywords.map((kw, i) => (
                    <span
                      key={i}
                      className="px-2.5 py-1 bg-rose-50 text-rose-800 text-xs font-bold rounded-lg border border-rose-200 flex items-center gap-1.5"
                    >
                      <span>{kw}</span>
                      <button
                        type="button"
                        onClick={() => handleRemoveNegativeKeyword(kw)}
                        className="text-rose-500 hover:text-rose-800 text-xs font-bold"
                      >
                        ✕
                      </button>
                    </span>
                  ))}
                </div>
              </div>

              {/* Auto Reply Template Textarea */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  نص الرد العام على استفسارات الأسعار:
                </label>
                <input
                  type="text"
                  value={settings.inquiry_reply_text}
                  onChange={(e) => setSettings({ ...settings, inquiry_reply_text: e.target.value })}
                  className="w-full bg-slate-50 text-xs font-medium text-slate-900 px-3.5 py-2.5 rounded-xl border border-slate-200 focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#1A73E8]/20"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  نص الرسالة الخاصة التلقائية عبر المسنجر / الدايركت (Auto-DM):
                </label>
                <textarea
                  rows={2}
                  value={settings.inquiry_dm_text}
                  onChange={(e) => setSettings({ ...settings, inquiry_dm_text: e.target.value })}
                  className="w-full bg-slate-50 text-xs font-medium text-slate-900 p-3 rounded-xl border border-slate-200 focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#1A73E8]/20"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  نص رسالة الاعتذار بالخاص عند رصد تعليق سلبي:
                </label>
                <textarea
                  rows={2}
                  value={settings.negative_dm_apology_text}
                  onChange={(e) => setSettings({ ...settings, negative_dm_apology_text: e.target.value })}
                  className="w-full bg-slate-50 text-xs font-medium text-slate-900 p-3 rounded-xl border border-slate-200 focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#1A73E8]/20"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setIsSettingsModalOpen(false)}
                className="px-4 py-2.5 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-100"
              >
                إلغاء
              </button>
              <button
                type="button"
                disabled={isSavingSettings}
                onClick={handleSaveSettings}
                className="px-5 py-2.5 rounded-xl bg-[#1A73E8] hover:bg-[#1557B0] text-white text-xs font-bold transition shadow-xs disabled:opacity-50 flex items-center gap-1.5"
              >
                {isSavingSettings ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>جاري الحفظ...</span>
                  </>
                ) : (
                  <span>حفظ الإعدادات والتطبيق على السيرفر</span>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* AI Sandbox Simulator Modal */}
      {isSimulatorModalOpen && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-indigo-100 text-indigo-700 flex items-center justify-center font-bold">
                  <Sparkles className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900">محاكي فحص الذكاء الاصطناعي الحي</h3>
                  <p className="text-[11px] text-slate-500">اختبر كيف يتعامل محرك AI مع أي تعليق قبل نشره</p>
                </div>
              </div>
              <button
                onClick={() => setIsSimulatorModalOpen(false)}
                className="p-1 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-xl"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  اكتب نص التعليق التجريبي:
                </label>
                <textarea
                  rows={3}
                  value={simulatorInput}
                  onChange={(e) => setSimulatorInput(e.target.value)}
                  placeholder="مثال: المنتج خاماته سيئة جداً ومحدش يشتري منهم..."
                  className="w-full bg-slate-50 text-xs font-medium text-slate-900 p-3 rounded-xl border border-slate-200 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                />
              </div>

              <div className="flex items-center justify-between">
                <span className="text-[11px] text-slate-400 font-semibold">
                  يتم الفحص وفقاً للقواعد وقائمة الكلمات المحظورة
                </span>
                <button
                  type="button"
                  disabled={isSimulating || !simulatorInput.trim()}
                  onClick={handleRunSimulation}
                  className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold transition flex items-center gap-1.5 disabled:opacity-50"
                >
                  {isSimulating ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>جاري الفحص بالـ AI...</span>
                    </>
                  ) : (
                    <>
                      <Play className="w-3.5 h-3.5 fill-current" />
                      <span>بدء الفحص</span>
                    </>
                  )}
                </button>
              </div>

              {/* Simulation Result */}
              {simulatorResult && (
                <div
                  className={`p-4 rounded-2xl border space-y-2 animate-in fade-in duration-150 ${
                    simulatorResult.sentiment === 'negative' || simulatorResult.sentiment === 'spam'
                      ? 'bg-rose-50 border-rose-200 text-rose-900'
                      : simulatorResult.sentiment === 'neutral_inquiry'
                      ? 'bg-blue-50 border-blue-200 text-blue-900'
                      : 'bg-emerald-50 border-emerald-200 text-emerald-900'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-black">
                      نتيجة التحليل: {simulatorResult.sentiment.toUpperCase()}
                    </span>
                    <span className="text-[10px] font-bold bg-white px-2 py-0.5 rounded-md border">
                      نسبة الثقة: {simulatorResult.confidence}%
                    </span>
                  </div>
                  <p className="text-xs font-bold leading-relaxed">{simulatorResult.decision}</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Public Reply & DM Modal */}
      {replyModalComment && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-blue-100 text-[#1A73E8] flex items-center justify-center font-bold">
                  <Send className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900">
                    الرد على تعليق ({replyModalComment.author_name})
                  </h3>
                  <p className="text-[11px] text-slate-500">
                    عبر {replyModalComment.platform === 'facebook' ? 'صفحة الفيسبوك' : 'إنستغرام'}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setReplyModalComment(null)}
                className="p-1 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-xl"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-3 bg-slate-50 rounded-xl border border-slate-100 text-xs text-slate-700">
              <span className="text-[10px] font-bold text-slate-400 block mb-1">التعليق الأصلي:</span>
              "{replyModalComment.comment_text}"
            </div>

            <form onSubmit={handleSendReply} className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">نص الرد:</label>
                <textarea
                  rows={3}
                  required
                  value={replyText}
                  onChange={(e) => setReplyText(e.target.value)}
                  placeholder="اكتب ردك هنا..."
                  className="w-full bg-slate-50 text-xs font-medium text-slate-900 p-3 rounded-xl border border-slate-200 focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#1A73E8]/20 focus:border-[#1A73E8]"
                />
              </div>

              <label className="flex items-center gap-2 text-xs font-bold text-slate-700 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={replyAsDm}
                  onChange={(e) => setReplyAsDm(e.target.checked)}
                  className="rounded text-[#1A73E8] focus:ring-[#1A73E8]"
                />
                <span>إرسال نفس الرسالة في محادثة خاصة (Messenger / Direct) أيضاً</span>
              </label>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setReplyModalComment(null)}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-100"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingReply || !replyText.trim()}
                  className="px-5 py-2 rounded-xl bg-[#1A73E8] hover:bg-[#1557B0] text-white text-xs font-bold transition flex items-center gap-1.5 disabled:opacity-50"
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>{isSubmittingReply ? 'جاري الإرسال...' : 'إرسال الرد'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* AI Activity Audit Logs Modal */}
      {isLogsModalOpen && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-2xl w-full p-6 shadow-2xl border border-slate-200 space-y-4 animate-in fade-in zoom-in-95 duration-150 max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 shrink-0">
              <div className="flex items-center gap-2">
                <Activity className="w-5 h-5 text-indigo-600" />
                <h3 className="text-sm font-bold text-slate-900">سجل إجراءات الذكاء الاصطناعي على التعليقات (Audit Logs)</h3>
              </div>
              <button
                onClick={() => setIsLogsModalOpen(false)}
                className="p-1 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-xl"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto space-y-2.5 pr-1 text-xs">
              {logs.length === 0 ? (
                <div className="p-8 text-center text-slate-400">
                  <Activity className="w-8 h-8 mx-auto mb-2 opacity-40" />
                  <p>لا توجد سجلات عمليات مسجلة بعد</p>
                </div>
              ) : (
                logs.map((log) => (
                  <div
                    key={log.id}
                    className="p-3.5 bg-slate-50 rounded-xl border border-slate-200/80 space-y-1.5"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-slate-900">
                        {log.comment_author || 'عميل'} — {log.performed_by}
                      </span>
                      <span className="text-[10px] text-slate-500 font-semibold bg-white px-2 py-0.5 rounded-md border">
                        {formatRelativeTime(log.created_at)}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="px-2 py-0.5 rounded-md bg-indigo-100 text-indigo-700 font-bold text-[10px]">
                        {log.action_type}
                      </span>
                      {log.details?.reason && (
                        <span className="text-slate-600 font-medium">السبب: {log.details.reason}</span>
                      )}
                      {log.details?.reply_text && (
                        <span className="text-slate-600 font-medium">نص الرد: "{log.details.reply_text}"</span>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
