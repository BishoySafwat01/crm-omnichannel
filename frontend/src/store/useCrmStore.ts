import { create } from 'zustand';
import {
  CrmState,
  createFilterSlice,
  createCustomerSlice,
  createChatSlice,
} from './slices';

export * from './slices';

export const useCrmStore = create<CrmState>()((...a) => ({
  ...createFilterSlice(...a),
  ...createCustomerSlice(...a),
  ...createChatSlice(...a),
}));

if (typeof window !== 'undefined') {
  (window as any).useCrmStore = useCrmStore;
}
