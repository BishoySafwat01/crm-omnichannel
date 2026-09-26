import { create } from 'zustand';
import { Brand } from '../types/crm';
import { getBrandMetadata } from '../constants/brands';
import { useCrmStore } from './useCrmStore';
import { fetchActiveBrandsDirect } from '../services/api';

interface BrandState {
  selectedBrandId: string;
  setSelectedBrandId: (brandId: string) => void;
  brands: Brand[];
  getDynamicBrands: () => Brand[];
  refreshBrands: () => void;
  fetchBackendBrands: () => Promise<void>;
}

const cachedBackendBrands = new Map<string, string>();

const computeDynamicBrands = (): Brand[] => {
  const list: Brand[] = [
    { id: 'all', name: 'المتاجر', avatar: 'ALL', color: 'from-slate-700 to-slate-800', page_id: '' },
  ];
  const seen = new Set<string>(['all', 'الكل']);

  const addBrand = (bName?: string | null, pageId?: string | null) => {
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
      page_id: String(pageId || '').trim(),
      logo_url: meta.logo_url,
    });
  };

  // Active connected pages are the sole source of store filter options.
  cachedBackendBrands.forEach((pageId, name) => addBrand(name, pageId));

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

  fetchBackendBrands: async () => {
    try {
      const backendBrands = await fetchActiveBrandsDirect();
      if (backendBrands && Array.isArray(backendBrands)) {
        cachedBackendBrands.clear();
        backendBrands.forEach((b) => {
          if (b.name) cachedBackendBrands.set(b.name, String(b.page_id || '').trim());
        });
        const updated = computeDynamicBrands();
        set({ brands: updated });
      }
    } catch (e) {
      console.warn('[useBrandStore] fetchBackendBrands error:', e);
    }
  },
}));

// Initialize backend brands on application load
try {
  setTimeout(() => {
    useBrandStore.getState().fetchBackendBrands();
  }, 100);
} catch {}
