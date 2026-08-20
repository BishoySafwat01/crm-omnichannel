import React, { useState, useEffect } from 'react';
import { MessageSquare, CheckCircle, Settings, Layers, Wifi, Share2, X, Send, Check, LogOut, User as UserIcon, Bot, BarChart3, Database } from 'lucide-react';
import { MOCK_BRANDS } from '../services/api';
import { useCrmStore, ChannelFilterType } from '../store/useCrmStore';
import { useAuthStore } from '../store/useAuthStore';

interface TopBarProps {
  activeMainView?: 'chat' | 'automations' | 'dashboard' | 'database';
  setActiveMainView?: (view: 'chat' | 'automations' | 'dashboard' | 'database') => void;
}

export const TopBar: React.FC<TopBarProps> = ({ activeMainView = 'chat', setActiveMainView }) => {
  const { selectedBrandId, setSelectedBrandId, selectedChannel, setSelectedChannel, setActiveFilterTab, unreadSummary, fetchUnreadSummary } = useCrmStore();
  const { user, logout } = useAuthStore();

  const [isPostModalOpen, setIsPostModalOpen] = useState(false);
  const [postMessage, setPostMessage] = useState('');
  const [postLink, setPostLink] = useState('');
  const [isPublishing, setIsPublishing] = useState(false);
  const [publishSuccess, setPublishSuccess] = useState<string | null>(null);
  const [publishError, setPublishError] = useState<string | null>(null);

  useEffect(() => {
    fetchUnreadSummary();
  }, []);

  const channels: { id: ChannelFilterType; label: string; activeClass: string; hoverClass: string }[] = [
    { id: 'all', label: 'الكل', activeClass: 'bg-white text-slate-800 shadow-xs border border-slate-200 font-bold', hoverClass: 'hover:bg-white/60 text-slate-600' },
    { id: 'whatsapp', label: 'واتساب', activeClass: 'bg-emerald-600 text-white shadow-xs font-bold', hoverClass: 'hover:bg-emerald-50 text-emerald-700' },
    { id: 'instagram', label: 'إنستغرام', activeClass: 'bg-gradient-to-r from-fuchsia-600 to-pink-600 text-white shadow-xs font-bold', hoverClass: 'hover:bg-fuchsia-50 text-fuchsia-700' },
    { id: 'messenger', label: 'ماسنجر', activeClass: 'bg-blue-600 text-white shadow-xs font-bold', hoverClass: 'hover:bg-blue-50 text-blue-700' },
  ];

  const getUnreadCount = (chId: ChannelFilterType): number => {
    if (!unreadSummary || !unreadSummary.channels) return 0;
    return unreadSummary.channels[chId] || 0;
  };

  const handlePublishPost = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!postMessage.trim()) return;

    setIsPublishing(true);
    setPublishSuccess(null);
    setPublishError(null);

    try {
      const res = await fetch('/api/v1/meta/posts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: postMessage.trim(),
          link: postLink.trim() || undefined,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        setPublishSuccess(`تم نشر المنشور بنجاح على صفحة الفيسبوك (ID: ${data.post_id || 'تم'})`);
        setPostMessage('');
        setPostLink('');
        setTimeout(() => {
          setIsPostModalOpen(false);
          setPublishSuccess(null);
        }, 2500);
      } else {
        const errData = await res.json().catch(() => ({ detail: 'فشل نشر المنشور' }));
        setPublishError(errData.detail || 'تعذر التواصل مع الخادم لنشر المنشور.');
      }
    } catch (err: any) {
      setPublishError('تعذر نشر المنشور. يرجى التحقق من الاتصال بالخادم.');
    } finally {
      setIsPublishing(false);
    }
  };

  const isUserAdmin = user?.role === 'admin' || (user?.role as any) === 'ADMIN';

  return (
    <>
      <header className="h-16 bg-white/85 backdrop-blur-md border-b border-slate-200/80 px-6 flex items-center justify-between shrink-0 relative z-20 shadow-xs">
        {/* Brand Header & Channel Switcher */}
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-teal-600 to-teal-700 text-white flex items-center justify-center font-bold shadow-xs">
              <Layers className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-sm font-bold text-slate-900 tracking-tight">LUXIRA HOLDING</h1>
              <p className="text-[11px] text-slate-500 font-medium">مجموعة أدوات الأعمال الرقمية</p>
            </div>
          </div>

          {/* Admin Main View Switcher (Chat vs Automations vs Dashboard vs Database) */}
          {isUserAdmin && setActiveMainView && (
            <div className="flex items-center gap-1 bg-slate-100/90 p-1 rounded-xl border border-slate-200/80 mr-2">
              <button
                onClick={() => setActiveMainView('chat')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                  activeMainView === 'chat'
                    ? 'bg-white text-teal-800 shadow-xs border border-slate-200/80 font-bold'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-white/60'
                }`}
              >
                الشات المباشر
              </button>
              <button
                onClick={() => setActiveMainView('automations')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
                  activeMainView === 'automations'
                    ? 'bg-gradient-to-r from-teal-600 to-teal-700 text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-white/60'
                }`}
              >
                <Bot className="w-3.5 h-3.5" />
                <span>الأتمتة والردود</span>
              </button>
              <button
                onClick={() => setActiveMainView('dashboard')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
                  activeMainView === 'dashboard'
                    ? 'bg-gradient-to-r from-teal-600 to-teal-700 text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-white/60'
                }`}
              >
                <BarChart3 className="w-3.5 h-3.5" />
                <span>لوحة التحليلات</span>
              </button>
              <button
                onClick={() => setActiveMainView('database')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
                  activeMainView === 'database'
                    ? 'bg-gradient-to-r from-teal-600 to-teal-700 text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-white/60'
                }`}
              >
                <Database className="w-3.5 h-3.5" />
                <span>قاعدة البيانات</span>
              </button>
            </div>
          )}



          {/* Brand Switcher Pills */}
          <div className="hidden lg:flex items-center gap-1 bg-slate-100/80 p-1 rounded-xl border border-slate-200/60 mr-2">
            {MOCK_BRANDS.map((brand) => {
              const isSelected = selectedBrandId === brand.id;
              const brandUnread = unreadSummary?.brands?.[brand.id] || 0;
              return (
                <button
                  key={brand.id}
                  onClick={() => setSelectedBrandId(brand.id)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-all duration-150 flex items-center gap-1.5 ${
                    isSelected
                      ? 'bg-white text-teal-800 shadow-xs border border-slate-200/80 font-bold'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-white/60'
                  }`}
                >
                  <span className="w-3.5 h-3.5 rounded-full bg-slate-200 text-slate-700 flex items-center justify-center text-[8px] font-bold">
                    {brand.avatar}
                  </span>
                  <span>{brand.name}</span>
                  {brandUnread > 0 && (
                    <span className="bg-red-500 text-white text-[9px] px-1.5 py-0.2 rounded-full font-bold">
                      {brandUnread}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* Channel Filter Pills */}
          <div className="flex items-center gap-1 bg-slate-100/90 p-1 rounded-xl border border-slate-200/80 mr-2">
            {channels.map((ch) => {
              const isSelected = selectedChannel === ch.id;
              const unreadCount = getUnreadCount(ch.id);
              return (
                <button
                  key={ch.id}
                  onClick={() => setSelectedChannel(ch.id)}
                  className={`px-3 py-1 rounded-lg text-xs transition-all duration-150 flex items-center gap-1.5 ${
                    isSelected ? ch.activeClass : ch.hoverClass
                  }`}
                >
                  <span>{ch.label}</span>
                  {unreadCount > 0 && (
                    <span className="bg-red-500 text-white rounded-full text-[10px] px-1.5 py-0.2 font-bold shadow animate-in fade-in">
                      {unreadCount}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>


        {/* Right Header Actions */}
        <div className="flex items-center gap-2.5">
          {/* Post Publisher Quick Action */}
          <button
            onClick={() => setIsPostModalOpen(true)}
            className="px-3 py-1.5 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 text-white text-xs font-bold shadow-xs hover:from-blue-700 hover:to-indigo-700 transition flex items-center gap-1.5"
          >
            <Share2 className="w-3.5 h-3.5" />
            <span>نشر منشور جديد</span>
          </button>

          {/* Live Socket Status Badge */}
          <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200/80 text-xs font-semibold">
            <Wifi className="w-3.5 h-3.5 text-emerald-600 animate-pulse" />
            <span>متصل مباشر</span>
          </div>

          {/* User Profile & Logout */}
          {user && (
            <div className="flex items-center gap-2 pr-2 border-r border-slate-200/80">
              <div className="flex items-center gap-1.5 px-2.5 py-1 bg-slate-100/90 rounded-xl border border-slate-200/80 text-xs font-bold text-slate-800">
                <UserIcon className="w-3.5 h-3.5 text-teal-600" />
                <span>{user.full_name}</span>
                <span className="text-[10px] bg-teal-100 text-teal-800 px-1.5 py-0.2 rounded-md uppercase font-extrabold ml-1">
                  {user.role}
                </span>
              </div>
              <button
                onClick={logout}
                className="p-1.5 rounded-xl text-slate-500 hover:text-rose-600 hover:bg-rose-50 transition"
                title="تسجيل الخروج"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          )}

          {/* Quick Action Navigation Buttons */}
          <div className="flex items-center gap-1 bg-slate-100/80 p-1 rounded-xl border border-slate-200/60">
            <button
              onClick={() => setActiveFilterTab('all')}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold text-slate-700 hover:bg-white hover:text-teal-700 transition flex items-center gap-1.5"
              title="المحادثات النشطة"
            >
              <MessageSquare className="w-3.5 h-3.5 text-teal-600" />
              <span>شات</span>
            </button>
            <button
              onClick={() => setActiveFilterTab('completed')}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold text-slate-700 hover:bg-white hover:text-emerald-700 transition flex items-center gap-1.5"
              title="المحادثات المكتملة"
            >
              <CheckCircle className="w-3.5 h-3.5 text-emerald-600" />
              <span>مكتمل</span>
            </button>
            <button
              className="p-1.5 rounded-lg text-slate-500 hover:text-slate-800 hover:bg-white transition"
              title="الإعدادات"
            >
              <Settings className="w-4 h-4" />
            </button>
          </div>
        </div>
      </header>


      {/* Quick Post Publisher Modal */}
      {isPostModalOpen && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200 space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-blue-100 text-blue-700 flex items-center justify-center font-bold">
                  <Share2 className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900">نشر منشور على صفحة الفيسبوك</h3>
                  <p className="text-[11px] text-slate-500">منشور مزود بزر "إرسال رسالة" تلقائياً</p>
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
                  className="w-full bg-slate-50 text-xs text-slate-900 p-3 rounded-xl border border-slate-200 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 font-medium"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">رابط اختياري (Link):</label>
                <input
                  type="url"
                  value={postLink}
                  onChange={(e) => setPostLink(e.target.value)}
                  placeholder="https://luxira.com/offer"
                  className="w-full bg-slate-50 text-xs text-slate-900 px-3 py-2 rounded-xl border border-slate-200 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 font-medium"
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
                  className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold transition flex items-center gap-1.5 shadow-xs disabled:opacity-50"
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>{isPublishing ? 'جاري النشر...' : 'نشر الآن'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
};


