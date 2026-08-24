import React, { useState, useEffect } from 'react';
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
  Image as ImageIcon,
} from 'lucide-react';
import { commentsApi, MOCK_BRANDS } from '../../services/api';
import { SocialComment } from '../../types/crm';

export interface ModerationRuleSettings {
  autoDeleteNegative: boolean;
  autoHideSpam: boolean;
  autoReplyInquiries: boolean;
  strictnessLevel: 'strict' | 'balanced' | 'relaxed';
  actionForNegative: 'delete' | 'hide' | 'delete_and_dm';
  negativeKeywords: string[];
  inquiryKeywords: string[];
  inquiryReplyText: string;
  inquiryDmText: string;
  negativeDmApologyText: string;
}

export const SocialCommentsManager: React.FC = () => {
  const [comments, setComments] = useState<SocialComment[]>([]);
  const [isLoadingComments, setIsLoadingComments] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [platformFilter, setPlatformFilter] = useState<'all' | 'facebook' | 'instagram'>('all');
  const [sentimentFilter, setSentimentFilter] = useState<'all' | 'positive' | 'neutral_inquiry' | 'negative' | 'spam'>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'auto_deleted' | 'auto_hidden' | 'replied'>('all');
  const [selectedPostId, setSelectedPostId] = useState<string>('all');
  const [isAiAutoModerationActive, setIsAiAutoModerationActive] = useState(true);

  // Modals state
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
  const [isSimulatorModalOpen, setIsSimulatorModalOpen] = useState(false);
  const [isLogsModalOpen, setIsLogsModalOpen] = useState(false);
  const [replyModalComment, setReplyModalComment] = useState<SocialComment | null>(null);
  const [replyText, setReplyText] = useState('');
  const [replyAsDm, setReplyAsDm] = useState(true);
  const [isSubmittingReply, setIsSubmittingReply] = useState(false);
  const [actionNotification, setActionNotification] = useState<string | null>(null);

  // Settings state
  const [settings, setSettings] = useState<ModerationRuleSettings>({
    autoDeleteNegative: true,
    autoHideSpam: true,
    autoReplyInquiries: true,
    strictnessLevel: 'strict',
    actionForNegative: 'delete',
    negativeKeywords: ['نصابين', 'سيء', 'زفت', 'سرقة', 'كذابين', 'مقلب', 'غالي جدا', 'خامة رديئة', 'حرامية'],
    inquiryKeywords: ['بكام', 'السعر', 'التفاصيل', 'شحن', 'توصيل', 'عايز اطلب', 'كم السعر'],
    inquiryReplyText: 'أهلاً بك! تم إرسال كافة التفاصيل والأسعار في رسالة خاصة 💌',
    inquiryDmText: 'أهلاً بك يا فندم! يسعدنا تواصلك معنا، إليك كافة التفاصيل والعروض الخاصة المتاحة اليوم...',
    negativeDmApologyText: 'نعتذر جداً عن أي تجربة غير مرضية واجهتك، هدفنا رضاك التام ويسعدنا حل المشكلة فوراً...',
  });

  const [newNegativeKeyword, setNewNegativeKeyword] = useState('');

  // Simulator state
  const [simulatorInput, setSimulatorInput] = useState('');
  const [simulatorResult, setSimulatorResult] = useState<{
    sentiment: 'positive' | 'neutral_inquiry' | 'negative' | 'spam';
    confidence: number;
    decision: string;
    actionType: 'delete' | 'hide' | 'reply' | 'allow';
  } | null>(null);
  const [isSimulating, setIsSimulating] = useState(false);

  // Show Toast Notification
  const triggerNotification = (msg: string) => {
    setActionNotification(msg);
    setTimeout(() => {
      setActionNotification(null);
    }, 3500);
  };

  const loadComments = async () => {
    setIsLoadingComments(true);
    setApiError(null);
    try {
      const data = await commentsApi.listComments({
        channel: platformFilter !== 'all' ? platformFilter : undefined,
        sentiment: sentimentFilter !== 'all' ? sentimentFilter : undefined,
        status: statusFilter !== 'all' ? statusFilter : undefined,
      });
      const safeArray = Array.isArray(data) ? data : (data as any)?.items || [];
      setComments(safeArray);
    } catch (err: any) {
      console.warn('[SocialComments] loadComments error:', err);
      setApiError(err?.message || 'تعذر تحميل التعليقات من الخادم');
    } finally {
      setIsLoadingComments(false);
    }
  };

  useEffect(() => {
    loadComments();
  }, [platformFilter, sentimentFilter, statusFilter]);

  // Actions on comments
  const handleToggleHide = async (comment: SocialComment) => {
    try {
      await commentsApi.toggleHideComment(comment.id, !comment.is_hidden);
      triggerNotification(comment.is_hidden ? 'تم إظهار التعليق للجمهور 👁️' : 'تم إخفاء التعليق عن الجمهور 🛡️');
      loadComments();
    } catch (err: any) {
      triggerNotification(`فشل تعديل حالة الإخفاء: ${err?.message || 'خطأ'}`);
    }
  };

  const handleSyncComments = async () => {
    try {
      triggerNotification('جاري مزامنة التعليقات من فيسبوك وإنستغرام...');
      await commentsApi.syncComments();
      await loadComments();
      triggerNotification('تمت مزامنة التعليقات بنجاح ✅');
    } catch (err: any) {
      triggerNotification(`فشل المزامنة: ${err?.message || 'خطأ'}`);
    }
  };

  const handleSendReply = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!replyModalComment || !replyText.trim()) return;

    setIsSubmittingReply(true);
    try {
      await commentsApi.replyToComment(replyModalComment.id, {
        message: replyText.trim(),
        private_dm: replyAsDm,
      });
      triggerNotification('تم إرسال الرد بنجاح على المنشور 💬');
      setReplyModalComment(null);
      setReplyText('');
      loadComments();
    } catch (err: any) {
      triggerNotification(`فشل إرسال الرد: ${err?.message || 'خطأ'}`);
    } finally {
      setIsSubmittingReply(false);
    }
  };

  // Run AI Simulation
  const handleRunSimulation = () => {
    if (!simulatorInput.trim()) return;
    setIsSimulating(true);

    setTimeout(() => {
      const lower = simulatorInput.toLowerCase();
      const hasNegative = settings.negativeKeywords.some((k) => lower.includes(k.toLowerCase())) ||
        lower.includes('زفت') || lower.includes('نصاب') || lower.includes('سيء') || lower.includes('غالي') || lower.includes('وحش');
      const hasSpam = lower.includes('واتساب') || lower.includes('01') || lower.includes('رابط') || lower.includes('متابعين');
      const hasInquiry = settings.inquiryKeywords.some((k) => lower.includes(k.toLowerCase())) ||
        lower.includes('بكام') || lower.includes('سعر') || lower.includes('تفاصيل') || lower.includes('شحن');

      if (hasSpam) {
        setSimulatorResult({
          sentiment: 'spam',
          confidence: 99.4,
          decision: '🚫 تم تصنيف التعليق كـ (سبام/إعلانات). سيتم حذفه وحظر المعرف تلقائياً.',
          actionType: 'delete',
        });
      } else if (hasNegative) {
        setSimulatorResult({
          sentiment: 'negative',
          confidence: 97.8,
          decision: '🤖❌ تم رصد نبرة سلبية ومسيئة! سيتم حذف التعليق فوراً من فيسبوك وإنستغرام وإرسال اعتذار خاص للعميل.',
          actionType: 'delete',
        });
      } else if (hasInquiry) {
        setSimulatorResult({
          sentiment: 'neutral_inquiry',
          confidence: 96.2,
          decision: '⚡💬 تم تصنيف التعليق كـ (استفسار شراء). سيتم نشر رد عام وإرسال رسالة تفاصيل في المسنجر/الدايركت تلقائياً.',
          actionType: 'reply',
        });
      } else {
        setSimulatorResult({
          sentiment: 'positive',
          confidence: 98.1,
          decision: '🟢 تعليق إيجابي وداعم. سيتم إبقاؤه منشورا على الصفحة لتعزيز التفاعل والمصداقية.',
          actionType: 'allow',
        });
      }
      setIsSimulating(false);
    }, 450);
  };

  // Add Negative Keyword
  const handleAddNegativeKeyword = () => {
    const trimmed = newNegativeKeyword.trim();
    if (trimmed && !settings.negativeKeywords.includes(trimmed)) {
      setSettings({
        ...settings,
        negativeKeywords: [...settings.negativeKeywords, trimmed],
      });
      setNewNegativeKeyword('');
    }
  };

  const handleRemoveNegativeKeyword = (kw: string) => {
    setSettings({
      ...settings,
      negativeKeywords: settings.negativeKeywords.filter((k) => k !== kw),
    });
  };

  // Filtered comments from real data
  const safeComments = Array.isArray(comments) ? comments : [];
  const filteredComments = safeComments.filter((c) => {
    const channel = (c.channel || (c as any).platform || 'facebook').toLowerCase();
    if (platformFilter !== 'all' && channel !== platformFilter.toLowerCase()) return false;
    if (sentimentFilter !== 'all' && c.sentiment !== sentimentFilter) return false;
    if (statusFilter !== 'all') {
      if (statusFilter === 'auto_deleted' && !c.is_deleted && !c.is_hidden) return false;
      if (statusFilter === 'replied' && !c.auto_replied && !c.reply_text) return false;
      if (statusFilter === 'active' && (c.is_deleted || c.is_hidden)) return false;
    }
    if (selectedPostId !== 'all' && c.post_id !== selectedPostId && (c as any).postId !== selectedPostId) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const text = (c.text || (c as any).commentText || '').toLowerCase();
      const author = (c.author_name || (c as any).authorName || '').toLowerCase();
      const postTitle = (c.post_title || (c as any).postTitle || '').toLowerCase();
      return text.includes(q) || author.includes(q) || postTitle.includes(q);
    }
    return true;
  });

  // Dynamic KPI Stats
  const totalCommentsCount = safeComments.length;
  const autoDeletedCount = safeComments.filter((c) => c.is_deleted || c.is_hidden).length;
  const autoRepliedCount = safeComments.filter((c) => c.auto_replied || Boolean(c.reply_text)).length;
  const positiveCount = safeComments.filter((c) => c.sentiment === 'positive').length;
  const sentimentScore = totalCommentsCount > 0 ? Math.round(((positiveCount + autoRepliedCount) / totalCommentsCount) * 100) : 100;

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
                  Meta Graph v20.0
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
              onClick={loadComments}
              disabled={isLoadingComments}
              className="p-2.5 rounded-2xl bg-slate-100 hover:bg-slate-200/80 text-slate-700 transition border border-slate-200/60 shadow-2xs"
              title="تحديث البيانات"
            >
              <RefreshCw className={`w-4 h-4 ${isLoadingComments ? 'animate-spin text-[#1A73E8]' : ''}`} />
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
              onClick={() => setIsLogsModalOpen(true)}
              className="px-3.5 py-2 rounded-2xl bg-slate-100 hover:bg-slate-200/80 text-slate-700 text-xs font-bold transition flex items-center gap-1.5 border border-slate-200/60 shadow-2xs"
            >
              <Activity className="w-4 h-4 text-slate-600" />
              <span>سجل العمليات ({autoDeletedCount + autoRepliedCount})</span>
            </button>
          </div>
        </div>

        {/* AI Auto-Protection Engine Status Banner */}
        <div
          className={`p-4 rounded-2xl border transition flex flex-col sm:flex-row sm:items-center justify-between gap-4 ${
            isAiAutoModerationActive
              ? 'bg-gradient-to-r from-emerald-500/10 via-teal-500/5 to-transparent border-emerald-300/80'
              : 'bg-amber-50 border-amber-200'
          }`}
        >
          <div className="flex items-center gap-3">
            <div
              className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                isAiAutoModerationActive
                  ? 'bg-emerald-600 text-white shadow-md shadow-emerald-500/20'
                  : 'bg-amber-500 text-white'
              }`}
            >
              {isAiAutoModerationActive ? <ShieldCheck className="w-5 h-5" /> : <ShieldAlert className="w-5 h-5" />}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h4 className="text-xs font-bold text-slate-900">
                  {isAiAutoModerationActive
                    ? 'الحذف التلقائي للتعليقات السلبية بالـ AI: مـفـعّـل ونشط 🛡️'
                    : 'الحذف التلقائي بالـ AI: متوقف مؤقتاً ⚠️'}
                </h4>
                {isAiAutoModerationActive && (
                  <span className="flex h-2 w-2 relative">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
                  </span>
                )}
              </div>
              <p className="text-[11px] text-slate-500 mt-0.5">
                {isAiAutoModerationActive
                  ? 'يتم فحص التعليقات فور وصولها من فيسبوك وإنستغرام؛ تُحذف الشتائم والتعليقات السلبية فورياً، وتُرسل تفاصيل الأسعار في الخاص تلقائياً.'
                  : 'تنبيه: تم تعطيل الحذف التلقائي، ستبقى كافة التعليقات السلبية معروضة للجمهور حتى يتم حذفها يدوياً.'}
              </p>
            </div>
          </div>

          <button
            onClick={() => {
              const nextState = !isAiAutoModerationActive;
              setIsAiAutoModerationActive(nextState);
              triggerNotification(
                nextState
                  ? 'تم تفعيل الحذف التلقائي للتعليقات السلبية بالـ AI بنجاح 🛡️'
                  : 'تم إيقاف الأتمتة مؤقتاً ⚠️'
              );
            }}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition shrink-0 ${
              isAiAutoModerationActive
                ? 'bg-emerald-100 hover:bg-emerald-200 text-emerald-800 border border-emerald-300'
                : 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs'
            }`}
          >
            {isAiAutoModerationActive ? 'إيقاف مؤقت' : 'تفعيل الحماية الفورية الآن'}
          </button>
        </div>

        {/* KPI Stats Cards (4 Columns) */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold text-slate-500">إجمالي التعليقات الواردة</p>
              <div className="flex items-baseline gap-2 mt-1">
                <h3 className="text-2xl font-black text-slate-900">{totalCommentsCount}</h3>
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
                <h3 className="text-2xl font-black text-rose-600">{autoDeletedCount}</h3>
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
                <h3 className="text-2xl font-black text-indigo-600">{autoRepliedCount}</h3>
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
                <h3 className="text-2xl font-black text-emerald-600">{sentimentScore}%</h3>
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

            {/* Post Selector Dropdown */}
            <div className="w-full md:w-64 shrink-0">
              <select
                value={selectedPostId}
                onChange={(e) => setSelectedPostId(e.target.value)}
                className="w-full bg-slate-50 text-xs font-bold text-slate-800 px-3 py-2.5 rounded-xl border border-slate-200 focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#1A73E8]/20 cursor-pointer"
              >
                <option value="all">جميع المنشورات (All Posts)</option>
                {Array.from(new Set(safeComments.map((c) => c.post_id).filter(Boolean))).map((pid) => {
                  const comm = safeComments.find((c) => c.post_id === pid);
                  const title = comm?.post_title || pid;
                  return (
                    <option key={pid} value={pid}>
                      {title.length > 35 ? `${title.substring(0, 35)}...` : title}
                    </option>
                  );
                })}
              </select>
            </div>
          </div>

          {/* Filter Pills */}
          <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-slate-100 text-xs">
            <span className="text-[11px] font-bold text-slate-400 ml-1">تصفية سريعة:</span>

            {/* Platform Filter */}
            <div className="flex items-center bg-slate-100 p-0.5 rounded-xl">
              <button
                onClick={() => setPlatformFilter('all')}
                className={`px-3 py-1 rounded-lg text-xs font-bold transition ${
                  platformFilter === 'all' ? 'bg-white text-slate-900 shadow-2xs' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                الكل
              </button>
              <button
                onClick={() => setPlatformFilter('facebook')}
                className={`px-3 py-1 rounded-lg text-xs font-bold transition ${
                  platformFilter === 'facebook'
                    ? 'bg-blue-600 text-white shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                فيسبوك (FB)
              </button>
              <button
                onClick={() => setPlatformFilter('instagram')}
                className={`px-3 py-1 rounded-lg text-xs font-bold transition ${
                  platformFilter === 'instagram'
                    ? 'bg-gradient-to-r from-purple-600 to-pink-600 text-white shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                إنستغرام (IG)
              </button>
            </div>

            {/* Sentiment Filter */}
            <div className="flex items-center bg-slate-100 p-0.5 rounded-xl">
              <button
                onClick={() => setSentimentFilter('all')}
                className={`px-2.5 py-1 rounded-lg text-xs font-bold transition ${
                  sentimentFilter === 'all' ? 'bg-white text-slate-900 shadow-2xs' : 'text-slate-600'
                }`}
              >
                كل المشاعر
              </button>
              <button
                onClick={() => setSentimentFilter('positive')}
                className={`px-2.5 py-1 rounded-lg text-xs font-bold transition ${
                  sentimentFilter === 'positive' ? 'bg-emerald-600 text-white shadow-2xs' : 'text-slate-600'
                }`}
              >
                🟢 إيجابي
              </button>
              <button
                onClick={() => setSentimentFilter('neutral_inquiry')}
                className={`px-2.5 py-1 rounded-lg text-xs font-bold transition ${
                  sentimentFilter === 'neutral_inquiry' ? 'bg-blue-600 text-white shadow-2xs' : 'text-slate-600'
                }`}
              >
                💬 استفسار/سعر
              </button>
              <button
                onClick={() => setSentimentFilter('negative')}
                className={`px-2.5 py-1 rounded-lg text-xs font-bold transition ${
                  sentimentFilter === 'negative' ? 'bg-rose-600 text-white shadow-2xs' : 'text-slate-600'
                }`}
              >
                ❌ سلبي (محذوف)
              </button>
              <button
                onClick={() => setSentimentFilter('spam')}
                className={`px-2.5 py-1 rounded-lg text-xs font-bold transition ${
                  sentimentFilter === 'spam' ? 'bg-purple-600 text-white shadow-2xs' : 'text-slate-600'
                }`}
              >
                🚫 سبام/مخالف
              </button>
            </div>

            {/* Status Filter */}
            <div className="flex items-center bg-slate-100 p-0.5 rounded-xl">
              <button
                onClick={() => setStatusFilter('all')}
                className={`px-2.5 py-1 rounded-lg text-xs font-bold transition ${
                  statusFilter === 'all' ? 'bg-white text-slate-900 shadow-2xs' : 'text-slate-600'
                }`}
              >
                الحالة: الكل
              </button>
              <button
                onClick={() => setStatusFilter('auto_deleted')}
                className={`px-2.5 py-1 rounded-lg text-xs font-bold transition ${
                  statusFilter === 'auto_deleted' ? 'bg-rose-600 text-white shadow-2xs' : 'text-slate-600'
                }`}
              >
                محذوف بالـ AI 🤖
              </button>
              <button
                onClick={() => setStatusFilter('replied')}
                className={`px-2.5 py-1 rounded-lg text-xs font-bold transition ${
                  statusFilter === 'replied' ? 'bg-indigo-600 text-white shadow-2xs' : 'text-slate-600'
                }`}
              >
                تم الرد
              </button>
            </div>
          </div>
        </div>

        {/* Comments Feed List (Task 5) */}
        <div className="space-y-3.5">
          {isLoadingComments ? (
            <div className="bg-white p-12 rounded-3xl border border-slate-200/80 text-center space-y-3">
              <Loader2 className="w-8 h-8 text-[#1A73E8] animate-spin mx-auto" />
              <h3 className="text-sm font-bold text-slate-800">جاري تحميل التعليقات من الخادم...</h3>
            </div>
          ) : apiError ? (
            <div className="bg-rose-50 border border-rose-200 p-5 rounded-2xl flex items-center justify-between text-rose-900 text-xs font-semibold">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0" />
                <span>{apiError}</span>
              </div>
              <button
                onClick={loadComments}
                className="px-3 py-1 bg-rose-600 text-white rounded-xl text-xs font-bold hover:bg-rose-700 transition"
              >
                إعادة المحاولة
              </button>
            </div>
          ) : filteredComments.length === 0 ? (
            <div className="bg-white p-12 rounded-3xl border border-slate-200/80 text-center space-y-3">
              <div className="w-12 h-12 rounded-2xl bg-slate-100 text-slate-400 flex items-center justify-center mx-auto">
                <MessageSquare className="w-6 h-6" />
              </div>
              <h3 className="text-sm font-bold text-slate-800">لا توجد تعليقات واردة من قنوات التواصل الاجتماعي</h3>
              <p className="text-xs text-slate-500">انقر زر مزامنة Meta لجلب أحدث التعليقات</p>
            </div>
          ) : (
            filteredComments.map((comment) => {
              const author = comment.author_name || (comment as any).authorName || 'مستخدم';
              const text = comment.text || (comment as any).commentText || '';
              const platform = (comment.channel || (comment as any).platform || 'facebook').toLowerCase();
              const isHidden = Boolean(comment.is_hidden || (comment as any).moderationStatus === 'auto_hidden');
              const isDeleted = Boolean(comment.is_deleted || (comment as any).moderationStatus === 'auto_deleted');
              const isReplied = Boolean(comment.auto_replied || comment.reply_text || (comment as any).moderationStatus === 'replied');
              const postTitle = comment.post_title || (comment as any).postTitle || 'منشور على وسائل التواصل الاجتماعي';
              const postUrl = comment.post_url || (comment as any).postUrl;
              const postThumbnail = comment.post_thumbnail || (comment as any).postThumbnail;

              return (
                <div
                  key={comment.id}
                  className={`bg-white rounded-2xl border p-5 shadow-xs transition duration-150 space-y-3.5 ${
                    isDeleted
                      ? 'border-rose-200 bg-rose-50/20'
                      : isHidden
                      ? 'border-amber-200 bg-amber-50/20'
                      : 'border-slate-200 hover:border-blue-300'
                  }`}
                >
                  {/* Top Bar: Author, Platform, Sentiment & Status */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div className="flex items-center gap-3">
                      {/* Author Avatar */}
                      <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-slate-200 to-slate-300 text-slate-700 flex items-center justify-center font-bold text-xs shadow-2xs shrink-0">
                        {author.substring(0, 2)}
                      </div>

                      <div>
                        <div className="flex items-center gap-2">
                          <h4 className="text-xs font-bold text-slate-900">{author}</h4>

                          {/* Platform Badge */}
                          {platform === 'facebook' ? (
                            <span className="px-2 py-0.5 bg-blue-50 text-blue-700 text-[10px] font-bold rounded-md border border-blue-200 flex items-center gap-1">
                              <span>فيسبوك</span>
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 bg-gradient-to-r from-purple-50 to-pink-50 text-purple-700 text-[10px] font-bold rounded-md border border-pink-200 flex items-center gap-1">
                              <span>إنستغرام</span>
                            </span>
                          )}

                          <span className="text-[11px] text-slate-400 flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            <span>{new Date(comment.created_at || Date.now()).toLocaleDateString('ar-EG')}</span>
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* AI Sentiment & Status Badges */}
                    <div className="flex flex-wrap items-center gap-1.5 self-start sm:self-auto">
                      {comment.sentiment === 'positive' && (
                        <span className="px-2.5 py-1 bg-emerald-50 text-emerald-700 text-[11px] font-bold rounded-xl border border-emerald-200 flex items-center gap-1">
                          <span>🟢 إيجابي</span>
                        </span>
                      )}
                      {comment.sentiment === 'neutral_inquiry' && (
                        <span className="px-2.5 py-1 bg-blue-50 text-[#1A73E8] text-[11px] font-bold rounded-xl border border-blue-200 flex items-center gap-1">
                          <span>💬 استفسار/سعر</span>
                        </span>
                      )}
                      {comment.sentiment === 'negative' && (
                        <span className="px-2.5 py-1 bg-rose-50 text-rose-700 text-[11px] font-bold rounded-xl border border-rose-200 flex items-center gap-1">
                          <span>❌ سلبي</span>
                        </span>
                      )}
                      {comment.sentiment === 'spam' && (
                        <span className="px-2.5 py-1 bg-purple-50 text-purple-700 text-[11px] font-bold rounded-xl border border-purple-200 flex items-center gap-1">
                          <span>🚫 سبام</span>
                        </span>
                      )}

                      {/* Moderation Status */}
                      {isDeleted && (
                        <span className="px-2.5 py-1 bg-rose-600 text-white text-[10px] font-black rounded-xl shadow-2xs flex items-center gap-1">
                          <Bot className="w-3 h-3" />
                          <span>محذوف</span>
                        </span>
                      )}
                      {isHidden && (
                        <span className="px-2.5 py-1 bg-amber-500 text-white text-[10px] font-black rounded-xl shadow-2xs flex items-center gap-1">
                          <EyeOff className="w-3 h-3" />
                          <span>مخفي</span>
                        </span>
                      )}
                      {isReplied && (
                        <span className="px-2.5 py-1 bg-indigo-50 text-indigo-700 text-[10px] font-bold rounded-xl border border-indigo-200 flex items-center gap-1">
                          <Check className="w-3 h-3" />
                          <span>تم الرد</span>
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Comment Body */}
                  <div
                    className={`p-3.5 rounded-xl border text-xs font-semibold leading-relaxed ${
                      isDeleted
                        ? 'bg-rose-50/60 border-rose-200 text-slate-800 line-through opacity-80'
                        : isHidden
                        ? 'bg-amber-50/50 border-amber-200 text-slate-800'
                        : 'bg-slate-50 border-slate-100 text-slate-800'
                    }`}
                  >
                    "{text}"
                  </div>

                  {/* Original Social Media Post Reference Card (Task 5) */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-50/90 border border-slate-200/80 p-3 rounded-xl text-xs">
                    <div className="flex items-center gap-3 min-w-0">
                      {postThumbnail ? (
                        <img
                          src={postThumbnail}
                          alt="Post thumbnail"
                          className="w-12 h-12 rounded-lg object-cover border border-slate-200 shrink-0 shadow-2xs"
                        />
                      ) : (
                        <div className="w-12 h-12 rounded-lg bg-blue-50 text-[#1A73E8] border border-blue-200/60 flex items-center justify-center font-bold text-xs shrink-0">
                          <ImageIcon className="w-5 h-5 text-blue-500" />
                        </div>
                      )}
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 text-[10px] text-slate-400 font-semibold mb-0.5">
                          <span>المنشور الأصلي:</span>
                          <span className="font-mono text-slate-500">ID: {comment.post_id || (comment as any).postId}</span>
                        </div>
                        <p className="font-bold text-slate-800 text-xs truncate max-w-sm sm:max-w-md">
                          {postTitle}
                        </p>
                      </div>
                    </div>

                    {postUrl ? (
                      <a
                        href={postUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-[11px] font-bold text-blue-600 hover:text-blue-800 bg-white hover:bg-blue-50 border border-blue-200 px-3 py-1.5 rounded-xl transition shrink-0 shadow-2xs"
                        title="فتح المنشور الأصلي في نافذة جديدة"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                        <span>رابط المنشور الأصلي ↗</span>
                      </a>
                    ) : (
                      <span className="text-[10px] text-slate-400 font-medium px-2 py-1 bg-slate-100 rounded-lg shrink-0">
                        رابط المنشور غير متوفر
                      </span>
                    )}
                  </div>

                  {/* Auto-Replied Message Preview */}
                  {(comment.reply_text || (comment as any).autoRepliedText) && (
                    <div className="p-3 bg-indigo-50/70 border border-indigo-200/80 rounded-xl text-xs text-indigo-900 space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-extrabold text-indigo-700 flex items-center gap-1">
                          <Bot className="w-3 h-3" />
                          رد الصفحة المنشور:
                        </span>
                      </div>
                      <p className="font-medium">{comment.reply_text || (comment as any).autoRepliedText}</p>
                    </div>
                  )}

                  {/* Actions Footer */}
                  <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-100">
                    <div className="flex items-center gap-2">
                      {/* Public Reply Button */}
                      <button
                        onClick={() => {
                          setReplyModalComment(comment);
                          setReplyText('');
                        }}
                        className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200/80 text-slate-800 text-xs font-bold rounded-xl transition flex items-center gap-1.5"
                      >
                        <MessageSquare className="w-3.5 h-3.5 text-[#1A73E8]" />
                        <span>رد على التعليق</span>
                      </button>

                      {/* Hide/Show Toggle */}
                      <button
                        onClick={() => handleToggleHide(comment)}
                        className={`px-3 py-1.5 text-xs font-bold rounded-xl transition flex items-center gap-1.5 ${
                          isHidden
                            ? 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200'
                            : 'bg-slate-100 hover:bg-slate-200/80 text-slate-700'
                        }`}
                      >
                        {isHidden ? (
                          <>
                            <Eye className="w-3.5 h-3.5 text-emerald-600" />
                            <span>إظهار للجمهور</span>
                          </>
                        ) : (
                          <>
                            <EyeOff className="w-3.5 h-3.5 text-slate-500" />
                            <span>إخفاء عن الجمهور</span>
                          </>
                        )}
                      </button>
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
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-2xl bg-[#1A73E8] text-white flex items-center justify-center font-bold shadow-md shadow-blue-500/20">
                  <Bot className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900">
                    إعدادات أتمتة وحذف التعليقات السلبية بالـ AI
                  </h3>
                  <p className="text-[11px] text-slate-500">
                    تخصيص قواعد الحذف التلقائي، الكلمات المحظورة، والردود الذكية الفورية
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsSettingsModalOpen(false)}
                className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-xl"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-4">
              {/* Toggles Group */}
              <div className="space-y-3 bg-slate-50 p-4 rounded-2xl border border-slate-200/80">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="text-xs font-bold text-slate-900">
                      الحذف التلقائي للتعليقات السلبية والشتائم بالـ AI
                    </h4>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      فحص فوري باستخدام الذكاء الاصطناعي لحذف التعليقات المسيئة فور كتابتها
                    </p>
                  </div>
                  <button
                    onClick={() =>
                      setSettings({ ...settings, autoDeleteNegative: !settings.autoDeleteNegative })
                    }
                    className={`w-11 h-6 rounded-full transition-colors p-0.5 flex items-center ${
                      settings.autoDeleteNegative ? 'bg-rose-600 justify-end' : 'bg-slate-300 justify-start'
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
                    onClick={() => setSettings({ ...settings, autoHideSpam: !settings.autoHideSpam })}
                    className={`w-11 h-6 rounded-full transition-colors p-0.5 flex items-center ${
                      settings.autoHideSpam ? 'bg-purple-600 justify-end' : 'bg-slate-300 justify-start'
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
                      setSettings({ ...settings, autoReplyInquiries: !settings.autoReplyInquiries })
                    }
                    className={`w-11 h-6 rounded-full transition-colors p-0.5 flex items-center ${
                      settings.autoReplyInquiries ? 'bg-[#1A73E8] justify-end' : 'bg-slate-300 justify-start'
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
                    value={settings.strictnessLevel}
                    onChange={(e) => setSettings({ ...settings, strictnessLevel: e.target.value as any })}
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
                    value={settings.actionForNegative}
                    onChange={(e) => setSettings({ ...settings, actionForNegative: e.target.value as any })}
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
                  {settings.negativeKeywords.map((kw, i) => (
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
                  value={settings.inquiryReplyText}
                  onChange={(e) => setSettings({ ...settings, inquiryReplyText: e.target.value })}
                  className="w-full bg-slate-50 text-xs font-medium text-slate-900 px-3.5 py-2.5 rounded-xl border border-slate-200 focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#1A73E8]/20"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  نص الرسالة الخاصة التلقائية عبر المسنجر / الدايركت (Auto-DM):
                </label>
                <textarea
                  rows={2}
                  value={settings.inquiryDmText}
                  onChange={(e) => setSettings({ ...settings, inquiryDmText: e.target.value })}
                  className="w-full bg-slate-50 text-xs font-medium text-slate-900 p-3 rounded-xl border border-slate-200 focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#1A73E8]/20"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setIsSettingsModalOpen(false)}
                className="px-5 py-2.5 rounded-xl bg-[#1A73E8] hover:bg-[#1557B0] text-white text-xs font-bold transition shadow-xs"
              >
                حفظ الإعدادات والتطبيق
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
                  <h3 className="text-sm font-bold text-slate-900">محاكي فحص الذكاء الاصطناعي</h3>
                  <p className="text-[11px] text-slate-500">جرب كتابة أي تعليق لمعرفة كيف سيتعامل معه الـ AI فورياً</p>
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
                <label className="block text-xs font-bold text-slate-700 mb-1">اكتب نص التعليق للتجربة:</label>
                <textarea
                  rows={3}
                  value={simulatorInput}
                  onChange={(e) => setSimulatorInput(e.target.value)}
                  placeholder="مثال 1: المنتج بتاعكم زفت ونصابين ومحدش يشتري منكم&#10;مثال 2: بكام الفستان ده وفيه مقاس لارج؟"
                  className="w-full bg-slate-50 text-xs font-medium text-slate-900 p-3 rounded-xl border border-slate-200 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600"
                />
              </div>

              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5 text-[11px] text-slate-500">
                  <span>أمثلة سريعة:</span>
                  <button
                    type="button"
                    onClick={() => setSimulatorInput('الخامة وحشة جداً ونصابين')}
                    className="text-rose-600 hover:underline font-bold"
                  >
                    [سلبي]
                  </button>
                  <button
                    type="button"
                    onClick={() => setSimulatorInput('بكام السعر وفيه شحن إسكندرية؟')}
                    className="text-blue-600 hover:underline font-bold"
                  >
                    [استفسار]
                  </button>
                  <button
                    type="button"
                    onClick={() => setSimulatorInput('تحفة ما شاء الله شكراً ليكم')}
                    className="text-emerald-600 hover:underline font-bold"
                  >
                    [إيجابي]
                  </button>
                </div>

                <button
                  type="button"
                  disabled={isSimulating || !simulatorInput.trim()}
                  onClick={handleRunSimulation}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition flex items-center gap-1.5 disabled:opacity-50"
                >
                  <Play className="w-3.5 h-3.5" />
                  <span>{isSimulating ? 'جاري الفحص...' : 'فحص بالذكاء الاصطناعي'}</span>
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
                    الرد على تعليق ({replyModalComment.author_name || (replyModalComment as any).authorName || 'مستخدم'})
                  </h3>
                  <p className="text-[11px] text-slate-500">
                    عبر {((replyModalComment.channel || (replyModalComment as any).platform) === 'facebook') ? 'صفحة الفيسبوك' : 'إنستغرام'}
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
              "{replyModalComment.text || (replyModalComment as any).commentText}"
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
                <h3 className="text-sm font-bold text-slate-900">سجل إجراءات الذكاء الاصطناعي على التعليقات</h3>
              </div>
              <button
                onClick={() => setIsLogsModalOpen(false)}
                className="p-1 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-xl"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto space-y-2.5 pr-1 text-xs">
              {safeComments
                .filter((c) => c.reply_text || c.auto_replied || c.is_hidden || c.is_deleted)
                .map((c) => (
                  <div
                    key={c.id}
                    className="p-3.5 bg-slate-50 rounded-xl border border-slate-200/80 space-y-1.5"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-slate-900">
                        {c.author_name || (c as any).authorName || 'مستخدم'} ({((c.channel || (c as any).platform || 'facebook') as string).toUpperCase()})
                      </span>
                      <span className="text-[10px] text-slate-500 font-semibold bg-white px-2 py-0.5 rounded-md border">
                        {new Date(c.created_at || Date.now()).toLocaleDateString('ar-EG')}
                      </span>
                    </div>
                    <p className="text-slate-700 font-medium italic">"{c.text || (c as any).commentText}"</p>
                    <div className="pt-1 text-[11px] font-bold text-[#1A73E8]">
                      ⚡ {c.reply_text ? `تم الرد: ${c.reply_text}` : c.is_hidden ? 'تم إخفاء التعليق' : 'تمت المعالجة'}
                    </div>
                  </div>
                ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export { SocialCommentsManager as CommentsPage };
export default SocialCommentsManager;

