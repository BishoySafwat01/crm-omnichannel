import React, { useState } from 'react';
import { User, Store } from 'lucide-react';
import { MOCK_BRANDS } from '../services/api';

export interface ConversationAvatarProps {
  customerName: string;
  customerAvatarUrl?: string | null;
  brandId?: string | null;
  brandName?: string | null;
  channel?: string;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
  showPresenceDot?: boolean;
  presenceDotColor?: string;
  presenceStatusText?: string;
}

export const ChannelSocialIcon: React.FC<{ channel?: string; sizeClass?: string; className?: string }> = ({
  channel = 'messenger',
  sizeClass = 'w-4 h-4',
  className = '',
}) => {
  const normChan = (channel || 'messenger').toLowerCase();

  if (normChan === 'whatsapp') {
    return (
      <div className={`${sizeClass} rounded-full flex items-center justify-center shrink-0 shadow-xs border border-white bg-emerald-500 ${className}`} title="واتساب WhatsApp">
        <svg viewBox="0 0 24 24" className="w-[82%] h-[82%]" fill="none">
          <path
            d="M12.04 4.5C7.94 4.5 4.6 7.84 4.6 11.94C4.6 13.31 4.97 14.61 5.63 15.75L4.5 19.5L8.38 18.4C9.48 19.01 10.73 19.34 12.04 19.34C16.14 19.34 19.48 16 19.48 11.9C19.48 7.8 16.14 4.5 12.04 4.5ZM15.73 14.86C15.58 15.29 14.97 15.65 14.54 15.74C14.25 15.8 13.86 15.84 12.59 15.31C10.96 14.63 9.91 12.98 9.83 12.87C9.75 12.76 9.17 12 9.17 11.2C9.17 10.4 9.58 10.01 9.75 9.84C9.89 9.7 10.08 9.63 10.28 9.63C10.35 9.63 10.41 9.63 10.47 9.64C10.63 9.64 10.71 9.65 10.82 9.92C10.96 10.26 11.3 11.1 11.34 11.18C11.38 11.27 11.42 11.37 11.35 11.5C11.29 11.63 11.24 11.69 11.14 11.8C11.05 11.91 10.96 11.99 10.86 12.11C10.75 12.22 10.64 12.35 10.77 12.57C10.89 12.78 11.32 13.48 11.96 14.05C12.78 14.78 13.45 15.01 13.69 15.11C13.89 15.19 14.02 15.17 14.16 15.01C14.33 14.82 14.53 14.53 14.73 14.24C14.88 14.03 15.07 14.06 15.27 14.13C15.48 14.2 16.59 14.75 16.82 14.86C17.05 14.97 17.2 15.03 17.26 15.13C17.31 15.24 17.31 15.7 17.16 16.13"
            fill="white"
          />
        </svg>
      </div>
    );
  }

  if (normChan === 'instagram') {
    return (
      <div className={`${sizeClass} rounded-full flex items-center justify-center shrink-0 shadow-xs border border-white overflow-hidden bg-gradient-to-tr from-[#f09433] via-[#dc2743] to-[#bc1888] ${className}`} title="إنستغرام Instagram">
        <svg viewBox="0 0 24 24" className="w-[78%] h-[78%]" fill="none">
          <rect x="4.5" y="4.5" width="15" height="15" rx="4" stroke="white" strokeWidth="1.8" fill="none" />
          <circle cx="12" cy="12" r="3.8" stroke="white" strokeWidth="1.8" fill="none" />
          <circle cx="16.5" cy="7.5" r="1" fill="white" />
        </svg>
      </div>
    );
  }

  // Default: Messenger
  return (
    <div className={`${sizeClass} rounded-full flex items-center justify-center shrink-0 shadow-xs border border-white bg-gradient-to-tr from-[#0078FF] via-[#00C6FF] to-[#A033FF] ${className}`} title="فيسبوك ماسنجر Messenger">
      <svg viewBox="0 0 24 24" className="w-[82%] h-[82%]" fill="none">
        <path
          d="M12 4C7.58 4 4 7.36 4 11.5C4 13.86 5.18 15.96 7.02 17.33V20L9.62 18.57C10.38 18.78 11.18 18.9 12 18.9C16.42 18.9 20 15.54 20 11.4C20 7.26 16.42 4 12 4ZM12.8 13.9L10.75 11.7L6.8 13.9L11.15 9.3L13.25 11.5L17.2 9.3L12.8 13.9Z"
          fill="white"
        />
      </svg>
    </div>
  );
};

export const getBrandObject = (brandId?: string | null, brandName?: string | null) => {
  if (brandId && brandId !== 'all') {
    const found = MOCK_BRANDS.find((b) => b.id.toLowerCase() === brandId.toLowerCase() || b.name.toLowerCase() === brandId.toLowerCase());
    if (found) return found;
  }
  if (brandName) {
    const found = MOCK_BRANDS.find((b) => b.name.toLowerCase() === brandName.toLowerCase() || b.id.toLowerCase() === brandName.toLowerCase());
    if (found) return found;
  }
  // Default to LUXIRA
  return MOCK_BRANDS.find((b) => b.id === 'LUXIRA') || {
    id: 'LUXIRA',
    name: 'LUXIRA',
    avatar: 'LX',
    color: 'from-[#1A73E8] to-blue-700',
    page_id: '',
  };
};

export const ConversationAvatar: React.FC<ConversationAvatarProps> = ({
  customerName,
  customerAvatarUrl,
  brandId,
  brandName,
  channel = 'messenger',
  size = 'md',
  className = '',
  showPresenceDot = false,
  presenceDotColor = 'bg-emerald-500',
  presenceStatusText = '',
}) => {
  const [custImgError, setCustImgError] = useState(false);

  const brand = getBrandObject(brandId, brandName);

  const sizeDimensions = {
    sm: {
      container: 'w-10 h-10',
      brandBox: 'w-8 h-8 text-[10px]',
      subAvatar: 'w-4 h-4',
      subIcon: 'w-2.5 h-2.5',
      channelBadge: 'w-3.5 h-3.5 -top-0.5 -right-0.5',
      presence: 'w-2 h-2 top-0 right-0',
    },
    md: {
      container: 'w-12 h-12',
      brandBox: 'w-10 h-10 text-xs',
      subAvatar: 'w-5 h-5',
      subIcon: 'w-3 h-3',
      channelBadge: 'w-4 h-4 -top-1 -right-1',
      presence: 'w-2.5 h-2.5 top-0 right-0',
    },
    lg: {
      container: 'w-14 h-14',
      brandBox: 'w-12 h-12 text-sm',
      subAvatar: 'w-6 h-6',
      subIcon: 'w-3.5 h-3.5',
      channelBadge: 'w-5 h-5 -top-1 -right-1',
      presence: 'w-3 h-3 top-0 right-0',
    },
    xl: {
      container: 'w-16 h-16',
      brandBox: 'w-14 h-14 text-base',
      subAvatar: 'w-7 h-7',
      subIcon: 'w-4 h-4',
      channelBadge: 'w-5 h-5 -top-1.5 -right-1.5',
      presence: 'w-3.5 h-3.5 top-0 right-0',
    },
  }[size];

  const custInitial = (customerName || 'ع').trim().charAt(0).toUpperCase();

  return (
    <div className={`relative shrink-0 flex items-center justify-center ${sizeDimensions.container} ${className}`}>
      {/* 1. Main Store / Brand Avatar Box */}
      <div
        className={`${sizeDimensions.brandBox} rounded-2xl bg-gradient-to-tr ${brand.color || 'from-slate-700 to-slate-900'} text-white font-black flex items-center justify-center shadow-xs border border-white/80 select-none tracking-wider`}
        title={`متجر: ${brand.name}`}
      >
        <span>{brand.avatar || brand.name.substring(0, 2).toUpperCase()}</span>
      </div>

      {/* 2. Overlapping Small Customer Avatar Circle (دايرة صغيرة متداخلة فيها صورة الشخص) */}
      <div
        className={`absolute -bottom-0.5 -left-0.5 ${sizeDimensions.subAvatar} rounded-full bg-white border-2 border-white shadow-xs flex items-center justify-center overflow-hidden z-10`}
        title={`العميل: ${customerName}`}
      >
        {customerAvatarUrl && !custImgError ? (
          <img
            src={customerAvatarUrl}
            alt={customerName}
            className="w-full h-full object-cover rounded-full"
            onError={() => setCustImgError(true)}
          />
        ) : (
          <div className="w-full h-full bg-slate-100 text-slate-700 font-bold flex items-center justify-center text-[9px]">
            {customerName ? custInitial : <User className={sizeDimensions.subIcon} />}
          </div>
        )}
      </div>

      {/* 3. Small Social Channel Icon Badge (علامة الفيس، الواتس، الإنستا الأصلية) */}
      <div className={`absolute ${sizeDimensions.channelBadge} z-10`}>
        <ChannelSocialIcon channel={channel} sizeClass="w-full h-full" />
      </div>

      {/* 4. Presence / Activity Dot */}
      {showPresenceDot && (
        <span
          className={`absolute ${sizeDimensions.presence} border-2 border-white rounded-full ${presenceDotColor} z-20`}
          title={presenceStatusText}
        />
      )}
    </div>
  );
};
