import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { MessageSquare, MessageCircle, CheckCircle, Layers, Share2, X, Send, Check, LogOut, User as UserIcon, Bot, BarChart3, Database, Users, ChevronDown, Filter, Plug, MapPin } from 'lucide-react';
import { MOCK_BRANDS } from '../../constants/brands';
import { useCrmStore, ChannelFilterType } from '../../store/useCrmStore';
import { useAuthStore } from '../../store/useAuthStore';
import { metaApi } from '../../services/api';
import { ProviderStatusIndicator } from '../ProviderStatusIndicator';
import { getBrandObject } from '../ConversationAvatar';

interface TopBarProps {
  activeMainView?: 'chat' | 'comments' | 'automations' | 'dashboard' | 'database' | 'team';
  setActiveMainView?: (view: 'chat' | 'comments' | 'automations' | 'dashboard' | 'database' | 'team') => void;
}

export const TopBar: React.FC<TopBarProps> = ({ activeMainView = 'chat', setActiveMainView }) => {
  const {
    selectedBrandId,
    setSelectedBrandId,
    selectedChannel,
    setSelectedChannel,
    selectedCountry,
    setSelectedCountry,
    availableCountries,
    selectedAgentId,
    setSelectedAgentId,
    teamMembers,
    fetchTeamMembers,
    setIsIntegrationsModalOpen,
    unreadSummary,
    fetchUnreadSummary,
    conversations,
  } = useCrmStore();
  const { user, logout } = useAuthStore();

  const [isPostModalOpen, setIsPostModalOpen] = useState(false);
  const [postMessage, setPostMessage] = useState('');
  const [postLink, setPostLink] = useState('');
  const [isPublishing, setIsPublishing] = useState(false);
  const [publishSuccess, setPublishSuccess] = useState<string | null>(null);
  const [publishError, setPublishError] = useState<string | null>(null);

  // Dropdown states for compact header controls
  const [isBrandDropdownOpen, setIsBrandDropdownOpen] = useState(false);

  useEffect(() => {
    fetchUnreadSummary();
    fetchTeamMembers();
  }, []);

  const channels: { id: ChannelFilterType; label: string }[] = [
    { id: 'all', label: 'كل القنوات' },
    { id: 'messenger', label: 'ماسنجر' },
    { id: 'instagram', label: 'إنستغرام' },
    { id: 'whatsapp', label: 'واتساب' },
  ];

  const handlePublishPost = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!postMessage.trim()) return;

    setIsPublishing(true);
    setPublishSuccess(null);
    setPublishError(null);

    const rawLink = postLink.trim();
    let formattedLink: string | undefined = undefined;
    if (rawLink) {
      formattedLink = /^https?:\/\//i.test(rawLink) ? rawLink : `https://${rawLink}`;
    }

    try {
      const data = await metaApi.publishPost({
        message: postMessage.trim(),
        link: formattedLink,
      });

      setPublishSuccess(`تم نشر المنشور بنجاح على صفحة فيسبوك ✨ (ID: ${data.post_id || 'تم'})`);
      setPostMessage('');
      setPostLink('');
      setTimeout(() => {
        setIsPostModalOpen(false);
        setPublishSuccess(null);
      }, 2500);
    } catch (err: any) {
      console.warn('[PublishPost] error:', err);
      setPublishError(err?.message || 'تعذر نشر المنشور. يرجى التأكد من صلاحيات الصفحة.');
    } finally {
      setIsPublishing(false);
    }
  };

  const isUserAdmin = user?.role === 'admin' || (user?.role as any) === 'ADMIN';

  const dynamicBrands = React.useMemo(() => {
    const list: { id: string; name: string; avatar: string; logo_url?: string; color: string }[] = [
      { id: 'all', name: 'كل الماركات', avatar: 'ALL', color: 'from-slate-700 to-slate-800' },
    ];
    const seen = new Set<string>(['all']);

    // 1. Gather all active brands from unreadSummary & conversations
    const activeBrandNames = new Set<string>();
    if (unreadSummary?.brands) {
      Object.keys(unreadSummary.brands).forEach((b) => {
        if (b && b.toLowerCase() !== 'all' && b !== 'الكل') activeBrandNames.add(b);
      });
    }
    conversations.forEach((c) => {
      const b = c.brand || c.brand_name;
      if (b && b.toLowerCase() !== 'all' && b !== 'الكل') activeBrandNames.add(b);
    });

    // 2. Add active brands with resolved logos
    activeBrandNames.forEach((bName) => {
      const norm = bName.toLowerCase();
      if (!seen.has(norm)) {
        seen.add(norm);
        const obj = getBrandObject(bName, bName);
        list.push({
          id: bName,
          name: obj.name || bName,
          avatar: obj.avatar,
          logo_url: obj.logo_url,
          color: obj.color,
        });
      }
    });

    // 3. Append remaining standard mock brands if not already present
    MOCK_BRANDS.forEach((mb) => {
      const norm = mb.id.toLowerCase();
      if (!seen.has(norm) && mb.id !== 'all') {
        seen.add(norm);
        list.push({
          id: mb.id,
          name: mb.name,
          avatar: mb.avatar,
          logo_url: mb.logo_url,
          color: mb.color || 'from-slate-700 to-slate-800',
        });
      }
    });

    return list;
  }, [unreadSummary?.brands, conversations]);

  const selectedBrandObj = React.useMemo(() => {
    if (!selectedBrandId || selectedBrandId.toLowerCase() === 'all') {
      return dynamicBrands[0];
    }
    const found = dynamicBrands.find(
      (b) => b.id.toLowerCase() === selectedBrandId.toLowerCase() || b.name.toLowerCase() === selectedBrandId.toLowerCase()
    );
    if (found) return found;
    const resolved = getBrandObject(selectedBrandId, selectedBrandId);
    return {
      id: selectedBrandId,
      name: resolved.name || selectedBrandId,
      avatar: resolved.avatar,
      logo_url: resolved.logo_url,
      color: resolved.color,
    };
  }, [dynamicBrands, selectedBrandId]);

  return (
    <header className="h-13 my-2 mx-4 px-5 bg-white/80 backdrop-blur-xl border border-white/80 shadow-[0_4px_20px_-2px_rgba(0,0,0,0.03)] rounded-2xl flex items-center justify-between shrink-0 relative z-30 transition-all">
      {/* Right Section (RTL Start): Logo & 6-Way Main View Switcher */}
      <div className="flex items-center gap-5">
        {/* Brand Identity Mark */}
        <div className="flex items-center gap-2 shrink-0">
          <div className="w-7 h-7 rounded-xl bg-gradient-to-tr from-[#1A73E8] to-teal-500 text-white flex items-center justify-center font-bold shadow-xs">
            <Layers className="w-4 h-4" />
          </div>
          <span className="text-sm font-extrabold text-slate-900 tracking-tight hidden sm:inline">LUXIRA</span>
        </div>

        {/* 6-Way View Navigation Tabs */}
        {isUserAdmin && setActiveMainView && (
          <nav className="flex items-center gap-1 bg-slate-100/60 p-1 rounded-full border border-slate-200/50 backdrop-blur-md">
            <button
              onClick={() => setActiveMainView('chat')}
              className={`px-3.5 py-1 rounded-full text-xs transition-all flex items-center gap-1.5 ${
                activeMainView === 'chat'
                  ? 'bg-[#E8F0FE] text-[#1A73E8] font-bold shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-white/60 font-medium'
              }`}
            >
              <MessageSquare className="w-3.5 h-3.5 text-[#1A73E8]" />
              <span>الشات المباشر</span>
            </button>
            <button
              onClick={() => setActiveMainView('comments')}
              className={`px-3.5 py-1 rounded-full text-xs transition-all flex items-center gap-1.5 ${
                activeMainView === 'comments'
                  ? 'bg-[#E8F0FE] text-[#1A73E8] font-bold shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-white/60 font-medium'
              }`}
            >
              <MessageCircle className="w-3.5 h-3.5 text-[#1A73E8]" />
              <span>التعليقات</span>
            </button>
            <button
              onClick={() => setActiveMainView('automations')}
              className={`px-3.5 py-1 rounded-full text-xs transition-all flex items-center gap-1.5 ${
                activeMainView === 'automations'
                  ? 'bg-[#E8F0FE] text-[#1A73E8] font-bold shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-white/60 font-medium'
              }`}
            >
              <Bot className="w-3.5 h-3.5 text-[#1A73E8]" />
              <span>الأتمتة</span>
            </button>
            <button
              onClick={() => setActiveMainView('dashboard')}
              className={`px-3.5 py-1 rounded-full text-xs transition-all flex items-center gap-1.5 ${
                activeMainView === 'dashboard'
                  ? 'bg-[#E8F0FE] text-[#1A73E8] font-bold shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-white/60 font-medium'
              }`}
            >
              <BarChart3 className="w-3.5 h-3.5 text-[#1A73E8]" />
              <span>التحليلات</span>
            </button>
            <button
              onClick={() => setActiveMainView('database')}
              className={`px-3.5 py-1 rounded-full text-xs transition-all flex items-center gap-1.5 ${
                activeMainView === 'database'
                  ? 'bg-[#E8F0FE] text-[#1A73E8] font-bold shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-white/60 font-medium'
              }`}
            >
              <Database className="w-3.5 h-3.5 text-[#1A73E8]" />
              <span>العملاء</span>
            </button>
            <button
              onClick={() => setActiveMainView('team')}
              className={`px-3.5 py-1 rounded-full text-xs transition-all flex items-center gap-1.5 ${
                activeMainView === 'team'
                  ? 'bg-[#E8F0FE] text-[#1A73E8] font-bold shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-white/60 font-medium'
              }`}
            >
              <Users className="w-3.5 h-3.5 text-[#1A73E8]" />
              <span>الفريق</span>
            </button>
          </nav>
        )}
      </div>

      {/* Center Section: Compact Inline Brand, Channel & Dynamic Location Selectors */}
      {activeMainView === 'chat' && (
        <div className="flex items-center gap-2">
          {/* Brand Switcher Pill Dropdown */}
          <div className="relative">
            <button
              onClick={() => setIsBrandDropdownOpen(!isBrandDropdownOpen)}
              className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-100/70 hover:bg-white text-xs font-semibold text-slate-800 border border-slate-200/60 shadow-2xs transition"
            >
              {selectedBrandObj?.logo_url ? (
                <img src={selectedBrandObj.logo_url} alt="" className="w-3.5 h-3.5 rounded-full object-cover" />
              ) : (
                <span className="w-2 h-2 rounded-full bg-[#1A73E8]" />
              )}
              <span>{selectedBrandObj?.name || 'كل الماركات'}</span>
              <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
            </button>

            {isBrandDropdownOpen && (
              <div className="absolute top-full right-0 mt-1.5 w-52 max-h-72 overflow-y-auto bg-white/98 backdrop-blur-xl rounded-2xl shadow-xl border border-white/80 p-1.5 z-50 space-y-0.5 animate-in fade-in zoom-in-95 duration-100 scrollbar-none">
                {dynamicBrands.map((b) => {
                  const brandUnread = unreadSummary?.brands?.[b.id] || unreadSummary?.brands?.[b.name] || 0;
                  return (
                    <button
                      key={b.id}
                      onClick={() => {
                        setSelectedBrandId(b.id);
                        setIsBrandDropdownOpen(false);
                      }}
                      className={`w-full text-right px-3 py-2 rounded-xl text-xs transition flex items-center justify-between ${
                        selectedBrandId === b.id
                          ? 'bg-[#E8F0FE] text-[#1A73E8] font-bold border border-[#1A73E8]/20'
                          : 'text-slate-700 hover:bg-slate-50 font-medium'
                      }`}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        {b.logo_url ? (
                          <img src={b.logo_url} alt="" className="w-4 h-4 rounded-full object-cover shrink-0" />
                        ) : (
                          <div className={`w-4 h-4 rounded-full bg-gradient-to-tr ${b.color} text-white flex items-center justify-center text-[8px] font-bold shrink-0`}>
                            {b.avatar?.substring(0, 2) || 'ST'}
                          </div>
                        )}
                        <span className="truncate">{b.name}</span>
                      </div>
                      {brandUnread > 0 && (
                        <span className="bg-[#1A73E8] text-white text-[10px] px-1.5 py-0.2 rounded-full font-bold shrink-0">
                          {brandUnread}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Clean Channel Dropdown Selector */}
          <select
            value={selectedChannel}
            onChange={(e) => setSelectedChannel(e.target.value as ChannelFilterType)}
            className="bg-slate-100/70 hover:bg-white text-slate-800 text-xs font-semibold rounded-full px-3 py-1 border border-slate-200/60 shadow-2xs focus:outline-none cursor-pointer"
          >
            {channels.map((ch) => (
              <option key={ch.id} value={ch.id}>
                {ch.label}
              </option>
            ))}
          </select>

          {/* Dynamic Database-Driven Location Dropdown Selector */}
          <select
            value={selectedCountry}
            onChange={(e) => setSelectedCountry(e.target.value)}
            className="bg-slate-100/70 hover:bg-white text-slate-800 text-xs font-semibold rounded-full px-3 py-1 border border-slate-200/60 shadow-2xs focus:outline-none cursor-pointer"
          >
            <option value="all">🌍 كل المواقع</option>
            {(availableCountries || []).map((c) => (
              <option key={c} value={c}>
                📍 {c}
              </option>
            ))}
            <option value="unspecified">⚪ غير محدد</option>
          </select>

          {/* Dynamic Team Member / Agent Dropdown Selector */}
          <select
            value={selectedAgentId}
            onChange={(e) => setSelectedAgentId(e.target.value)}
            className="bg-slate-100/70 hover:bg-white text-slate-800 text-xs font-semibold rounded-full px-3 py-1 border border-slate-200/60 shadow-2xs focus:outline-none cursor-pointer"
          >
            <option value="all">👥 كل الموظفين</option>
            {(teamMembers || []).map((m) => (
              <option key={m.id} value={m.id}>
                👤 {m.full_name} {m.role === 'admin' ? '(مدير)' : ''}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Left Section (RTL End): Integrations Modal, Profile & Quick Post Action */}
      <div className="flex items-center gap-2">
        {/* Omnichannel Integrations Hub Trigger Button */}
        <button
          onClick={() => setIsIntegrationsModalOpen(true)}
          className="px-3 py-1 rounded-full bg-[#E8F0FE] hover:bg-blue-100 text-[#1A73E8] text-xs font-bold border border-[#1A73E8]/20 transition flex items-center gap-1.5 shadow-2xs"
          title="ربط القنوات والويب هـوك"
        >
          <Plug className="w-3.5 h-3.5 text-[#1A73E8]" />
          <span>ربط القنوات</span>
        </button>

        {/* Quick Post Publisher Action */}
        <button
          onClick={() => setIsPostModalOpen(true)}
          className="px-3.5 py-1 rounded-full bg-[#1A73E8] hover:bg-[#1557B0] text-white text-xs font-bold shadow-xs transition flex items-center gap-1.5"
        >
          <Share2 className="w-3.5 h-3.5 text-white" />
          <span>نشر منشور</span>
        </button>

        {/* Provider Mode Status Badge (Embedded Authenticated Indicator) */}
        <ProviderStatusIndicator />

        {/* User Profile & Logout */}
        {user && (
          <div className="flex items-center gap-2 pr-2 border-r border-slate-100">
            <div className="flex items-center gap-1.5 px-2.5 py-1 bg-slate-50 rounded-xl border border-slate-200/70 text-xs font-semibold text-slate-800">
              <UserIcon className="w-3.5 h-3.5 text-teal-600" />
              <span className="truncate max-w-[100px]">{user.full_name}</span>
            </div>
            <button
              onClick={logout}
              className="p-1.5 rounded-xl text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition"
              title="تسجيل الخروج"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>

      {/* Quick Post Publisher Modal (Rendered with Portal for Perfect Viewport Centering) */}
      {isPostModalOpen &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            className="fixed inset-0 bg-slate-950/60 backdrop-blur-sm z-[9999] flex items-center justify-center p-4 select-none overflow-y-auto animate-in fade-in duration-150 dir-rtl text-right"
            onClick={() => setIsPostModalOpen(false)}
          >
            <div
              className="bg-white rounded-3xl max-w-lg w-full p-6 shadow-2xl border border-slate-200/80 space-y-4 animate-in zoom-in-95 duration-150 my-auto"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Modal Header */}
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-2xl bg-[#1877F2]/10 text-[#1877F2] flex items-center justify-center font-bold border border-[#1877F2]/20">
                    <Share2 className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-sm font-extrabold text-slate-900">نشر منشور على صفحة الفيسبوك</h3>
                    <p className="text-[11px] text-slate-500 font-medium">سيتم تزويد المنشور بزر "إرسال رسالة" (Send Message) تلقائياً</p>
                  </div>
                </div>
                <button
                  onClick={() => setIsPostModalOpen(false)}
                  className="p-1.5 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition"
                  title="إغلاق"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Modal Form */}
              <form onSubmit={handlePublishPost} className="space-y-4">
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="block text-xs font-bold text-slate-700">محتوى المنشور:</label>
                    <span className="text-[10px] font-mono text-slate-400">{postMessage.length} حرف</span>
                  </div>
                  <textarea
                    rows={4}
                    required
                    value={postMessage}
                    onChange={(e) => setPostMessage(e.target.value)}
                    placeholder="اكتب محتوى المنشور هنا (مثل: استمتع بأحدث العروض والخصومات الحصرية اليوم...)"
                    className="w-full bg-slate-50 text-xs text-slate-900 p-3.5 rounded-2xl border border-slate-200 focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#1877F2]/20 focus:border-[#1877F2] font-medium leading-relaxed resize-none shadow-inner"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5">رابط اختياري للمنتج / العرض (Link):</label>
                  <input
                    type="text"
                    value={postLink}
                    onChange={(e) => setPostLink(e.target.value)}
                    placeholder="https://luxira.com/offer أو luxira.com"
                    className="w-full bg-slate-50 text-xs text-slate-900 px-3.5 py-2.5 rounded-xl border border-slate-200 focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#1877F2]/20 focus:border-[#1877F2] font-medium"
                  />
                </div>

                {publishSuccess && (
                  <div className="p-3 bg-emerald-50 text-emerald-800 rounded-2xl text-xs font-bold border border-emerald-200 flex items-center gap-2 animate-in fade-in">
                    <Check className="w-4 h-4 text-emerald-600 shrink-0" />
                    <span>{publishSuccess}</span>
                  </div>
                )}

                {publishError && (
                  <div className="p-3 bg-rose-50 text-rose-800 rounded-2xl text-xs font-bold border border-rose-200 animate-in fade-in">
                    {publishError}
                  </div>
                )}

                <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => setIsPostModalOpen(false)}
                    className="px-4 py-2.5 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100 transition"
                  >
                    إلغاء
                  </button>
                  <button
                    type="submit"
                    disabled={isPublishing || !postMessage.trim()}
                    className="px-5 py-2.5 rounded-xl bg-[#1877F2] hover:bg-blue-700 text-white text-xs font-bold transition flex items-center gap-2 shadow-md shadow-blue-500/20 disabled:opacity-50 active:scale-95 cursor-pointer"
                  >
                    <Send className="w-3.5 h-3.5 rotate-180" />
                    <span>{isPublishing ? 'جاري النشر...' : 'نشر الآن'}</span>
                  </button>
                </div>
              </form>
            </div>
          </div>,
          document.body
        )}
    </header>
  );
};
