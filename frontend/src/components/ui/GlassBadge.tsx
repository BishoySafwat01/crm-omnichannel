import React from 'react';

interface GlassBadgeProps {
  children: React.ReactNode;
  variant?: 'default' | 'active' | 'success' | 'urgent' | 'pending';
  className?: string;
}

export const GlassBadge: React.FC<GlassBadgeProps> = ({
  children,
  variant = 'default',
  className = '',
}) => {
  const variantStyles = {
    default: 'bg-slate-100/80 text-slate-600 border-slate-200/60',
    active: 'bg-[#E8F0FE] text-[#1A73E8] border-[#1A73E8]/20 font-bold',
    success: 'bg-[#E6F4EA] text-[#137333] border-[#CEEAD6] font-bold',
    urgent: 'bg-[#FEE2E2] text-[#B91C1C] border-[#FECACA] font-bold',
    pending: 'bg-[#FEF3C7] text-[#92400E] border-[#FDE68A] font-bold',
  };

  return (
    <span
      className={`inline-flex items-center gap-1 text-[11px] px-2.5 py-0.5 rounded-full border backdrop-blur-md transition ${variantStyles[variant]} ${className}`}
    >
      {children}
    </span>
  );
};
