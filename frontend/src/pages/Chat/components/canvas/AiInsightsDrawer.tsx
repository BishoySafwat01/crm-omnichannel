import React from 'react';
import { Sparkles } from 'lucide-react';

export interface AiInsightsData {
  summary?: string;
  intent?: string;
  sentiment?: string;
  replies: string[];
}

export interface AiInsightsDrawerProps {
  isOpen: boolean;
  onToggleOpen: () => void;
  onClose: () => void;
  insights: AiInsightsData;
  isAnalyzing: boolean;
  onRunAnalysis: () => void;
  onSelectSmartReply: (reply: string) => void;
}

export const AiInsightsDrawer: React.FC<AiInsightsDrawerProps> = ({
  isOpen,
  onToggleOpen,
  onClose,
  insights,
  isAnalyzing,
  onRunAnalysis,
  onSelectSmartReply,
}) => {
  return (
    <div className="relative">
      {/* AI Insights Floating Popover Toggle Button */}
      <button
        type="button"
        onClick={onToggleOpen}
        className={`p-1.5 rounded-full border transition flex items-center gap-1 text-xs font-bold cursor-pointer ${
          isOpen
            ? 'bg-[#1A73E8] text-white border-[#1A73E8] shadow-xs'
            : 'bg-[#E8F0FE] hover:bg-blue-100 text-[#1A73E8] border-[#1A73E8]/20'
        }`}
        title="تحليلات الذكاء الاصطناعي"
      >
        <Sparkles className="w-3.5 h-3.5 text-amber-500" />
        <span>AI</span>
      </button>

      {/* AI Insights Floating Popover / Drawer */}
      {isOpen && (
        <div className="absolute top-full left-0 mt-2 w-80 bg-white/95 backdrop-blur-xl rounded-2xl shadow-xl shadow-slate-900/5 border border-slate-100 p-4 z-50 space-y-3 animate-in fade-in zoom-in-95 duration-100 text-right">
          <div className="flex items-center justify-between border-b border-slate-100 pb-2">
            <span className="text-xs font-extrabold text-slate-800 flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-teal-600" />
              تحليلات الذكاء الاصطناعي
            </span>
            <button
              type="button"
              onClick={onClose}
              className="text-slate-400 hover:text-slate-600 text-xs font-bold cursor-pointer"
            >
              ✕
            </button>
          </div>

          <p className="text-xs text-slate-700 leading-relaxed font-medium">
            {insights.summary
              ? `✨ ${insights.summary}`
              : 'لا يوجد ملخص متاح حالياً. انقر زر التحليل لتوليد ملخص للمحادثة.'}
          </p>

          {/* 1-Click Smart Replies Section (DEF-AI-01 Resolution) */}
          {insights.replies && insights.replies.length > 0 && (
            <div className="space-y-1.5 pt-2 border-t border-slate-100">
              <span className="text-[11px] font-bold text-slate-600 flex items-center gap-1">
                <span>💡</span>
                <span>الردود الذكية المقترحة (Smart Replies):</span>
              </span>
              <div className="flex flex-col gap-1.5">
                {insights.replies.map((rep, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => {
                      onSelectSmartReply(rep);
                      onClose();
                    }}
                    className="text-right text-xs bg-blue-50/70 hover:bg-blue-100/90 text-blue-900 border border-blue-200/80 p-2 rounded-xl transition font-medium cursor-pointer shadow-2xs hover:shadow-xs"
                  >
                    {rep}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Badges and Refresh Action */}
          <div className="flex items-center justify-between pt-1 border-t border-slate-100">
            <div className="flex items-center gap-1.5">
              {insights.intent && (
                <span className="text-[10px] bg-[#E8F0FE] text-[#1A73E8] font-bold px-2 py-0.5 rounded-full border border-[#1A73E8]/20">
                  🎯 {insights.intent}
                </span>
              )}
              {insights.sentiment && (
                <span className="text-[10px] bg-[#E6F4EA] text-[#137333] font-bold px-2 py-0.5 rounded-full border border-[#CEEAD6]">
                  {insights.sentiment}
                </span>
              )}
            </div>

            <button
              type="button"
              onClick={onRunAnalysis}
              disabled={isAnalyzing}
              className="text-xs bg-[#1A73E8] hover:bg-[#1557B0] text-white font-bold px-3 py-1 rounded-full transition shadow-2xs flex items-center gap-1 disabled:opacity-50 cursor-pointer"
            >
              <Sparkles className={`w-3.5 h-3.5 ${isAnalyzing ? 'animate-spin' : ''}`} />
              <span>{isAnalyzing ? 'تحليل...' : 'تحديث ✨'}</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
