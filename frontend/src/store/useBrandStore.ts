import { create } from 'zustand';
import { Brand } from '../types/crm';
import { getBrandMetadata } from '../constants/brands';
import { useCrmStore } from './useCrmStore';
import { useChannelsStore } from './useChannelsStore';
import { useAuthStore } from './useAuthStore';

interface BrandState {
  selectedBrandId: string;
  setSelectedBrandId: (brandId: string) => void;
  brands: Brand[];
  getDynamicBrands: () => Brand[];
  refreshBrands: () => void;
}

const computeDynamicBrands = (): Brand[] => {
  const list: Brand[] = [
    { id: 'all', name: 'كل الماركات', avatar: 'ALL', color: 'from-slate-700 to-slate-800', page_id: '' },
  ];
  const seen = new Set<string>(['all', 'الكل']);

  const addBrand = (bName?: string | null) => {
    if (!bName) return;
    const clean = bName.trim();
    if (!clean) return;
    const norm = clean.toLowerCase();
    if (seen.has(norm) || norm === 'all' || norm === 'الكل') return;
    seen.add(norm);

    const meta = getBrandMetadata(clean);
    list.push({
      id: meta.id || clean,
      name: meta.name || clean,
      avatar: meta.avatar,
      color: meta.color,
      page_id: '',
      logo_url: meta.logo_url,
    });
  };

  // 1. Ingest connected pages from useChannelsStore
  try {
    const connectedPages = useChannelsStore.getState().connectedPages || [];
    connectedPages.forEach((page) => {
      if ((page as any).brand) addBrand((page as any).brand);
      else if (page.name) addBrand(page.name);
    });
  } catch {}

  // 2. Ingest unreadSummary brands from useCrmStore
  try {
    const unreadSummary = useCrmStore.getState().unreadSummary;
    if (unreadSummary?.brands) {
      Object.keys(unreadSummary.brands).forEach(addBrand);
    }
  } catch {}

  // 3. Ingest active conversation brands from useCrmStore
  try {
    const conversations = useCrmStore.getState().conversations || [];
    conversations.forEach((c) => {
      addBrand(c.brand || c.brand_name);
    });
  } catch {}

  // 4. Ingest user assigned brand_access from useAuthStore
  try {
    const user = useAuthStore.getState().user;
    if (user?.brand_access && Array.isArray(user.brand_access)) {
      user.brand_access.forEach((b: string) => {
        if (b && b !== 'ALL' && b !== 'all') addBrand(b);
      });
    }
  } catch {}

  return list;
};

export const useBrandStore = create<BrandState>((set, get) => ({
  selectedBrandId: 'all',

  setSelectedBrandId: (brandId: string) => {
    set({ selectedBrandId: brandId });
    try {
      useCrmStore.getState().setSelectedBrandId(brandId);
    } catch {}
  },

  brands: computeDynamicBrands(),

  getDynamicBrands: () => computeDynamicBrands(),

  refreshBrands: () => {
    const updated = computeDynamicBrands();
    set({ brands: updated });
  },
}));

// Automatic reactivity: whenever channels or CRM stores update, refresh the dynamic brand list
try {
  useChannelsStore.subscribe(() => {
    useBrandStore.getState().refreshBrands();
  });
} catch {}

try {
  useCrmStore.subscribe(() => {
    useBrandStore.getState().refreshBrands();
  });
} catch {}
