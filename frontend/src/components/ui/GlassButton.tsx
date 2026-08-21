import React from 'react';

interface GlassButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'mint';
  size?: 'sm' | 'md' | 'lg';
  children: React.ReactNode;
  className?: string;
}

export const GlassButton: React.FC<GlassButtonProps> = ({
  variant = 'primary',
  size = 'md',
  children,
  className = '',
  ...props
}) => {
  const variantStyles = {
    primary: 'bg-[#1A73E8] hover:bg-[#1557B0] text-white shadow-sm font-semibold',
    secondary: 'bg-white/80 hover:bg-white text-slate-800 border border-slate-200/80 shadow-2xs font-semibold',
    ghost: 'bg-transparent hover:bg-slate-100/70 text-slate-600 hover:text-slate-900 font-medium',
    mint: 'bg-[#00A884] hover:bg-[#008f70] text-white shadow-sm font-semibold',
  };

  const sizeStyles = {
    sm: 'px-2.5 py-1 text-xs rounded-xl',
    md: 'px-3.5 py-1.5 text-xs rounded-xl',
    lg: 'px-4 py-2 text-sm rounded-2xl',
  };

  return (
    <button
      className={`inline-flex items-center justify-center gap-1.5 transition-all duration-150 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed ${variantStyles[variant]} ${sizeStyles[size]} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
};
