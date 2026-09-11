import { StateCreator } from 'zustand';
import { customerApi, teamApi } from '../../services/api';
import { CrmState, FilterSlice } from './types';

export const createFilterSlice: StateCreator<CrmState, [], [], FilterSlice> = (set, get) => ({
  selectedProvider: 'all',
  selectedBrand: null,
  selectedBrandId: 'all',
  showArchived: false,
  selectedChannel: 'all',
  selectedCountry: 'all',
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
    const cleanBrand = !brand || brand === 'all' || brand === 'الكل' ? null : brand;
    set({ selectedBrand: cleanBrand, selectedBrandId: cleanBrand || 'all', conversationsPage: 1 });
    get().fetchConversations();
  },

  setSelectedBrandId: (brandId) => {
    const cleanBrand = !brandId || brandId === 'all' || brandId === 'الكل' ? null : brandId;
    set({ selectedBrandId: brandId, selectedBrand: cleanBrand, conversationsPage: 1 });
    get().fetchConversations();
  },

  toggleShowArchived: () => {
    set((state) => ({ showArchived: !state.showArchived, conversationsPage: 1 }));
    get().fetchConversations();
  },

  setSelectedChannel: (channel) => {
    set({ selectedChannel: channel, conversationsPage: 1 });
    get().fetchConversations();
  },

  setSelectedCountry: (country) => {
    set({ selectedCountry: country, conversationsPage: 1 });
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

    // Automatically re-fetch conversations when switching between active inbox and completed archive
    const wasCompleted = previousTab === 'completed';
    const isCompleted = tab === 'completed';
    if (wasCompleted !== isCompleted) {
      set({ conversationsPage: 1 });
      get().fetchConversations();
    }
  },

  setSelectedMetaTag: (tag) => {
    set({ selectedMetaTag: tag });
  },
});
