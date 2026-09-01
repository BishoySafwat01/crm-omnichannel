import React, { useState } from 'react';
import { User, Store, Lock, MessageSquare } from 'lucide-react';
import { MOCK_BRANDS, BRAND_IMAGES } from '../constants/brands';

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
  sizeClass = 'w-5 h-5',
  className = '',
}) => {
  const normChan = (channel || 'messenger').toLowerCase();

  if (normChan === 'whatsapp') {
    return (
      <div
        className={`${sizeClass} rounded-full flex items-center justify-center shrink-0 shadow-md border-2 border-white bg-[#25D366] ${className}`}
        title="واتساب (WhatsApp)"
      >
        <svg viewBox="0 0 24 24" className="w-[62%] h-[62%]" fill="white">
          <path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91C2.13 13.66 2.59 15.36 3.45 16.86L2.05 22L7.3 20.63C8.75 21.41 10.38 21.82 12.04 21.82C17.5 21.82 21.95 17.37 21.95 11.91C21.95 6.45 17.5 2 12.04 2ZM12.04 20.15C10.56 20.15 9.11 19.76 7.85 19.01L7.55 18.83L4.43 19.65L5.26 16.61L5.07 16.3C4.24 14.99 3.81 13.47 3.81 11.91C3.81 7.37 7.5 3.68 12.04 3.68C16.58 3.68 20.27 7.37 20.27 11.91C20.27 16.45 16.58 20.15 12.04 20.15ZM16.54 14.41C16.29 14.29 15.08 13.69 14.86 13.61C14.63 13.53 14.47 13.49 14.3 13.73C14.14 13.98 13.65 14.55 13.5 14.71C13.36 14.88 13.21 14.9 12.96 14.78C12.72 14.65 11.93 14.4 11 13.57C10.27 12.92 9.78 12.12 9.64 11.87C9.5 11.63 9.62 11.49 9.75 11.37C9.86 11.26 10 11.09 10.12 10.95C10.24 10.81 10.28 10.71 10.36 10.54C10.45 10.38 10.4 10.24 10.34 10.12C10.28 10 9.79 8.79 9.58 8.3C9.38 7.82 9.18 7.88 9.02 7.88C8.88 7.87 8.71 7.87 8.55 7.87C8.39 7.87 8.12 7.93 7.89 8.18C7.67 8.42 7.03 9.02 7.03 10.24C7.03 11.47 7.92 12.65 8.05 12.82C8.17 12.98 9.8 15.5 12.28 16.57C12.87 16.83 13.33 16.98 13.69 17.1C14.29 17.29 14.83 17.26 15.26 17.2C15.74 17.13 16.74 16.6 16.95 16.03C17.15 15.46 17.15 14.97 17.09 14.86C17.03 14.76 16.88 14.7 16.63 14.58L16.54 14.41Z" />
        </svg>
      </div>
    );
  }

  if (normChan === 'instagram') {
    return (
      <div
        className={`${sizeClass} rounded-full flex items-center justify-center shrink-0 shadow-md border-2 border-white bg-gradient-to-tr from-[#f09433] via-[#dc2743] to-[#bc1888] ${className}`}
        title="إنستغرام (Instagram Direct)"
      >
        <svg viewBox="0 0 24 24" className="w-[62%] h-[62%]" fill="none" stroke="white" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="2" y="2" width="20" height="20" rx="5" ry="5" />
          <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
          <line x1="17.5" y1="6.5" x2="17.51" y2="6.5" strokeWidth="2.5" />
        </svg>
      </div>
    );
  }

  // Default: Messenger - Super vibrant Facebook Messenger Blue with bold white lightning
  return (
    <div
      className={`${sizeClass} rounded-full flex items-center justify-center shrink-0 shadow-md border-2 border-white bg-[#0084FF] ${className}`}
      title="فيسبوك ماسنجر (Facebook Messenger)"
    >
      <svg viewBox="0 0 24 24" className="w-[68%] h-[68%]" fill="white">
        <path d="M12 2C6.48 2 2 6.03 2 11C2 13.77 3.38 16.23 5.56 17.84V22L9.48 19.86C10.29 20.08 11.13 20.2 12 20.2C17.52 20.2 22 16.17 22 11.2C22 6.23 17.52 2 12 2ZM13.06 14.5L10.74 12.03L6.2 14.5L11.18 9.2L13.5 11.67L17.94 9.2L13.06 14.5Z" />
      </svg>
    </div>
  );
};

export interface BrandObjectInfo {
  id: string;
  name: string;
  avatar: string;
  color: string;
  page_id?: string;
  logo_url?: string;
  isDirect: boolean;
}

const STORE_GRADIENTS = [
  'from-teal-600 to-teal-800',
  'from-indigo-600 to-indigo-800',
  'from-cyan-600 to-cyan-800',
  'from-rose-600 to-rose-800',
  'from-amber-600 to-amber-800',
  'from-purple-600 to-purple-800',
  'from-emerald-600 to-emerald-800',
  'from-blue-600 to-blue-800',
];

export const getBrandObject = (brandId?: string | null, brandName?: string | null): BrandObjectInfo => {
  const rawId = (brandId || '').trim();
  const rawName = (brandName || '').trim();
  const normId = rawId.toLowerCase();
  const normName = rawName.toLowerCase();
  const combined = `${normId} ${normName}`.trim();

  // Explicit Direct Messages only
  if (normId === 'direct' || normName === 'direct' || normId === 'private' || normName === 'private') {
    return {
      id: 'direct',
      name: 'شات مباشر / خاص',
      avatar: 'DM',
      color: 'from-slate-700 via-indigo-900 to-slate-900',
      page_id: '',
      isDirect: true,
    };
  }

  // 1. Check known brands with fuzzy / alias recognition
  if (combined.includes('lotus')) {
    const found = MOCK_BRANDS.find((b) => b.id === 'LOTUS BLUE') || MOCK_BRANDS[3];
    return {
      id: rawName || 'Lotus Blue',
      name: rawName || 'Lotus Blue',
      avatar: 'LB',
      color: 'from-cyan-600 to-cyan-700',
      logo_url: BRAND_IMAGES['lotus blue'] || found?.logo_url,
      isDirect: false,
    };
  }

  if (combined.includes('hayat')) {
    const found = MOCK_BRANDS.find((b) => b.id === 'HAYAT') || MOCK_BRANDS[8];
    return {
      id: rawName || 'Hayat Cosmetics',
      name: rawName || 'Hayat Cosmetics',
      avatar: 'HY',
      color: 'from-emerald-600 to-emerald-700',
      logo_url: BRAND_IMAGES['hayat'] || found?.logo_url,
      isDirect: false,
    };
  }

  if (combined.includes('liora') || combined.includes('luxira')) {
    const found = MOCK_BRANDS.find((b) => b.id === 'LUXIRA' || b.id === 'LIORA') || MOCK_BRANDS[2];
    return {
      id: rawName || 'Liora',
      name: rawName || 'Liora',
      avatar: 'LX',
      color: 'from-[#1A73E8] to-blue-600',
      logo_url: BRAND_IMAGES['liora'] || found?.logo_url,
      isDirect: false,
    };
  }

  if (combined.includes('loxx')) {
    const found = MOCK_BRANDS.find((b) => b.id === 'LOXX KING') || MOCK_BRANDS[5];
    return {
      id: rawName || 'LOXX KING',
      name: rawName || 'LOXX KING',
      avatar: 'LK',
      color: 'from-amber-600 to-amber-700',
      logo_url: BRAND_IMAGES['loxx king'] || found?.logo_url,
      isDirect: false,
    };
  }

  if (combined.includes('lavva') || combined.includes('lava')) {
    const found = MOCK_BRANDS.find((b) => b.id === 'LAVVA') || MOCK_BRANDS[1];
    return {
      id: rawName || 'LAVVA',
      name: rawName || 'LAVVA',
      avatar: 'LV',
      color: 'from-teal-600 to-teal-700',
      logo_url: BRAND_IMAGES['lavva'] || found?.logo_url,
      isDirect: false,
    };
  }

  if (combined.includes('flare')) {
    const found = MOCK_BRANDS.find((b) => b.id === 'FLARE') || MOCK_BRANDS[4];
    return {
      id: rawName || 'FLARE',
      name: rawName || 'FLARE',
      avatar: 'FL',
      color: 'from-orange-600 to-orange-700',
      logo_url: BRAND_IMAGES['flare'] || found?.logo_url,
      isDirect: false,
    };
  }

  if (combined.includes('nora') || combined.includes('moon')) {
    const found = MOCK_BRANDS.find((b) => b.id === 'NORA' || b.id === 'MOON LIGHT') || MOCK_BRANDS[6];
    return {
      id: rawName || 'MOON LIGHT',
      name: rawName || 'MOON LIGHT',
      avatar: 'ML',
      color: 'from-indigo-600 to-indigo-700',
      logo_url: BRAND_IMAGES['nora'] || found?.logo_url,
      isDirect: false,
    };
  }

  if (combined.includes('beauty')) {
    const found = MOCK_BRANDS.find((b) => b.id === 'BEAUTY CENTER') || MOCK_BRANDS[7];
    return {
      id: rawName || 'BEAUTY CENTER',
      name: rawName || 'BEAUTY CENTER',
      avatar: 'BC',
      color: 'from-rose-600 to-rose-700',
      logo_url: BRAND_IMAGES['beauty center'] || found?.logo_url,
      isDirect: false,
    };
  }

  if (combined.includes('finest')) {
    const found = MOCK_BRANDS.find((b) => b.id === 'FINEST') || MOCK_BRANDS[10];
    return {
      id: rawName || 'FINEST',
      name: rawName || 'FINEST',
      avatar: 'FN',
      color: 'from-amber-700 to-amber-800',
      logo_url: BRAND_IMAGES['finest'] || found?.logo_url,
      isDirect: false,
    };
  }

  if (combined.includes('aerobics')) {
    const found = MOCK_BRANDS.find((b) => b.id === 'AEROBICS') || MOCK_BRANDS[11];
    return {
      id: rawName || 'AEROBICS',
      name: rawName || 'AEROBICS',
      avatar: 'AR',
      color: 'from-sky-600 to-sky-700',
      logo_url: BRAND_IMAGES['aerobics'] || found?.logo_url,
      isDirect: false,
    };
  }

  // 2. Direct lookup in MOCK_BRANDS
  const matchedMock = MOCK_BRANDS.find(
    (b) =>
      b.id.toLowerCase() === normId ||
      b.name.toLowerCase() === normName ||
      b.id.toLowerCase() === normName ||
      b.name.toLowerCase() === normId
  );
  if (matchedMock && matchedMock.id !== 'all') {
    return { ...matchedMock, isDirect: false };
  }

  // 3. Clean dynamic store fallback (Never false DM 🔒)
  const displayName = rawName || rawId || 'متجر';
  const words = displayName.split(/\s+/).filter(Boolean);
  const initials =
    words.length >= 2
      ? `${words[0][0]}${words[1][0]}`.toUpperCase()
      : displayName.substring(0, 2).toUpperCase();

  const colorIndex = Math.abs(
    displayName.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0)
  ) % STORE_GRADIENTS.length;

  return {
    id: rawId || displayName,
    name: displayName,
    avatar: initials,
    color: STORE_GRADIENTS[colorIndex],
    isDirect: false,
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
  const [logoError, setLogoError] = useState(false);

  const brand = getBrandObject(brandId, brandName);

  const sizeDimensions = {
    sm: {
      container: 'w-10 h-10',
      brandBox: 'w-8 h-8 text-[10px]',
      subAvatar: 'w-4 h-4',
      subIcon: 'w-2.5 h-2.5',
      channelBadge: 'w-4 h-4 -top-1 -right-1',
      presence: 'w-2.5 h-2.5 -bottom-0.5 -right-0.5',
    },
    md: {
      container: 'w-12 h-12',
      brandBox: 'w-10 h-10 text-xs',
      subAvatar: 'w-5 h-5',
      subIcon: 'w-3 h-3',
      channelBadge: 'w-5 h-5 -top-1 -right-1',
      presence: 'w-3 h-3 -bottom-0.5 -right-0.5',
    },
    lg: {
      container: 'w-14 h-14',
      brandBox: 'w-12 h-12 text-sm',
      subAvatar: 'w-6 h-6',
      subIcon: 'w-3.5 h-3.5',
      channelBadge: 'w-6 h-6 -top-1.5 -right-1.5',
      presence: 'w-3.5 h-3.5 -bottom-0.5 -right-0.5',
    },
    xl: {
      container: 'w-16 h-16',
      brandBox: 'w-14 h-14 text-base',
      subAvatar: 'w-7 h-7',
      subIcon: 'w-4 h-4',
      channelBadge: 'w-7 h-7 -top-2 -right-2',
      presence: 'w-4 h-4 -bottom-1 -right-1',
    },
  }[size];

  const custInitial = (customerName || 'ع').trim().charAt(0).toUpperCase();

  // If it's a Direct/Private chat and the customer has an avatar photo:
  // Render customer photo as main avatar with a subtle DM badge
  if (brand.isDirect && customerAvatarUrl && !custImgError) {
    return (
      <div className={`relative shrink-0 flex items-center justify-center ${sizeDimensions.container} ${className}`}>
        {/* Main Customer Photo */}
        <img
          src={customerAvatarUrl}
          alt={customerName}
          className={`${sizeDimensions.brandBox} rounded-2xl object-cover shadow-sm border border-slate-200`}
          onError={() => setCustImgError(true)}
        />

        {/* Overlapping Small Direct/DM Badge */}
        <div
          className={`absolute -bottom-0.5 -left-0.5 ${sizeDimensions.subAvatar} rounded-full bg-indigo-600 text-white font-black text-[9px] border-2 border-white shadow-xs flex items-center justify-center z-10`}
          title="شات خاص مباشر (Direct Message)"
        >
          <Lock className={sizeDimensions.subIcon} />
        </div>

        {/* Clear Vivid Channel Icon Badge */}
        <div className={`absolute ${sizeDimensions.channelBadge} z-20`}>
          <ChannelSocialIcon channel={channel} sizeClass="w-full h-full" />
        </div>

        {/* Presence Dot */}
        {showPresenceDot && (
          <span
            className={`absolute ${sizeDimensions.presence} border-2 border-white rounded-full ${presenceDotColor} z-30`}
            title={presenceStatusText}
          />
        )}
      </div>
    );
  }

  return (
    <div className={`relative shrink-0 flex items-center justify-center ${sizeDimensions.container} ${className}`}>
      {/* 1. Main Store Avatar Box (or DM Box if Direct) */}
      <div
        className={`${sizeDimensions.brandBox} rounded-2xl bg-gradient-to-tr ${brand.color || 'from-slate-700 to-slate-900'} text-white font-black flex items-center justify-center shadow-xs border border-white/80 select-none tracking-wider overflow-hidden`}
        title={brand.isDirect ? 'محادثة خاصة مباشرة' : `متجر: ${brand.name}`}
      >
        {brand.isDirect ? (
          <span className="flex items-center gap-0.5 text-[11px]">
            <Lock className="w-3 h-3" />
            <span>DM</span>
          </span>
        ) : brand.logo_url && !logoError ? (
          <img
            src={brand.logo_url}
            alt={brand.name}
            className="w-full h-full object-cover rounded-2xl"
            onError={() => setLogoError(true)}
          />
        ) : (
          <span>{brand.avatar || brand.name.substring(0, 2).toUpperCase()}</span>
        )}
      </div>

      {/* 2. Overlapping Small Customer Avatar Circle */}
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

      {/* 3. Small Social Channel Icon Badge (Messenger / WhatsApp / Instagram) */}
      <div className={`absolute ${sizeDimensions.channelBadge} z-20`}>
        <ChannelSocialIcon channel={channel} sizeClass="w-full h-full" />
      </div>

      {/* 4. Presence / Activity Dot */}
      {showPresenceDot && (
        <span
          className={`absolute ${sizeDimensions.presence} border-2 border-white rounded-full ${presenceDotColor} z-30`}
          title={presenceStatusText}
        />
      )}
    </div>
  );
};
