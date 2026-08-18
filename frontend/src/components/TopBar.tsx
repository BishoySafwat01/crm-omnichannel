import React from 'react';
import { MessageSquare, CheckCircle, Settings, Layers, Wifi } from 'lucide-react';
import { MOCK_BRANDS } from '../services/api';
import { useCrmStore } from '../store/useCrmStore';

export const TopBar: React.FC = () => {
  const { selectedBrandId, setSelectedBrandId, setActiveFilterTab } = useCrmStore();

  return (
    <header className="h-16 bg-white/85 backdrop-blur-md border-b border-slate-200/80 px-6 flex items-center justify-between shrink-0 relative z-20 shadow-xs">
      {/* Brand Header */}
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

        {/* Brand Switcher Pills */}
        <div className="hidden md:flex items-center gap-1 bg-slate-100/80 p-1 rounded-xl border border-slate-200/60 mr-4">
          {MOCK_BRANDS.map((brand) => {
            const isSelected = selectedBrandId === brand.id;
            return (
              <button
                key={brand.id}
                onClick={() => setSelectedBrandId(brand.id)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all duration-150 flex items-center gap-1.5 ${
                  isSelected
                    ? 'bg-white text-teal-800 shadow-xs border border-slate-200/80 font-bold'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-white/60'
                }`}
              >
                <span className="w-4 h-4 rounded-full bg-slate-200 text-slate-700 flex items-center justify-center text-[9px] font-bold">
                  {brand.avatar}
                </span>
                <span>{brand.name}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Right Header Actions */}
      <div className="flex items-center gap-2.5">
        {/* Live Socket Status Badge */}
        <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200/80 text-xs font-semibold">
          <Wifi className="w-3.5 h-3.5 text-emerald-600 animate-pulse" />
          <span>متصل مباشر</span>
        </div>

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
  );
};
