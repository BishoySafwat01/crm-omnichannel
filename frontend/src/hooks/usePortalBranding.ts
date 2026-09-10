import { useEffect } from 'react';
import { usePortalBrandingStore, PortalBranding } from '../store/usePortalBrandingStore';

export const usePortalBranding = (): {
  branding: PortalBranding;
  isLoading: boolean;
  refreshBranding: () => Promise<void>;
} => {
  const { branding, isLoading, fetchBranding } = usePortalBrandingStore();

  useEffect(() => {
    fetchBranding();
  }, [fetchBranding]);

  return { branding, isLoading, refreshBranding: fetchBranding };
};

export type { PortalBranding };
