import React from 'react';
import { ShieldCheck, ArrowLeft, ExternalLink } from 'lucide-react';
import logoImg from '../../assets/luxira-logo.png';

interface LegalLayoutProps {
  title: string;
  activeTab: 'privacy' | 'terms' | 'deletion';
  children: React.ReactNode;
}

export const LegalLayout: React.FC<LegalLayoutProps> = ({ title, activeTab, children }) => {
  const currentYear = new Date().getFullYear();

  const navigateTo = (path: string, e: React.MouseEvent) => {
    e.preventDefault();
    window.history.pushState({}, '', path);
    window.dispatchEvent(new PopStateEvent('popstate'));
  };

  return (
    <div className="min-h-screen w-full bg-slate-50 text-slate-800 flex flex-col antialiased selection:bg-teal-500 selection:text-white" dir="ltr">
      {/* Sticky Corporate Navigation Bar */}
      <header className="sticky top-0 z-50 bg-white border-b border-slate-200 shadow-sm backdrop-blur-md bg-white/95">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 h-18 py-3 flex items-center justify-between gap-4">
          <a
            href="/privacy-policy"
            onClick={(e) => navigateTo('/privacy-policy', e)}
            className="flex items-center gap-3.5 group text-left"
          >
            <div className="relative">
              <img
                src={logoImg}
                alt="LUXIRA HOLDING Logo"
                className="w-11 h-11 object-contain rounded-lg border border-slate-200 bg-white p-0.5 shadow-sm group-hover:border-teal-500 transition-colors"
              />
            </div>
            <div className="flex flex-col">
              <div className="flex items-center gap-2">
                <span className="font-extrabold text-slate-900 tracking-tight text-lg leading-tight group-hover:text-teal-700 transition-colors">
                  LUXIRA HOLDING
                </span>
                <span className="hidden sm:inline-flex items-center gap-1 text-[11px] font-bold text-emerald-800 bg-emerald-50 border border-emerald-200/80 px-2 py-0.5 rounded-full">
                  <ShieldCheck className="w-3 h-3 text-emerald-600" />
                  Verified Registry
                </span>
              </div>
              <span className="text-xs text-slate-500 font-medium">
                LUXIRA Omnichannel Platform &bull; LUXIRA KOZMETİK TİCARET LİMİTED ŞİRKETİ
              </span>
            </div>
          </a>

          {/* Navigation Items & App Switcher */}
          <div className="flex items-center gap-1.5 sm:gap-2">
            <nav className="flex items-center gap-1 bg-slate-100/80 p-1 rounded-xl border border-slate-200 text-xs sm:text-sm font-semibold">
              <a
                href="/privacy-policy"
                onClick={(e) => navigateTo('/privacy-policy', e)}
                className={`px-3 py-1.5 rounded-lg transition-all ${
                  activeTab === 'privacy'
                    ? 'bg-white text-teal-700 shadow-sm font-bold border border-slate-200/60'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-white/60'
                }`}
              >
                Privacy
              </a>
              <a
                href="/terms-of-service"
                onClick={(e) => navigateTo('/terms-of-service', e)}
                className={`px-3 py-1.5 rounded-lg transition-all ${
                  activeTab === 'terms'
                    ? 'bg-white text-teal-700 shadow-sm font-bold border border-slate-200/60'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-white/60'
                }`}
              >
                Terms
              </a>
              <a
                href="/data-deletion"
                onClick={(e) => navigateTo('/data-deletion', e)}
                className={`px-3 py-1.5 rounded-lg transition-all ${
                  activeTab === 'deletion'
                    ? 'bg-white text-teal-700 shadow-sm font-bold border border-slate-200/60'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-white/60'
                }`}
              >
                Data Deletion
              </a>
            </nav>

            <a
              href="/"
              onClick={(e) => navigateTo('/', e)}
              className="hidden md:inline-flex items-center gap-1.5 text-xs font-bold text-slate-700 hover:text-teal-700 bg-white hover:bg-slate-100 border border-slate-200 px-3 py-2 rounded-xl shadow-2xs transition-colors ml-2"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              Return to CRM
            </a>
          </div>
        </div>
      </header>

      {/* Main Document Content Area */}
      <main className="flex-1 max-w-5xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12">
        <article className="bg-white rounded-2xl border border-slate-200 shadow-xl shadow-slate-900/5 p-6 sm:p-10 lg:p-14">
          {children}
        </article>
      </main>

      {/* Corporate Compliance Footer */}
      <footer className="mt-auto border-t border-slate-200 bg-white py-10 text-center text-xs text-slate-500">
        <div className="max-w-5xl mx-auto px-4 space-y-4">
          <div className="flex flex-wrap items-center justify-center gap-4 font-semibold text-slate-600">
            <a href="/privacy-policy" onClick={(e) => navigateTo('/privacy-policy', e)} className="hover:text-teal-700">
              Privacy Policy
            </a>
            <span className="text-slate-300">&bull;</span>
            <a href="/terms-of-service" onClick={(e) => navigateTo('/terms-of-service', e)} className="hover:text-teal-700">
              Terms of Service
            </a>
            <span className="text-slate-300">&bull;</span>
            <a href="/data-deletion" onClick={(e) => navigateTo('/data-deletion', e)} className="hover:text-teal-700">
              User Data Deletion Instructions
            </a>
            <span className="text-slate-300">&bull;</span>
            <a href="https://webluxira.com" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 hover:text-teal-700">
              webluxira.com <ExternalLink className="w-3 h-3" />
            </a>
          </div>

          <div className="text-slate-500 space-y-1">
            <p className="font-medium text-slate-700">
              &copy; {currentYear} LUXIRA KOZMETİK TİCARET LİMİTED ŞİRKETİ (operating as Luxira Holding LLC). All rights reserved.
            </p>
            <p className="text-[11px] text-slate-400">
              VKN: 6091375815 (Kocasinan Vergi Dairesi) &bull; Headquarters: Şirinevler Mah. Meriç Sk. No: 15 Bahçelievler / İstanbul, Turkey &bull; Compliance: privacy@webluxira.com
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
};
