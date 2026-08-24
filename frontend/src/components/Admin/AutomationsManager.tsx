import React, { useState, useEffect, useRef } from 'react';
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
  Sliders,
  Sparkles,
  Save,
  Play,
  Pause,
  RefreshCw,
  Send,
  CheckCircle2,
  User,
  Eye,
  ArrowRight,
  Split,
  Timer,
  Keyboard,
} from 'lucide-react';
import {
  automationApi,
  AutomationRule,
  AutomationExecutionLog,
  socialCommentsApi,
  ModerationSettings,
  MOCK_BRANDS,
} from '../../services/api';

interface SimulatorMessage {
  id: string;
  sender: 'customer' | 'bot' | 'system';
  text: string;
  timestamp: string;
  matchedRuleName?: string;
}

export const AutomationsManager: React.FC = () => {
  const [rules, setRules] = useState<AutomationRule[]>([]);
  const [logs, setLogs] = useState<AutomationExecutionLog[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isLogsModalOpen, setIsLogsModalOpen] = useState(false);
  const [isAiSettingsModalOpen, setIsAiSettingsModalOpen] = useState(false);
  const [isSimulatorOpen, setIsSimulatorOpen] = useState(false);
  const [editingRule, setEditingRule] = useState<AutomationRule | null>(null);

  // AI Moderation & Automations Settings State
  const [aiSettings, setAiSettings] = useState<ModerationSettings>({
    auto_delete_negative: true,
    auto_hide_spam: true,
    auto_reply_inquiries: true,
    strictness_level: 'strict',
    action_for_negative: 'delete',
    negative_keywords: [],
    inquiry_keywords: [],
    inquiry_reply_text: 'تم الرد على استفسارك في الخاص بنجاح 📩',
    inquiry_dm_text: 'أهلاً بك! تم إرسال تفاصيل الأسعار والعروض المتاحة في رسالة خاصة.',
    negative_dm_apology_text: 'نعتذر عن أي تجربة غير مرضية، فريق الدعم سيتواصل معك فوراً.',
  });
  const [isSavingAiSettings, setIsSavingAiSettings] = useState(false);

  // Form State
  const [name, setName] = useState('');
  const [brandId, setBrandId] = useState<string>('all');
  const [channels, setChannels] = useState<string[]>(['messenger', 'instagram', 'whatsapp']);
  const [matchType, setMatchType] = useState<'contains' | 'exact' | 'regex'>('contains');
  const [keywordInput, setKeywordInput] = useState('');
  const [keywords, setKeywords] = useState<string[]>([]);
  const [responseText, setResponseText] = useState('');
  const [splitLines, setSplitLines] = useState<boolean>(true);
  const [delaySeconds, setDelaySeconds] = useState<number>(2);
  const [humanTypingSimulation, setHumanTypingSimulation] = useState<boolean>(true);
  const [cooldownMinutes, setCooldownMinutes] = useState(15);
  const [isActive, setIsActive] = useState(true);
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Visual Live Simulator State
  const [simCustomerInput, setSimCustomerInput] = useState('مساء الخير، لو سمحت عايز اعرف تفاصيل الخصم والعروض المتاحة وفستان الحرير بكام؟');
  const [simMessages, setSimMessages] = useState<SimulatorMessage[]>([
    { id: '1', sender: 'customer', text: 'مساء الخير، محتاج استفسر عن العروض والخصومات المتاحة حالياً', timestamp: '10:00 AM' },
  ]);
  const [isSimRunning, setIsSimRunning] = useState(false);
  const [simIsTyping, setSimIsTyping] = useState(false);
  const [simMatchingStatus, setSimMatchingStatus] = useState<'idle' | 'analyzing' | 'matched' | 'unmatched_unread'>('idle');
  const [simMatchedRuleName, setSimMatchedRuleName] = useState<string | null>(null);
  const [simConfidenceScore, setSimConfidenceScore] = useState<number>(0);
  const simChatScrollRef = useRef<HTMLDivElement>(null);

  const fetchRulesAndLogs = async () => {
    setIsLoading(true);
    try {
      const fetchedRules = await automationApi.listRules();
      setRules(fetchedRules);

      const fetchedLogs = await automationApi.listLogs();
      setLogs(fetchedLogs);

      try {
        const fetchedAiSettings = await socialCommentsApi.getSettings('all');
        if (fetchedAiSettings) {
          setAiSettings(fetchedAiSettings);
        }
      } catch (err) {
        console.warn('[AutomationsManager] Error fetching AI moderation settings:', err);
      }
    } catch (e) {
      console.warn('[AutomationsManager] Error fetching rules/logs:', e);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSaveAiSettings = async () => {
    setIsSavingAiSettings(true);
    try {
      const updated = await socialCommentsApi.updateSettings(aiSettings, 'all');
      setAiSettings(updated);
      setIsAiSettingsModalOpen(false);
    } catch (e: any) {
      console.warn('[AutomationsManager] Error saving AI settings:', e);
    } finally {
      setIsSavingAiSettings(false);
    }
  };

  useEffect(() => {
    fetchRulesAndLogs();
  }, []);

  const openCreateModal = () => {
    setEditingRule(null);
    setName('');
    setBrandId('all');
    setChannels(['messenger', 'instagram', 'whatsapp']);
    setMatchType('contains');
    setKeywordInput('');
    setKeywords(['خصم', 'عروض']);
    setResponseText('');
    setSplitLines(true);
    setDelaySeconds(2);
    setHumanTypingSimulation(true);
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
    setResponseText(rule.response_text);
    setSplitLines(rule.split_lines !== undefined ? rule.split_lines : true);
    setDelaySeconds(rule.delay_seconds !== undefined ? rule.delay_seconds : 2);
    setHumanTypingSimulation(rule.human_typing_simulation !== undefined ? rule.human_typing_simulation : true);
    setCooldownMinutes(rule.cooldown_minutes);
    setIsActive(rule.is_active);
    setFormError(null);
    setIsModalOpen(true);
  };

  const handleAddKeyword = () => {
    const trimmed = keywordInput.trim();
    if (trimmed && !keywords.includes(trimmed)) {
      setKeywords([...keywords, trimmed]);
      setKeywordInput('');
    }
  };

  const handleRemoveKeyword = (kw: string) => {
    setKeywords(keywords.filter((k) => k !== kw));
  };

  const handleToggleChannel = (ch: string) => {
    if (channels.includes(ch)) {
      if (channels.length > 1) {
        setChannels(channels.filter((c) => c !== ch));
      }
    } else {
      setChannels([...channels, ch]);
    }
  };

  const handleToggleRuleActive = async (rule: AutomationRule) => {
    const newActive = !rule.is_active;
    // Optimistic UI update
    setRules((prev) => prev.map((r) => (r.id === rule.id ? { ...r, is_active: newActive } : r)));

    try {
      await automationApi.updateRule(rule.id, { is_active: newActive });
    } catch (e) {
      // Revert on error
      setRules((prev) => prev.map((r) => (r.id === rule.id ? { ...r, is_active: rule.is_active } : r)));
    }
  };

  const handleDeleteRule = async (id: string) => {
    if (!window.confirm('هل أنت تأكد من رغبتك في حذف قاعدة الأتمتة هذه؟')) return;
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
    if (!responseText.trim()) {
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
      response_text: responseText.trim(),
      split_lines: splitLines,
      delay_seconds: delaySeconds,
      human_typing_simulation: humanTypingSimulation,
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

  // Simulator Step & Live Playback Engine
  const runSimulatorStep = async (customText?: string) => {
    const textToTest = (customText || simCustomerInput).trim();
    if (!textToTest || isSimRunning) return;

    setIsSimRunning(true);
    setSimMatchingStatus('analyzing');
    setSimMatchedRuleName(null);
    setSimConfidenceScore(0);

    const newCustMsg: SimulatorMessage = {
      id: Date.now().toString(),
      sender: 'customer',
      text: textToTest,
      timestamp: new Date().toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' }),
    };

    setSimMessages((prev) => [...prev, newCustMsg]);

    setTimeout(() => {
      simChatScrollRef.current?.scrollTo({ top: simChatScrollRef.current.scrollHeight, behavior: 'smooth' });
    }, 60);

    await new Promise((r) => setTimeout(r, 650));

    // Live evaluate rules
    let matchedRule: AutomationRule | null = null;
    const cleanText = textToTest.toLowerCase();

    for (const rule of rules) {
      if (!rule.is_active) continue;
      const kws = rule.keywords || [];
      const mType = (rule.match_type || 'contains').toLowerCase();
      let isMatch = false;

      if (mType === 'exact') {
        isMatch = kws.some((k) => k.trim().toLowerCase() === cleanText);
      } else if (mType === 'regex') {
        for (const k of kws) {
          try {
            if (k.trim() && new RegExp(k.trim(), 'i').test(cleanText)) {
              isMatch = true;
              break;
            }
          } catch {}
        }
      } else {
        isMatch = kws.some((k) => k.trim() && cleanText.includes(k.trim().toLowerCase()));
      }

      if (isMatch) {
        matchedRule = rule;
        break;
      }
    }

    if (matchedRule) {
      setSimMatchingStatus('matched');
      setSimMatchedRuleName(matchedRule.name);
      setSimConfidenceScore(97);

      const splitMode = matchedRule.split_lines !== undefined ? matchedRule.split_lines : true;
      const humanType = matchedRule.human_typing_simulation !== undefined ? matchedRule.human_typing_simulation : true;
      const delay = matchedRule.delay_seconds || 2;

      const raw = matchedRule.response_text || '';
      const chunks = splitMode && raw.includes('\n')
        ? raw.split('\n').map((l) => l.trim()).filter(Boolean)
        : [raw.trim()];

      for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i];
        if (!chunk) continue;

        if (humanType) {
          setSimIsTyping(true);
          const typingDuration = Math.max(900, Math.min(2600, chunk.length * 35));
          await new Promise((r) => setTimeout(r, typingDuration));
          setSimIsTyping(false);
        }

        const botMsg: SimulatorMessage = {
          id: (Date.now() + i).toString(),
          sender: 'bot',
          text: chunk,
          timestamp: new Date().toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' }),
          matchedRuleName: matchedRule.name,
        };

        setSimMessages((prev) => [...prev, botMsg]);

        setTimeout(() => {
          simChatScrollRef.current?.scrollTo({ top: simChatScrollRef.current.scrollHeight, behavior: 'smooth' });
        }, 60);

        if (i < chunks.length - 1 && delay > 0) {
          await new Promise((r) => setTimeout(r, delay * 1000));
        }
      }
    } else {
      setSimMatchingStatus('unmatched_unread');
      setSimConfidenceScore(15);

      await new Promise((r) => setTimeout(r, 600));

      const sysMsg: SimulatorMessage = {
        id: Date.now().toString(),
        sender: 'system',
        text: '⚠️ لم يتطابق الاستفسار مع أي قاعدة أتمتة -> تم نقل المحادثة تلقائياً لقائمة (غير مقروءة 🔴) لإسنادها لأحد الموظفين البشريين للرد المباشر.',
        timestamp: new Date().toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' }),
      };
      setSimMessages((prev) => [...prev, sysMsg]);

      setTimeout(() => {
        simChatScrollRef.current?.scrollTo({ top: simChatScrollRef.current.scrollHeight, behavior: 'smooth' });
      }, 60);
    }

    setIsSimRunning(false);
  };

  const activeRulesCount = rules.filter((r) => r.is_active).length;

  return (
    <div className="flex-1 bg-slate-50/50 p-6 overflow-y-auto" dir="rtl">
      {/* Header Title & Actions */}
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-6 rounded-3xl border border-slate-200/80 shadow-xs">
          <div className="flex items-center gap-3.5">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-teal-600 to-teal-700 text-white flex items-center justify-center shadow-lg shadow-teal-600/20">
              <Bot className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-slate-900 tracking-tight">محرك الأتمتة والردود الذكية</h1>
              <p className="text-xs text-slate-500 font-medium mt-0.5">
                إدارة القواعد التلقائية، تقسيم الرسائل، فترات التهدئة، ومحاكاة سرعة الكتابة البشرية
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <button
              onClick={() => setIsSimulatorOpen(true)}
              className="px-4 py-2.5 rounded-2xl bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-xs font-bold transition flex items-center gap-2 border border-indigo-200 shadow-2xs"
            >
              <Play className="w-4 h-4 text-indigo-600 fill-indigo-600" />
              <span>محاكي الأتمتة والتفقد البصري</span>
            </button>

            <button
              onClick={() => setIsAiSettingsModalOpen(true)}
              className="px-4 py-2.5 rounded-2xl bg-slate-100 hover:bg-slate-200/80 text-slate-700 text-xs font-bold transition flex items-center gap-2 border border-slate-200/60 shadow-2xs"
            >
              <Sliders className="w-4 h-4 text-teal-600" />
              <span>إعدادات الأتمتة والـ AI</span>
            </button>

            <button
              onClick={() => setIsLogsModalOpen(true)}
              className="px-4 py-2.5 rounded-2xl bg-slate-100 hover:bg-slate-200/80 text-slate-700 text-xs font-bold transition flex items-center gap-2 border border-slate-200/60 shadow-2xs"
            >
              <Activity className="w-4 h-4 text-teal-600" />
              <span>سجل التنفيذي ({logs.length})</span>
            </button>

            <button
              onClick={openCreateModal}
              className="px-5 py-2.5 rounded-2xl bg-gradient-to-r from-teal-600 to-teal-700 hover:from-teal-700 hover:to-teal-800 text-white text-xs font-bold shadow-lg shadow-teal-600/20 transition flex items-center gap-2"
            >
              <Plus className="w-4 h-4" />
              <span>إنشاء قاعدة جديدة</span>
            </button>
          </div>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold text-slate-500">إجمالي القواعد</p>
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

        {/* Rules Grid */}
        {isLoading ? (
          <div className="bg-white p-12 rounded-3xl border border-slate-200/80 text-center text-slate-400 text-xs font-medium">
            جاري تحميل قواعد الأتمتة...
          </div>
        ) : rules.length === 0 ? (
          <div className="bg-white p-12 rounded-3xl border border-slate-200/80 text-center space-y-3">
            <div className="w-12 h-12 rounded-2xl bg-slate-100 text-slate-400 flex items-center justify-center mx-auto">
              <Bot className="w-6 h-6" />
            </div>
            <h3 className="text-sm font-bold text-slate-800">لا توجد قواعد أتمتة حتى الآن</h3>
            <p className="text-xs text-slate-500">قم بإنشاء قاعدتك الأولى للرد التلقائي على استفسارات العملاء بناءً على الكلمات المفتاحية</p>
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
              return (
                <div
                  key={rule.id}
                  className={`bg-white rounded-2xl border p-5 shadow-xs transition duration-150 flex flex-col justify-between space-y-4 ${
                    rule.is_active ? 'border-slate-200 hover:border-teal-300' : 'border-slate-200/60 opacity-60 bg-slate-50/50'
                  }`}
                >
                  <div className="space-y-3">
                    {/* Header line: Title & Active Toggle */}
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="text-sm font-bold text-slate-900">{rule.name}</h3>
                          <span className="text-[10px] bg-slate-100 text-slate-700 px-2 py-0.5 rounded-md font-semibold border border-slate-200/60">
                            {rule.match_type === 'exact' ? 'مطابقة تامة' : rule.match_type === 'regex' ? 'تعبير نمطي (Regex)' : 'يحتوي على'}
                          </span>
                        </div>
                        <div className="flex flex-wrap items-center gap-2 mt-1.5">
                          <span className="text-[11px] font-semibold text-teal-800 bg-teal-50 px-2 py-0.5 rounded-lg border border-teal-100">
                            {brandObj ? brandObj.name : 'كل البراندات (Global)'}
                          </span>
                          <span className="text-[11px] text-slate-400">•</span>
                          <span className="text-[11px] text-slate-500 font-medium flex items-center gap-1">
                            <Clock className="w-3 h-3 text-slate-400" />
                            تهدئة {rule.cooldown_minutes} دقيقة
                          </span>
                          {rule.split_lines !== false && (
                            <span className="text-[10px] font-bold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded-md border border-indigo-100 flex items-center gap-1">
                              <Split className="w-2.5 h-2.5" />
                              <span>تقسيم أسطر</span>
                            </span>
                          )}
                          <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-100 flex items-center gap-1">
                            <Timer className="w-2.5 h-2.5" />
                            <span>فاصل {rule.delay_seconds || 2}ث</span>
                          </span>
                          {rule.human_typing_simulation !== false && (
                            <span className="text-[10px] font-bold text-amber-700 bg-amber-50 px-2 py-0.5 rounded-md border border-amber-100 flex items-center gap-1">
                              <Keyboard className="w-2.5 h-2.5" />
                              <span>محاكاة بشرية</span>
                            </span>
                          )}
                        </div>
                      </div>

                      <button
                        onClick={() => handleToggleRuleActive(rule)}
                        className={`w-11 h-6 rounded-full transition-colors p-0.5 flex items-center ${
                          rule.is_active ? 'bg-teal-600 justify-end' : 'bg-slate-300 justify-start'
                        }`}
                        title={rule.is_active ? 'إيقاف القاعدة' : 'تفعيل القاعدة'}
                      >
                        <span className="w-5 h-5 rounded-full bg-white shadow-md block" />
                      </button>
                    </div>

                    {/* Keywords List */}
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

                    {/* Response Text Preview */}
                    <div className="p-3 bg-slate-50 rounded-xl border border-slate-100 text-xs font-medium text-slate-700 space-y-1">
                      <p className="text-[10px] font-bold text-slate-400">الرد التلقائي المعتمد:</p>
                      <p className="line-clamp-3 whitespace-pre-wrap leading-relaxed">"{rule.response_text}"</p>
                    </div>
                  </div>

                  {/* Actions Bar */}
                  <div className="flex items-center justify-between border-t border-slate-100 pt-3 text-xs">
                    <span className="text-[11px] text-slate-400">
                      القنوات: {(rule.channels || []).join(', ')}
                    </span>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => openEditModal(rule)}
                        className="p-1.5 text-slate-500 hover:text-teal-700 hover:bg-teal-50 rounded-lg transition"
                        title="تعديل"
                      >
                        <Edit3 className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleDeleteRule(rule.id)}
                        className="p-1.5 text-slate-500 hover:text-rose-700 hover:bg-rose-50 rounded-lg transition"
                        title="حذف"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Create / Edit Rule Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-xl w-full p-6 shadow-2xl border border-slate-200 space-y-4 animate-in fade-in zoom-in-95 duration-150 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-sm font-bold text-slate-900">
                {editingRule ? 'تعديل قاعدة الأتمتة' : 'إنشاء قاعدة أتمتة جديدة'}
              </h3>
              <button
                onClick={() => setIsModalOpen(false)}
                className="p-1 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-xl"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {formError && (
              <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 text-xs font-semibold rounded-xl flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{formError}</span>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">اسم القاعدة:</label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="مثلاً: الرد التلقائي على عروض الصيف"
                  className="w-full bg-slate-50 text-xs font-medium text-slate-900 px-3.5 py-2.5 rounded-xl border border-slate-200 focus:bg-white focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-600"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">البراند المستهدف:</label>
                  <select
                    value={brandId}
                    onChange={(e) => setBrandId(e.target.value)}
                    className="w-full bg-slate-50 text-xs font-medium text-slate-900 px-3 py-2.5 rounded-xl border border-slate-200 focus:bg-white focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-600"
                  >
                    <option value="all">كل البراندات (Global)</option>
                    {MOCK_BRANDS.filter((b) => b.id !== 'all').map((b) => (
                      <option key={b.id} value={b.id}>{b.name}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">نوع المطابقة:</label>
                  <select
                    value={matchType}
                    onChange={(e) => setMatchType(e.target.value as any)}
                    className="w-full bg-slate-50 text-xs font-medium text-slate-900 px-3 py-2.5 rounded-xl border border-slate-200 focus:bg-white focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-600"
                  >
                    <option value="contains">يحتوي على (Contains)</option>
                    <option value="exact">مطابقة تامة (Exact)</option>
                    <option value="regex">تعبير نمطي (Regex)</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">القنوات المفعلة:</label>
                <div className="flex items-center gap-3">
                  {['messenger', 'instagram', 'whatsapp'].map((ch) => (
                    <label key={ch} className="flex items-center gap-1.5 text-xs font-semibold text-slate-700 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={channels.includes(ch)}
                        onChange={() => handleToggleChannel(ch)}
                        className="rounded text-teal-600 focus:ring-teal-500"
                      />
                      <span className="capitalize">{ch}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">الكلمات المفتاحية (اضغط Enter للإضافة):</label>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={keywordInput}
                    onChange={(e) => setKeywordInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleAddKeyword();
                      }
                    }}
                    placeholder="اكتب الكلمة المفتاحية ثم اضغط إضافة..."
                    className="flex-1 bg-slate-50 text-xs font-medium text-slate-900 px-3.5 py-2.5 rounded-xl border border-slate-200 focus:bg-white focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-600"
                  />
                  <button
                    type="button"
                    onClick={handleAddKeyword}
                    className="px-3.5 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl transition"
                  >
                    إضافة
                  </button>
                </div>

                <div className="flex flex-wrap gap-1.5 mt-2">
                  {keywords.map((kw, idx) => (
                    <span key={idx} className="px-2.5 py-1 bg-teal-50 text-teal-800 text-xs font-bold rounded-lg border border-teal-200 flex items-center gap-1.5">
                      <span>{kw}</span>
                      <button type="button" onClick={() => handleRemoveKeyword(kw)} className="text-teal-500 hover:text-rose-600 text-xs">✕</button>
                    </span>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">نص الرد التلقائي المعتمد (اضغط Enter لكتابة أسطر متعددة):</label>
                <textarea
                  rows={4}
                  required
                  value={responseText}
                  onChange={(e) => setResponseText(e.target.value)}
                  placeholder="أهلاً بك يا فندم! 🌸&#10;كود الخصم المتاح اليوم هو LUX20&#10;يمكنك تصفح منتجاتنا عبر الرابط التالي..."
                  className="w-full bg-slate-50 text-xs font-medium text-slate-900 p-3 rounded-xl border border-slate-200 focus:bg-white focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-600 leading-relaxed"
                />
                <p className="text-[10px] text-slate-400 text-left mt-0.5">{responseText.length}/2000 حرف</p>
              </div>

              {/* Timing & Multiline Chunking Controls */}
              <div className="bg-slate-50/90 p-4 rounded-2xl border border-slate-200/80 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                      <Split className="w-3.5 h-3.5 text-indigo-600" />
                      إرسال كل سطر في رسالة منفصلة
                    </h4>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      عند النزول لسطر جديد في نص الرد، يتم إرسال كل فقرة كرسالة مستقلة
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setSplitLines(!splitLines)}
                    className={`w-11 h-6 rounded-full transition-colors p-0.5 flex items-center ${
                      splitLines ? 'bg-indigo-600 justify-end' : 'bg-slate-300 justify-start'
                    }`}
                  >
                    <span className="w-5 h-5 rounded-full bg-white shadow-md block" />
                  </button>
                </div>

                <div className="flex items-center justify-between pt-2.5 border-t border-slate-200/60">
                  <div>
                    <h4 className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                      <Keyboard className="w-3.5 h-3.5 text-teal-600" />
                      محاكاة سرعة الكتابة البشرية (Typing Simulator)
                    </h4>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      إظهار مؤشر الكتابة (typing...) وحساب التوقيت كإنسان حقيقي قبل إرسال كل رسالة
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setHumanTypingSimulation(!humanTypingSimulation)}
                    className={`w-11 h-6 rounded-full transition-colors p-0.5 flex items-center ${
                      humanTypingSimulation ? 'bg-teal-600 justify-end' : 'bg-slate-300 justify-start'
                    }`}
                  >
                    <span className="w-5 h-5 rounded-full bg-white shadow-md block" />
                  </button>
                </div>

                <div className="pt-2.5 border-t border-slate-200/60 flex items-center justify-between gap-3">
                  <div>
                    <h4 className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                      <Timer className="w-3.5 h-3.5 text-amber-600" />
                      الفاصل الزمني بين كل رسالة والأخرى (بالثواني):
                    </h4>
                    <p className="text-[11px] text-slate-500 mt-0.5">المدة الزمنية الفاصلة بين إرسال الأسطر المتتالية</p>
                  </div>
                  <div className="w-24">
                    <input
                      type="number"
                      min={0}
                      max={30}
                      value={delaySeconds}
                      onChange={(e) => setDelaySeconds(Number(e.target.value))}
                      className="w-full bg-white text-xs font-bold text-center text-slate-900 px-3 py-1.5 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-teal-500/20"
                    />
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">فترة التهدئة للعميل (بالدقائق):</label>
                <input
                  type="number"
                  min={0}
                  max={1440}
                  value={cooldownMinutes}
                  onChange={(e) => setCooldownMinutes(Number(e.target.value))}
                  className="w-full bg-slate-50 text-xs font-medium text-slate-900 px-3.5 py-2 rounded-xl border border-slate-200 focus:bg-white focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-600"
                />
                <p className="text-[10px] text-slate-400 mt-1">تمنع هذه الفترة تكرار إرسال الرد التلقائي لنفس العميل خلال المهلة المحددة</p>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2.5 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-100 transition"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-5 py-2.5 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-xs font-bold transition flex items-center gap-1.5 shadow-xs disabled:opacity-50"
                >
                  <Check className="w-4 h-4" />
                  <span>{isSubmitting ? 'جاري الحفظ...' : 'حفظ القاعدة'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Visual Live Simulator Modal */}
      {isSimulatorOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-3xl w-full p-6 shadow-2xl border border-slate-200 space-y-4 animate-in fade-in zoom-in-95 duration-150 max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 shrink-0">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center">
                  <Play className="w-4 h-4 fill-indigo-600" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900">محاكي الأتمتة المباشر والتفقد البصري</h3>
                  <p className="text-[11px] text-slate-500">
                    تفقد طريقة تدفق الرسائل، سرعة الكتابة البشرية، وإسناد المحادثة لغير مقروء عند عدم التطابق
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsSimulatorOpen(false)}
                className="p-1 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-xl"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Quick Test Scenarios Bar */}
            <div className="flex flex-wrap items-center gap-2 shrink-0 bg-slate-50 p-2.5 rounded-2xl border border-slate-200/60">
              <span className="text-[11px] font-bold text-slate-600">سيناريوهات سريعة:</span>
              <button
                type="button"
                onClick={() => {
                  setSimCustomerInput('عايز اعرف تفاصيل كود الخصم والعروض المتاحة');
                  runSimulatorStep('عايز اعرف تفاصيل كود الخصم والعروض المتاحة');
                }}
                disabled={isSimRunning}
                className="px-2.5 py-1 bg-white hover:bg-slate-100 text-indigo-700 border border-indigo-200 rounded-lg text-[11px] font-bold shadow-2xs transition"
              >
                🎯 استفسار يطابق كود الخصم
              </button>
              <button
                type="button"
                onClick={() => {
                  setSimCustomerInput('هل يوجد فستان بمقاس 4XL تفصيل خاص غير المعروض؟');
                  runSimulatorStep('هل يوجد فستان بمقاس 4XL تفصيل خاص غير المعروض؟');
                }}
                disabled={isSimRunning}
                className="px-2.5 py-1 bg-white hover:bg-slate-100 text-rose-700 border border-rose-200 rounded-lg text-[11px] font-bold shadow-2xs transition"
              >
                ⚠️ استفسار خارج الأتمتة (نقل لغير مقروء)
              </button>
            </div>

            {/* Live Chat Timeline Simulation Stream */}
            <div
              ref={simChatScrollRef}
              className="flex-1 overflow-y-auto p-4 bg-slate-50/70 rounded-2xl border border-slate-200/80 space-y-3 min-h-[300px] max-h-[380px]"
            >
              {simMessages.map((msg) => {
                if (msg.sender === 'system') {
                  return (
                    <div key={msg.id} className="p-3 bg-amber-50 rounded-xl border border-amber-200 text-amber-900 text-xs font-semibold flex items-center gap-2 animate-in fade-in">
                      <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
                      <span>{msg.text}</span>
                    </div>
                  );
                }

                const isCustomer = msg.sender === 'customer';
                return (
                  <div
                    key={msg.id}
                    className={`flex items-end gap-2 ${isCustomer ? 'justify-start' : 'justify-end'} animate-in fade-in slide-in-from-bottom-1 duration-200`}
                  >
                    {isCustomer && (
                      <div className="w-7 h-7 rounded-full bg-slate-200 text-slate-700 text-[10px] font-bold flex items-center justify-center shrink-0">
                        عميل
                      </div>
                    )}

                    <div
                      className={`max-w-[78%] px-4 py-2.5 rounded-2xl text-xs font-medium leading-relaxed shadow-2xs ${
                        isCustomer
                          ? 'bg-white text-slate-800 border border-slate-200 rounded-bl-xs'
                          : 'bg-teal-600 text-white rounded-br-xs'
                      }`}
                    >
                      <p className="whitespace-pre-wrap">{msg.text}</p>
                      <div className={`text-[10px] mt-1 flex items-center gap-1 ${isCustomer ? 'text-slate-400 justify-start' : 'text-teal-100 justify-end'}`}>
                        <span>{msg.timestamp}</span>
                        {!isCustomer && <span>✓✓</span>}
                      </div>
                    </div>

                    {!isCustomer && (
                      <div className="w-7 h-7 rounded-full bg-teal-700 text-white text-[10px] font-bold flex items-center justify-center shrink-0">
                        <Bot className="w-4 h-4" />
                      </div>
                    )}
                  </div>
                );
              })}

              {/* Realistic Typing Indicator */}
              {simIsTyping && (
                <div className="flex items-end gap-2 justify-end animate-in fade-in">
                  <div className="bg-white border border-slate-200 px-3.5 py-2.5 rounded-2xl rounded-br-xs shadow-2xs flex items-center gap-1.5">
                    <span className="text-[11px] font-bold text-slate-500">المساعد الآلي يكتب الآن</span>
                    <span className="w-1.5 h-1.5 bg-teal-600 rounded-full animate-bounce" />
                    <span className="w-1.5 h-1.5 bg-teal-600 rounded-full animate-bounce [animation-delay:0.2s]" />
                    <span className="w-1.5 h-1.5 bg-teal-600 rounded-full animate-bounce [animation-delay:0.4s]" />
                  </div>
                  <div className="w-7 h-7 rounded-full bg-teal-700 text-white text-[10px] font-bold flex items-center justify-center shrink-0">
                    <Bot className="w-4 h-4" />
                  </div>
                </div>
              )}
            </div>

            {/* Live Intent & Decision Status Box */}
            <div className="bg-slate-900 text-white p-3.5 rounded-2xl flex items-center justify-between text-xs shrink-0">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-cyan-400 shrink-0" />
                <div>
                  <span className="font-bold text-slate-200">حالة الفحص والتحليل: </span>
                  {simMatchingStatus === 'analyzing' && <span className="text-cyan-400 font-semibold animate-pulse">جاري فحص نية العميل والكلمات المفتاحية...</span>}
                  {simMatchingStatus === 'matched' && (
                    <span className="text-emerald-400 font-bold">
                      تم التطابق مع [{simMatchedRuleName}] بنسبة ثقة {simConfidenceScore}% ✅
                    </span>
                  )}
                  {simMatchingStatus === 'unmatched_unread' && (
                    <span className="text-rose-400 font-bold">
                      لم يتم التطابق -&gt; المحادثة معينة كـ (غير مقروءة 🔴)
                    </span>
                  )}
                  {simMatchingStatus === 'idle' && <span className="text-slate-400">جاهز لبدء المحاكاة</span>}
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setSimMessages([
                    { id: '1', sender: 'customer', text: 'مساء الخير، محتاج استفسر عن العروض والخصومات المتاحة حالياً', timestamp: '10:00 AM' },
                  ]);
                  setSimMatchingStatus('idle');
                }}
                className="px-2.5 py-1 bg-white/10 hover:bg-white/20 text-white text-[10px] font-bold rounded-lg transition"
              >
                إعادة ضبط الشات
              </button>
            </div>

            {/* Input Bar for Simulator */}
            <div className="flex items-center gap-2 shrink-0 pt-1">
              <input
                type="text"
                value={simCustomerInput}
                onChange={(e) => setSimCustomerInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    runSimulatorStep();
                  }
                }}
                disabled={isSimRunning}
                placeholder="اكتب رسالة من العميل لاختبار تدفق الأتمتة..."
                className="flex-1 bg-slate-50 text-xs font-semibold text-slate-900 px-4 py-2.5 rounded-2xl border border-slate-200 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
              />
              <button
                type="button"
                onClick={() => runSimulatorStep()}
                disabled={isSimRunning || !simCustomerInput.trim()}
                className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-2xl transition flex items-center gap-1.5 shadow-2xs disabled:opacity-50"
              >
                <Send className="w-3.5 h-3.5" />
                <span>تشغيل المحاكاة</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Execution Audit Logs Modal */}
      {isLogsModalOpen && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-2xl w-full p-6 shadow-2xl border border-slate-200 space-y-4 animate-in fade-in zoom-in-95 duration-150 max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 shrink-0">
              <div className="flex items-center gap-2">
                <Activity className="w-5 h-5 text-teal-600" />
                <h3 className="text-sm font-bold text-slate-900">سجل التنفيذ والتنفيذ التدقييم للأتمتة</h3>
              </div>
              <button
                onClick={() => setIsLogsModalOpen(false)}
                className="p-1 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-xl"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto space-y-2 pr-1">
              {logs.length === 0 ? (
                <p className="text-center text-slate-400 text-xs py-8">لا يوجد سجلات تنفيذ سابقة حتى الآن</p>
              ) : (
                logs.map((log) => (
                  <div key={log.id} className="p-3 bg-slate-50 rounded-xl border border-slate-100 text-xs flex items-center justify-between">
                    <div>
                      <span className="font-bold text-slate-900">{log.rule_name || 'قاعدة أتمتة'}</span>
                      <p className="text-[11px] text-slate-500 font-mono mt-0.5">
                        العميل: {log.customer_id.substring(0, 8)}... | المحادثة: {log.conversation_id.substring(0, 8)}...
                      </p>
                    </div>
                    <span className="text-[10px] font-semibold text-slate-500 bg-white px-2 py-1 rounded-md border border-slate-200">
                      {new Date(log.executed_at).toLocaleString('ar-EG')}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
      {/* AI Moderation & Automations Settings Modal */}
      {isAiSettingsModalOpen && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-2xl w-full p-6 shadow-2xl border border-slate-200 space-y-5 animate-in fade-in zoom-in-95 duration-150 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <Sliders className="w-5 h-5 text-teal-600" />
                <h3 className="text-sm font-bold text-slate-900">
                  إعدادات محرك الأتمتة وقواعد الذكاء الاصطناعي
                </h3>
              </div>
              <button
                onClick={() => setIsAiSettingsModalOpen(false)}
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
                      setAiSettings({ ...aiSettings, auto_delete_negative: !aiSettings.auto_delete_negative })
                    }
                    className={`w-11 h-6 rounded-full transition-colors p-0.5 flex items-center ${
                      aiSettings.auto_delete_negative ? 'bg-rose-600 justify-end' : 'bg-slate-300 justify-start'
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
                    onClick={() => setAiSettings({ ...aiSettings, auto_hide_spam: !aiSettings.auto_hide_spam })}
                    className={`w-11 h-6 rounded-full transition-colors p-0.5 flex items-center ${
                      aiSettings.auto_hide_spam ? 'bg-purple-600 justify-end' : 'bg-slate-300 justify-start'
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
                      setAiSettings({ ...aiSettings, auto_reply_inquiries: !aiSettings.auto_reply_inquiries })
                    }
                    className={`w-11 h-6 rounded-full transition-colors p-0.5 flex items-center ${
                      aiSettings.auto_reply_inquiries ? 'bg-teal-600 justify-end' : 'bg-slate-300 justify-start'
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
                    value={aiSettings.strictness_level}
                    onChange={(e) => setAiSettings({ ...aiSettings, strictness_level: e.target.value as any })}
                    className="w-full bg-slate-50 text-xs font-medium text-slate-900 px-3.5 py-2.5 rounded-xl border border-slate-200 focus:bg-white focus:outline-none focus:ring-2 focus:ring-teal-500/20"
                  >
                    <option value="strict">صارم جداً (حذف فوري لأي نبرة استياء أو إساءة)</option>
                    <option value="balanced">متوازن (حذف الشتائم والاتهامات المباشرة فقط)</option>
                    <option value="relaxed">مرن (مراقبة فقط بدون حذف تلقائي)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    الإجراء التلقائي للتعليقات السلبية:
                  </label>
                  <select
                    value={aiSettings.action_for_negative}
                    onChange={(e) => setAiSettings({ ...aiSettings, action_for_negative: e.target.value as any })}
                    className="w-full bg-slate-50 text-xs font-medium text-slate-900 px-3.5 py-2.5 rounded-xl border border-slate-200 focus:bg-white focus:outline-none focus:ring-2 focus:ring-teal-500/20"
                  >
                    <option value="delete">حذف التعليق فوراً (Delete)</option>
                    <option value="hide">إخفاء التعليق فقط (Hide)</option>
                    <option value="delete_and_dm">حذف وإرسال رسالة اعتذار بالخاص (Delete & DM)</option>
                  </select>
                </div>
              </div>

              {/* Auto Reply Templates */}
              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    نص الرد العام على التعليق في الصفحة (Public Reply):
                  </label>
                  <input
                    type="text"
                    value={aiSettings.inquiry_reply_text}
                    onChange={(e) => setAiSettings({ ...aiSettings, inquiry_reply_text: e.target.value })}
                    className="w-full bg-slate-50 text-xs font-medium text-slate-900 px-3.5 py-2.5 rounded-xl border border-slate-200 focus:bg-white focus:outline-none focus:ring-2 focus:ring-teal-500/20"
                    placeholder="تم الرد على استفسارك في الخاص بنجاح 📩"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    نص الرسالة المرسلة في الخاص (Direct Message):
                  </label>
                  <textarea
                    rows={2}
                    value={aiSettings.inquiry_dm_text}
                    onChange={(e) => setAiSettings({ ...aiSettings, inquiry_dm_text: e.target.value })}
                    className="w-full bg-slate-50 text-xs font-medium text-slate-900 p-3 rounded-xl border border-slate-200 focus:bg-white focus:outline-none focus:ring-2 focus:ring-teal-500/20"
                    placeholder="أهلاً بك! تم إرسال تفاصيل الأسعار والعروض المتاحة في رسالة خاصة."
                  />
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsAiSettingsModalOpen(false)}
                  className="px-4 py-2.5 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-100 transition"
                >
                  إلغاء
                </button>
                <button
                  type="button"
                  onClick={handleSaveAiSettings}
                  disabled={isSavingAiSettings}
                  className="px-5 py-2.5 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-xs font-bold transition flex items-center gap-1.5 shadow-sm disabled:opacity-50"
                >
                  <Save className="w-4 h-4" />
                  <span>{isSavingAiSettings ? 'جاري الحفظ...' : 'حفظ إعدادات الأتمتة'}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
