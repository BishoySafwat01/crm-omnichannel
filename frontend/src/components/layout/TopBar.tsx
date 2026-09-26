import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { BarChart3, Bot, Check, Database, LogOut, Menu, MessageCircle, MessageSquare, Radio, Settings as SettingsIcon, Users, X } from 'lucide-react';
import { useAuthStore, isAdminUser } from '../../store/useAuthStore';

interface TopBarProps {
  activeMainView?: 'chat' | 'comments' | 'automations' | 'dashboard' | 'database' | 'team' | 'channels' | 'settings';
  setActiveMainView?: (view: 'chat' | 'comments' | 'automations' | 'dashboard' | 'database' | 'team' | 'channels' | 'settings') => void;
  isRealtimeConnected?: boolean;
}

export const TopBar: React.FC<TopBarProps> = ({ activeMainView = 'chat', setActiveMainView }) => {
  const { user, logout } = useAuthStore();
  const [isNavigationDrawerOpen, setIsNavigationDrawerOpen] = useState(false);
  const navigationToggleRef = useRef<HTMLButtonElement>(null);
  const normalizedRole = String(user?.role || '').toLowerCase();
  const isUserAdmin = isAdminUser(user);
  const isCallCenterUser = normalizedRole === 'agent' || normalizedRole === 'call_center';

  useEffect(() => {
    if (!isNavigationDrawerOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsNavigationDrawerOpen(false);
        navigationToggleRef.current?.focus();
      }
    };
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', handleEscape);
    };
  }, [isNavigationDrawerOpen]);

  const navItems: {
    id: 'chat' | 'database' | 'channels' | 'automations' | 'dashboard' | 'team' | 'comments' | 'settings';
    label: string;
    icon: React.ReactNode;
  }[] = [
    { id: 'chat', label: 'الشات المباشر', icon: <MessageSquare className="h-4 w-4" /> },
    { id: 'database', label: 'العملاء', icon: <Database className="h-4 w-4" /> },
    { id: 'channels', label: 'القنوات', icon: <Radio className="h-4 w-4" /> },
    { id: 'automations', label: 'الأتمتة', icon: <Bot className="h-4 w-4" /> },
    { id: 'dashboard', label: 'التحليلات', icon: <BarChart3 className="h-4 w-4" /> },
    { id: 'team', label: 'الفريق', icon: <Users className="h-4 w-4" /> },
    { id: 'comments', label: 'التعليقات', icon: <MessageCircle className="h-4 w-4" /> },
    { id: 'settings', label: 'الإعدادات', icon: <SettingsIcon className="h-4 w-4" /> },
  ];

  return (
    <header dir="ltr" className="sticky top-0 z-30 grid h-16 w-full grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center border-b border-slate-200/70 bg-white/95 px-3 shadow-sm backdrop-blur-md sm:px-5">
      <div className="flex justify-start">
        <button ref={navigationToggleRef} type="button" onClick={() => setIsNavigationDrawerOpen((isOpen) => !isOpen)} aria-haspopup="dialog" aria-expanded={isNavigationDrawerOpen} aria-controls="account-navigation-drawer" className="rounded-full border border-slate-200 bg-white p-2.5 text-slate-700 shadow-sm transition hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-theme-primary/20" title="فتح قائمة التنقل">
          <Menu className="h-5 w-5" />
        </button>
      </div>

      <div dir="rtl" className="min-w-0 px-3 text-center leading-tight">
        <p className="truncate text-sm font-bold tracking-wide text-slate-950 sm:text-base">LUXIRA HOLDING</p>
        <p className="mt-0.5 max-w-[46vw] truncate text-xs text-muted-foreground">{user?.full_name || 'مستخدم النظام'}</p>
      </div>

      <div aria-hidden="true" />

      {user && typeof document !== 'undefined' && createPortal(
        <div className={`fixed inset-0 z-[9998] transition-[visibility] duration-300 ${isNavigationDrawerOpen ? 'visible' : 'invisible pointer-events-none'}`} aria-hidden={!isNavigationDrawerOpen}>
          <button type="button" tabIndex={isNavigationDrawerOpen ? 0 : -1} aria-label="إغلاق قائمة التنقل" onClick={() => setIsNavigationDrawerOpen(false)} className={`absolute inset-0 h-full w-full bg-slate-950/45 backdrop-blur-[2px] transition-opacity duration-300 ${isNavigationDrawerOpen ? 'opacity-100' : 'opacity-0'}`} />
          <aside id="account-navigation-drawer" role="dialog" aria-modal="true" aria-label="قائمة الحساب والتنقل" dir="rtl" className={`absolute inset-y-0 right-0 flex w-[min(92vw,360px)] flex-col border-l border-slate-200 bg-white text-right shadow-2xl transition-transform duration-300 ease-out ${isNavigationDrawerOpen ? 'translate-x-0' : 'translate-x-full'}`}>
            <div className="relative border-b border-slate-200 bg-slate-50 px-5 py-5">
              <button type="button" tabIndex={isNavigationDrawerOpen ? 0 : -1} onClick={() => setIsNavigationDrawerOpen(false)} className="absolute left-4 top-4 rounded-full p-2 text-slate-500 transition hover:bg-white hover:text-slate-900" aria-label="إغلاق القائمة"><X className="h-5 w-5" /></button>
              <p className="truncate pl-10 text-sm font-bold text-slate-950">{user.full_name || 'مستخدم النظام'}</p>
              <p className="mt-1 truncate pl-10 text-xs text-muted-foreground">{user.email}</p>
            </div>

            <div className="flex-1 overflow-y-auto p-4">
              {(isUserAdmin || isCallCenterUser) && setActiveMainView && (
                <nav aria-label="التنقل الرئيسي" className="space-y-1">
                  {navItems.filter((item) => isUserAdmin || item.id === 'chat' || item.id === 'automations').map((item) => {
                    const isActive = activeMainView === item.id;
                    return (
                      <button key={item.id} type="button" tabIndex={isNavigationDrawerOpen ? 0 : -1} onClick={() => { setActiveMainView(item.id); setIsNavigationDrawerOpen(false); }} aria-current={isActive ? 'page' : undefined} className={`flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-sm transition ${isActive ? 'bg-theme-primary-tint font-bold text-theme-primary' : 'font-medium text-slate-700 hover:bg-slate-50'}`}>
                        <span className="flex items-center gap-3">{item.icon}{item.label}</span>
                        {isActive && <Check className="h-4 w-4" />}
                      </button>
                    );
                  })}
                </nav>
              )}
            </div>

            <div className="border-t border-slate-200 p-4">
              <button type="button" tabIndex={isNavigationDrawerOpen ? 0 : -1} onClick={() => { setIsNavigationDrawerOpen(false); logout(); }} className="flex w-full items-center justify-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-bold text-rose-700 transition hover:bg-rose-100">
                <LogOut className="h-4 w-4" />
                تسجيل الخروج
              </button>
            </div>
          </aside>
        </div>,
        document.body
      )}
    </header>
  );
};

export default TopBar;
