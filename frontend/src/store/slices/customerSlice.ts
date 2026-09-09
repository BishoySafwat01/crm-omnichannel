import { StateCreator } from 'zustand';
import { Customer, LocationAlert } from '../../types/crm';
import { apiService, customerApi } from '../../services/api';
import { CrmState, CustomerSlice } from './types';

export const createCustomerSlice: StateCreator<CrmState, [], [], CustomerSlice> = (set, get) => ({
  locationAlerts: [],

  addLocationAlert: (alertData) => {
    const alert: LocationAlert = {
      ...alertData,
      id: `loc-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      timestamp: Date.now(),
    };
    set((state) => ({
      locationAlerts: [alert, ...state.locationAlerts.slice(0, 3)],
    }));
  },

  dismissLocationAlert: (id) =>
    set((state) => ({
      locationAlerts: state.locationAlerts.filter((a) => a.id !== id),
    })),

  toggleCustomerTag: async (tagLabel, templateText) => {
    const { activeConversationId, conversations, setDraftText } = get();
    if (!activeConversationId) return;

    if (templateText) {
      setDraftText(templateText);
    }

    const activeConv = conversations.find((c) => c.id === activeConversationId);
    if (!activeConv || !activeConv.customer) return;

    const customer = activeConv.customer;
    const currentTags = customer.tags || [];
    const hasTag = currentTags.includes(tagLabel);
    const newTags = hasTag
      ? currentTags.filter((t) => t !== tagLabel)
      : [...currentTags, tagLabel];

    const updatedConvs = conversations.map((c) =>
      c.id === activeConversationId && c.customer
        ? { ...c, customer: { ...c.customer, tags: newTags } }
        : c
    );

    set({ conversations: updatedConvs });
    await apiService.updateCustomerTags(customer.id, newTags);
  },

  updateCustomerProfile: async (customerId: string, payload: Partial<Customer>) => {
    set((state) => {
      const updatedConvs = state.conversations.map((c) => {
        if (c.customer_id === customerId || c.customer?.id === customerId) {
          const updatedCustomer = { ...(c.customer || {}), ...payload } as Customer;
          return {
            ...c,
            customer: updatedCustomer,
            customer_display_name: payload.display_name || c.customer_display_name,
          };
        }
        return c;
      });
      return { conversations: updatedConvs };
    });

    await apiService.updateCustomerProfile(customerId, payload);
    if (payload.location || (payload as any).country) {
      get().fetchAvailableCountries();
    }
  },

  blockCustomer: async (customerId: string, reason?: string) => {
    set((state) => ({
      conversations: state.conversations.map((c) => {
        if (c.customer_id === customerId || c.customer?.id === customerId) {
          return {
            ...c,
            customer: { ...(c.customer || {}), is_blocked: true, blocked_reason: reason || 'حظر يدوي من المشرف' } as Customer,
          };
        }
        return c;
      }),
    }));
    await customerApi.blockCustomer(customerId, reason);
  },

  unblockCustomer: async (customerId: string) => {
    set((state) => ({
      conversations: state.conversations.map((c) => {
        if (c.customer_id === customerId || c.customer?.id === customerId) {
          return {
            ...c,
            customer: { ...(c.customer || {}), is_blocked: false, blocked_reason: undefined } as Customer,
          };
        }
        return c;
      }),
    }));
    await customerApi.unblockCustomer(customerId);
  },
});
