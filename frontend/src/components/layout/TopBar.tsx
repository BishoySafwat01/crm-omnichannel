import React, { useState, useEffect, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';
import {
  MessageSquare,
  MessageCircle,
  Share2,
  X,
  Send,
  Check,
  LogOut,
  Bot,
  BarChart3,
  Database,
  Users,
  ChevronDown,
  Radio,
  Bell,
  SlidersHorizontal,
  Globe,
  Layers,
} from 'lucide-react';
import { useBrandStore } from '../../store/useBrandStore';
import { useCrmStore, ChannelFilterType } from '../../store/useCrmStore';
import { useAuthStore, isAdminUser } from '../../store/useAuthStore';
import { metaApi } from '../../services/api';
import { ProviderStatusIndicator } from '../ProviderStatusIndicator';
import { getBrandObject } from '../ConversationAvatar';
import luxiraLogo from '../../assets/luxira-logo.png';
import { usePortalBrandingStore } from '../../store/usePortalBrandingStore';

interface TopBarProps {
  activeMainView?: 'chat' | 'comments' | 'automations' | 'dashboard' | 'database' | 'team' | 'channels';
  setActiveMainView?: (view: 'chat' | 'comments' | 'automations' | 'dashboard' | 'database' | 'team' | 'channels') => void;
}

export const TopBar: React.FC<TopBarProps> = ({ activeMainView = 'chat', setActiveMainView }) => {
  const {
    selectedProvider,
    setSelectedProvider,
    selectedBrandId,
    setSelectedBrandId,
    selectedChannel,
    setSelectedChannel,
    selectedCountry,
    setSelectedCountry,
    availableCountries,
    unreadSummary,
    fetchUnreadSummary,
    conversations,
  } = useCrmStore();
  const { user, logout } = useAuthStore();
  const { branding } = usePortalBrandingStore();

  const [isPostModalOpen, setIsPostModalOpen] = useState(false);
  const [postMessage, setPostMessage] = useState('');
  const [postLink, setPostLink] = useState('');
  const [isPublishing, setIsPublishing] = useState(false);
  const [publishSuccess, setPublishSuccess] = useState<string | null>(null);
  const [publishError, setPublishError] = useState<string | null>(null);

  // Dropdown states with outside click detection
  const [isBrandDropdownOpen, setIsBrandDropdownOpen] = useState(false);
  const brandDropdownRef = useRef<HTMLDivElement>(null);

  const [isChannelDropdownOpen, setIsChannelDropdownOpen] = useState(false);
  const channelDropdownRef = useRef<HTMLDivElement>(null);

  const [isSecondaryOpen, setIsSecondaryOpen] = useState(false);
  const secondaryDropdownRef = useRef<HTMLDivElement>(null);

  const [isNotifOpen, setIsNotifOpen] = useState(false);
  const notifDropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetchUnreadSummary();
  }, [fetchUnreadSummary]);

  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (brandDropdownRef.current && !brandDropdownRef.current.contains(e.target as Node)) {
        setIsBrandDropdownOpen(false);
      }
      if (channelDropdownRef.current && !channelDropdownRef.current.contains(e.target as Node)) {
        setIsChannelDropdownOpen(false);
      }
      if (secondaryDropdownRef.current && !secondaryDropdownRef.current.contains(e.target as Node)) {
        setIsSecondaryOpen(false);
      }
      if (notifDropdownRef.current && !notifDropdownRef.current.contains(e.target as Node)) {
        setIsNotifOpen(false);
      }
    };
    if (isBrandDropdownOpen || isChannelDropdownOpen || isSecondaryOpen || isNotifOpen) {
      document.addEventListener('mousedown', handleOutsideClick);
    }
    return () => {
      document.removeEventListener('mousedown', handleOutsideClick);
    };
  }, [isBrandDropdownOpen, isChannelDropdownOpen, isSecondaryOpen, isNotifOpen]);

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

      setPublishSuccess(`تم نشر المنشور بنجاح على صفحة فيسبوك (ID: ${data.post_id || 'تم'})`);
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

  const isUserAdmin = isAdminUser(user);

  const dynamicBrands = useBrandStore((state) => state.brands);

  const selectedBrandObj = useMemo(() => {
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

  // Main navigation tabs ordered by workflow priority
  const navItems: {
    id: 'chat' | 'database' | 'channels' | 'automations' | 'dashboard' | 'team' | 'comments';
    label: string;
    icon: React.ReactNode;
  }[] = [
    { id: 'chat', label: 'الشات المباشر', icon: <MessageSquare className="w-3.5 h-3.5" /> },
    { id: 'database', label: 'العملاء', icon: <Database className="w-3.5 h-3.5" /> },
    { id: 'channels', label: 'القنوات', icon: <Radio className="w-3.5 h-3.5" /> },
    { id: 'automations', label: 'الأتمتة', icon: <Bot className="w-3.5 h-3.5" /> },
    { id: 'dashboard', label: 'التحليلات', icon: <BarChart3 className="w-3.5 h-3.5" /> },
    { id: 'team', label: 'الفريق', icon: <Users className="w-3.5 h-3.5" /> },
    { id: 'comments', label: 'التعليقات', icon: <MessageCircle className="w-3.5 h-3.5" /> },
  ];

  return (
    <header className="sticky top-0 z-30 w-full bg-white/95 backdrop-blur-md border-b border-slate-100 shadow-[0_1px_3px_0_rgba(0,0,0,0.02)] px-4 py-2 flex items-center justify-between select-none">
      {/* Right Side (RTL Start): LUXIRA HOLDING Corporate Brand Mark + Primary Navigation */}
      <div className="flex items-center gap-4">
        {/* Corporate Brand Mark & Dynamic Typographic Branding */}
        <div className="flex items-center gap-2.5 shrink-0 group cursor-default">
          <div className="h-9 w-9 rounded-xl bg-slate-950 p-1 flex items-center justify-center shadow-xs border border-teal-500/30 transition-transform duration-200 ease-out group-hover:scale-105 overflow-hidden">
            <img
              src={branding.brand_logo_url || luxiraLogo}
              alt={branding.brand_display_name || "LUXIRA HOLDING"}
              className="h-7 w-7 object-contain drop-shadow-xs"
            />
          </div>
          <div className="flex flex-col">
            <div className="flex items-center gap-1 leading-none">
              <span className="text-sm font-black text-slate-900 tracking-tight">
                {branding.brand_display_name || "LUXIRA HOLDING"}
              </span>
            </div>
            <span className="text-[8px] font-bold text-slate-400 tracking-widest uppercase mt-0.5">
              {branding.workspace_name && branding.workspace_name !== 'Default Organization' ? branding.workspace_name : 'OMNICHANNEL CRM'}
            </span>
          </div>
        </div>

        {/* Primary Navigation Strip (Admin Restricted) */}
        {isUserAdmin && setActiveMainView && (
          <nav className="flex items-center gap-1 bg-slate-100/70 p-1 rounded-2xl border border-slate-200/60 backdrop-blur-md">
            {navItems.map((item) => {
              const isActive = activeMainView === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => setActiveMainView(item.id)}
                  className={`text-xs flex items-center gap-1.5 select-none cursor-pointer transition-all duration-200 ease-out ${
                    isActive
                      ? 'bg-teal-600 text-white shadow-xs font-semibold rounded-xl px-3.5 py-1.5'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50 font-medium rounded-xl px-3.5 py-1.5 transition-colors'
                  }`}
                >
                  <span className={isActive ? 'text-white' : 'text-slate-500'}>
                    {item.icon}
                  </span>
                  <span>{item.label}</span>
                </button>
              );
            })}
          </nav>
        )}
      </div>

      {/* Middle Side: Compact, Sleek Contextual Filter Triggers */}
      <div className="flex items-center gap-2">
        {activeMainView === 'chat' && (
          <>
            {/* 1. Store / Brand Switcher Pill Dropdown */}
            <div className="relative" ref={brandDropdownRef}>
              <button
                type="button"
                onClick={() => setIsBrandDropdownOpen(!isBrandDropdownOpen)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-50/80 hover:bg-slate-100 border border-slate-200/70 text-slate-700 text-xs font-medium transition-colors shadow-2xs cursor-pointer"
                title="تصفية المحادثات حسب الماركة"
              >
                {selectedBrandObj?.logo_url ? (
                  <img src={selectedBrandObj.logo_url} alt="" className="w-3.5 h-3.5 rounded-full object-cover ring-1 ring-slate-200" />
                ) : (
                  <span className="w-2 h-2 rounded-full bg-teal-600" />
                )}
                <span className="max-w-[85px] truncate">{selectedBrandObj?.name || 'كل الماركات'}</span>
                <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
              </button>

              {isBrandDropdownOpen && (
                <div className="absolute top-full right-0 mt-1.5 w-52 max-h-72 overflow-y-auto bg-white/95 backdrop-blur-md rounded-2xl shadow-xl shadow-slate-900/5 border border-slate-100 p-1.5 z-50 space-y-0.5 animate-in fade-in zoom-in-95 duration-150 scrollbar-none">
                  {dynamicBrands.map((b) => {
                    const brandUnread = unreadSummary?.brands?.[b.id] || unreadSummary?.brands?.[b.name] || 0;
                    const isSelected = selectedBrandId === b.id || (!selectedBrandId && b.id === 'all');
                    return (
                      <button
                        key={b.id}
                        type="button"
                        onClick={() => {
                          setSelectedBrandId(b.id);
                          setIsBrandDropdownOpen(false);
                        }}
                        className={`w-full text-right px-3 py-2 rounded-xl text-xs transition-colors duration-150 flex items-center justify-between cursor-pointer ${
                          isSelected
                            ? 'bg-teal-50 text-teal-700 font-bold border border-teal-200/50'
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
                          <span className="bg-teal-600 text-white text-[10px] px-1.5 py-0.2 rounded-full font-bold shrink-0">
                            {brandUnread}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* 2. Channel Filter Pill Dropdown */}
            <div className="relative" ref={channelDropdownRef}>
              <button
                type="button"
                onClick={() => setIsChannelDropdownOpen(!isChannelDropdownOpen)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-50/80 hover:bg-slate-100 border border-slate-200/70 text-slate-700 text-xs font-medium transition-colors shadow-2xs cursor-pointer"
                title="تصفية المحادثات حسب القناة"
              >
                <Radio className="w-3.5 h-3.5 text-teal-600" />
                <span>{channels.find((c) => c.id === selectedChannel)?.label || 'كل القنوات'}</span>
                <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
              </button>

              {isChannelDropdownOpen && (
                <div className="absolute top-full right-0 mt-1.5 w-44 bg-white/95 backdrop-blur-md rounded-2xl shadow-xl shadow-slate-900/5 border border-slate-100 p-1.5 z-50 space-y-0.5 animate-in fade-in zoom-in-95 duration-150">
                  {channels.map((ch) => (
                    <button
                      key={ch.id}
                      type="button"
                      onClick={() => {
                        setSelectedChannel(ch.id);
                        setIsChannelDropdownOpen(false);
                      }}
                      className={`w-full text-right px-3 py-2 rounded-xl text-xs transition-colors duration-150 flex items-center justify-between cursor-pointer ${
                        selectedChannel === ch.id
                          ? 'bg-teal-50 text-teal-700 font-bold border border-teal-200/50'
                          : 'text-slate-700 hover:bg-slate-50 font-medium'
                      }`}
                    >
                      <span>{ch.label}</span>
                      {selectedChannel === ch.id && <Check className="w-3.5 h-3.5 text-teal-600" />}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* 3. Segmented Provider Controller (No Emojis, Pure SVGs & Typography) */}
            <div className="flex items-center bg-slate-100/70 p-0.5 rounded-xl border border-slate-200/60 shadow-2xs">
              <button
                type="button"
                onClick={() => setSelectedProvider('all')}
                className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-all duration-150 cursor-pointer ${
                  selectedProvider === 'all'
                    ? 'bg-white text-slate-900 shadow-xs font-semibold'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
                title="عرض كل المزودين"
              >
                <span>الكل</span>
              </button>
              <button
                type="button"
                onClick={() => setSelectedProvider('meta')}
                className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-all duration-150 flex items-center gap-1.5 cursor-pointer ${
                  selectedProvider === 'meta'
                    ? 'bg-white text-teal-700 shadow-xs font-semibold'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
                title="محادثات Meta Graph API المباشرة"
              >
                <Globe className={`w-3.5 h-3.5 ${selectedProvider === 'meta' ? 'text-teal-600' : 'text-slate-400'}`} />
                <span>ميتا مباشر</span>
              </button>
              <button
                type="button"
                onClick={() => setSelectedProvider('beon')}
                className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-all duration-150 flex items-center gap-1.5 cursor-pointer ${
                  selectedProvider === 'beon'
                    ? 'bg-white text-teal-700 shadow-xs font-semibold'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
                title="محادثات مزود BeOn Gateway V3"
              >
                <Layers className={`w-3.5 h-3.5 ${selectedProvider === 'beon' ? 'text-teal-600' : 'text-slate-400'}`} />
                <span>مزود BeOn</span>
              </button>
            </div>

            {/* 4. Grouped Secondary Actions Popover (Location Filter & Quick Post) */}
            <div className="relative" ref={secondaryDropdownRef}>
              <button
                type="button"
                onClick={() => setIsSecondaryOpen(!isSecondaryOpen)}
                className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl border text-xs font-medium transition-colors shadow-2xs cursor-pointer ${
                  isSecondaryOpen || (selectedCountry && selectedCountry !== 'all')
                    ? 'bg-teal-50 text-teal-800 border-teal-300 ring-2 ring-teal-500/20'
                    : 'bg-slate-50/80 text-slate-700 border-slate-200/70 hover:bg-slate-100'
                }`}
                title="خيارات إضافية (الموقع الجغرافي والنشر)"
              >
                <SlidersHorizontal className="w-3.5 h-3.5 text-slate-500" />
                <span className="hidden xl:inline text-[11px]">
                  {selectedCountry && selectedCountry !== 'all' ? selectedCountry : 'أدوات إضافية'}
                </span>
                <ChevronDown className="w-3 h-3 text-slate-400" />
              </button>

              {isSecondaryOpen && (
                <div className="absolute top-full right-0 mt-1.5 w-72 bg-white/95 backdrop-blur-md rounded-2xl shadow-xl shadow-slate-900/5 border border-slate-100 p-3 z-50 animate-in fade-in zoom-in-95 duration-150 space-y-3 text-right">
                  <div className="flex items-center justify-between pb-2 border-b border-slate-100 text-slate-400">
                    <span className="text-[11px] font-bold text-slate-600">إجراءات وأدوات ثانوية</span>
                    <SlidersHorizontal className="w-3.5 h-3.5 text-slate-400" />
                  </div>

                  {/* Location Selector */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-slate-700 flex items-center gap-1.5">
                      <Globe className="w-3.5 h-3.5 text-teal-600" />
                      <span>تصفية المحادثات حسب الموقع / الدولة:</span>
                    </label>
                    <select
                      value={selectedCountry}
                      onChange={(e) => setSelectedCountry(e.target.value)}
                      className="w-full bg-slate-50 hover:bg-slate-100/80 text-slate-800 text-xs font-medium rounded-xl px-3 py-2 border border-slate-200 focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-600 transition duration-150 cursor-pointer"
                    >
                      <option value="all">كل المواقع والدول</option>
                      {(availableCountries || []).map((c) => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))}
                      <option value="unspecified">غير محدد</option>
                    </select>
                  </div>

                  {/* Quick Post Trigger */}
                  <div className="pt-2 border-t border-slate-100">
                    <button
                      type="button"
                      onClick={() => {
                        setIsSecondaryOpen(false);
                        setIsPostModalOpen(true);
                      }}
                      className="w-full flex items-center justify-between px-3 py-2 rounded-xl bg-teal-50 hover:bg-teal-100/80 text-teal-800 text-xs font-bold transition duration-150 border border-teal-200/70 cursor-pointer"
                    >
                      <div className="flex items-center gap-2">
                        <div className="w-6 h-6 rounded-lg bg-teal-600 text-white flex items-center justify-center shadow-xs">
                          <Share2 className="w-3 h-3" />
                        </div>
                        <span>نشر منشور على الفيسبوك</span>
                      </div>
                      <span className="text-[10px] text-teal-600 font-medium">Meta Page</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {/* Left Side (RTL End): Provider Status, Notification Bell, Agent Profile & Logout */}
      <div className="flex items-center gap-3">
        {/* Provider Status Indicator (Hybrid Meta + BeOn) */}
        <ProviderStatusIndicator />

        {/* Notification Bell Dropdown */}
        <div className="relative" ref={notifDropdownRef}>
          <button
            onClick={() => setIsNotifOpen(!isNotifOpen)}
            className="p-2 rounded-xl text-slate-500 hover:text-slate-800 hover:bg-slate-100/80 border border-slate-200/70 bg-slate-50 shadow-2xs hover:ring-2 hover:ring-teal-500/20 transition duration-150 relative cursor-pointer"
            title="التنبيهات والرسائل غير المقروءة"
          >
            <Bell className="w-4 h-4" />
            {unreadSummary && unreadSummary.total_unread > 0 && (
              <span className="absolute -top-1 -left-1 bg-teal-600 text-white text-[9px] font-black w-4 h-4 rounded-full flex items-center justify-center shadow-xs animate-pulse">
                {unreadSummary.total_unread > 99 ? '99+' : unreadSummary.total_unread}
              </span>
            )}
          </button>

          {isNotifOpen && (
            <div className="absolute top-full left-0 mt-2 w-64 bg-white/95 backdrop-blur-md rounded-2xl shadow-xl shadow-slate-900/5 border border-slate-100 p-3 z-50 text-right animate-in fade-in zoom-in-95 duration-150">
              <div className="flex items-center justify-between border-b border-slate-100 pb-2 mb-2">
                <span className="text-xs font-black text-slate-900">ملخص الرسائل غير المقروءة</span>
                <span className="text-[10px] font-mono font-bold bg-teal-50 text-teal-700 px-2 py-0.5 rounded-full border border-teal-200/50">
                  {unreadSummary?.total_unread || 0} رسالة
                </span>
              </div>

              {unreadSummary && unreadSummary.brands && Object.keys(unreadSummary.brands).length > 0 ? (
                <div className="space-y-1 text-xs">
                  <span className="text-[10px] text-slate-400 font-bold block mb-1">حسب العلامة التجارية:</span>
                  {Object.entries(unreadSummary.brands).map(([b, count]) => {
                    if (b.toLowerCase() === 'all' || b === 'الكل' || count <= 0) return null;
                    return (
                      <div key={b} className="flex items-center justify-between hover:bg-slate-50 transition-colors duration-150 rounded-xl px-2.5 py-1.5 text-slate-700 text-xs font-medium">
                        <span className="truncate">{b}</span>
                        <span className="font-bold font-mono text-teal-700 bg-teal-50 px-1.5 py-0.2 rounded-md border border-teal-200/50">
                          {count}
                        </span>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="text-[11px] text-slate-400 text-center py-2">لا توجد رسائل غير مقروءة حالياً</p>
              )}
            </div>
          )}
        </div>

        {/* User Profile Chip */}
        {user && (
          <div className="flex items-center gap-2 pr-2 border-r border-slate-200/60">
            <div className="flex items-center gap-2 px-2.5 py-1 bg-slate-50/80 hover:bg-slate-100/80 rounded-xl border border-slate-200/70 text-xs transition-colors">
              <div className="w-6 h-6 rounded-full bg-slate-200 text-slate-700 flex items-center justify-center text-[10px] font-bold">
                {user.full_name
                  ? user.full_name.split(' ').map((n) => n[0]).join('').substring(0, 2).toUpperCase()
                  : 'BS'}
              </div>
              <div className="flex items-center gap-1.5 leading-none">
                <span className="font-semibold text-slate-800 truncate max-w-[110px]">{user.full_name || 'Bishoy Safwat'}</span>
                <span className="text-[10px] font-medium bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded-md border border-slate-200/50">
                  {user.role === 'admin' || user.role === 'superadmin' ? 'Admin' : 'Agent'}
                </span>
              </div>
            </div>
            <button
              onClick={logout}
              className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
              title="تسجيل الخروج"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>

      {/* Quick Post Publisher Modal (Rendered with Portal for Viewport Centering) */}
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
                  <div className="w-10 h-10 rounded-2xl bg-teal-50 text-teal-700 flex items-center justify-center font-bold border border-teal-200/60">
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
                    className="w-full bg-slate-50 text-xs text-slate-900 p-3.5 rounded-2xl border border-slate-200 focus:bg-white focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-600 font-medium leading-relaxed resize-none shadow-inner"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5">رابط اختياري للمنتج / العرض (Link):</label>
                  <input
                    type="text"
                    value={postLink}
                    onChange={(e) => setPostLink(e.target.value)}
                    placeholder="https://luxira.com/offer أو luxira.com"
                    className="w-full bg-slate-50 text-xs text-slate-900 px-3.5 py-2.5 rounded-xl border border-slate-200 focus:bg-white focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-600 font-medium"
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
                    className="px-5 py-2.5 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-xs font-bold transition flex items-center gap-2 shadow-md shadow-teal-600/20 disabled:opacity-50 active:scale-98 cursor-pointer"
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

export default TopBar;
