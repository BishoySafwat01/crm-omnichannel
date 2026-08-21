import React from 'react';

interface GlassInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  icon?: React.ReactNode;
  className?: string;
}

export const GlassInput: React.FC<GlassInputProps> = ({
  icon,
  className = '',
  ...props
}) => {
  return (
    <div className="relative flex items-center w-full">
      <input
        className={`w-full bg-slate-100/80 hover:bg-slate-100 focus:bg-white text-slate-800 text-xs rounded-full py-2 px-4 border border-transparent focus:border-[#1A73E8] focus:outline-none focus:ring-2 focus:ring-[#1A73E8]/20 transition-all font-medium placeholder-slate-400 ${
          icon ? 'pr-8' : ''
        } ${className}`}
        {...props}
      />
      {icon && <div className="absolute right-3 text-slate-400">{icon}</div>}
    </div>
  );
};
