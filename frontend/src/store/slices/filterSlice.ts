import { StateCreator } from 'zustand';
import { customerApi, teamApi } from '../../services/api';
import { CrmState, FilterSlice } from './types';

const normalizeStore = (store?: string | null): string | null => {
  const cleanStore = String(store || '').trim();
  return !cleanStore || ['all', 'الكل'].includes(cleanStore.toLowerCase()) ? null : cleanStore;
};

export const createFilterSlice: StateCreator<CrmState, [], [], FilterSlice> = (set, get) => ({
  selectedProvider: 'all',
  selectedBrand: null,
  selectedBrandId: 'all',
  selectedBrandIds: [],
  showArchived: false,
  selectedChannel: 'all',
  selectedChannels: [],
  selectedCountry: 'all',
  selectedCountries: [],
  availableCountries: [],
  selectedEmployeeId: null,
  availableEmployees: [],
  selectedAgentId: 'all',
  teamMembers: [],
  isFetchingTeamMembers: false,
  isIntegrationsModalOpen: false,
  searchQuery: '',
  activeFilterTab: 'all',
  selectedMetaTag: 'HUMAN_AGENT',

  setSelectedProvider: (provider) => {
    set({ selectedProvider: provider, conversationsPage: 1 });
    get().fetchConversations();
  },

  setSelectedBrand: (brand) => {
    const cleanBrand = normalizeStore(brand);
    set({ selectedBrand: cleanBrand, selectedBrandId: cleanBrand || 'all', selectedBrandIds: cleanBrand ? [cleanBrand] : [], conversationsPage: 1 });
    get().fetchConversations();
  },

  setSelectedBrandId: (brandId) => {
    const cleanBrand = normalizeStore(brandId);
    set({ selectedBrandId: cleanBrand || 'all', selectedBrand: cleanBrand, selectedBrandIds: cleanBrand ? [cleanBrand] : [], conversationsPage: 1 });
    get().fetchConversations();
  },

  setSelectedBrandIds: (brandIds) => {
    const cleanBrands = Array.from(new Set(brandIds.map(normalizeStore).filter((brand): brand is string => Boolean(brand))));
    set({
      selectedBrandIds: cleanBrands,
      selectedBrandId: cleanBrands[0] || 'all',
      selectedBrand: cleanBrands[0] || null,
      conversationsPage: 1,
    });
    get().fetchConversations();
  },

  toggleShowArchived: () => {
    set((state) => ({ showArchived: !state.showArchived, conversationsPage: 1 }));
    get().fetchConversations();
  },

  setSelectedChannel: (channel) => {
    set({ selectedChannel: channel, selectedChannels: channel === 'all' ? [] : [channel], conversationsPage: 1 });
    get().fetchConversations();
  },

  setSelectedChannels: (channels) => {
    const cleanChannels = Array.from(new Set(channels));
    set({ selectedChannels: cleanChannels, selectedChannel: cleanChannels[0] || 'all', conversationsPage: 1 });
    get().fetchConversations();
  },

  setSelectedCountry: (country) => {
    const cleanCountry = !country || country === 'all' || country === 'الكل' ? null : country;
    set({ selectedCountry: cleanCountry || 'all', selectedCountries: cleanCountry ? [cleanCountry] : [], conversationsPage: 1 });
    get().fetchConversations();
  },

  setSelectedCountries: (countries) => {
    const cleanCountries = Array.from(new Set(countries.map((country) => country.trim()).filter(Boolean)));
    set({ selectedCountries: cleanCountries, selectedCountry: cleanCountries[0] || 'all', conversationsPage: 1 });
    get().fetchConversations();
  },

  setSelectedEmployeeId: (employeeId) => {
    const cleanId = !employeeId || employeeId === 'all' || employeeId === 'الكل' ? null : employeeId;
    set({
      selectedEmployeeId: cleanId,
      selectedAgentId: cleanId || 'all',
      conversationsPage: 1,
    });
  },

  setSelectedAgentId: (agentId) => {
    const cleanId = !agentId || agentId === 'all' || agentId === 'الكل' ? null : agentId;
    set({
      selectedAgentId: cleanId || 'all',
      selectedEmployeeId: cleanId,
      conversationsPage: 1,
    });
  },

  fetchAvailableCountries: async () => {
    try {
      const locations = await customerApi.getLocations();
      set({ availableCountries: locations });
    } catch (err) {
      console.warn('[Store] fetchAvailableCountries error:', err);
    }
  },

  fetchTeamMembers: async () => {
    try {
      set({ isFetchingTeamMembers: true });
      const members = await teamApi.listMembers();
      const safeMembers = Array.isArray(members) ? members : [];
      set({
        availableEmployees: safeMembers,
        teamMembers: safeMembers,
        isFetchingTeamMembers: false,
      });
    } catch (err) {
      console.warn('[Store] fetchTeamMembers error:', err);
      set({ isFetchingTeamMembers: false });
    }
  },

  setIsIntegrationsModalOpen: (open) => {
    set({ isIntegrationsModalOpen: open });
  },

  setSearchQuery: (query) => {
    set({ searchQuery: query });
  },

  setActiveFilterTab: (tab) => {
    const previousTab = get().activeFilterTab;
    set({ activeFilterTab: tab });

    // Re-fetch tabs whose dataset is filtered by the backend.
    const wasSpecial = previousTab === 'completed' || previousTab === 'blocked' || previousTab === 'unread';
    const isSpecial = tab === 'completed' || tab === 'blocked' || tab === 'unread';
    if (wasSpecial !== isSpecial || (wasSpecial && isSpecial && previousTab !== tab)) {
      set({ conversationsPage: 1 });
      get().fetchConversations();
    }
  },

  setSelectedMetaTag: (tag) => {
    set({ selectedMetaTag: tag });
  },
});
