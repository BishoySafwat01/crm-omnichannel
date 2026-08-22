import React, { useState, useEffect } from 'react';
import { MessageSquare, CheckCircle, Layers, Share2, X, Send, Check, LogOut, User as UserIcon, Bot, BarChart3, Database, Users, ChevronDown, Filter, Plug, MapPin } from 'lucide-react';
import { MOCK_BRANDS, metaApi } from '../services/api';
import { useCrmStore, ChannelFilterType } from '../store/useCrmStore';
import { useAuthStore } from '../store/useAuthStore';

interface TopBarProps {
  activeMainView?: 'chat' | 'automations' | 'dashboard' | 'database' | 'team';
  setActiveMainView?: (view: 'chat' | 'automations' | 'dashboard' | 'database' | 'team') => void;
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
    setIsIntegrationsModalOpen,
    unreadSummary,
    fetchUnreadSummary,
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

    try {
      const data = await metaApi.publishPost(postMessage.trim(), postLink.trim() || undefined);

      setPublishSuccess(`تم نشر المنشور بنجاح (ID: ${data.post_id || 'تم'})`);
      setPostMessage('');
      setPostLink('');
      setTimeout(() => {
        setIsPostModalOpen(false);
        setPublishSuccess(null);
      }, 2500);
    } catch (err: any) {
      setPublishError(err?.message || 'تعذر نشر المنشور. يرجى التحقق من الاتصال بالخادم.');
    } finally {
      setIsPublishing(false);
    }
  };

  const isUserAdmin = user?.role === 'admin' || (user?.role as any) === 'ADMIN';

  const selectedBrandObj = MOCK_BRANDS.find((b) => b.id === selectedBrandId) || MOCK_BRANDS[0];

  return (
    <header className="h-13 my-2 mx-4 px-5 bg-white/80 backdrop-blur-xl border border-white/80 shadow-[0_4px_20px_-2px_rgba(0,0,0,0.03)] rounded-2xl flex items-center justify-between shrink-0 relative z-30 transition-all">
      {/* Right Section (RTL Start): Logo & 5-Way Main View Switcher */}
      <div className="flex items-center gap-5">
        {/* Brand Identity Mark */}
        <div className="flex items-center gap-2 shrink-0">
          <div className="w-7 h-7 rounded-xl bg-gradient-to-tr from-[#1A73E8] to-teal-500 text-white flex items-center justify-center font-bold shadow-xs">
            <Layers className="w-4 h-4" />
          </div>
          <span className="text-sm font-extrabold text-slate-900 tracking-tight hidden sm:inline">LUXIRA</span>
        </div>

        {/* 5-Way View Navigation Tabs */}
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
              <span className="w-2 h-2 rounded-full bg-[#1A73E8]" />
              <span>{selectedBrandObj?.name || 'كل الماركات'}</span>
              <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
            </button>

            {isBrandDropdownOpen && (
              <div className="absolute top-full right-0 mt-1.5 w-48 bg-white/95 backdrop-blur-xl rounded-2xl shadow-xl border border-white/80 p-1.5 z-50 space-y-0.5 animate-in fade-in zoom-in-95 duration-100">
                {MOCK_BRANDS.map((b) => {
                  const brandUnread = unreadSummary?.brands?.[b.id] || 0;
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
                      <span>{b.name}</span>
                      {brandUnread > 0 && (
                        <span className="bg-[#1A73E8] text-white text-[10px] px-1.5 py-0.2 rounded-full font-bold">
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
        </div>
      )}

      {/* Left Section (RTL End): WebSocket Status, Integrations Modal, Profile & Quick Post Action */}
      <div className="flex items-center gap-2">
        {/* Live WebSocket Status Dot */}
        <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-50 border border-emerald-200/70 text-xs font-semibold text-emerald-700">
          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
          <span>مباشر</span>
        </div>

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

      {/* Quick Post Publisher Modal */}
      {isPostModalOpen && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200 space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-emerald-100 text-emerald-700 flex items-center justify-center font-bold">
                  <Share2 className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900">نشر منشور على صفحة الفيسبوك</h3>
                  <p className="text-[11px] text-slate-500">منشور مزود زر "إرسال رسالة" تلقائياً</p>
                </div>
              </div>
              <button
                onClick={() => setIsPostModalOpen(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handlePublishPost} className="space-y-3.5">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">محتوى المنشور:</label>
                <textarea
                  rows={4}
                  required
                  value={postMessage}
                  onChange={(e) => setPostMessage(e.target.value)}
                  placeholder="اكتب محتوى المنشور هنا (مثل: أحدث العروض والخصومات اليوم...)"
                  className="w-full bg-slate-50 text-xs text-slate-900 p-3 rounded-xl border border-slate-200 focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 font-medium"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">رابط اختياري (Link):</label>
                <input
                  type="url"
                  value={postLink}
                  onChange={(e) => setPostLink(e.target.value)}
                  placeholder="https://luxira.com/offer"
                  className="w-full bg-slate-50 text-xs text-slate-900 px-3 py-2 rounded-xl border border-slate-200 focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 font-medium"
                />
              </div>

              {publishSuccess && (
                <div className="p-3 bg-emerald-50 text-emerald-800 rounded-xl text-xs font-semibold border border-emerald-200 flex items-center gap-2">
                  <Check className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>{publishSuccess}</span>
                </div>
              )}

              {publishError && (
                <div className="p-3 bg-rose-50 text-rose-800 rounded-xl text-xs font-semibold border border-rose-200">
                  {publishError}
                </div>
              )}

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsPostModalOpen(false)}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-100 transition"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  disabled={isPublishing || !postMessage.trim()}
                  className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition flex items-center gap-1.5 shadow-2xs disabled:opacity-50"
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>{isPublishing ? 'جاري النشر...' : 'نشر الآن'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </header>
  );
};
