import React, { useState } from 'react';
import { Search, ChevronDown, ChevronUp, Users, Check } from 'lucide-react';

export interface ChatEmployeeItem {
  id: string;
  name: string;
  role?: string;
}

export interface MessageSearchToolbarProps {
  isSearchOpen: boolean;
  onOpenSearch: () => void;
  onCloseSearch: () => void;
  searchQuery: string;
  onSearchQueryChange: (query: string) => void;
  matchedCount: number;
  currentIndex: number;
  onJumpToMatch: (dir: 'next' | 'prev') => void;
  chatEmployees: ChatEmployeeItem[];
  activeEmpFilterId: string | null;
  activeEmpFilterObj: ChatEmployeeItem | null;
  onSelectEmployee: (empId: string | null) => void;
}

export const MessageSearchToolbar: React.FC<MessageSearchToolbarProps> = ({
  isSearchOpen,
  onOpenSearch,
  onCloseSearch,
  searchQuery,
  onSearchQueryChange,
  matchedCount,
  currentIndex,
  onJumpToMatch,
  chatEmployees,
  activeEmpFilterId,
  activeEmpFilterObj,
  onSelectEmployee,
}) => {
  const [isChatEmpMenuOpen, setIsChatEmpMenuOpen] = useState(false);

  return (
    <div className="relative flex items-center">
      {isSearchOpen ? (
        <div className="flex items-center gap-1.5 bg-slate-100/90 rounded-full px-2.5 py-1 border border-slate-200 shadow-2xs animate-in fade-in zoom-in-95 duration-100">
          <Search className="w-3.5 h-3.5 text-slate-400 shrink-0" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => onSearchQueryChange(e.target.value)}
            placeholder="بحث بنص أو اسم موظف..."
            autoFocus
            className="bg-transparent text-xs font-semibold text-slate-800 placeholder-slate-400 focus:outline-none w-32 sm:w-44"
          />

          {/* Employee Filter inside Chat */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setIsChatEmpMenuOpen(!isChatEmpMenuOpen)}
              className={`p-1 rounded-full text-xs flex items-center gap-0.5 font-bold transition cursor-pointer ${
                activeEmpFilterId ? 'bg-blue-600 text-white px-2 py-0.5' : 'text-slate-500 hover:text-slate-800'
              }`}
              title="تصفية المحادثة بالموظف الذي رد"
            >
              <Users className="w-3 h-3" />
              {activeEmpFilterObj && (
                <span className="max-w-[65px] truncate text-[10px]">{activeEmpFilterObj.name}</span>
              )}
              <ChevronDown className="w-2.5 h-2.5" />
            </button>

            {isChatEmpMenuOpen && (
              <div className="absolute top-full left-0 mt-2 w-52 bg-white/95 backdrop-blur-xl rounded-2xl shadow-xl shadow-slate-900/5 border border-slate-100 p-1.5 z-50 space-y-0.5 animate-in fade-in zoom-in-95 duration-100 text-right">
                <div className="px-2 py-1 text-[10px] font-bold text-slate-400 border-b border-slate-100">
                  تصفية الردود حسب الموظف
                </div>
                <button
                  type="button"
                  onClick={() => {
                    onSelectEmployee(null);
                    setIsChatEmpMenuOpen(false);
                  }}
                  className="w-full text-right px-2.5 py-1.5 rounded-xl text-xs font-medium transition-colors duration-150 hover:bg-slate-50 text-slate-700 flex items-center justify-between cursor-pointer"
                >
                  <span>كل الموظفين (All)</span>
                  {!activeEmpFilterId && <Check className="w-3.5 h-3.5 text-teal-600" />}
                </button>
                {chatEmployees.map((emp) => (
                  <button
                    key={emp.id}
                    type="button"
                    onClick={() => {
                      onSelectEmployee(emp.id);
                      setIsChatEmpMenuOpen(false);
                    }}
                    className={`w-full text-right px-2.5 py-1.5 rounded-xl text-xs font-medium transition-colors duration-150 flex items-center justify-between cursor-pointer ${
                      activeEmpFilterId === emp.id
                        ? 'bg-teal-50 text-teal-700 font-bold border border-teal-200/50'
                        : 'hover:bg-slate-50 text-slate-700'
                    }`}
                  >
                    <span className="truncate">{emp.name}</span>
                    {activeEmpFilterId === emp.id && <Check className="w-3.5 h-3.5 text-[#1A73E8]" />}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Match Navigation Stepper */}
          {matchedCount > 0 && (
            <div className="flex items-center gap-1 border-r border-slate-200 pr-1 mr-1">
              <span className="text-[10px] font-mono font-bold text-slate-500">
                {currentIndex + 1}/{matchedCount}
              </span>
              <button
                type="button"
                onClick={() => onJumpToMatch('prev')}
                className="p-0.5 text-slate-400 hover:text-slate-700 transition cursor-pointer"
                title="المطابقة السابقة"
              >
                <ChevronUp className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => onJumpToMatch('next')}
                className="p-0.5 text-slate-400 hover:text-slate-700 transition cursor-pointer"
                title="المطابقة التالية"
              >
                <ChevronDown className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          <button
            type="button"
            onClick={onCloseSearch}
            className="text-slate-400 hover:text-slate-600 text-xs font-bold px-1 transition cursor-pointer"
            title="إغلاق البحث"
          >
            ✕
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={onOpenSearch}
          className="p-1.5 rounded-full text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition cursor-pointer"
          title="بحث في المحادثة"
        >
          <Search className="w-4 h-4" />
        </button>
      )}
    </div>
  );
};
