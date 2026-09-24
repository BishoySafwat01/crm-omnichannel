import React, { useState, useEffect, useMemo } from 'react';
import {
  Bot,
  Plus,
  Trash2,
  Edit3,
  Power,
  Zap,
  Clock,
  MessageSquare,
  Layers,
  ShieldCheck,
  Tag,
  X,
  Check,
  Activity,
  AlertCircle,
  Play,
  Sparkles,
  MessageCircle,
  ShieldAlert,
  Filter,
} from 'lucide-react';
import {
  automationApi,
  AutomationRule,
  AutomationExecutionLog,
  commentAutomationApi,
  getConnectedPages,
} from '../../services/api';
import { CommentAutomationRule, ConnectedPage } from '../../types/crm';
import { BadWordsModerationModal } from './components/BadWordsModerationModal';
import { useBrandStore } from '../../store/useBrandStore';
import { getBrandObject } from '../../components/ConversationAvatar';

export const suggestSemanticName = (kws: string[]): string => {
  const cleanKws = kws.map((k) => k.trim()).filter(Boolean);
  if (cleanKws.length === 0) return '';
  const text = cleanKws.join(' ').toLowerCase();
  const firstKw = cleanKws[0] ? ` (${cleanKws[0].slice(0, 30)})` : '';

  if (['سعر', 'بكم', 'كام', 'تكلفة', 'فلوس', 'اسعار', 'بكام', 'سعره', 'سعرها'].some((w) => text.includes(w))) {
    return `قاعدة: استفسار السعر${firstKw}`;
  }
  if (['حجز', 'ثبت', 'طلب', 'اوردر', 'اشتري', 'ابعتلي', 'احجز', 'تثبيت', 'اريد', 'بدي'].some((w) => text.includes(w))) {
    return `قاعدة: تأكيد وحجز الطلب${firstKw}`;
  }
  if (['توصيل', 'شحن', 'محافظات', 'مصاريف', 'مندوب', 'ميعاد', 'بيوصل'].some((w) => text.includes(w))) {
    return `قاعدة: الشحن والتوصيل${firstKw}`;
  }
  if (['بشرتي', 'درجة', 'درجه', 'فاونديشن', 'لون', 'الوان', 'تغطية', 'كونسيلر'].some((w) => text.includes(w))) {
    return `قاعدة: درجات البشرة والفاونديشن${firstKw}`;
  }
  if (['كلف', 'هالات', 'حبوب', 'اثار', 'تجاعيد', 'مسام', 'علاج', 'تصبغات', 'اكسدة', 'جفاف'].some((w) => text.includes(w))) {
    return `قاعدة: مشاكل وعلاج البشرة${firstKw}`;
  }
  if (['عرض', 'عروض', 'خصم', 'خصومات', 'هدية', 'باكدج', 'بكج', 'تخفيض'].some((w) => text.includes(w))) {
    return `قاعدة: العروض والخصومات${firstKw}`;
  }
  if (['طريقة', 'استخدام', 'استعمال', 'ازاي', 'كيفية', 'طريقه', 'ازى'].some((w) => text.includes(w))) {
    return `قاعدة: طريقة الاستخدام${firstKw}`;
  }
  if (['عنوان', 'مكان', 'فرع', 'فروع', 'لوكيشن', 'موقع', 'المحل'].some((w) => text.includes(w))) {
    return `قاعدة: الفروع والعنوان${firstKw}`;
  }
  if (['تفاصيل', 'معلومات', 'شرح', 'مكونات', 'عايزة اعرف', 'عبارة عن ايه'].some((w) => text.includes(w))) {
    return `قاعدة: تفاصيل ومعلومات المنتج${firstKw}`;
  }
  if (['مرحبا', 'اهلا', 'سلام', 'صباح', 'مساء', 'الو', 'هااي', 'هالو', 'السلام'].some((w) => text.includes(w))) {
    return `قاعدة: الترحيب والاستقبال${firstKw}`;
  }
  return `قاعدة: ${cleanKws.slice(0, 3).join(' / ')}`;
};

export const AutomationsManager: React.FC = () => {
  const brands = useBrandStore((state) => state.brands);
  const [activeTab, setActiveTab] = useState<'messages' | 'comments'>('messages');

  const [rules, setRules] = useState<AutomationRule[]>([]);
  const [logs, setLogs] = useState<AutomationExecutionLog[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isLogsModalOpen, setIsLogsModalOpen] = useState(false);
  const [isModerationModalOpen, setIsModerationModalOpen] = useState(false);
  const [editingRule, setEditingRule] = useState<AutomationRule | null>(null);

  const [name, setName] = useState('');
  const [brandId, setBrandId] = useState<string>('all');
  const [channels, setChannels] = useState<string[]>(['messenger', 'instagram', 'whatsapp']);
  const [matchType, setMatchType] = useState<'contains' | 'exact' | 'regex'>('contains');
  const [keywordInput, setKeywordInput] = useState('');
  const [keywords, setKeywords] = useState<string[]>([]);
  const [cooldownMinutes, setCooldownMinutes] = useState(15);
  const [isActive, setIsActive] = useState(true);
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [responseText, setResponseText] = useState('');

  const [commentRules, setCommentRules] = useState<CommentAutomationRule[]>([]);
  const [isLoadingCommentRules, setIsLoadingCommentRules] = useState(false);
  const [isCommentModalOpen, setIsCommentModalOpen] = useState(false);
  const [editingCommentRule, setEditingCommentRule] = useState<CommentAutomationRule | null>(null);
  const [commentRuleName, setCommentRuleName] = useState('');
  const [commentChannel, setCommentChannel] = useState<'all' | 'facebook' | 'instagram'>('all');
  const [commentKeywordInput, setCommentKeywordInput] = useState('');
  const [commentKeywords, setCommentKeywords] = useState<string[]>([]);
  const [publicReplyText, setPublicReplyText] = useState('');
  const [privateDmText, setPrivateDmText] = useState('');
  const [autoHideToxic, setAutoHideToxic] = useState(true);
  const [isCommentRuleActive, setIsCommentRuleActive] = useState(true);
  const [commentFormError, setCommentFormError] = useState<string | null>(null);

  // Global Automation Master Toggle State
  const [isGlobalEnabled, setIsGlobalEnabled] = useState<boolean>(true);
  const [isTogglingGlobal, setIsTogglingGlobal] = useState<boolean>(false);
  const [globalToggleError, setGlobalToggleError] = useState<string | null>(null);

  // Multi-Filter State (by Account/Page and Channel)
  const [connectedPages, setConnectedPages] = useState<ConnectedPage[]>([]);
  const [selectedPageId, setSelectedPageId] = useState<string>('all');
  const [selectedChannel, setSelectedChannel] = useState<string>('all');

  const fetchRulesAndLogs = async () => {
    setIsLoading(true);
    try {
      const fetchedRules = await automationApi.listRules();
      setRules(fetchedRules);
      const fetchedLogs = await automationApi.listLogs();
      setLogs(fetchedLogs);
    } catch (e) {
      console.warn('[AutomationsManager] Error fetching rules/logs:', e);
    } finally {
      setIsLoading(false);
    }
  };

  const fetchCommentRules = async () => {
    setIsLoadingCommentRules(true);
    try {
      const list = await commentAutomationApi.listCommentAutomations();
      setCommentRules(list || []);
    } catch (e) {
      console.warn('[AutomationsManager] Error fetching comment rules:', e);
    } finally {
      setIsLoadingCommentRules(false);
    }
  };

  const fetchGlobalToggle = async () => {
    try {
      const enabled = await automationApi.getGlobalToggle();
      setIsGlobalEnabled(enabled);
    } catch (e) {
      console.warn('[AutomationsManager] Error fetching global toggle:', e);
    }
  };

  const fetchConnectedPagesList = async () => {
    try {
      const pages = await getConnectedPages();
      setConnectedPages(pages || []);
    } catch (e) {
      console.warn('[AutomationsManager] Error fetching connected pages:', e);
    }
  };

  useEffect(() => {
    fetchRulesAndLogs();
    fetchCommentRules();
    fetchGlobalToggle();
    fetchConnectedPagesList();
  }, []);

  const handleToggleGlobal = async () => {
    const nextState = !isGlobalEnabled;
    setIsGlobalEnabled(nextState);
    setIsTogglingGlobal(true);
    setGlobalToggleError(null);
    try {
      const updated = await automationApi.setGlobalToggle(nextState);
      setIsGlobalEnabled(updated);
    } catch (err: any) {
      setIsGlobalEnabled(!nextState); // Rollback optimistic update
      setGlobalToggleError(err?.message || 'فشل في تغيير حالة التحكم الشامل بالأتمتة');
    } finally {
      setIsTogglingGlobal(false);
    }
  };

  // Available pages for the filter dropdown
  const availablePages = useMemo(() => {
    const map = new Map<string, string>();
    connectedPages.forEach((p) => {
      if (p.page_id) {
        map.set(p.page_id, p.name || p.page_id);
      }
    });
    const knownNames: Record<string, string> = {
      '101509818947526': 'Lotus Blue Cosmetic',
      '100736899432829': 'Lavva',
      '104710089055383': 'LOXX KING MAN',
      '103412619187974': 'Hayat Cosmetics',
      '801569813029844': 'Liora',
    };
    rules.forEach((r) => {
      if (r.page_id && !map.has(r.page_id)) {
        map.set(r.page_id, knownNames[r.page_id] || `صفحة (${r.page_id})`);
      }
    });
    return Array.from(map.entries()).map(([page_id, name]) => ({ page_id, name }));
  }, [connectedPages, rules]);

  // Filtered Rules by Account/Page and Channel
  const filteredRules = useMemo(() => {
    return rules.filter((rule) => {
      const matchesPage = selectedPageId === 'all' || rule.page_id === selectedPageId;
      let matchesChannel = true;
      if (selectedChannel !== 'all') {
        const ruleChans = rule.channels || [];
        matchesChannel = ruleChans.includes(selectedChannel);
      }
      return matchesPage && matchesChannel;
    });
  }, [rules, selectedPageId, selectedChannel]);

  const openCreateModal = () => {
    setEditingRule(null);
    const initialKws = ['خصم', 'عروض'];
    setKeywords(initialKws);
    setName(suggestSemanticName(initialKws));
    setBrandId('all');
    setChannels(['messenger', 'instagram', 'whatsapp']);
    setMatchType('contains');
    setKeywordInput('');
    setResponseText('');
    setCooldownMinutes(15);
    setIsActive(true);
    setFormError(null);
    setIsModalOpen(true);
  };

  const openEditModal = (rule: AutomationRule) => {
    setEditingRule(rule);
    setName(rule.name);
    setBrandId(rule.brand_id || 'all');
    setChannels(rule.channels || ['messenger', 'instagram', 'whatsapp']);
    setMatchType((rule.match_type as any) || 'contains');
    setKeywordInput('');
    setKeywords(rule.keywords || []);
    setResponseText(rule.response_text || '');
    setCooldownMinutes(rule.cooldown_minutes);
    setIsActive(rule.is_active);
    setFormError(null);
    setIsModalOpen(true);
  };

  const handleAddKeyword = () => {
    const trimmed = keywordInput.trim();
    if (trimmed && !keywords.includes(trimmed)) {
      const nextKws = [...keywords, trimmed];
      setKeywords(nextKws);
      setKeywordInput('');
      if (!name.trim() || name.startsWith('قاعدة:') || name.startsWith('Rule_')) {
        setName(suggestSemanticName(nextKws));
      }
    }
  };

  const handleRemoveKeyword = (kwToRemove: string) => {
    const nextKws = keywords.filter((k) => k !== kwToRemove);
    setKeywords(nextKws);
    if (!name.trim() || name.startsWith('قاعدة:') || name.startsWith('Rule_')) {
      if (nextKws.length > 0) {
        setName(suggestSemanticName(nextKws));
      }
    }
  };

  const handleToggleRuleActive = async (rule: AutomationRule) => {
    const newActive = !rule.is_active;
    setRules((prev) => prev.map((r) => (r.id === rule.id ? { ...r, is_active: newActive } : r)));
    try {
      await automationApi.updateRule(rule.id, { is_active: newActive });
    } catch (e) {
      setRules((prev) => prev.map((r) => (r.id === rule.id ? { ...r, is_active: rule.is_active } : r)));
    }
  };

  const handleDeleteRule = async (id: string) => {
    if (!window.confirm('هل أنت متأكد من رغبتك في حذف قاعدة الأتمتة هذه؟')) return;
    setRules((prev) => prev.filter((r) => r.id !== id));
    try {
      await automationApi.deleteRule(id);
    } catch (e) {
      fetchRulesAndLogs();
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setFormError('يرجى إدخال اسم قاعدة الأتمتة');
      return;
    }
    if (keywords.length === 0) {
      setFormError('يرجى إضافة كلمة مفتاحية واحدة على الأقل');
      return;
    }
    const cleanText = responseText.trim();
    if (!cleanText) {
      setFormError('يرجى إدخال نص الرد التلقائي');
      return;
    }
    setIsSubmitting(true);
    setFormError(null);
    const payload = {
      name: name.trim(),
      brand_id: brandId === 'all' ? null : brandId,
      channels,
      match_type: matchType,
      keywords,
      response_text: cleanText,
      cooldown_minutes: cooldownMinutes,
      is_active: isActive,
    };
    try {
      if (editingRule) {
        const updated = await automationApi.updateRule(editingRule.id, payload);
        setRules((prev) => prev.map((r) => (r.id === editingRule.id ? updated : r)));
      } else {
        const created = await automationApi.createRule(payload);
        setRules((prev) => [created, ...prev]);
      }
      setIsModalOpen(false);
    } catch (err: any) {
      setFormError(err.message || 'حدث خطأ أثناء حفظ قاعدة الأتمتة');
    } finally {
      setIsSubmitting(false);
    }
  };

  const openCreateCommentModal = () => {
    setEditingCommentRule(null);
    setCommentRuleName('');
    setCommentChannel('all');
    setCommentKeywordInput('');
    setCommentKeywords(['بكام', 'السعر', 'تفاصيل']);
    setPublicReplyText('أهلاً بك! تم إرسال تفاصيل الأسعار والعروض في رسالة خاصة 💌');
    setPrivateDmText('أهلاً بك يا فندم! يسعدنا تواصلك، إليك تفاصيل العروض والأسعار الحالية...');
    setAutoHideToxic(true);
    setIsCommentRuleActive(true);
    setCommentFormError(null);
    setIsCommentModalOpen(true);
  };

  const handleAddCommentKeyword = () => {
    const trimmed = commentKeywordInput.trim();
    if (trimmed && !commentKeywords.includes(trimmed)) {
      setCommentKeywords([...commentKeywords, trimmed]);
      setCommentKeywordInput('');
    }
  };

  const handleRemoveCommentKeyword = (kw: string) => {
    setCommentKeywords(commentKeywords.filter((k) => k !== kw));
  };

  const handleDeleteCommentRule = async (ruleId: string) => {
    if (!window.confirm('هل أنت متأكد من رغبتك في حذف قاعدة أتمتة التعليقات هذه؟')) return;
    setCommentRules((prev) => prev.filter((r) => r.id !== ruleId));
    try {
      await commentAutomationApi.deleteCommentAutomation(ruleId);
    } catch (e) {
      fetchCommentRules();
    }
  };

  const handleCommentSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!commentRuleName.trim()) {
      setCommentFormError('يرجى إدخال اسم قاعدة أتمتة التعليقات');
      return;
    }
    if (commentKeywords.length === 0) {
      setCommentFormError('يرجى إدخال كلمة مفتاحية محفزة واحدة على الأقل');
      return;
    }
    setCommentFormError(null);
    try {
      const payload: Partial<CommentAutomationRule> = {
        name: commentRuleName.trim(),
        channel: commentChannel,
        trigger_keywords: commentKeywords,
        public_reply_text: publicReplyText.trim() || null,
        private_dm_text: privateDmText.trim() || null,
        is_active: isCommentRuleActive,
        auto_hide_toxic: autoHideToxic,
      };
      const created = await commentAutomationApi.createCommentAutomation(payload);
      if (created) {
        setCommentRules((prev) => [created, ...prev.filter((r) => r.id !== created.id)]);
      }
      setIsCommentModalOpen(false);
    } catch (err: any) {
      setCommentFormError(err.message || 'فشل حفظ قاعدة أتمتة التعليقات');
    }
  };

  const activeRulesCount = rules.filter((r) => r.is_active).length;

  return (
    <div className="flex-1 bg-slate-50/50 p-6 overflow-y-auto" dir="rtl">
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-6 rounded-3xl border border-slate-200/80 shadow-xs">
          <div className="flex items-center gap-3.5">
            <div className="w-12 h-12 rounded-2xl bg-theme-primary text-white flex items-center justify-center shadow-lg shadow-theme-primary/20">
              <Bot className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-xl font-black text-slate-900 tracking-tight">محرك الأتمتة والردود الذكية</h1>
              <p className="text-xs text-slate-500 font-medium mt-0.5">
                أتمتة الرسائل والمحادثات، وتقسيم الردود، والرد على تعليقات السوشيال ميديا
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center bg-slate-100 p-1 rounded-2xl border border-slate-200/60">
              <button
                onClick={() => setActiveTab('messages')}
                className={`px-4 py-2 rounded-xl text-xs font-bold transition flex items-center gap-1.5 ${
                  activeTab === 'messages' ? 'bg-white text-theme-primary shadow-2xs' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <MessageSquare className="w-3.5 h-3.5 text-theme-primary" />
                <span>أتمتة الرسائل ({rules.length})</span>
              </button>
              <button
                onClick={() => setActiveTab('comments')}
                className={`px-4 py-2 rounded-xl text-xs font-bold transition flex items-center gap-1.5 ${
                  activeTab === 'comments' ? 'bg-white text-theme-primary shadow-2xs' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <MessageCircle className="w-3.5 h-3.5 text-theme-primary" />
                <span>أتمتة التعليقات ({commentRules.length})</span>
              </button>
            </div>
            <button
              onClick={() => setIsModerationModalOpen(true)}
              className="px-4 py-2 rounded-2xl bg-rose-50 hover:bg-rose-100 text-rose-700 text-xs font-bold transition flex items-center gap-1.5 border border-rose-200 shadow-2xs cursor-pointer"
              title="إدارة الكلمات السيئة والمحظورة وتنبيهات الأمان الفورية"
            >
              <ShieldAlert className="w-4 h-4 text-rose-600" />
              <span>🛡️ الكلمات المحظورة والتنبيهات</span>
            </button>
            {activeTab === 'messages' ? (
              <>
                <button
                  onClick={() => setIsLogsModalOpen(true)}
                  className="px-3.5 py-2 rounded-2xl bg-slate-100 hover:bg-slate-200/80 text-slate-700 text-xs font-bold transition flex items-center gap-1.5 border border-slate-200/60"
                >
                  <Activity className="w-4 h-4 text-theme-primary" />
                  <span>السجل ({logs.length})</span>
                </button>
                <button
                  onClick={openCreateModal}
                  className="px-4 py-2 rounded-2xl bg-theme-primary hover:bg-theme-primary-hover text-white text-xs font-bold shadow-md shadow-theme-primary/20 transition flex items-center gap-1.5"
                >
                  <Plus className="w-4 h-4" />
                  <span>إنشاء قاعدة رسائل</span>
                </button>
              </>
            ) : (
              <button
                onClick={openCreateCommentModal}
                className="px-4 py-2 rounded-2xl bg-theme-primary hover:bg-theme-primary-hover text-white text-xs font-bold shadow-md shadow-theme-primary/20 transition flex items-center gap-1.5"
              >
                <Plus className="w-4 h-4" />
                <span>إنشاء قاعدة تعليقات</span>
              </button>
            )}
          </div>
        </div>

        {/* Global Master Automation Switch Card */}
        <div className={`p-5 rounded-3xl border transition-all duration-200 shadow-xs ${
          isGlobalEnabled 
            ? 'bg-gradient-to-r from-emerald-500/10 via-white to-white border-emerald-200/80' 
            : 'bg-gradient-to-r from-rose-500/10 via-white to-white border-rose-200/80'
        }`}>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className={`w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 shadow-sm ${
                isGlobalEnabled
                  ? 'bg-emerald-500 text-white shadow-emerald-500/20'
                  : 'bg-rose-500 text-white shadow-rose-500/20'
              }`}>
                <Power className="w-6 h-6" />
              </div>
              <div className="space-y-1">
                <div className="flex items-center gap-2.5 flex-wrap">
                  <h2 className="text-base font-black text-slate-900">
                    التحكم الشامل بالأتمتة (Master Automation Control)
                  </h2>
                  <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold border transition ${
                    isGlobalEnabled
                      ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
                      : 'bg-rose-50 border-rose-200 text-rose-700'
                  }`}>
                    <span className={`w-2 h-2 rounded-full ${isGlobalEnabled ? 'bg-emerald-500 animate-pulse' : 'bg-rose-500'}`} />
                    {isGlobalEnabled ? 'كافة القواعد مفعلة 🟢' : 'كافة القواعد متوقفة مؤقتاً 🔴'}
                  </span>
                </div>
                <p className="text-xs text-slate-500 font-medium">
                  {isGlobalEnabled
                    ? 'المحرك الآلي يعمل بنشاط ويستجيب تلقائياً لرسائل العملاء الواردة على كافة القنوات والصفحات المعتمدة.'
                    : 'محرك الأتمتة متوقف شمولياً — لن يتم إرسال أي ردود آلية للعملاء على أي منصة أو حساب حتى إعادة التفعيل.'}
                </p>
              </div>
            </div>

            {/* Master Switch Action Switch with instant feedback */}
            <div className="flex items-center gap-3 self-end sm:self-center">
              {globalToggleError && (
                <span className="text-xs text-rose-600 font-bold">{globalToggleError}</span>
              )}
              <button
                type="button"
                role="switch"
                aria-checked={isGlobalEnabled}
                disabled={isTogglingGlobal}
                onClick={handleToggleGlobal}
                className={`w-16 h-8 flex items-center rounded-full p-1 cursor-pointer transition-colors duration-200 ${
                  isGlobalEnabled ? 'bg-emerald-500 justify-start' : 'bg-slate-300 justify-end'
                } ${isTogglingGlobal ? 'opacity-60 cursor-wait' : ''}`}
                title={isGlobalEnabled ? 'إيقاف تشغيل الأتمتة بالكامل' : 'تشغيل الأتمتة بالكامل'}
              >
                <div className="w-6 h-6 rounded-full bg-white shadow-md transform transition-all duration-200" />
              </button>
            </div>
          </div>
        </div>

        {activeTab === 'messages' && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs flex items-center justify-between">
                <div>
                  <p className="text-xs font-semibold text-slate-500">إجمالي قواعد المحادثات</p>
                  <h3 className="text-2xl font-black text-slate-900 mt-1">{rules.length}</h3>
                </div>
                <div className="w-10 h-10 rounded-xl bg-slate-100 text-slate-700 flex items-center justify-center font-bold">
                  <Zap className="w-5 h-5" />
                </div>
              </div>
              <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs flex items-center justify-between">
                <div>
                  <p className="text-xs font-semibold text-slate-500">القواعد النشطة</p>
                  <h3 className="text-2xl font-black text-theme-primary mt-1">{activeRulesCount}</h3>
                </div>
                <div className="w-10 h-10 rounded-xl bg-theme-primary-tint text-theme-primary flex items-center justify-center font-bold">
                  <Power className="w-5 h-5" />
                </div>
              </div>
              <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs flex items-center justify-between">
                <div>
                  <p className="text-xs font-semibold text-slate-500">إجمالي الردود المنفذة</p>
                  <h3 className="text-2xl font-black text-indigo-700 mt-1">{logs.length}</h3>
                </div>
                <div className="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-700 flex items-center justify-center font-bold">
                  <ShieldCheck className="w-5 h-5" />
                </div>
              </div>
            </div>

            {/* Advanced Multi-Filter Bar (by Account/Page and Independent Channels) */}
            <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-4">
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3.5 flex-1 flex-wrap">
                {/* Account / Page Dropdown Filter */}
                <div className="flex items-center gap-2">
                  <div className="flex items-center gap-1.5 text-xs font-bold text-slate-700 shrink-0">
                    <Layers className="w-4 h-4 text-theme-primary" />
                    <span>الحساب / الصفحة:</span>
                  </div>
                  <select
                    value={selectedPageId}
                    onChange={(e) => setSelectedPageId(e.target.value)}
                    className="px-3 py-2 bg-slate-50 hover:bg-slate-100/80 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:border-theme-primary transition cursor-pointer min-w-[200px]"
                  >
                    <option value="all">جميع الحسابات والصفحات (All Accounts)</option>
                    {availablePages.map((page) => (
                      <option key={page.page_id} value={page.page_id}>
                        {page.name}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Independent Channel Segmented Pill Bar */}
                <div className="flex items-center gap-2 flex-wrap">
                  <div className="flex items-center gap-1.5 text-xs font-bold text-slate-700 shrink-0">
                    <Filter className="w-4 h-4 text-theme-primary" />
                    <span>القناة:</span>
                  </div>
                  <div className="flex items-center bg-slate-100 p-1 rounded-xl border border-slate-200/60 flex-wrap gap-1">
                    {[
                      { id: 'all', label: 'الكل (جميع القنوات)' },
                      { id: 'whatsapp', label: 'واتساب (WhatsApp)' },
                      { id: 'messenger', label: 'ماسنجر (Messenger)' },
                      { id: 'instagram', label: 'إنستغرام (Instagram)' },
                    ].map((chan) => {
                      const isSelected = selectedChannel === chan.id;
                      return (
                        <button
                          key={chan.id}
                          type="button"
                          onClick={() => setSelectedChannel(chan.id)}
                          className={`px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
                            isSelected
                              ? 'bg-white text-theme-primary shadow-2xs'
                              : 'text-slate-600 hover:text-slate-900'
                          }`}
                        >
                          {chan.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* Dynamic Counter & Reset Filter Option */}
              <div className="flex items-center justify-between sm:justify-end gap-2.5 shrink-0 border-t lg:border-t-0 pt-2 lg:pt-0 border-slate-100">
                <div className="px-3 py-1.5 bg-slate-100 rounded-xl border border-slate-200/70 text-xs font-bold text-slate-700 flex items-center gap-1.5">
                  <Bot className="w-3.5 h-3.5 text-theme-primary" />
                  <span>
                    عرض <span className="text-theme-primary font-black">{filteredRules.length}</span> من أصل{' '}
                    <span className="text-slate-900 font-black">{rules.length}</span> قاعدة
                  </span>
                </div>

                {(selectedPageId !== 'all' || selectedChannel !== 'all') && (
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedPageId('all');
                      setSelectedChannel('all');
                    }}
                    className="px-2.5 py-1.5 text-xs font-bold text-rose-600 hover:bg-rose-50 rounded-xl transition border border-rose-200 flex items-center gap-1 cursor-pointer"
                    title="إعادة تعيين الفلاتر"
                  >
                    <X className="w-3.5 h-3.5" />
                    <span>إلغاء الفلترة</span>
                  </button>
                )}
              </div>
            </div>

            {isLoading ? (
              <div className="bg-white p-12 rounded-3xl border border-slate-200/80 text-center text-slate-400 text-xs font-medium">جاري تحميل قواعد الأتمتة...</div>
            ) : rules.length === 0 ? (
              <div className="bg-white p-12 rounded-3xl border border-slate-200/80 text-center space-y-3">
                <div className="w-12 h-12 rounded-2xl bg-slate-100 text-slate-400 flex items-center justify-center mx-auto">
                  <Bot className="w-6 h-6" />
                </div>
                <h3 className="text-sm font-bold text-slate-800">لا توجد قواعد أتمتة رسائل حتى الآن</h3>
                <p className="text-xs text-slate-500">قم بإنشاء قاعدتك الأولى للرد التلقائي المقسم على استفسارات العملاء</p>
                <button
                  onClick={openCreateModal}
                  className="px-4 py-2 bg-theme-primary hover:bg-theme-primary-hover text-white rounded-xl text-xs font-bold transition inline-flex items-center gap-1.5"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>إضافة قاعدة</span>
                </button>
              </div>
            ) : filteredRules.length === 0 ? (
              <div className="bg-white p-12 rounded-3xl border border-slate-200/80 text-center space-y-3">
                <div className="w-12 h-12 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center mx-auto">
                  <Filter className="w-6 h-6" />
                </div>
                <h3 className="text-sm font-bold text-slate-800">لا توجد قواعد أتمتة تطابق الفلاتر المحددة</h3>
                <p className="text-xs text-slate-500">جرب تغيير الحساب/الصفحة أو القناة لعرض القواعد المرتبطة</p>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedPageId('all');
                    setSelectedChannel('all');
                  }}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition inline-flex items-center gap-1.5 cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                  <span>إعادة ضبط الفلاتر</span>
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {filteredRules.map((rule) => {
                  const brandObj = rule.brand_id && rule.brand_id !== 'all' ? getBrandObject(rule.brand_id, rule.brand_id) : null;
                  const pageMatch = availablePages.find((p) => p.page_id === rule.page_id);
                  const pageDisplayName = pageMatch ? pageMatch.name : (rule.page_id ? `صفحة (${rule.page_id})` : null);
                  const bubbles = (rule.response_text || '')
                    .split(/[\r\n]+/)
                    .map((p) => p.trim())
                    .filter(Boolean);
                  return (
                    <div key={rule.id} className={`bg-white rounded-2xl border p-5 shadow-xs transition duration-150 space-y-4 ${rule.is_active ? 'border-slate-200 hover:border-theme-primary/40' : 'border-slate-200/60 opacity-65 bg-slate-50/40'}`}>
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="flex items-center gap-2">
                            <h3 className="text-sm font-bold text-slate-900">{rule.name}</h3>
                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${rule.is_active ? 'bg-theme-primary-tint text-theme-primary border border-theme-primary/20' : 'bg-slate-100 text-slate-500'}`}>
                              {rule.is_active ? 'نشطة' : 'متوقفة'}
                            </span>
                          </div>
                          <p className="text-[11px] text-slate-400 font-medium mt-0.5">
                            {pageDisplayName ? `الصفحة: ${pageDisplayName}` : (brandObj ? `البراند: ${brandObj.name}` : 'كل البراندات')} | التهدئة: {rule.cooldown_minutes} دقيقة
                          </p>
                        </div>
                        <button
                          onClick={() => handleToggleRuleActive(rule)}
                          className={`p-2 rounded-xl transition ${rule.is_active ? 'bg-theme-primary-tint text-theme-primary hover:bg-theme-primary-subtle' : 'bg-slate-100 text-slate-400 hover:bg-slate-200'}`}
                          title={rule.is_active ? 'إيقاف القاعدة' : 'تفعيل القاعدة'}
                        >
                          <Power className="w-4 h-4" />
                        </button>
                      </div>
                      <div className="space-y-2.5">
                        <div>
                          <p className="text-[11px] font-bold text-slate-500 mb-1.5">الكلمات المفتاحية المحفزة:</p>
                          <div className="flex flex-wrap gap-1.5">
                            {rule.keywords.map((kw, i) => (
                              <span key={i} className="px-2 py-0.5 bg-slate-100 text-slate-700 text-[11px] font-bold rounded-lg border border-slate-200/80 flex items-center gap-1">
                                <Tag className="w-2.5 h-2.5 text-slate-400" />
                                {kw}
                              </span>
                            ))}
                          </div>
                        </div>
                        <div className="p-3 bg-slate-50 rounded-xl border border-slate-100 space-y-1.5">
                          <div className="flex items-center justify-between text-[10px] font-bold text-slate-500">
                            <span>الردود المتتالية ({bubbles.length} رسالة):</span>
                            <span className="text-theme-primary font-semibold flex items-center gap-1"><Sparkles className="w-3 h-3" /> إرسال متتالي تلقائي</span>
                          </div>
                          <div className="space-y-1">
                            {bubbles.map((b, idx) => (
                              <div key={idx} className="flex items-start gap-1.5 bg-white p-2 rounded-lg border border-slate-200/70 text-xs">
                                <span className="w-4 h-4 rounded-full bg-theme-primary-tint text-theme-primary text-[10px] font-black flex items-center justify-center shrink-0">{idx + 1}</span>
                                <p className="text-slate-700 line-clamp-1 font-medium">{b}</p>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center justify-between border-t border-slate-100 pt-3 text-xs">
                        <span className="text-[11px] text-slate-400">القنوات: {(rule.channels || []).join(', ')}</span>
                        <div className="flex items-center gap-1">
                          <button onClick={() => openEditModal(rule)} className="p-1.5 text-slate-500 hover:text-theme-primary hover:bg-theme-primary-tint rounded-lg transition" title="تعديل"><Edit3 className="w-4 h-4" /></button>
                          <button onClick={() => handleDeleteRule(rule.id)} className="p-1.5 text-slate-500 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition" title="حذف"><Trash2 className="w-4 h-4" /></button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {activeTab === 'comments' && (
          <div className="space-y-6">
            <div className="bg-gradient-to-r from-theme-primary-tint via-theme-primary-subtle to-transparent border border-theme-primary/20 p-4 rounded-2xl flex items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-theme-primary text-white flex items-center justify-center shrink-0 shadow-md shadow-theme-primary/20 font-bold"><MessageCircle className="w-5 h-5" /></div>
                <div>
                  <h4 className="text-xs font-bold text-slate-900">أتمتة التعليقات على فيسبوك وإنستغرام (Social Comment Automations)</h4>
                  <p className="text-[11px] text-slate-500 mt-0.5">الرد التلقائي على التعليقات وإرسال رسائل خاصة (DM) وإخفاء التعليقات السلبية</p>
                </div>
              </div>
              <button onClick={openCreateCommentModal} className="px-4 py-2 bg-theme-primary hover:bg-theme-primary-hover text-white text-xs font-bold rounded-xl transition shrink-0 shadow-xs flex items-center gap-1.5"><Plus className="w-3.5 h-3.5" /> <span>إضافة قاعدة تعليقات</span></button>
            </div>
            {isLoadingCommentRules ? (
              <div className="bg-white p-12 rounded-3xl border border-slate-200/80 text-center text-slate-400 text-xs font-medium">جاري تحميل قواعد أتمتة التعليقات...</div>
            ) : commentRules.length === 0 ? (
              <div className="bg-white p-12 rounded-3xl border border-slate-200/80 text-center space-y-3">
                <div className="w-12 h-12 rounded-2xl bg-theme-primary-tint text-theme-primary flex items-center justify-center mx-auto"><MessageCircle className="w-6 h-6" /></div>
                <h3 className="text-sm font-bold text-slate-800">لا توجد قواعد أتمتة تعليقات مضافة</h3>
                <p className="text-xs text-slate-500">قم بإنشاء قاعدة للرد على تعليقات الاستفسار عن الأسعار تلقائياً</p>
                <button onClick={openCreateCommentModal} className="px-4 py-2 bg-theme-primary hover:bg-theme-primary-hover text-white rounded-xl text-xs font-bold transition inline-flex items-center gap-1.5"><Plus className="w-3.5 h-3.5" /> <span>إنشاء أول قاعدة تعليقات</span></button>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {commentRules.map((cRule) => (
                  <div key={cRule.id} className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs space-y-4 hover:border-theme-primary/40 transition">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="text-sm font-bold text-slate-900">{cRule.name}</h3>
                          <span className="px-2 py-0.5 bg-blue-50 text-blue-700 border border-blue-200 text-[10px] font-bold rounded-full">{cRule.channel}</span>
                        </div>
                        <p className="text-[11px] text-slate-400 font-medium mt-0.5">{cRule.auto_hide_toxic ? '🛡️ إخفاء تلقائي للمسيء مفعّل' : 'إخفاء التعليقات غير مفعّل'}</p>
                      </div>
                      <button onClick={() => handleDeleteCommentRule(cRule.id)} className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition" title="حذف القاعدة"><Trash2 className="w-4 h-4" /></button>
                    </div>
                    <div className="space-y-2">
                      <div>
                        <p className="text-[11px] font-bold text-slate-500 mb-1">الكلمات المفتاحية:</p>
                        <div className="flex flex-wrap gap-1">
                          {(cRule.trigger_keywords || []).map((k, i) => (<span key={i} className="px-2 py-0.5 bg-slate-100 text-slate-700 text-[10px] font-bold rounded-md">{k}</span>))}
                        </div>
                      </div>
                      {cRule.public_reply_text && (
                        <div className="p-2.5 bg-slate-50 rounded-xl border border-slate-100 text-xs"><span className="text-[10px] font-bold text-slate-500 block mb-0.5">الرد العلني:</span><p className="text-slate-700 font-medium">{cRule.public_reply_text}</p></div>
                      )}
                      {cRule.private_dm_text && (
                        <div className="p-2.5 bg-theme-primary-subtle rounded-xl border border-theme-primary/20 text-xs"><span className="text-[10px] font-bold text-theme-primary block mb-0.5">الرسالة الخاصة (DM):</span><p className="text-slate-900 font-medium">{cRule.private_dm_text}</p></div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-2xl w-full p-6 shadow-2xl border border-slate-200 space-y-5 animate-in fade-in zoom-in-95 duration-150 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-theme-primary-tint text-theme-primary flex items-center justify-center font-bold"><Bot className="w-5 h-5" /></div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900">{editingRule ? 'تعديل قاعدة أتمتة الرسائل' : 'إنشاء قاعدة أتمتة رسائل جديدة'}</h3>
                  <p className="text-[11px] text-slate-500">حدد الكلمات المفتاحية والردود المتتالية المنفصلة</p>
                </div>
              </div>
              <button onClick={() => setIsModalOpen(false)} className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-xl cursor-pointer"><X className="w-4 h-4" /></button>
            </div>
            {formError && (<div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 rounded-xl text-xs font-semibold flex items-center gap-2"><AlertCircle className="w-4 h-4" /> <span>{formError}</span></div>)}
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-xs font-bold text-slate-700">اسم القاعدة:</label>
                  {keywords.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setName(suggestSemanticName(keywords))}
                      className="text-[11px] text-theme-primary hover:text-theme-primary-hover font-bold flex items-center gap-1 cursor-pointer transition"
                      title="اقتراح اسم تلقائي بناءً على الكلمات المفتاحية"
                    >
                      <Sparkles className="w-3 h-3" />
                      <span>اقتراح اسم تلقائي 🪄</span>
                    </button>
                  )}
                </div>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="مثال: قاعدة: استفسار السعر"
                  className="w-full bg-slate-50 text-xs font-medium text-slate-900 px-3.5 py-2.5 rounded-xl border border-slate-200 focus:bg-white focus:outline-none focus:ring-2 focus:ring-theme-primary/20 focus:border-theme-primary"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">البراند:</label>
                  <select value={brandId} onChange={(e) => setBrandId(e.target.value)} className="w-full bg-slate-50 text-xs font-medium text-slate-900 px-3 py-2.5 rounded-xl border border-slate-200 focus:bg-white focus:outline-none focus:ring-2 focus:ring-theme-primary/20 focus:border-theme-primary cursor-pointer">
                    <option value="all">كل البراندات (Global)</option>
                    {brands.filter((b) => b.id !== 'all').map((b) => (<option key={b.id} value={b.id}>{b.name}</option>))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">نوع المطابقة:</label>
                  <select value={matchType} onChange={(e) => setMatchType(e.target.value as any)} className="w-full bg-slate-50 text-xs font-medium text-slate-900 px-3 py-2.5 rounded-xl border border-slate-200 focus:bg-white focus:outline-none focus:ring-2 focus:ring-theme-primary/20 focus:border-theme-primary cursor-pointer">
                    <option value="contains">يحتوي على</option>
                    <option value="exact">مطابقة تامة</option>
                    <option value="regex">تعبير نمطي</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">القنوات المفعلة:</label>
                <div className="flex items-center gap-3">
                  {['messenger', 'instagram', 'whatsapp'].map((ch) => (
                    <label key={ch} className="flex items-center gap-1.5 text-xs font-semibold text-slate-700 cursor-pointer select-none">
                      <input type="checkbox" checked={channels.includes(ch)} onChange={() => { if(channels.includes(ch) && channels.length > 1) setChannels(channels.filter(c => c !== ch)); else if(!channels.includes(ch)) setChannels([...channels, ch]); }} className="rounded text-theme-primary focus:ring-theme-primary accent-theme-primary" />
                      <span className="capitalize">{ch}</span>
                    </label>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">الكلمات المفتاحية:</label>
                <div className="flex items-center gap-2">
                  <input type="text" value={keywordInput} onChange={(e) => setKeywordInput(e.target.value)} onKeyDown={(e) => { if(e.key === 'Enter') { e.preventDefault(); handleAddKeyword(); } }} placeholder="اكتب ثم اضغط إضافة..." className="flex-1 bg-slate-50 text-xs font-medium text-slate-900 px-3.5 py-2 rounded-xl border border-slate-200 focus:bg-white focus:outline-none focus:ring-2 focus:ring-theme-primary/20 focus:border-theme-primary" />
                  <button type="button" onClick={handleAddKeyword} className="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl transition cursor-pointer">إضافة</button>
                </div>
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {keywords.map((kw, idx) => (
                    <span key={idx} className="px-2.5 py-1 bg-theme-primary-tint text-theme-primary text-xs font-bold rounded-lg border border-theme-primary/20 flex items-center gap-1.5">
                      <span>{kw}</span>
                      <button type="button" onClick={() => handleRemoveKeyword(kw)} className="text-theme-primary/70 hover:text-theme-primary cursor-pointer">✕</button>
                    </span>
                  ))}
                </div>
              </div>

              {/* Single Consolidated Response Textarea with Sequential Message Note */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="block text-xs font-bold text-slate-700">نص الرد التلقائي:</label>
                  <span className="text-[11px] text-theme-primary font-bold flex items-center gap-1 bg-theme-primary-tint px-2.5 py-0.5 rounded-lg border border-theme-primary/20">
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>إرسال تسلسلي ذكي</span>
                  </span>
                </div>
                <textarea
                  rows={5}
                  required
                  value={responseText}
                  onChange={(e) => setResponseText(e.target.value)}
                  placeholder="اكتب رسالة الرد التلقائي هنا...
يمكنك كتابة عدة فقرات أو أسطر مفصولة، وسيقوم النظام بإرسال كل فقرة كرسالة منفصلة بشكل متتالي للعميل."
                  className="w-full bg-slate-50 text-xs font-medium text-slate-900 p-3.5 rounded-2xl border border-slate-200 focus:bg-white focus:outline-none focus:ring-2 focus:ring-theme-primary/20 focus:border-theme-primary leading-relaxed shadow-2xs"
                />
                <div className="p-2.5 bg-blue-50/70 border border-blue-100 rounded-xl text-xs text-blue-900 flex items-center gap-2">
                  <span className="text-sm shrink-0">💡</span>
                  <span className="font-semibold text-[11px]">
                    ملاحظة: كل سطر جديد أو فقرة مفصولة ستصل للعميل كرسالة منفصلة تلقائياً.
                  </span>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">فترة التهدئة (بالدقائق):</label>
                <input type="number" min={0} value={cooldownMinutes} onChange={(e) => setCooldownMinutes(Number(e.target.value))} className="w-full bg-slate-50 text-xs font-medium p-2.5 rounded-xl border border-slate-200" />
              </div>
              <div className="flex items-center justify-end gap-2 pt-3 border-t">
                <button type="button" onClick={() => setIsModalOpen(false)} className="px-4 py-2.5 rounded-xl text-xs font-semibold text-slate-600 cursor-pointer hover:bg-slate-100">إلغاء</button>
                <button type="submit" disabled={isSubmitting} className="px-5 py-2.5 rounded-xl bg-theme-primary hover:bg-theme-primary-hover text-white text-xs font-bold shadow-xs disabled:opacity-50 cursor-pointer">{isSubmitting ? 'جاري الحفظ...' : 'حفظ القاعدة'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {isCommentModalOpen && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-xl w-full p-6 shadow-2xl border border-slate-200 space-y-4 animate-in fade-in zoom-in-95 duration-150 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b pb-3">
              <h3 className="text-sm font-bold">إنشاء قاعدة أتمتة للتعليقات</h3>
              <button onClick={() => setIsCommentModalOpen(false)} className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-xl"><X className="w-4 h-4" /></button>
            </div>
            <form onSubmit={handleCommentSubmit} className="space-y-3.5">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">اسم القاعدة:</label>
                <input type="text" required value={commentRuleName} onChange={(e) => setCommentRuleName(e.target.value)} className="w-full bg-slate-50 text-xs p-2.5 rounded-xl border border-slate-200 focus:bg-white focus:outline-none focus:ring-2 focus:ring-theme-primary/20 focus:border-theme-primary" />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">المنصة:</label>
                <select value={commentChannel} onChange={(e) => setCommentChannel(e.target.value as any)} className="w-full bg-slate-50 text-xs p-2.5 rounded-xl border border-slate-200 focus:bg-white focus:outline-none focus:ring-2 focus:ring-theme-primary/20 focus:border-theme-primary cursor-pointer">
                  <option value="all">فيسبوك وإنستغرام</option>
                  <option value="facebook">فيسبوك</option>
                  <option value="instagram">إنستغرام</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">الكلمات المفتاحية:</label>
                <div className="flex items-center gap-2">
                  <input type="text" value={commentKeywordInput} onChange={(e) => setCommentKeywordInput(e.target.value)} onKeyDown={(e) => { if(e.key === 'Enter') { e.preventDefault(); handleAddCommentKeyword(); } }} className="flex-1 bg-slate-50 text-xs p-2.5 rounded-xl border border-slate-200 focus:bg-white focus:outline-none focus:ring-2 focus:ring-theme-primary/20 focus:border-theme-primary" />
                  <button type="button" onClick={handleAddCommentKeyword} className="px-3.5 py-2 bg-slate-100 font-bold text-xs rounded-xl">إضافة</button>
                </div>
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">الرد العلني:</label>
                <textarea rows={2} value={publicReplyText} onChange={(e) => setPublicReplyText(e.target.value)} className="w-full bg-slate-50 text-xs p-2.5 rounded-xl border border-slate-200 focus:bg-white focus:outline-none focus:ring-2 focus:ring-theme-primary/20 focus:border-theme-primary" />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">الرسالة الخاصة (DM):</label>
                <textarea rows={2} value={privateDmText} onChange={(e) => setPrivateDmText(e.target.value)} className="w-full bg-slate-50 text-xs p-2.5 rounded-xl border border-slate-200 focus:bg-white focus:outline-none focus:ring-2 focus:ring-theme-primary/20 focus:border-theme-primary" />
              </div>
              <div className="pt-2 border-t flex items-center justify-between">
                <label className="flex items-center gap-2 text-xs font-bold cursor-pointer"><input type="checkbox" checked={autoHideToxic} onChange={(e) => setAutoHideToxic(e.target.checked)} /> إخفاء التعليق المسيء تلقائياً</label>
              </div>
              <div className="flex items-center justify-end gap-2 pt-3 border-t">
                <button type="button" onClick={() => setIsCommentModalOpen(false)} className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600">إلغاء</button>
                <button type="submit" className="px-5 py-2 rounded-xl bg-theme-primary hover:bg-theme-primary-hover text-white text-xs font-bold shadow-xs transition">حفظ قاعدة التعليق</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {isLogsModalOpen && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-2xl w-full p-6 shadow-2xl border border-slate-200 space-y-4 animate-in fade-in zoom-in-95 duration-150 max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between border-b pb-3 shrink-0">
              <div className="flex items-center gap-2"><Activity className="w-5 h-5 text-theme-primary" /> <h3 className="text-sm font-bold">سجل التنفيذ للأتمتة</h3></div>
              <button onClick={() => setIsLogsModalOpen(false)} className="p-1 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-xl"><X className="w-4 h-4" /></button>
            </div>
            <div className="flex-1 overflow-y-auto space-y-2 pr-1">
              {logs.length === 0 ? <p className="text-center text-slate-400 text-xs py-8">لا يوجد سجلات تنفيذ سابقة</p> : logs.map((log) => (
                <div key={log.id} className="p-3 bg-slate-50 rounded-xl border text-xs flex items-center justify-between">
                  <div>
                    <span className="font-bold">{log.rule_name || 'قاعدة أتمتة'}</span>
                    <p className="text-[11px] text-slate-500 font-mono mt-0.5">العميل: {log.customer_id.substring(0, 8)}... | {new Date(log.executed_at).toLocaleString('ar-EG')}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Bad Words & Live Chat Moderation Pop-up Modal */}
      <BadWordsModerationModal
        isOpen={isModerationModalOpen}
        onClose={() => setIsModerationModalOpen(false)}
      />
    </div>
  );
};

export { AutomationsManager as AutomationPage };
export default AutomationsManager;

