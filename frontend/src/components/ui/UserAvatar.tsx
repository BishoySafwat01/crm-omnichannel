import React, { useState } from 'react';

interface UserAvatarProps {
  name: string;
  avatarUrl?: string | null;
  className?: string;
  size?: 'sm' | 'md' | 'lg';
}

const COLORS = [
  'bg-blue-600', 'bg-indigo-600', 'bg-violet-600',
  'bg-emerald-600', 'bg-amber-600', 'bg-rose-600', 'bg-teal-600'
];

export const UserAvatar: React.FC<UserAvatarProps> = ({
  name,
  avatarUrl,
  className = '',
  size = 'md',
}) => {
  const [imgError, setImgError] = useState(false);

  const initial = (name || 'ع').trim().charAt(0).toUpperCase();
  const charCode = (name || 'A').charCodeAt(0);
  const bgColor = COLORS[charCode % COLORS.length];

  const sizeClasses = {
    sm: 'w-8 h-8 text-xs',
    md: 'w-10 h-10 text-sm',
    lg: 'w-16 h-16 text-lg',
  }[size];

  if (avatarUrl && !imgError) {
    return (
      <img
        src={avatarUrl}
        alt={name}
        className={`${sizeClasses} rounded-full object-cover shadow-xs border border-slate-200/60 shrink-0 ${className}`}
        onError={() => setImgError(true)}
      />
    );
  }

  return (
    <div
      className={`${sizeClasses} ${bgColor} text-white font-bold rounded-full flex items-center justify-center shadow-xs border border-slate-300/60 shrink-0 ${className}`}
    >
      {initial}
    </div>
  );
};
