import React, { useState, useEffect } from 'react';
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
} from 'lucide-react';
import {
  automationApi,
  AutomationRule,
  AutomationExecutionLog,
  commentAutomationApi,
  MOCK_BRANDS,
} from '../../services/api';
import { CommentAutomationRule } from '../../types/crm';
import { BadWordsModerationModal } from './components/BadWordsModerationModal';

interface MessageBlock {
  id: string;
  text: string;
  delaySeconds: number;
}

export const AutomationsManager: React.FC = () => {
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

  const [messageBlocks, setMessageBlocks] = useState<MessageBlock[]>([
    { id: '1', text: '', delaySeconds: 0 },
  ]);
  const [enableHumanTyping, setEnableHumanTyping] = useState(true);
  const [typingSpeed, setTypingSpeed] = useState<'fast' | 'natural' | 'careful'>('natural');

  const [isPreviewRunning, setIsPreviewRunning] = useState(false);
  const [simulatedSentIndex, setSimulatedSentIndex] = useState<number>(-1);
  const [simulatedIsTyping, setSimulatedIsTyping] = useState(false);

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

  useEffect(() => {
    fetchRulesAndLogs();
    fetchCommentRules();
  }, []);

  const openCreateModal = () => {
    setEditingRule(null);
    setName('');
    setBrandId('all');
    setChannels(['messenger', 'instagram', 'whatsapp']);
    setMatchType('contains');
    setKeywordInput('');
    setKeywords(['خصم', 'عروض']);
    setMessageBlocks([{ id: '1', text: '', delaySeconds: 0 }]);
    setEnableHumanTyping(true);
    setTypingSpeed('natural');
    setCooldownMinutes(15);
    setIsActive(true);
    setFormError(null);
    setIsPreviewRunning(false);
    setSimulatedSentIndex(-1);
    setSimulatedIsTyping(false);
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
    const rawText = rule.response_text || '';
    const parts = rawText.split('\n\n').filter((p) => p.trim());
    if (parts.length > 0) {
      setMessageBlocks(
        parts.map((p, idx) => ({
          id: String(idx + 1),
          text: p.trim(),
          delaySeconds: idx === 0 ? 0 : idx * 3,
        }))
      );
    } else {
      setMessageBlocks([{ id: '1', text: rawText, delaySeconds: 0 }]);
    }
    setEnableHumanTyping(true);
    setTypingSpeed('natural');
    setCooldownMinutes(rule.cooldown_minutes);
    setIsActive(rule.is_active);
    setFormError(null);
    setIsPreviewRunning(false);
    setSimulatedSentIndex(-1);
    setSimulatedIsTyping(false);
    setIsModalOpen(true);
  };

  const handleAddMessageBlock = () => {
    const nextId = String(messageBlocks.length + 1);
    const lastDelay = messageBlocks[messageBlocks.length - 1]?.delaySeconds || 0;
    setMessageBlocks([...messageBlocks, { id: nextId, text: '', delaySeconds: lastDelay + 3 }]);
  };

  const handleRemoveMessageBlock = (id: string) => {
    if (messageBlocks.length <= 1) return;
    setMessageBlocks(messageBlocks.filter((b) => b.id !== id));
  };

  const handleUpdateMessageBlock = (id: string, field: 'text' | 'delaySeconds', value: any) => {
    setMessageBlocks(
      messageBlocks.map((b) => (b.id === id ? { ...b, [field]: value } : b))
    );
  };

  const handleRunPreviewSimulation = () => {
    if (isPreviewRunning) return;
    setIsPreviewRunning(true);
    setSimulatedSentIndex(-1);
    setSimulatedIsTyping(true);

    let current = 0;
    const runStep = () => {
      if (current >= messageBlocks.length) {
        setSimulatedIsTyping(false);
        setIsPreviewRunning(false);
        return;
      }
      setSimulatedIsTyping(true);
      setTimeout(() => {
        setSimulatedSentIndex(current);
        setSimulatedIsTyping(false);
        current++;
        if (current < messageBlocks.length) {
          const delay = Math.max(1000, (messageBlocks[current]?.delaySeconds || 2) * 500);
          setTimeout(runStep, delay);
        } else {
          setIsPreviewRunning(false);
        }
      }, 1200);
    };
    setTimeout(runStep, 800);
  };

  const handleAddKeyword = () => {
    const trimmed = keywordInput.trim();
    if (trimmed && !keywords.includes(trimmed)) {
      setKeywords([...keywords, trimmed]);
      setKeywordInput('');
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
    const compiledText = messageBlocks.map((b) => b.text.trim()).filter(Boolean).join('\n\n');
    if (!compiledText) {
      setFormError('يرجى إدخال نص رسالة واحدة على الأقل');
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
      response_text: compiledText,
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
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-teal-600 to-teal-700 text-white flex items-center justify-center shadow-lg shadow-teal-600/20">
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
                  activeTab === 'messages' ? 'bg-white text-teal-800 shadow-2xs' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <MessageSquare className="w-3.5 h-3.5 text-teal-600" />
                <span>أتمتة الرسائل ({rules.length})</span>
              </button>
              <button
                onClick={() => setActiveTab('comments')}
                className={`px-4 py-2 rounded-xl text-xs font-bold transition flex items-center gap-1.5 ${
                  activeTab === 'comments' ? 'bg-white text-blue-800 shadow-2xs' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <MessageCircle className="w-3.5 h-3.5 text-blue-600" />
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
                  <Activity className="w-4 h-4 text-teal-600" />
                  <span>السجل ({logs.length})</span>
                </button>
                <button
                  onClick={openCreateModal}
                  className="px-4 py-2 rounded-2xl bg-gradient-to-r from-teal-600 to-teal-700 hover:from-teal-700 hover:to-teal-800 text-white text-xs font-bold shadow-md shadow-teal-600/20 transition flex items-center gap-1.5"
                >
                  <Plus className="w-4 h-4" />
                  <span>إنشاء قاعدة رسائل</span>
                </button>
              </>
            ) : (
              <button
                onClick={openCreateCommentModal}
                className="px-4 py-2 rounded-2xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white text-xs font-bold shadow-md shadow-blue-600/20 transition flex items-center gap-1.5"
              >
                <Plus className="w-4 h-4" />
                <span>إنشاء قاعدة تعليقات</span>
              </button>
            )}
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
                  <h3 className="text-2xl font-black text-teal-700 mt-1">{activeRulesCount}</h3>
                </div>
                <div className="w-10 h-10 rounded-xl bg-teal-50 text-teal-700 flex items-center justify-center font-bold">
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
                  className="px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white rounded-xl text-xs font-bold transition inline-flex items-center gap-1.5"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>إضافة قاعدة</span>
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {rules.map((rule) => {
                  const brandObj = MOCK_BRANDS.find((b) => b.id === rule.brand_id);
                  const bubbles = (rule.response_text || '').split('\n\n').filter(Boolean);
                  return (
                    <div key={rule.id} className={`bg-white rounded-2xl border p-5 shadow-xs transition duration-150 space-y-4 ${rule.is_active ? 'border-slate-200 hover:border-teal-300' : 'border-slate-200/60 opacity-65 bg-slate-50/40'}`}>
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="flex items-center gap-2">
                            <h3 className="text-sm font-bold text-slate-900">{rule.name}</h3>
                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${rule.is_active ? 'bg-teal-50 text-teal-700 border border-teal-200' : 'bg-slate-100 text-slate-500'}`}>
                              {rule.is_active ? 'نشطة' : 'متوقفة'}
                            </span>
                          </div>
                          <p className="text-[11px] text-slate-400 font-medium mt-0.5">
                            البراند: {brandObj ? brandObj.name : 'كل البراندات'} | التهدئة: {rule.cooldown_minutes} دقيقة
                          </p>
                        </div>
                        <button
                          onClick={() => handleToggleRuleActive(rule)}
                          className={`p-2 rounded-xl transition ${rule.is_active ? 'bg-teal-50 text-teal-700 hover:bg-teal-100' : 'bg-slate-100 text-slate-400 hover:bg-slate-200'}`}
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
                            <span>الردود المتتالية ({bubbles.length} فقرة):</span>
                            <span className="text-teal-700 font-semibold flex items-center gap-1"><Sparkles className="w-3 h-3" /> إرسال متتالي</span>
                          </div>
                          <div className="space-y-1">
                            {bubbles.map((b, idx) => (
                              <div key={idx} className="flex items-start gap-1.5 bg-white p-2 rounded-lg border border-slate-200/70 text-xs">
                                <span className="w-4 h-4 rounded-full bg-teal-100 text-teal-800 text-[10px] font-black flex items-center justify-center shrink-0">{idx + 1}</span>
                                <p className="text-slate-700 line-clamp-1 font-medium">{b}</p>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center justify-between border-t border-slate-100 pt-3 text-xs">
                        <span className="text-[11px] text-slate-400">القنوات: {(rule.channels || []).join(', ')}</span>
                        <div className="flex items-center gap-1">
                          <button onClick={() => openEditModal(rule)} className="p-1.5 text-slate-500 hover:text-teal-700 hover:bg-teal-50 rounded-lg transition" title="تعديل"><Edit3 className="w-4 h-4" /></button>
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
            <div className="bg-gradient-to-r from-blue-500/10 via-indigo-500/5 to-transparent border border-blue-200/80 p-4 rounded-2xl flex items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-blue-600 text-white flex items-center justify-center shrink-0 shadow-md shadow-blue-500/20 font-bold"><MessageCircle className="w-5 h-5" /></div>
                <div>
                  <h4 className="text-xs font-bold text-slate-900">أتمتة التعليقات على فيسبوك وإنستغرام (Social Comment Automations)</h4>
                  <p className="text-[11px] text-slate-500 mt-0.5">الرد التلقائي على التعليقات وإرسال رسائل خاصة (DM) وإخفاء التعليقات السلبية</p>
                </div>
              </div>
              <button onClick={openCreateCommentModal} className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl transition shrink-0 shadow-xs flex items-center gap-1.5"><Plus className="w-3.5 h-3.5" /> <span>إضافة قاعدة تعليقات</span></button>
            </div>
            {isLoadingCommentRules ? (
              <div className="bg-white p-12 rounded-3xl border border-slate-200/80 text-center text-slate-400 text-xs font-medium">جاري تحميل قواعد أتمتة التعليقات...</div>
            ) : commentRules.length === 0 ? (
              <div className="bg-white p-12 rounded-3xl border border-slate-200/80 text-center space-y-3">
                <div className="w-12 h-12 rounded-2xl bg-blue-50 text-blue-500 flex items-center justify-center mx-auto"><MessageCircle className="w-6 h-6" /></div>
                <h3 className="text-sm font-bold text-slate-800">لا توجد قواعد أتمتة تعليقات مضافة</h3>
                <p className="text-xs text-slate-500">قم بإنشاء قاعدة للرد على تعليقات الاستفسار عن الأسعار تلقائياً</p>
                <button onClick={openCreateCommentModal} className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition inline-flex items-center gap-1.5"><Plus className="w-3.5 h-3.5" /> <span>إنشاء أول قاعدة تعليقات</span></button>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {commentRules.map((cRule) => (
                  <div key={cRule.id} className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs space-y-4 hover:border-blue-300 transition">
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
                        <div className="p-2.5 bg-blue-50/60 rounded-xl border border-blue-100 text-xs"><span className="text-[10px] font-bold text-blue-700 block mb-0.5">الرسالة الخاصة (DM):</span><p className="text-blue-900 font-medium">{cRule.private_dm_text}</p></div>
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
                <div className="w-9 h-9 rounded-xl bg-teal-100 text-teal-700 flex items-center justify-center font-bold"><Bot className="w-5 h-5" /></div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900">{editingRule ? 'تعديل قاعدة أتمتة الرسائل' : 'إنشاء قاعدة أتمتة رسائل جديدة'}</h3>
                  <p className="text-[11px] text-slate-500">حدد الكلمات المفتاحية والردود المتتالية المنفصلة</p>
                </div>
              </div>
              <button onClick={() => setIsModalOpen(false)} className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-xl"><X className="w-4 h-4" /></button>
            </div>
            {formError && (<div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 rounded-xl text-xs font-semibold flex items-center gap-2"><AlertCircle className="w-4 h-4" /> <span>{formError}</span></div>)}
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">اسم القاعدة:</label>
                <input type="text" required value={name} onChange={(e) => setName(e.target.value)} placeholder="مثال: الرد الترحيبي" className="w-full bg-slate-50 text-xs font-medium text-slate-900 px-3.5 py-2.5 rounded-xl border border-slate-200 focus:bg-white focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-600" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">البراند:</label>
                  <select value={brandId} onChange={(e) => setBrandId(e.target.value)} className="w-full bg-slate-50 text-xs font-medium text-slate-900 px-3 py-2.5 rounded-xl border border-slate-200 focus:bg-white focus:outline-none focus:ring-2 focus:ring-teal-500/20 cursor-pointer">
                    <option value="all">كل البراندات (Global)</option>
                    {MOCK_BRANDS.filter((b) => b.id !== 'all').map((b) => (<option key={b.id} value={b.id}>{b.name}</option>))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">نوع المطابقة:</label>
                  <select value={matchType} onChange={(e) => setMatchType(e.target.value as any)} className="w-full bg-slate-50 text-xs font-medium text-slate-900 px-3 py-2.5 rounded-xl border border-slate-200 focus:bg-white focus:outline-none focus:ring-2 focus:ring-teal-500/20 cursor-pointer">
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
                      <input type="checkbox" checked={channels.includes(ch)} onChange={() => { if(channels.includes(ch) && channels.length > 1) setChannels(channels.filter(c => c !== ch)); else if(!channels.includes(ch)) setChannels([...channels, ch]); }} className="rounded text-teal-600" />
                      <span className="capitalize">{ch}</span>
                    </label>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">الكلمات المفتاحية:</label>
                <div className="flex items-center gap-2">
                  <input type="text" value={keywordInput} onChange={(e) => setKeywordInput(e.target.value)} onKeyDown={(e) => { if(e.key === 'Enter') { e.preventDefault(); handleAddKeyword(); } }} placeholder="اكتب ثم اضغط إضافة..." className="flex-1 bg-slate-50 text-xs font-medium text-slate-900 px-3.5 py-2 rounded-xl border border-slate-200 focus:bg-white focus:outline-none focus:ring-2 focus:ring-teal-500/20" />
                  <button type="button" onClick={handleAddKeyword} className="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl transition">إضافة</button>
                </div>
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {keywords.map((kw, idx) => (
                    <span key={idx} className="px-2.5 py-1 bg-teal-50 text-teal-800 text-xs font-bold rounded-lg border border-teal-200 flex items-center gap-1.5">
                      <span>{kw}</span>
                      <button type="button" onClick={() => setKeywords(keywords.filter(k => k !== kw))} className="text-teal-500">✕</button>
                    </span>
                  ))}
                </div>
              </div>
              <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="text-xs font-bold text-slate-900 flex items-center gap-1.5"><Layers className="w-4 h-4 text-teal-600" /> <span>تقسيم الرسائل والتوقيت</span></h4>
                  </div>
                  <button type="button" onClick={handleAddMessageBlock} className="px-3 py-1.5 bg-teal-600 text-white rounded-xl text-xs font-bold transition flex items-center gap-1 shadow-2xs">إضافة فقرة</button>
                </div>
                <div className="space-y-3">
                  {messageBlocks.map((block, idx) => (
                    <div key={block.id} className="bg-white p-3.5 rounded-xl border border-slate-200 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-black text-teal-800 bg-teal-50 px-2.5 py-0.5 rounded-md">الفقرة {idx + 1}</span>
                        <div className="flex items-center gap-1.5 text-xs text-slate-600">
                          <span>تأخير:</span>
                          <input type="number" min={0} max={60} value={block.delaySeconds} onChange={(e) => handleUpdateMessageBlock(block.id, 'delaySeconds', Number(e.target.value))} className="w-14 bg-slate-50 text-center rounded-lg border" />
                          <span>ثانية</span>
                        </div>
                      </div>
                      <textarea rows={2} required value={block.text} onChange={(e) => handleUpdateMessageBlock(block.id, 'text', e.target.value)} className="w-full bg-slate-50 text-xs p-2.5 rounded-lg border" />
                    </div>
                  ))}
                </div>
                <div className="pt-2 border-t flex flex-col sm:flex-row gap-3">
                  <label className="flex items-center gap-2 text-xs font-bold"><input type="checkbox" checked={enableHumanTyping} onChange={(e) => setEnableHumanTyping(e.target.checked)} /> مظهر الكتابة البشرية</label>
                </div>
                <button type="button" onClick={handleRunPreviewSimulation} className="w-full py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-bold rounded-xl transition flex items-center justify-center gap-1.5 border border-slate-200 shadow-2xs disabled:opacity-50">
                  <Play className="w-3.5 h-3.5" /> <span>{isPreviewRunning ? 'جاري المعاينة...' : 'تجربة المعاينة'}</span>
                </button>
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">فترة التهدئة (بالدقائق):</label>
                <input type="number" min={0} value={cooldownMinutes} onChange={(e) => setCooldownMinutes(Number(e.target.value))} className="w-full bg-slate-50 text-xs font-medium p-2.5 rounded-xl border border-slate-200" />
              </div>
              <div className="flex items-center justify-end gap-2 pt-3 border-t">
                <button type="button" onClick={() => setIsModalOpen(false)} className="px-4 py-2.5 rounded-xl text-xs font-semibold text-slate-600">إلغاء</button>
                <button type="submit" disabled={isSubmitting} className="px-5 py-2.5 rounded-xl bg-teal-600 text-white text-xs font-bold shadow-xs disabled:opacity-50">حفظ القاعدة</button>
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
                <input type="text" required value={commentRuleName} onChange={(e) => setCommentRuleName(e.target.value)} className="w-full bg-slate-50 text-xs p-2.5 rounded-xl border border-slate-200" />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">المنصة:</label>
                <select value={commentChannel} onChange={(e) => setCommentChannel(e.target.value as any)} className="w-full bg-slate-50 text-xs p-2.5 rounded-xl border border-slate-200 cursor-pointer">
                  <option value="all">فيسبوك وإنستغرام</option>
                  <option value="facebook">فيسبوك</option>
                  <option value="instagram">إنستغرام</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">الكلمات المفتاحية:</label>
                <div className="flex items-center gap-2">
                  <input type="text" value={commentKeywordInput} onChange={(e) => setCommentKeywordInput(e.target.value)} onKeyDown={(e) => { if(e.key === 'Enter') { e.preventDefault(); handleAddCommentKeyword(); } }} className="flex-1 bg-slate-50 text-xs p-2.5 rounded-xl border" />
                  <button type="button" onClick={handleAddCommentKeyword} className="px-3.5 py-2 bg-slate-100 font-bold text-xs rounded-xl">إضافة</button>
                </div>
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">الرد العلني:</label>
                <textarea rows={2} value={publicReplyText} onChange={(e) => setPublicReplyText(e.target.value)} className="w-full bg-slate-50 text-xs p-2.5 rounded-xl border" />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">الرسالة الخاصة (DM):</label>
                <textarea rows={2} value={privateDmText} onChange={(e) => setPrivateDmText(e.target.value)} className="w-full bg-slate-50 text-xs p-2.5 rounded-xl border" />
              </div>
              <div className="pt-2 border-t flex items-center justify-between">
                <label className="flex items-center gap-2 text-xs font-bold cursor-pointer"><input type="checkbox" checked={autoHideToxic} onChange={(e) => setAutoHideToxic(e.target.checked)} /> إخفاء التعليق المسيء تلقائياً</label>
              </div>
              <div className="flex items-center justify-end gap-2 pt-3 border-t">
                <button type="button" onClick={() => setIsCommentModalOpen(false)} className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600">إلغاء</button>
                <button type="submit" className="px-5 py-2 rounded-xl bg-blue-600 text-white text-xs font-bold shadow-xs">حفظ قاعدة التعليق</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {isLogsModalOpen && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-2xl w-full p-6 shadow-2xl border border-slate-200 space-y-4 animate-in fade-in zoom-in-95 duration-150 max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between border-b pb-3 shrink-0">
              <div className="flex items-center gap-2"><Activity className="w-5 h-5 text-teal-600" /> <h3 className="text-sm font-bold">سجل التنفيذ للأتمتة</h3></div>
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

