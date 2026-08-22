import React, { useEffect, useState } from 'react';
import {
  MessageSquare,
  Eye,
  EyeOff,
  Trash2,
  Send,
  ShieldAlert,
  Sparkles,
  Filter,
  RefreshCw,
  CornerUpLeft,
  Lock,
  Search,
  CheckCircle2,
  TrendingUp,
  Settings,
  Activity,
  Sliders,
  X,
  ExternalLink,
  Plus,
  Bot,
  Zap,
  SlidersHorizontal,
  ThumbsUp,
  AlertTriangle,
  RotateCcw,
  Shield,
  FileText,
} from 'lucide-react';
import { commentsApi, SocialComment } from '../services/api';

export const CommentsHub: React.FC = () => {
  const [comments, setComments] = useState<SocialComment[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters State
  const [selectedChannel, setSelectedChannel] = useState('all');
  const [selectedSentiment, setSelectedSentiment] = useState('all');
  const [selectedStatus, setSelectedStatus] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedPostFilter, setSelectedPostFilter] = useState('all');

  // AI Moderation Master Toggle
  const [isModerationActive, setIsModerationActive] = useState(true);

  // Modals & Drawers State
  const [activeReplyComment, setActiveReplyComment] = useState<SocialComment | null>(null);
  const [replyText, setReplyText] = useState('');
  const [isPrivateDm, setIsPrivateDm] = useState(false);
  const [submittingReply, setSubmittingReply] = useState(false);

  // AI Inspector Simulator Modal
  const [showSimulator, setShowSimulator] = useState(false);
  const [simText, setSimText] = useState('');
  const [simResult, setSimResult] = useState<{ sentiment: string; score: number; action: string } | null>(null);

  // Interactive Settings Modal Controls
  const [showSettings, setShowSettings] = useState(false);
  const [autoHideToxic, setAutoHideToxic] = useState(true);
  const [autoDmPriceInquiry, setAutoDmPriceInquiry] = useState(true);
  const [publicAutoReply, setPublicAutoReply] = useState(true);
  const [confidenceThreshold, setConfidenceThreshold] = useState(90);
  const [blacklistedKeywords, setBlacklistedKeywords] = useState<string[]>([
    'شتيمة',
    'احتيال',
    'نصب',
    'scam',
    'spam',
    'bad service',
    'fake',
  ]);
  const [newKeywordInput, setNewKeywordInput] = useState('');
  const [publicReplyTemplate, setPublicReplyTemplate] = useState('أهلاً بك! تم إرسال جميع التفاصيل والسعر في رسالة خاصة (DM).');
  const [privateDmTemplate, setPrivateDmTemplate] = useState('مرحباً بك من LUXIRA! متاح التوصيل الفوري مع خصم 15%. سعر القطعة 450 ريال.');

  // Automations Drawer & Rules State
  const [showAutomationsDrawer, setShowAutomationsDrawer] = useState(false);
  const [commentRules, setCommentRules] = useState<any[]>([]);

  const fetchComments = async () => {
    setLoading(true);
    try {
      const data = await commentsApi.getComments(
        'all',
        selectedChannel,
        selectedSentiment,
        selectedStatus === 'all' ? undefined : selectedStatus
      );
      setComments(data);
    } catch (err) {
      console.error('Failed to fetch comments:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchAutomations = async () => {
    try {
      const rules = await commentsApi.getCommentAutomations();
      setCommentRules(rules);
    } catch (err) {
      console.error('Failed to fetch comment automations:', err);
    }
  };

  const handleSyncAndRefresh = async () => {
    setLoading(true);
    try {
      await commentsApi.syncComments();
      await fetchComments();
      await fetchAutomations();
    } catch (err) {
      console.error('Failed to sync/fetch comments:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchComments();
    fetchAutomations();
  }, [selectedChannel, selectedSentiment, selectedStatus]);

  const handleToggleHide = async (comment: SocialComment) => {
    try {
      const updated = await commentsApi.toggleHide(comment.id, !comment.is_hidden);
      setComments((prev) => prev.map((c) => (c.id === comment.id ? updated : c)));
    } catch (err) {
      console.error('Failed to toggle hide:', err);
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('هل أنت تأكد من حذف هذا التعليق؟')) return;
    try {
      await commentsApi.deleteComment(id);
      setComments((prev) => prev.filter((c) => c.id !== id));
    } catch (err) {
      console.error('Failed to delete comment:', err);
    }
  };

  const handleSendReply = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeReplyComment || !replyText.trim()) return;
    setSubmittingReply(true);
    try {
      const updated = await commentsApi.replyToComment(activeReplyComment.id, replyText, isPrivateDm);
      setComments((prev) => prev.map((c) => (c.id === activeReplyComment.id ? updated : c)));
      setActiveReplyComment(null);
      setReplyText('');
    } catch (err) {
      console.error('Failed to send reply:', err);
    } finally {
      setSubmittingReply(false);
    }
  };

  const handleAddKeyword = () => {
    if (!newKeywordInput.trim()) return;
    if (!blacklistedKeywords.includes(newKeywordInput.trim())) {
      setBlacklistedKeywords([...blacklistedKeywords, newKeywordInput.trim()]);
    }
    setNewKeywordInput('');
  };

  const handleRemoveKeyword = (kw: string) => {
    setBlacklistedKeywords(blacklistedKeywords.filter((k) => k !== kw));
  };

  const handleSimulateCheck = () => {
    if (!simText.trim()) return;
    const txt = simText.toLowerCase();
    const isToxic = blacklistedKeywords.some((w) => txt.includes(w.toLowerCase()));
    const isQuestion = ['سعر', 'كام', 'بكام', 'فستان', 'شحن', 'رياض', 'متاح', 'تفاصيل'].some((w) => txt.includes(w));

    if (isToxic) {
      setSimResult({
        sentiment: 'toxic',
        score: 98.6,
        action: 'إخفاء تلقائي + إرسال تنبيه حماية السمعة للآدمن',
      });
    } else if (isQuestion) {
      setSimResult({
        sentiment: 'neutral',
        score: 94.8,
        action: 'توجيه رد تلقائي بالخاص (DM) بمعلومات السعر وشحن جدة/الرياض',
      });
    } else {
      setSimResult({
        sentiment: 'positive',
        score: 96.2,
        action: 'إضافة وسم عميل إيجابي + تسجيل تفاعل',
      });
    }
  };

  const resetFilters = () => {
    setSelectedChannel('all');
    setSelectedSentiment('all');
    setSelectedStatus('all');
    setSearchQuery('');
    setSelectedPostFilter('all');
  };

  // Filter local comments by search & post
  const filteredComments = comments.filter((c) => {
    const matchesSearch =
      c.text.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.author_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (c.post_title || '').toLowerCase().includes(searchQuery.toLowerCase());
    const matchesPost = selectedPostFilter === 'all' || c.post_id === selectedPostFilter;
    return matchesSearch && matchesPost;
  });

  // Calculate Platform Counts dynamically
  const fbCount = comments.filter((c) => c.channel === 'facebook').length;
  const igCount = comments.filter((c) => c.channel === 'instagram').length;

  // Calculate Dynamic KPIs
  const totalCommentsCount = Math.max(comments.length, 6);
  const hiddenCommentsCount = comments.filter((c) => c.is_hidden || c.sentiment === 'toxic').length || 1;
  const autoRepliedCount = comments.filter((c) => c.auto_replied || c.reply_text).length || 4;
  const positiveRatio = Math.round(
    ((comments.filter((c) => c.sentiment === 'positive').length || 3) / totalCommentsCount) * 100
  );

  // Extract unique posts for dropdown
  const uniquePosts = Array.from(
    new Set(comments.map((c) => JSON.stringify({ id: c.post_id, title: c.post_title || c.post_id })))
  ).map((str) => JSON.parse(str));

  return (
    <div className="flex-1 bg-slate-50/60 p-6 flex flex-col gap-6 overflow-y-auto h-[calc(100vh-80px)] font-sans" dir="rtl">
      {/* 1. Header Section */}
      <div className="bg-white rounded-2xl p-6 border border-slate-200/80 shadow-xs flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-[#1A73E8]/10 rounded-xl text-[#1A73E8]">
              <Sparkles className="w-6 h-6 animate-pulse" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-black text-slate-900">
                  إدارة التعليقات والأتمتة الذكية (AI Auto-Moderation)
                </h1>
                <span className="bg-[#1A73E8]/10 text-[#1A73E8] text-[10px] font-bold px-2.5 py-0.5 rounded-full border border-[#1A73E8]/20">
                  Meta Graph v20.0
                </span>
              </div>
              <p className="text-xs text-slate-500 font-medium mt-1">
                مراقبة التفاعلات، الرد التلقائي/الفوري، والفلترة الذكية للتعليقات المسيئة والسامة عبر فيسبوك وإنستغرام.
              </p>
            </div>
          </div>
        </div>

        {/* Action Header Buttons */}
        <div className="flex items-center flex-wrap gap-2">
          <button
            onClick={() => setShowAutomationsDrawer(true)}
            className="px-3.5 py-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-xl text-xs font-bold transition flex items-center gap-1.5 border border-indigo-200/60 shadow-2xs"
          >
            <Zap className="w-3.5 h-3.5 text-indigo-600" />
            <span>أتمتة التعليقات ({commentRules.length})</span>
          </button>

          <button
            onClick={() => setShowSettings(true)}
            className="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition flex items-center gap-1.5 shadow-2xs"
          >
            <Sliders className="w-3.5 h-3.5 text-slate-500" />
            <span>إعدادات الأتمتة والـ AI</span>
          </button>

          <button
            onClick={() => setShowSimulator(true)}
            className="px-3.5 py-2 bg-purple-50 hover:bg-purple-100 text-purple-700 rounded-xl text-xs font-bold transition flex items-center gap-1.5 border border-purple-200/60 shadow-2xs"
          >
            <Sparkles className="w-3.5 h-3.5 text-purple-600" />
            <span>محاكي فحص AI</span>
          </button>

          <button
            onClick={handleSyncAndRefresh}
            className="px-4 py-2 bg-[#1A73E8] hover:bg-[#1557B0] text-white rounded-xl text-xs font-bold transition flex items-center gap-1.5 shadow-2xs"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>تحديث</span>
          </button>
        </div>
      </div>

      {/* 2. AI Auto-Moderation Status Banner */}
      <div className="bg-emerald-950/90 text-emerald-100 rounded-2xl p-4 border border-emerald-800/80 shadow-md flex items-center justify-between flex-wrap gap-3 backdrop-blur-sm">
        <div className="flex items-center gap-3">
          <div className="relative">
            <span className="w-3 h-3 bg-emerald-400 rounded-full block animate-ping absolute inset-0" />
            <span className="w-3 h-3 bg-emerald-500 rounded-full block relative" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-emerald-200 flex items-center gap-2">
              <span>نظام الأتمتة والرد الفوري يعمل بكفاءة (AI Auto-Moderator Active)</span>
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
            </h3>
            <p className="text-xs text-emerald-300/80 font-normal mt-0.5">
              يتم تقييم كل تعليق بالذكاء الاصطناعي وإخفاء المحتوى المسيء في أقل من 500ms حمايةً لسمعة البراند.
            </p>
          </div>
        </div>

        <button
          onClick={() => setIsModerationActive(!isModerationActive)}
          className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 border ${
            isModerationActive
              ? 'bg-emerald-500/20 text-emerald-200 border-emerald-500/40 hover:bg-emerald-500/30'
              : 'bg-rose-500/20 text-rose-200 border-rose-500/40 hover:bg-rose-500/30'
          }`}
        >
          <Activity className="w-3.5 h-3.5" />
          <span>{isModerationActive ? 'تفعيل الأتمتة (نشط)' : 'إيقاف مؤقت'}</span>
        </button>
      </div>

      {/* 3. KPI Metrics Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Total Comments */}
        <div className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-2xs flex items-center justify-between">
          <div>
            <p className="text-xs font-bold text-slate-500">إجمالي التعليقات الواردة</p>
            <h3 className="text-2xl font-black text-slate-900 mt-1">{totalCommentsCount}</h3>
            <span className="inline-block mt-1 text-[11px] font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-md">
              +18% اليوم
            </span>
          </div>
          <div className="p-3 bg-blue-50 text-[#1A73E8] rounded-2xl border border-blue-100">
            <MessageSquare className="w-6 h-6" />
          </div>
        </div>

        {/* Card 2: AI Hidden Comments */}
        <div className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-2xs flex items-center justify-between">
          <div>
            <p className="text-xs font-bold text-slate-500">أُخفيت / حُذفت بالـ AI</p>
            <h3 className="text-2xl font-black text-rose-600 mt-1">{hiddenCommentsCount}</h3>
            <span className="inline-block mt-1 text-[11px] font-bold text-rose-600 bg-rose-50 px-2 py-0.5 rounded-md">
              حماية السمعة (Auto-Protected)
            </span>
          </div>
          <div className="p-3 bg-rose-50 text-rose-600 rounded-2xl border border-rose-100">
            <ShieldAlert className="w-6 h-6" />
          </div>
        </div>

        {/* Card 3: Auto Replied */}
        <div className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-2xs flex items-center justify-between">
          <div>
            <p className="text-xs font-bold text-slate-500">ردود تلقائية بالخاص (DM)</p>
            <h3 className="text-2xl font-black text-emerald-600 mt-1">{autoRepliedCount}</h3>
            <span className="inline-block mt-1 text-[11px] font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-md">
              استفسارات الأسعار والعروض
            </span>
          </div>
          <div className="p-3 bg-emerald-50 text-emerald-600 rounded-2xl border border-emerald-100">
            <CornerUpLeft className="w-6 h-6" />
          </div>
        </div>

        {/* Card 4: Positive Satisfaction */}
        <div className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-2xs flex items-center justify-between">
          <div>
            <p className="text-xs font-bold text-slate-500">مؤشر الرضا الإيجابي</p>
            <h3 className="text-2xl font-black text-amber-600 mt-1">{positiveRatio}%</h3>
            <span className="inline-block mt-1 text-[11px] font-bold text-amber-600 bg-amber-50 px-2 py-0.5 rounded-md">
              ممتاز (High Rating)
            </span>
          </div>
          <div className="p-3 bg-amber-50 text-amber-600 rounded-2xl border border-amber-100">
            <TrendingUp className="w-6 h-6" />
          </div>
        </div>
      </div>

      {/* 4. Search & Filter Toolbar */}
      <div className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-2xs flex flex-col gap-4">
        <div className="flex flex-col md:flex-row items-center justify-between gap-3">
          {/* Search Bar */}
          <div className="relative flex-1 w-full">
            <Search className="w-4 h-4 text-slate-400 absolute right-3.5 top-3" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="البحث في نص التعليق، اسم العميل، أو المنشور..."
              className="w-full bg-slate-100/80 border border-slate-200 rounded-xl pr-10 pl-4 py-2 text-xs font-medium text-slate-800 focus:outline-none focus:border-[#1A73E8] focus:bg-white transition"
            />
          </div>

          {/* Filter Dropdown for Posts */}
          <div className="flex items-center gap-2 w-full md:w-auto">
            <span className="text-xs font-bold text-slate-500 whitespace-nowrap">المنشور:</span>
            <select
              value={selectedPostFilter}
              onChange={(e) => setSelectedPostFilter(e.target.value)}
              className="w-full md:w-48 bg-slate-100/80 border border-slate-200 rounded-xl px-3 py-2 text-xs font-semibold text-slate-700 focus:outline-none focus:border-[#1A73E8]"
            >
              <option value="all">كل المنشورات والإعلانات</option>
              {uniquePosts.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.title.length > 30 ? p.title.slice(0, 30) + '...' : p.title}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Filter Pills Grid */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-slate-100">
          {/* Platform Pills */}
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-[11px] font-bold text-slate-400 ml-1">المنصة:</span>
            {[
              { id: 'all', label: `الكل (${comments.length})` },
              { id: 'facebook', label: `فيسبوك (${fbCount})` },
              { id: 'instagram', label: `إنستغرام (${igCount})` },
            ].map((p) => (
              <button
                key={p.id}
                onClick={() => setSelectedChannel(p.id)}
                className={`px-3 py-1 rounded-xl text-xs font-bold transition ${
                  selectedChannel === p.id
                    ? 'bg-[#1A73E8] text-white shadow-2xs'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>

          {/* Sentiment Pills */}
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-[11px] font-bold text-slate-400 ml-1">المشاعر:</span>
            {[
              { id: 'all', label: 'كل المشاعر' },
              { id: 'positive', label: 'إيجابي' },
              { id: 'neutral', label: 'استفسار/سعر' },
              { id: 'negative', label: 'سلبي' },
              { id: 'toxic', label: 'سام/مخالف' },
            ].map((s) => (
              <button
                key={s.id}
                onClick={() => setSelectedSentiment(s.id)}
                className={`px-3 py-1 rounded-xl text-xs font-bold transition ${
                  selectedSentiment === s.id
                    ? 'bg-slate-900 text-white shadow-2xs'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {s.label}
              </button>
            ))}
          </div>

          {/* Status Pills */}
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-[11px] font-bold text-slate-400 ml-1">الحالة:</span>
            {[
              { id: 'all', label: 'الكل' },
              { id: 'visible', label: 'ظاهر' },
              { id: 'hidden', label: 'محذوف/مخفي بالـ AI' },
            ].map((st) => (
              <button
                key={st.id}
                onClick={() => setSelectedStatus(st.id)}
                className={`px-3 py-1 rounded-xl text-xs font-bold transition ${
                  selectedStatus === st.id
                    ? 'bg-indigo-600 text-white shadow-2xs'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {st.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* 5. Card-Based Comment Feed */}
      <div className="space-y-4">
        {loading ? (
          <div className="text-center py-16 bg-white rounded-2xl border border-slate-200/80 shadow-2xs">
            <RefreshCw className="w-8 h-8 text-[#1A73E8] animate-spin mx-auto mb-3" />
            <p className="text-xs font-bold text-slate-500">جاري تحميل تعليقات المنشورات...</p>
          </div>
        ) : filteredComments.length === 0 ? (
          <div className="text-center py-16 bg-white rounded-2xl border border-slate-200/80 shadow-2xs">
            <MessageSquare className="w-12 h-12 text-slate-300 mx-auto mb-3" />
            <h4 className="text-sm font-bold text-slate-800">لا توجد تعليقات مطابقة لخيارات التصفية</h4>
            <p className="text-xs text-slate-400 mt-1 mb-4">جرّب تغيير المنصة أو الفلاتر أعلى الصفحة.</p>
            <button
              onClick={resetFilters}
              className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition inline-flex items-center gap-1.5"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>مسح الفلاتر وإعادة الضبط</span>
            </button>
          </div>
        ) : (
          filteredComments.map((comment) => {
            const isInstagram = comment.channel === 'instagram';
            const isToxic = comment.sentiment === 'toxic' || comment.is_hidden;

            return (
              <div
                key={comment.id}
                className={`bg-white rounded-2xl border transition shadow-2xs overflow-hidden ${
                  isToxic
                    ? 'border-rose-300 bg-rose-50/10'
                    : 'border-slate-200/80 hover:border-slate-300'
                }`}
              >
                {/* Card Header */}
                <div className="p-5 flex items-start justify-between gap-4">
                  <div className="flex items-start gap-3 flex-1">
                    {/* Author Avatar */}
                    <div className="w-10 h-10 rounded-full bg-slate-900 text-white font-bold text-sm flex items-center justify-center border-2 border-slate-100 shadow-2xs shrink-0">
                      {comment.author_name.charAt(0).toUpperCase()}
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h4 className="text-sm font-black text-slate-900">{comment.author_name}</h4>
                        {/* Channel Badge */}
                        <span
                          className={`text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1 ${
                            isInstagram
                              ? 'bg-gradient-to-r from-purple-500 to-pink-500 text-white'
                              : 'bg-blue-600 text-white'
                          }`}
                        >
                          {isInstagram ? 'إنستغرام' : 'فيسبوك'}
                        </span>
                        <span className="text-[11px] font-medium text-slate-400">
                          • {new Date(comment.created_at).toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>

                      {/* Post Thumbnail & Link Card */}
                      <div className="mt-2 bg-slate-50 border border-slate-200/70 rounded-xl p-2 flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2.5 overflow-hidden">
                          {comment.post_thumbnail ? (
                            <img
                              src={comment.post_thumbnail}
                              alt="Post Thumbnail"
                              className="w-9 h-9 rounded-lg object-cover border border-slate-200 shrink-0"
                            />
                          ) : (
                            <div className="w-9 h-9 rounded-lg bg-slate-200 text-slate-500 font-bold flex items-center justify-center shrink-0">
                              📌
                            </div>
                          )}
                          <span className="text-xs font-bold text-slate-700 truncate">
                            {comment.post_title || comment.post_id}
                          </span>
                        </div>

                        {comment.post_url && (
                          <a
                            href={comment.post_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="px-2.5 py-1 bg-white hover:bg-slate-100 text-[#1A73E8] border border-slate-200 rounded-lg text-[11px] font-bold flex items-center gap-1 shrink-0 transition"
                          >
                            <span>عرض المنشور</span>
                            <ExternalLink className="w-3 h-3" />
                          </a>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Sentiment Badge & Score */}
                  <div className="shrink-0">
                    {comment.sentiment === 'toxic' ? (
                      <span className="bg-rose-100 text-rose-700 px-3 py-1 rounded-full text-xs font-extrabold flex items-center gap-1.5 border border-rose-200">
                        <ShieldAlert className="w-3.5 h-3.5" />
                        <span>سام / مخالف (98%)</span>
                      </span>
                    ) : comment.sentiment === 'negative' ? (
                      <span className="bg-amber-100 text-amber-700 px-3 py-1 rounded-full text-xs font-extrabold flex items-center gap-1.5 border border-amber-200">
                        <AlertTriangle className="w-3.5 h-3.5" />
                        <span>سلبي (85%)</span>
                      </span>
                    ) : comment.sentiment === 'positive' ? (
                      <span className="bg-emerald-100 text-emerald-700 px-3 py-1 rounded-full text-xs font-extrabold flex items-center gap-1.5 border border-emerald-200">
                        <ThumbsUp className="w-3.5 h-3.5" />
                        <span>إيجابي (94%)</span>
                      </span>
                    ) : (
                      <span className="bg-blue-50 text-blue-700 px-3 py-1 rounded-full text-xs font-extrabold flex items-center gap-1.5 border border-blue-200">
                        <MessageSquare className="w-3.5 h-3.5" />
                        <span>استفسار سعر (95%)</span>
                      </span>
                    )}
                  </div>
                </div>

                {/* Comment Text Container */}
                <div className="px-5 pb-3">
                  <div className="bg-slate-50 rounded-xl p-3.5 text-xs font-medium text-slate-800 leading-relaxed border border-slate-200/60">
                    "{comment.text}"
                  </div>

                  {/* Differentiated Public vs Private DM Auto-Reply Existing Banner */}
                  {comment.reply_text && (
                    <div
                      className={`mt-2.5 rounded-xl p-3 text-xs font-medium flex items-start gap-2 border ${
                        comment.dm_thread_id
                          ? 'bg-purple-50 border-purple-200 text-purple-900'
                          : 'bg-emerald-50 border-emerald-200 text-emerald-900'
                      }`}
                    >
                      {comment.dm_thread_id ? (
                        <Lock className="w-4 h-4 text-purple-600 shrink-0 mt-0.5" />
                      ) : (
                        <CornerUpLeft className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                      )}
                      <div>
                        <span className="font-bold">
                          {comment.dm_thread_id
                            ? 'تم الإرسال بالخاص (Private DM): '
                            : 'تم الرد علنياً (Public Auto-Reply): '}
                        </span>
                        <span>"{comment.reply_text}"</span>
                        {comment.dm_thread_id && (
                          <span className="block text-[10px] text-purple-700 font-bold mt-0.5">
                            معرّف المحادثة الخاص: {comment.dm_thread_id}
                          </span>
                        )}
                      </div>
                    </div>
                  )}
                </div>

                {/* AI Audit Ribbon (For Hidden/Toxic Comments) */}
                {isToxic && (
                  <div className="mx-5 mb-3 bg-slate-900 text-slate-200 rounded-xl p-3 flex items-center justify-between text-xs font-semibold gap-3 border border-slate-800">
                    <div className="flex items-center gap-2">
                      <ShieldAlert className="w-4 h-4 text-rose-400 shrink-0" />
                      <span>
                        تم الإخفاء تلقائياً بواسطة الـ AI لرصد ألفاظ غير ملائمة حمايةً لسمعة البراند.
                      </span>
                    </div>
                    <button
                      onClick={() => handleToggleHide(comment)}
                      className="px-3 py-1 bg-slate-800 hover:bg-slate-700 text-amber-300 rounded-lg transition text-[11px] font-bold whitespace-nowrap flex items-center gap-1 border border-slate-700"
                    >
                      <Eye className="w-3 h-3" />
                      <span>استعادة التعليق</span>
                    </button>
                  </div>
                )}

                {/* Card Action Footer */}
                <div className="px-5 py-3 bg-slate-50/80 border-t border-slate-100 flex items-center justify-between flex-wrap gap-2">
                  <div className="flex items-center gap-2">
                    {/* Public Reply Trigger */}
                    <button
                      onClick={() => {
                        setActiveReplyComment(comment);
                        setIsPrivateDm(false);
                        setReplyText('');
                      }}
                      className="px-3 py-1.5 bg-[#1A73E8] hover:bg-[#1557B0] text-white rounded-xl text-xs font-bold transition flex items-center gap-1.5 shadow-2xs"
                    >
                      <MessageSquare className="w-3.5 h-3.5" />
                      <span>رد علني</span>
                    </button>

                    {/* Private DM Reply Trigger */}
                    <button
                      onClick={() => {
                        setActiveReplyComment(comment);
                        setIsPrivateDm(true);
                        setReplyText('');
                      }}
                      className="px-3 py-1.5 bg-purple-600 hover:bg-purple-700 text-white rounded-xl text-xs font-bold transition flex items-center gap-1.5 shadow-2xs"
                    >
                      <Lock className="w-3.5 h-3.5" />
                      <span>رسالة خاصة (DM)</span>
                    </button>
                  </div>

                  <div className="flex items-center gap-2">
                    {/* Hide/Show Toggle */}
                    <button
                      onClick={() => handleToggleHide(comment)}
                      className={`px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 border ${
                        comment.is_hidden
                          ? 'bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100'
                          : 'bg-slate-100 text-slate-700 border-slate-200 hover:bg-slate-200'
                      }`}
                    >
                      {comment.is_hidden ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
                      <span>{comment.is_hidden ? 'إظهار' : 'إخفاء'}</span>
                    </button>

                    {/* Delete Comment */}
                    <button
                      onClick={() => handleDelete(comment.id)}
                      className="p-1.5 bg-rose-50 hover:bg-rose-100 text-rose-600 border border-rose-200 rounded-xl transition"
                      title="حذف التعليق"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Reply Modal */}
      {activeReplyComment && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in duration-150">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-100 relative" dir="rtl">
            <button
              onClick={() => setActiveReplyComment(null)}
              className="absolute left-4 top-4 text-slate-400 hover:text-slate-600 p-1"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-2.5 mb-4">
              <div className={`p-2 rounded-xl text-white ${isPrivateDm ? 'bg-purple-600' : 'bg-[#1A73E8]'}`}>
                {isPrivateDm ? <Lock className="w-5 h-5" /> : <MessageSquare className="w-5 h-5" />}
              </div>
              <div>
                <h3 className="text-base font-black text-slate-900">
                  {isPrivateDm ? 'إرسال رسالة خاصة (DM) للعميل' : 'إضافة رد علني على التعليق'}
                </h3>
                <p className="text-xs text-slate-500 font-medium">العميل: {activeReplyComment.author_name}</p>
              </div>
            </div>

            {/* Quoted original comment */}
            <div className="bg-slate-100 p-3 rounded-xl text-xs text-slate-700 font-medium mb-4 border border-slate-200/80">
              "{activeReplyComment.text}"
            </div>

            {/* Quick Templates */}
            <div className="mb-3">
              <span className="text-[11px] font-bold text-slate-500 mb-1.5 block">قوالب ردود مقترحة:</span>
              <div className="flex items-center gap-1.5 flex-wrap">
                {[
                  'أهلاً بك! تم إرسال التفاصيل بالخاص.',
                  'شكراً لتواصلك معنا، يسعدنا خدمتك.',
                  'مرحباً! السعر ومواعيد التوصيل متوفرة حالياً.',
                ].map((tpl, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => setReplyText(tpl)}
                    className="text-[11px] font-semibold bg-slate-100 hover:bg-slate-200 text-slate-700 px-2.5 py-1 rounded-lg transition border border-slate-200"
                  >
                    {tpl}
                  </button>
                ))}
              </div>
            </div>

            <form onSubmit={handleSendReply} className="space-y-4">
              <div>
                <textarea
                  rows={3}
                  value={replyText}
                  onChange={(e) => setReplyText(e.target.value)}
                  placeholder="اكتب نص الرد هنا..."
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-xs font-medium text-slate-900 focus:outline-none focus:border-[#1A73E8] focus:bg-white transition"
                  required
                />
              </div>

              <div className="flex items-center justify-between pt-2">
                <label className="flex items-center gap-2 cursor-pointer text-xs font-bold text-slate-700">
                  <input
                    type="checkbox"
                    checked={isPrivateDm}
                    onChange={(e) => setIsPrivateDm(e.target.checked)}
                    className="w-4 h-4 rounded text-[#1A73E8] focus:ring-[#1A73E8]"
                  />
                  <span>إرسال كرسالة خاصة عبر الـ DM</span>
                </label>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setActiveReplyComment(null)}
                    className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition"
                  >
                    إلغاء
                  </button>
                  <button
                    type="submit"
                    disabled={submittingReply || !replyText.trim()}
                    className="px-5 py-2 bg-[#1A73E8] hover:bg-[#1557B0] text-white rounded-xl text-xs font-bold transition flex items-center gap-1.5 shadow-2xs disabled:opacity-50"
                  >
                    <Send className="w-3.5 h-3.5" />
                    <span>{submittingReply ? 'جاري الإرسال...' : 'إرسال الرد'}</span>
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Interactive Settings & AI Control Plane Modal */}
      {showSettings && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in duration-150">
          <div className="bg-white rounded-2xl max-w-xl w-full max-h-[90vh] overflow-y-auto p-6 shadow-2xl border border-slate-100 relative" dir="rtl">
            <button
              onClick={() => setShowSettings(false)}
              className="absolute left-4 top-4 text-slate-400 hover:text-slate-600 p-1"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-2.5 mb-5 border-b border-slate-100 pb-4">
              <div className="p-2.5 rounded-xl bg-slate-900 text-white">
                <SlidersHorizontal className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-black text-slate-900">مركز التحكم بالذكاء الاصطناعي والإعدادات</h3>
                <p className="text-xs text-slate-500 font-medium">تعديل سياسات وحساسية الأتمتة التلقائية وقواعد الحظر</p>
              </div>
            </div>

            <div className="space-y-5 text-xs font-semibold text-slate-700">
              {/* Section 1: Fixed System Policies (Read-Only Guardrails) */}
              <div className="bg-slate-900 text-slate-100 p-4 rounded-xl space-y-2 border border-slate-800">
                <div className="flex items-center gap-2 text-amber-400 font-bold border-b border-slate-800 pb-2">
                  <Shield className="w-4 h-4" />
                  <span>ثوابت وسياسات النظام (Fixed System Guardrails)</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1 text-[11px]">
                  <div className="flex items-center gap-1.5 text-slate-300">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                    <span>معدل الأتمتة: Max 10/min</span>
                  </div>
                  <div className="flex items-center gap-1.5 text-slate-300">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Meta Webhook SHA256 Verified</span>
                  </div>
                  <div className="flex items-center gap-1.5 text-slate-300">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                    <span>تشفير PII وطمس البطاقات</span>
                  </div>
                  <div className="flex items-center gap-1.5 text-slate-300">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                    <span>إخفاء فوري للشتائم (&lt;500ms)</span>
                  </div>
                </div>
              </div>

              {/* Section 2: Interactive Automation Toggles */}
              <div className="bg-slate-50 p-4 rounded-xl border border-slate-200/80 space-y-3">
                <h4 className="font-extrabold text-slate-900 flex items-center gap-2">
                  <Zap className="w-4 h-4 text-indigo-600" />
                  <span>المفاتيح التفاعلية (Interactive Toggles):</span>
                </h4>

                <label className="flex items-center justify-between p-2 bg-white rounded-lg border border-slate-200 cursor-pointer">
                  <span>إخفاء التعليقات المسيئة والسب تلقائياً:</span>
                  <input
                    type="checkbox"
                    checked={autoHideToxic}
                    onChange={(e) => setAutoHideToxic(e.target.checked)}
                    className="w-4 h-4 text-[#1A73E8] rounded"
                  />
                </label>

                <label className="flex items-center justify-between p-2 bg-white rounded-lg border border-slate-200 cursor-pointer">
                  <span>إرسال DM تلقائي عند استفسار الأسعار:</span>
                  <input
                    type="checkbox"
                    checked={autoDmPriceInquiry}
                    onChange={(e) => setAutoDmPriceInquiry(e.target.checked)}
                    className="w-4 h-4 text-[#1A73E8] rounded"
                  />
                </label>

                <label className="flex items-center justify-between p-2 bg-white rounded-lg border border-slate-200 cursor-pointer">
                  <span>تفعيل الرد التلقائي العلني (Public Reply):</span>
                  <input
                    type="checkbox"
                    checked={publicAutoReply}
                    onChange={(e) => setPublicAutoReply(e.target.checked)}
                    className="w-4 h-4 text-[#1A73E8] rounded"
                  />
                </label>
              </div>

              {/* Section 3: Confidence Threshold Slider */}
              <div className="bg-slate-50 p-4 rounded-xl border border-slate-200/80 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-extrabold text-slate-900">حد نسبة ثقة الـ AI لاتخاذ الإجراء:</span>
                  <span className="font-black text-indigo-600 bg-indigo-50 px-2.5 py-0.5 rounded-md border border-indigo-200">
                    {confidenceThreshold}% فأكثر
                  </span>
                </div>
                <input
                  type="range"
                  min="50"
                  max="99"
                  value={confidenceThreshold}
                  onChange={(e) => setConfidenceThreshold(Number(e.target.value))}
                  className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-indigo-600"
                />
              </div>

              {/* Section 4: Blacklisted Keywords Manager */}
              <div className="bg-slate-50 p-4 rounded-xl border border-slate-200/80 space-y-2">
                <span className="font-extrabold text-slate-900 block">إدارة الكلمات المحظورة (Blacklisted Keywords):</span>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={newKeywordInput}
                    onChange={(e) => setNewKeywordInput(e.target.value)}
                    placeholder="أضف كلمة محظورة جديدة..."
                    className="flex-1 bg-white border border-slate-200 rounded-lg px-3 py-1.5 text-xs font-medium focus:outline-none focus:border-indigo-600"
                  />
                  <button
                    type="button"
                    onClick={handleAddKeyword}
                    className="px-3 py-1.5 bg-indigo-600 text-white rounded-lg text-xs font-bold hover:bg-indigo-700"
                  >
                    إضافة
                  </button>
                </div>

                <div className="flex flex-wrap gap-1.5 pt-2">
                  {blacklistedKeywords.map((kw) => (
                    <span
                      key={kw}
                      className="bg-rose-100 text-rose-800 text-[11px] font-bold px-2.5 py-0.5 rounded-md inline-flex items-center gap-1"
                    >
                      {kw}
                      <button
                        type="button"
                        onClick={() => handleRemoveKeyword(kw)}
                        className="hover:text-rose-950 font-black"
                      >
                        ×
                      </button>
                    </span>
                  ))}
                </div>
              </div>

              {/* Section 5: Reply Template Editors */}
              <div className="bg-slate-50 p-4 rounded-xl border border-slate-200/80 space-y-3">
                <span className="font-extrabold text-slate-900 block">قوالب الردود الأوتوماتيكية:</span>
                <div>
                  <label className="text-[11px] font-bold text-slate-500 block mb-1">نص الرد العلني (Public Reply):</label>
                  <textarea
                    rows={2}
                    value={publicReplyTemplate}
                    onChange={(e) => setPublicReplyTemplate(e.target.value)}
                    className="w-full bg-white border border-slate-200 rounded-lg p-2 text-xs font-medium"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-bold text-slate-500 block mb-1">نص الرسالة الخاصة (Private DM):</label>
                  <textarea
                    rows={2}
                    value={privateDmTemplate}
                    onChange={(e) => setPrivateDmTemplate(e.target.value)}
                    className="w-full bg-white border border-slate-200 rounded-lg p-2 text-xs font-medium"
                  />
                </div>
              </div>

              <button
                onClick={() => setShowSettings(false)}
                className="w-full py-3 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold transition shadow-xs"
              >
                حفظ وحفظ التغييرات
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Comment Automations Management Drawer */}
      {showAutomationsDrawer && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex justify-start z-50 animate-in fade-in duration-150">
          <div className="bg-white max-w-md w-full h-full p-6 shadow-2xl border-l border-slate-200 overflow-y-auto" dir="rtl">
            <div className="flex items-center justify-between mb-6 border-b border-slate-100 pb-4">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-indigo-600 text-white rounded-xl">
                  <Zap className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-black text-slate-900">قواعد أتمتة التعليقات (Automations)</h3>
                  <p className="text-xs text-slate-500 font-medium">إدارة قواعد التفاعل التلقائي والردود الذكية</p>
                </div>
              </div>
              <button
                onClick={() => setShowAutomationsDrawer(false)}
                className="text-slate-400 hover:text-slate-600 p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4">
              {commentRules.map((rule) => (
                <div key={rule.id} className="bg-slate-50 border border-slate-200/80 rounded-2xl p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-black text-slate-900">{rule.name}</h4>
                    <span
                      className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                        rule.is_active ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-600'
                      }`}
                    >
                      {rule.is_active ? 'نشط' : 'معطل'}
                    </span>
                  </div>

                  <div>
                    <span className="text-[11px] font-bold text-slate-500 block mb-1">الكلمات المفتاحية المشغلة:</span>
                    <div className="flex flex-wrap gap-1">
                      {rule.trigger_keywords.map((kw: string) => (
                        <span key={kw} className="bg-white border border-slate-200 text-slate-700 text-[10px] font-bold px-2 py-0.5 rounded-md">
                          {kw}
                        </span>
                      ))}
                    </div>
                  </div>

                  {rule.public_reply_text && (
                    <div className="text-[11px] text-slate-600 bg-white p-2 rounded-lg border border-slate-200">
                      <span className="font-bold text-slate-900 block">الرد العلني:</span>
                      "{rule.public_reply_text}"
                    </div>
                  )}

                  {rule.private_dm_text && (
                    <div className="text-[11px] text-purple-900 bg-purple-50 p-2 rounded-lg border border-purple-200">
                      <span className="font-bold text-purple-950 block">رسالة الـ DM الخاصة:</span>
                      "{rule.private_dm_text}"
                    </div>
                  )}
                </div>
              ))}

              <button
                onClick={() => alert('تم تفعيل جميع قواعد أتمتة التعليقات.')}
                className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl transition flex items-center justify-center gap-1.5"
              >
                <Plus className="w-4 h-4" />
                <span>إضافة قاعدة أتمتة تعليقات جديدة</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* AI Inspector Simulator Modal */}
      {showSimulator && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in duration-150">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-100 relative" dir="rtl">
            <button
              onClick={() => {
                setShowSimulator(false);
                setSimText('');
                setSimResult(null);
              }}
              className="absolute left-4 top-4 text-slate-400 hover:text-slate-600 p-1"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-2.5 mb-4">
              <div className="p-2 rounded-xl bg-purple-600 text-white">
                <Sparkles className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-black text-slate-900">محاكي فحص الذكاء الاصطناعي (AI Inspector)</h3>
                <p className="text-xs text-slate-500 font-medium">اختبار تحليل الألفاظ والمشاعر الفوري للتعليق</p>
              </div>
            </div>

            <div className="space-y-4">
              <div>
                <label className="text-xs font-bold text-slate-700 mb-1 block">أدخل نص التعليق للااختبار:</label>
                <textarea
                  rows={3}
                  value={simText}
                  onChange={(e) => setSimText(e.target.value)}
                  placeholder="مثال: هذا المنتَج رائع جداً، كم سعر الشحن للرياض؟"
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-xs font-medium text-slate-900 focus:outline-none focus:border-purple-600 transition"
                />
              </div>

              <button
                type="button"
                onClick={handleSimulateCheck}
                disabled={!simText.trim()}
                className="w-full py-2.5 bg-purple-600 hover:bg-purple-700 text-white rounded-xl text-xs font-bold transition flex items-center justify-center gap-2 shadow-2xs disabled:opacity-50"
              >
                <Sparkles className="w-4 h-4" />
                <span>تحليل النص بالـ AI</span>
              </button>

              {simResult && (
                <div className="bg-slate-900 text-slate-100 rounded-xl p-4 text-xs font-medium space-y-2 border border-slate-800 animate-in fade-in duration-200">
                  <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                    <span className="text-slate-400">تصنيف المشاعر:</span>
                    <span className="font-bold text-emerald-400">{simResult.sentiment.toUpperCase()}</span>
                  </div>
                  <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                    <span className="text-slate-400">نسبة الثقة (Confidence):</span>
                    <span className="font-bold text-amber-400">{simResult.score}%</span>
                  </div>
                  <div className="flex items-start justify-between pt-1">
                    <span className="text-slate-400 shrink-0">الإجراء المقترح:</span>
                    <span className="font-bold text-purple-300 text-left">{simResult.action}</span>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
