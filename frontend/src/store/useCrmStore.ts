import { create } from 'zustand';
import { AdminSecurityAlert, Conversation, Customer, FilterTab, LocationAlert, Message, MetaMessageTag, WebSocketEvent } from '../types/crm';
import { apiService, customerApi, getConversationsDirect, getMessagesDirect, getUnreadSummaryDirect, markConversationReadDirect, messageActionsApi, teamApi, TeamMember } from '../services/api';
import { realtimeService } from '../services/websocket';
import { useAuthStore } from './useAuthStore';

export type ChannelFilterType = 'all' | 'messenger' | 'instagram' | 'whatsapp';

export interface UnreadSummary {
  total_unread: number;
  channels: {
    all: number;
    messenger: number;
    instagram: number;
    whatsapp: number;
  };
  brands: Record<string, number>;
}


export const mergeAndDeduplicateMessages = (existing: Message[], incoming: Message[]): Message[] => {
  const result: Message[] = [];
  const seenIds = new Set<string>();
  const seenExternalIds = new Set<string>();

  // 1. Process incoming authoritative messages from backend
  incoming.forEach((msg) => {
    if (!msg || !msg.id) return;
    if (seenIds.has(msg.id)) return;
    if (msg.external_message_id && seenExternalIds.has(msg.external_message_id)) return;

    seenIds.add(msg.id);
    if (msg.external_message_id) seenExternalIds.add(msg.external_message_id);
    result.push(msg);
  });

  // 2. Only keep recent pending optimistic messages from existing state that are not yet in server list
  const now = Date.now();
  existing.forEach((msg) => {
    if (!msg || !msg.id) return;
    if (seenIds.has(msg.id)) return;
    if (msg.external_message_id && seenExternalIds.has(msg.external_message_id)) return;

    const isTemp = msg.id.startsWith('temp-') || msg.delivery_status === 'pending';
    if (isTemp) {
      const msgTime = new Date(msg.created_at || now).getTime();
      const isRecent = (now - msgTime) < 30000;
      const alreadyHasSameText = incoming.some(
        (inc) =>
          inc.text === msg.text &&
          inc.sender_type === msg.sender_type &&
          Math.abs(new Date(inc.created_at || now).getTime() - msgTime) < 30000
      );

      if (isRecent && !alreadyHasSameText) {
        seenIds.add(msg.id);
        result.push(msg);
      }
    }
  });

  return result.sort(
    (a, b) => new Date(a.created_at || 0).getTime() - new Date(b.created_at || 0).getTime()
  );
};

export const sortConversationsByLatest = (convs: Conversation[]): Conversation[] => {
  return [...convs].sort((a, b) => {
    const timeA = new Date(a.last_message_at || a.last_activity_at || a.created_at || 0).getTime();
    const timeB = new Date(b.last_message_at || b.last_activity_at || b.created_at || 0).getTime();
    return timeB - timeA;
  });
};

const areConversationsEqual = (a: Conversation[], b: Conversation[]): boolean => {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (
      a[i].id !== b[i].id ||
      a[i].brand !== b[i].brand ||
      a[i].status !== b[i].status ||
      a[i].priority !== b[i].priority ||
      a[i].assigned_agent_id !== b[i].assigned_agent_id ||
      a[i].unread_count !== b[i].unread_count ||
      a[i].last_message_text !== b[i].last_message_text ||
      a[i].last_message_at !== b[i].last_message_at ||
      a[i].customer_display_name !== b[i].customer_display_name ||
      a[i].customer?.location !== b[i].customer?.location ||
      a[i].customer?.country !== b[i].customer?.country ||
      a[i].customer?.tier !== b[i].customer?.tier ||
      a[i].customer?.skin_type !== b[i].customer?.skin_type ||
      a[i].customer?.stage !== b[i].customer?.stage
    ) {
      return false;
    }
  }
  return true;
};

const areMessagesEqual = (a: Message[] | undefined, b: Message[]): boolean => {
  if (!a) return b.length === 0;
  if (a.length !== b.length) return false;
  if (a.length === 0) return true;
  const firstA = a[0];
  const firstB = b[0];
  const lastA = a[a.length - 1];
  const lastB = b[b.length - 1];
  return (
    firstA.id === firstB.id &&
    lastA.id === lastB.id &&
    lastA.text === lastB.text &&
    (lastA as any).delivery_status === (lastB as any).delivery_status &&
    (lastA as any).is_edited === (lastB as any).is_edited &&
    (lastA as any).is_deleted === (lastB as any).is_deleted &&
    (lastA as any).is_pinned === (lastB as any).is_pinned &&
    ((lastA.reactions?.length || 0) === (lastB.reactions?.length || 0))
  );
};

interface CrmState {
  // State
  selectedProvider: 'all' | 'beon' | 'meta';
  selectedBrand: string | null;
  selectedBrandId: string;
  showArchived: boolean;
  selectedChannel: ChannelFilterType;
  selectedCountry: string;
  availableCountries: string[];
  selectedEmployeeId: string | null;
  availableEmployees: TeamMember[];
  selectedAgentId: string;
  teamMembers: TeamMember[];
  isFetchingTeamMembers: boolean;
  isIntegrationsModalOpen: boolean;
  searchQuery: string;
  activeFilterTab: FilterTab;
  conversations: Conversation[];
  activeConversationId: string | null;
  messages: Record<string, Message[]>;
  isTyping: Record<string, boolean>;
  selectedMetaTag: MetaMessageTag;
  isLoadingConversations: boolean;
  isLoadingMessages: boolean;
  isFetchingMore: boolean;
  conversationsPage: number;
  hasMoreConversations: boolean;
  isLoadingMoreConversations: boolean;
  draftText: string;
  error: string | null;
  unreadSummary: UnreadSummary;

  // Message Actions State
  replyingToMessage: Message | null;
  editingMessage: Message | null;
  isForwardModalOpen: boolean;
  forwardingMessage: Message | null;

  // Actions
  setSelectedProvider: (provider: 'all' | 'beon' | 'meta') => void;
  setSelectedBrand: (brand: string | null) => void;
  setSelectedBrandId: (brandId: string) => void;
  toggleShowArchived: () => void;
  setSelectedChannel: (channel: ChannelFilterType) => void;
  setSelectedCountry: (country: string) => void;
  setSelectedEmployeeId: (employeeId: string | null) => void;
  setSelectedAgentId: (agentId: string) => void;
  fetchAvailableCountries: () => Promise<void>;
  fetchTeamMembers: () => Promise<void>;
  setIsIntegrationsModalOpen: (open: boolean) => void;
  setSearchQuery: (query: string) => void;
  setActiveFilterTab: (tab: FilterTab) => void;
  setActiveConversationId: (id: string) => void;
  setSelectedMetaTag: (tag: MetaMessageTag) => void;
  setDraftText: (text: string) => void;
  fetchConversations: () => Promise<void>;
  loadMoreConversations: () => Promise<void>;
  fetchUnreadSummary: () => Promise<void>;
  markConversationAsRead: (conversationId: string) => Promise<void>;
  fetchMessages: (conversationId: string) => Promise<void>;
  loadMoreMessages: () => Promise<void>;
  sendMessage: (text: string, attachments?: any[]) => Promise<void>;
  retryMessage: (messageId: string) => Promise<void>;
  uploadAndSendMedia: (file: File, caption?: string) => Promise<void>;
  toggleCustomerTag: (tagLabel: string, templateText?: string) => Promise<void>;
  setConversationStatus: (conversationId: string, status: string) => Promise<void>;
  assignAgentToConversation: (conversationId: string, agentId: string | null) => Promise<void>;
  setConversationPriority: (conversationId: string, priority: 'low' | 'normal' | 'high' | 'urgent') => Promise<void>;
  updateConversationBrand: (conversationId: string, brand: string) => Promise<void>;
  updateCustomerProfile: (customerId: string, payload: Partial<Customer>) => Promise<void>;
  blockCustomer: (customerId: string, reason?: string) => Promise<void>;
  unblockCustomer: (customerId: string) => Promise<void>;
  handleRealtimeEvent: (event: WebSocketEvent) => void;

  adminSecurityAlerts: AdminSecurityAlert[];
  dismissSecurityAlert: (id: string) => void;

  locationAlerts: LocationAlert[];
  addLocationAlert: (alert: Omit<LocationAlert, 'id' | 'timestamp'>) => void;
  dismissLocationAlert: (id: string) => void;

  // Message Actions Handlers
  setReplyingToMessage: (msg: Message | null) => void;
  setEditingMessage: (msg: Message | null) => void;
  setIsForwardModalOpen: (open: boolean, msg?: Message | null) => void;
  editMessage: (messageId: string, text: string) => Promise<void>;
  deleteMessage: (messageId: string) => Promise<void>;
  toggleReaction: (messageId: string, emoji: string) => Promise<void>;
  togglePin: (messageId: string) => Promise<void>;
  forwardMessage: (targetConversationId: string) => Promise<void>;
}

export const useCrmStore = create<CrmState>((set, get) => ({
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
  conversations: [],
  activeConversationId: null,
  messages: {},
  isTyping: {},
  selectedMetaTag: 'HUMAN_AGENT',
  isLoadingConversations: false,
  isLoadingMessages: false,
  isFetchingMore: false,
  conversationsPage: 1,
  hasMoreConversations: true,
  isLoadingMoreConversations: false,
  draftText: '',
  error: null,
  unreadSummary: {
    total_unread: 0,
    channels: { all: 0, messenger: 0, instagram: 0, whatsapp: 0 },
    brands: {},
  },
  adminSecurityAlerts: [],
  dismissSecurityAlert: (id) =>
    set((state) => ({
      adminSecurityAlerts: state.adminSecurityAlerts.filter((a) => a.id !== id),
    })),

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

  // Message Actions State Defaults
  replyingToMessage: null,
  editingMessage: null,
  isForwardModalOpen: false,
  forwardingMessage: null,

  setReplyingToMessage: (msg) => set({ replyingToMessage: msg }),
  setEditingMessage: (msg) => set({ editingMessage: msg }),
  setIsForwardModalOpen: (open, msg) => set({ isForwardModalOpen: open, forwardingMessage: msg || null }),

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
    set({ activeFilterTab: tab });
  },

  setSelectedMetaTag: (tag) => {
    set({ selectedMetaTag: tag });
  },

  setDraftText: (text) => {
    set({ draftText: text });
  },

  setActiveConversationId: (id) => {
    if (!id) return;
    set((state) => {
      const conv = state.conversations.find((c) => c.id === id);
      const prevUnread = conv?.unread_count || 0;
      const updatedTotal = Math.max(0, (state.unreadSummary?.total_unread || 0) - prevUnread);
      const updatedConvs = state.conversations.map((c) =>
        c.id === id ? { ...c, unread_count: 0 } : c
      );
      return {
        activeConversationId: id,
        conversations: updatedConvs,
        unreadSummary: {
          ...state.unreadSummary,
          total_unread: updatedTotal,
        },
      };
    });
    get().fetchMessages(id);
    get().markConversationAsRead(id);
  },

  fetchUnreadSummary: async () => {
    try {
      const summary = await getUnreadSummaryDirect();
      if (summary) {
        set({ unreadSummary: summary });
      }
    } catch (err) {
      console.warn('[Store] fetchUnreadSummary error:', err);
    }
  },

  markConversationAsRead: async (id) => {
    if (!id) return;
    set((state) => {
      const conv = state.conversations.find((c) => c.id === id);
      const prevUnread = conv?.unread_count || 0;
      const updatedTotal = Math.max(0, (state.unreadSummary?.total_unread || 0) - prevUnread);
      return {
        conversations: state.conversations.map((c) =>
          c.id === id ? { ...c, unread_count: 0 } : c
        ),
        unreadSummary: {
          ...state.unreadSummary,
          total_unread: updatedTotal,
        },
      };
    });
    try {
      await markConversationReadDirect(id);
      get().fetchUnreadSummary();
    } catch (e) {
      console.warn('markConversationRead error:', e);
    }
  },


  fetchConversations: async () => {
    try {
      const selectedBrand = get().selectedBrand || get().selectedBrandId;
      const selectedChannel = get().selectedChannel;
      const selectedCountry = get().selectedCountry;
      const selectedProvider = get().selectedProvider;
      const showArchived = get().showArchived;
      const raw = await getConversationsDirect(
        selectedBrand,
        selectedChannel,
        selectedCountry,
        undefined,
        1,
        50,
        selectedProvider,
        showArchived
      );

      let items: Conversation[] = [];
      let total = 0;
      if (Array.isArray(raw)) {
        items = raw;
        total = raw.length;
      } else if (raw && Array.isArray((raw as any).items)) {
        items = (raw as any).items;
        total = (raw as any).total || (raw as any).items.length;
      } else if (raw && Array.isArray((raw as any).data)) {
        items = (raw as any).data;
        total = (raw as any).total || (raw as any).data.length;
      } else if (raw && Array.isArray((raw as any).conversations)) {
        items = (raw as any).conversations;
        total = (raw as any).total || (raw as any).conversations.length;
      }

      const hasMore = items.length >= 50 && (total === 0 || items.length < total);

      if (items.length > 0) {
        const currentActive = get().activeConversationId;
        const validActive = items.find((c) => c.id === currentActive) ? currentActive : items[0].id;
        const currentConvs = get().conversations;

        const mergedItems = sortConversationsByLatest(
          items.map((c) => {
            const existing = currentConvs.find((ex) => ex.id === c.id);
            if (existing && existing.customer) {
              return {
                ...c,
                customer: {
                  ...c.customer,
                  ...existing.customer,
                  tier: existing.customer.tier || c.customer?.tier,
                  skin_type: existing.customer.skin_type || c.customer?.skin_type,
                  stage: existing.customer.stage || c.customer?.stage,
                  location: existing.customer.location || c.customer?.location,
                  phone: existing.customer.phone || c.customer?.phone,
                  email: existing.customer.email || c.customer?.email,
                },
              };
            }
            return c;
          })
        );

        set({
          conversations: mergedItems,
          conversationsPage: 1,
          hasMoreConversations: hasMore,
          isLoadingConversations: false,
          activeConversationId: validActive,
          error: null,
        });

        if (validActive) {
          get().fetchMessages(validActive);
        }
      } else {
        set({
          conversations: [],
          conversationsPage: 1,
          hasMoreConversations: false,
          activeConversationId: null,
          isLoadingConversations: false,
          error: null,
        });
      }
    } catch (err: any) {
      console.warn('[Store] Live fetch error, keeping existing state:', err);
      set({ isLoadingConversations: false });
    }
  },

  loadMoreConversations: async () => {
    const {
      hasMoreConversations,
      isLoadingMoreConversations,
      conversationsPage,
      selectedBrand,
      selectedBrandId,
      selectedChannel,
      selectedCountry,
      selectedProvider,
      showArchived,
      conversations,
    } = get();

    if (!hasMoreConversations || isLoadingMoreConversations) return;

    set({ isLoadingMoreConversations: true });
    try {
      const nextPage = conversationsPage + 1;
      const targetBrand = selectedBrand || selectedBrandId;
      const raw = await getConversationsDirect(
        targetBrand,
        selectedChannel,
        selectedCountry,
        undefined,
        nextPage,
        50,
        selectedProvider,
        showArchived
      );

      let newItems: Conversation[] = [];
      let total = 0;
      if (Array.isArray(raw)) {
        newItems = raw;
        total = raw.length;
      } else if (raw && Array.isArray((raw as any).items)) {
        newItems = (raw as any).items;
        total = (raw as any).total || (raw as any).items.length;
      } else if (raw && Array.isArray((raw as any).data)) {
        newItems = (raw as any).data;
        total = (raw as any).total || (raw as any).data.length;
      }

      if (newItems.length > 0) {
        const seenIds = new Set(conversations.map((c) => c.id));
        const uniqueIncoming = newItems.filter((c) => !seenIds.has(c.id));
        const combined = sortConversationsByLatest([...conversations, ...uniqueIncoming]);
        const hasMore = newItems.length >= 50 && (total === 0 || combined.length < total);

        set({
          conversations: combined,
          conversationsPage: nextPage,
          hasMoreConversations: hasMore,
          isLoadingMoreConversations: false,
        });
      } else {
        set({
          hasMoreConversations: false,
          isLoadingMoreConversations: false,
        });
      }
    } catch (err) {
      console.warn('[Store] loadMoreConversations error:', err);
      set({ isLoadingMoreConversations: false });
    }
  },

  fetchMessages: async (conversationId: string) => {
    try {
      const raw = await getMessagesDirect(conversationId);
      let messagesList: Message[] = [];
      if (Array.isArray(raw)) {
        messagesList = raw;
      } else if (raw && Array.isArray((raw as any).items)) {
        messagesList = (raw as any).items;
      } else if (raw && Array.isArray((raw as any).messages)) {
        messagesList = (raw as any).messages;
      } else if (raw && Array.isArray((raw as any).data)) {
        messagesList = (raw as any).data;
      }

      const currentMsgs = get().messages[conversationId];
      if (!areMessagesEqual(currentMsgs, messagesList)) {
        const merged = mergeAndDeduplicateMessages(currentMsgs || [], messagesList);
        set((state) => ({
          messages: { ...state.messages, [conversationId]: merged },
          isLoadingMessages: false,
        }));
      } else if (get().isLoadingMessages) {
        set({ isLoadingMessages: false });
      }
    } catch (err) {
      console.error('[Store] fetchMessages error:', err);
      set({ isLoadingMessages: false });
    }
  },

  loadMoreMessages: async () => {
    const { activeConversationId, messages, isFetchingMore } = get();
    if (!activeConversationId || isFetchingMore) return;

    const currentList = messages[activeConversationId] || [];
    if (currentList.length === 0) return;

    const earliestMsg = currentList[0];
    set({ isFetchingMore: true });

    try {
      const res = await apiService.getMessages(activeConversationId, earliestMsg.id, 20);
      if (res.items && res.items.length > 0) {
        // Prepend new historical items avoiding duplicates
        const existingIds = new Set(currentList.map((m) => m.id));
        const newItems = res.items.filter((m) => !existingIds.has(m.id));

        set((state) => ({
          messages: {
            ...state.messages,
            [activeConversationId]: [...newItems, ...currentList],
          },
        }));
      }
    } catch (e) {
      console.warn('Failed to load more messages:', e);
    } finally {
      set({ isFetchingMore: false });
    }
  },

  sendMessage: async (text, attachments = []) => {
    const { activeConversationId, conversations, messages, selectedMetaTag, replyingToMessage } = get();
    if (!activeConversationId || (!text.trim() && attachments.length === 0)) return;

    const activeConv = conversations.find((c) => c.id === activeConversationId);
    const lastCustomerMsgAt = activeConv?.last_customer_message_at
      ? new Date(activeConv.last_customer_message_at).getTime()
      : Date.now();
    const isExpired = Date.now() - lastCustomerMsgAt > 24 * 3600 * 1000;

    const currentMsgs = messages[activeConversationId] || [];
    const tempId = `temp-${Date.now()}`;
    const authUser = useAuthStore.getState().user;
    const replyRef = replyingToMessage
      ? {
          message_id: replyingToMessage.id,
          text: replyingToMessage.text || replyingToMessage.attachments?.[0]?.title || 'مرفق وسائط',
          sender_name:
            replyingToMessage.sender_name ||
            (replyingToMessage.sender_type === 'customer'
              ? activeConv?.customer_display_name || 'العميل'
              : 'موظف الدعم'),
          sender_type: replyingToMessage.sender_type,
          message_type: replyingToMessage.message_type,
        }
      : undefined;

    // 1. Optimistic append with status = 'pending'
    const optimisticMessage: Message = {
      id: tempId,
      conversation_id: activeConversationId,
      sender_type: 'agent',
      sender_user_id: authUser?.id,
      sender_name: authUser?.full_name || 'موظف الدعم',
      message_type: attachments.length > 0 ? attachments[0].type : 'text',
      text: text.trim(),
      attachments,
      reply_to: replyRef,
      created_at: new Date().toISOString(),
      delivery_status: 'pending',
      meta_tag: isExpired ? selectedMetaTag : undefined,
    };

    const updatedMsgs = [...currentMsgs, optimisticMessage];
    const updatedConvs = sortConversationsByLatest(
      conversations.map((c) =>
        c.id === activeConversationId
          ? {
              ...c,
              last_message_text: text.trim() || 'مرفق وسائط',
              last_message_at: optimisticMessage.created_at,
              last_activity_at: optimisticMessage.created_at,
            }
          : c
      )
    );

    set({
      messages: { ...get().messages, [activeConversationId]: updatedMsgs },
      conversations: updatedConvs,
      draftText: '',
      replyingToMessage: null,
    });

    // 2. Dispatch via API
    try {
      const persistedMsg = await apiService.sendMessage(
        activeConversationId,
        text.trim(),
        attachments,
        isExpired ? selectedMetaTag : undefined,
        replyingToMessage?.id
      );

      // Transition to 'sent' / 'delivered' & Update customer location reactively with deduplication
      const newLoc = (persistedMsg as any)?.updated_customer_location;
      set((state) => {
        const list = state.messages[activeConversationId] || [];
        const alreadyHasPersisted = list.some((m) => m.id === persistedMsg.id);
        let replaced: Message[];
        if (alreadyHasPersisted) {
          replaced = list.filter((m) => m.id !== tempId);
        } else {
          replaced = list.map((m) =>
            m.id === tempId
              ? { ...persistedMsg, delivery_status: 'sent' as const }
              : m
          );
        }

        // Strict deduplication by ID and external_message_id
        const seenIds = new Set<string>();
        const seenExtIds = new Set<string>();
        replaced = replaced.filter((m) => {
          if (!m.id) return true;
          if (seenIds.has(m.id)) return false;
          if (m.external_message_id && seenExtIds.has(m.external_message_id)) return false;
          seenIds.add(m.id);
          if (m.external_message_id) seenExtIds.add(m.external_message_id);
          return true;
        });

        const updatedConvs = sortConversationsByLatest(
          state.conversations.map((c) =>
            c.id === activeConversationId
              ? {
                  ...c,
                  last_message_text: persistedMsg.text || c.last_message_text,
                  last_message_at: persistedMsg.created_at || c.last_message_at,
                  last_activity_at: persistedMsg.created_at || c.last_activity_at,
                  customer: newLoc
                    ? c.customer
                      ? { ...c.customer, location: newLoc }
                      : ({ id: c.customer_id || '', display_name: c.customer_display_name || '', location: newLoc, created_at: '', updated_at: '' } as any)
                    : c.customer,
                }
              : c
          )
        );

        return {
          messages: { ...state.messages, [activeConversationId]: replaced },
          conversations: updatedConvs,
        };
      });

      // Location Detection Notification Trigger
      const activeConv = get().conversations.find((c) => c.id === activeConversationId);
      const custName = activeConv?.customer_display_name || activeConv?.customer?.display_name || 'العميل';
      const locDetected = newLoc || (persistedMsg as any)?.detected_location;
      const locStatus = (persistedMsg as any)?.location_detection_status;

      if (locDetected) {
        get().addLocationAlert({
          type: 'detected',
          location: locDetected,
          customerName: custName,
          conversationId: activeConversationId,
        });
      } else if (locStatus === 'not_detected' && !activeConv?.customer?.location && text.trim().length > 3) {
        get().addLocationAlert({
          type: 'not_detected',
          customerName: custName,
          conversationId: activeConversationId,
        });
      }
    } catch (err: any) {
      console.warn('Outbound API send failed. Transitioning bubble to failed:', err);

      // Transition to 'failed' with error notice
      set((state) => {
        const list = state.messages[activeConversationId] || [];
        const failedList = list.map((m) =>
          m.id === tempId
            ? {
                ...m,
                delivery_status: 'failed' as const,
                error_message: err.message || 'فشل في تسليم الرسالة عبر Meta Send API',
              }
            : m
        );
        return { messages: { ...state.messages, [activeConversationId]: failedList } };
      });
    }
  },

  retryMessage: async (messageId) => {
    const { activeConversationId, messages } = get();
    if (!activeConversationId) return;

    const currentList = messages[activeConversationId] || [];
    const failedMsg = currentList.find((m) => m.id === messageId);
    if (!failedMsg) return;

    // Reset status to pending
    set((state) => {
      const list = state.messages[activeConversationId] || [];
      return {
        messages: {
          ...state.messages,
          [activeConversationId]: list.map((m) =>
            m.id === messageId ? { ...m, delivery_status: 'pending', error_message: undefined } : m
          ),
        },
      };
    });

    try {
      const res = await apiService.sendMessage(
        activeConversationId,
        failedMsg.text || '',
        failedMsg.attachments
      );
      set((state) => {
        const list = state.messages[activeConversationId] || [];
        return {
          messages: {
            ...state.messages,
            [activeConversationId]: list.map((m) =>
              m.id === messageId ? { ...res, delivery_status: 'sent' } : m
            ),
          },
        };
      });
    } catch (err: any) {
      set((state) => {
        const list = state.messages[activeConversationId] || [];
        return {
          messages: {
            ...state.messages,
            [activeConversationId]: list.map((m) =>
              m.id === messageId
                ? {
                    ...m,
                    delivery_status: 'failed',
                    error_message: err.message || 'فشلت إعادة المحاولة',
                  }
                : m
            ),
          },
        };
      });
    }
  },

  editMessage: async (messageId: string, text: string) => {
    const { activeConversationId } = get();
    if (!activeConversationId || !text.trim()) return;

    // Optimistic update
    set((state) => {
      const list = state.messages[activeConversationId] || [];
      return {
        messages: {
          ...state.messages,
          [activeConversationId]: list.map((m) =>
            m.id === messageId
              ? { ...m, text: text.trim(), is_edited: true, edited_at: new Date().toISOString() }
              : m
          ),
        },
        editingMessage: null,
      };
    });

    try {
      const updated = await messageActionsApi.editMessage(activeConversationId, messageId, text.trim());
      set((state) => {
        const list = state.messages[activeConversationId] || [];
        return {
          messages: {
            ...state.messages,
            [activeConversationId]: list.map((m) => (m.id === messageId ? { ...m, ...updated } : m)),
          },
        };
      });
    } catch (err: any) {
      console.error('[Store] editMessage failed:', err);
      get().fetchMessages(activeConversationId);
      throw err;
    }
  },

  deleteMessage: async (messageId: string) => {
    const { activeConversationId } = get();
    if (!activeConversationId) return;

    // Optimistic soft-delete
    set((state) => {
      const list = state.messages[activeConversationId] || [];
      return {
        messages: {
          ...state.messages,
          [activeConversationId]: list.map((m) =>
            m.id === messageId
              ? {
                  ...m,
                  is_deleted: true,
                  text: undefined,
                  attachments: [],
                  deleted_at: new Date().toISOString(),
                }
              : m
          ),
        },
      };
    });

    try {
      const updated = await messageActionsApi.deleteMessage(activeConversationId, messageId);
      set((state) => {
        const list = state.messages[activeConversationId] || [];
        return {
          messages: {
            ...state.messages,
            [activeConversationId]: list.map((m) => (m.id === messageId ? { ...m, ...updated } : m)),
          },
        };
      });
    } catch (err: any) {
      console.error('[Store] deleteMessage failed:', err);
      get().fetchMessages(activeConversationId);
      throw err;
    }
  },

  toggleReaction: async (messageId: string, emoji: string) => {
    const { activeConversationId } = get();
    if (!activeConversationId) return;
    const authUser = useAuthStore.getState().user;

    // Optimistic reaction toggle
    set((state) => {
      const list = state.messages[activeConversationId] || [];
      return {
        messages: {
          ...state.messages,
          [activeConversationId]: list.map((m) => {
            if (m.id !== messageId) return m;
            const curReactions = [...(m.reactions || [])];
            const uId = authUser?.id || 'current';
            const existIdx = curReactions.findIndex((r) => r.user_id === uId && r.emoji === emoji);
            if (existIdx >= 0) {
              curReactions.splice(existIdx, 1);
            } else {
              curReactions.push({
                emoji,
                user_id: uId,
                user_name: authUser?.full_name || 'موظف',
                created_at: new Date().toISOString(),
              });
            }
            return { ...m, reactions: curReactions };
          }),
        },
      };
    });

    try {
      const updated = await messageActionsApi.toggleReaction(activeConversationId, messageId, emoji);
      set((state) => {
        const list = state.messages[activeConversationId] || [];
        return {
          messages: {
            ...state.messages,
            [activeConversationId]: list.map((m) => (m.id === messageId ? { ...m, ...updated } : m)),
          },
        };
      });
    } catch (err) {
      console.error('[Store] toggleReaction failed:', err);
      get().fetchMessages(activeConversationId);
    }
  },

  togglePin: async (messageId: string) => {
    const { activeConversationId } = get();
    if (!activeConversationId) return;

    // Optimistic pin toggle
    set((state) => {
      const list = state.messages[activeConversationId] || [];
      return {
        messages: {
          ...state.messages,
          [activeConversationId]: list.map((m) =>
            m.id === messageId ? { ...m, is_pinned: !m.is_pinned } : m
          ),
        },
      };
    });

    try {
      const updated = await messageActionsApi.togglePin(activeConversationId, messageId);
      set((state) => {
        const list = state.messages[activeConversationId] || [];
        return {
          messages: {
            ...state.messages,
            [activeConversationId]: list.map((m) => (m.id === messageId ? { ...m, ...updated } : m)),
          },
        };
      });
    } catch (err) {
      console.error('[Store] togglePin failed:', err);
      get().fetchMessages(activeConversationId);
    }
  },

  forwardMessage: async (targetConversationId: string) => {
    const { activeConversationId, forwardingMessage } = get();
    if (!activeConversationId || !forwardingMessage) return;

    try {
      await messageActionsApi.forwardMessage(
        activeConversationId,
        forwardingMessage.id,
        targetConversationId
      );
      const targetMsgText =
        forwardingMessage.text ||
        forwardingMessage.attachments?.[0]?.title ||
        'رسالة معاد توجيهها';
      const nowIso = new Date().toISOString();
      const updatedConvs = sortConversationsByLatest(
        get().conversations.map((c) =>
          c.id === targetConversationId
            ? {
                ...c,
                last_message_text: targetMsgText,
                last_message_at: nowIso,
                last_activity_at: nowIso,
              }
            : c
        )
      );
      set({
        conversations: updatedConvs,
        isForwardModalOpen: false,
        forwardingMessage: null,
      });
      if (targetConversationId === activeConversationId) {
        get().fetchMessages(activeConversationId);
      }
    } catch (err) {
      console.error('[Store] forwardMessage failed:', err);
      throw err;
    }
  },

  uploadAndSendMedia: async (file, caption) => {
    const { activeConversationId, conversations, selectedMetaTag, draftText, replyingToMessage } = get();
    if (!activeConversationId) return;

    const messageText = (caption !== undefined ? caption : draftText).trim();
    const tempId = `temp-${Date.now()}`;
    const localUrl = URL.createObjectURL(file);

    const fileNameLower = file.name.toLowerCase();
    const isVoice = fileNameLower.startsWith('voice_') || file.type.startsWith('audio/') || ['ogg', 'opus', 'mp3', 'm4a', 'wav', 'aac'].some((ext) => fileNameLower.endsWith(ext));
    const isVideo = !isVoice && (file.type.startsWith('video/') || ['mp4', 'mov', 'avi', 'mkv', 'ogv'].some((ext) => fileNameLower.endsWith(ext)) || (fileNameLower.endsWith('.webm') && !fileNameLower.includes('voice')));
    const isImage = !isVoice && !isVideo && (file.type.startsWith('image/') || ['png', 'jpg', 'jpeg', 'webp', 'gif', 'svg'].some((ext) => fileNameLower.endsWith(ext)));
    const isAudio = isVoice || (!isVideo && !isImage && file.type.startsWith('audio/'));
    const mediaType = isAudio ? 'audio' : (isVideo ? 'video' : (isImage ? 'image' : 'file'));

    const localAttachment = {
      id: `att-${Date.now()}`,
      type: mediaType as any,
      url: localUrl,
      title: file.name,
      file_size: file.size,
    };

    const activeConv = conversations.find((c) => c.id === activeConversationId);
    const lastCustomerMsgAt = activeConv?.last_customer_message_at
      ? new Date(activeConv.last_customer_message_at).getTime()
      : Date.now();
    const isExpired = Date.now() - lastCustomerMsgAt > 24 * 3600 * 1000;
    const authUser = useAuthStore.getState().user;
    const replyRef = replyingToMessage
      ? {
          message_id: replyingToMessage.id,
          text: replyingToMessage.text || replyingToMessage.attachments?.[0]?.title || 'مرفق وسائط',
          sender_name:
            replyingToMessage.sender_name ||
            (replyingToMessage.sender_type === 'customer'
              ? activeConv?.customer_display_name || 'العميل'
              : 'موظف الدعم'),
          sender_type: replyingToMessage.sender_type,
          message_type: replyingToMessage.message_type,
        }
      : undefined;

    const optimisticMessage: Message = {
      id: tempId,
      conversation_id: activeConversationId,
      sender_type: 'agent',
      sender_user_id: authUser?.id,
      sender_name: authUser?.full_name || 'موظف الدعم',
      message_type: mediaType as any,
      text: messageText,
      attachments: [localAttachment],
      reply_to: replyRef,
      created_at: new Date().toISOString(),
      delivery_status: 'pending',
      meta_tag: isExpired ? selectedMetaTag : undefined,
    };

    // 1. Instantly append optimistic message to the chat list and clear draftText
    const currentMsgs = get().messages[activeConversationId] || [];
    const updatedMsgs = [...currentMsgs, optimisticMessage];
    const updatedConvs = sortConversationsByLatest(
      conversations.map((c) =>
        c.id === activeConversationId
          ? {
              ...c,
              last_message_text: messageText || (isAudio ? 'رسالة صوتية' : isVideo ? 'فيديو' : isImage ? 'صورة' : 'ملف'),
              last_message_at: optimisticMessage.created_at,
              last_activity_at: optimisticMessage.created_at,
            }
          : c
      )
    );

    set({
      messages: { ...get().messages, [activeConversationId]: updatedMsgs },
      conversations: updatedConvs,
      draftText: '',
      replyingToMessage: null,
    });

    // 2. Perform upload and dispatch in background
    try {
      const uploaded = await apiService.uploadMedia(file);

      const serverAttachment = {
        id: `att-${Date.now()}`,
        type: mediaType as any,
        url: uploaded.url,
        title: uploaded.filename || file.name,
        file_size: uploaded.size,
      };

      const persistedMsg = await apiService.sendMessage(
        activeConversationId,
        messageText,
        [serverAttachment],
        isExpired ? selectedMetaTag : undefined,
        replyingToMessage?.id
      );

      // Transition to 'sent'
      set((state) => {
        const list = state.messages[activeConversationId] || [];
        let replaced = list.map((m) =>
          m.id === tempId ? { ...persistedMsg, delivery_status: 'sent' as const } : m
        );

        const seenIds = new Set<string>();
        replaced = replaced.filter((m) => {
          if (!m.id) return true;
          if (seenIds.has(m.id)) return false;
          seenIds.add(m.id);
          return true;
        });

        const sortedConvs = sortConversationsByLatest(
          state.conversations.map((c) =>
            c.id === activeConversationId
              ? {
                  ...c,
                  last_message_text: persistedMsg.text || c.last_message_text,
                  last_message_at: persistedMsg.created_at || c.last_message_at,
                  last_activity_at: persistedMsg.created_at || c.last_activity_at,
                }
              : c
          )
        );

        return {
          messages: { ...state.messages, [activeConversationId]: replaced },
          conversations: sortedConvs,
        };
      });
    } catch (e: any) {
      console.error('Failed to upload and send media:', e);
      // Transition optimistic message to failed
      set((state) => {
        const list = state.messages[activeConversationId] || [];
        const failedList = list.map((m) =>
          m.id === tempId
            ? {
                ...m,
                delivery_status: 'failed' as const,
                error_message: e.message || 'فشل رفع أو تسليم المرفق',
              }
            : m
        );
        return { messages: { ...state.messages, [activeConversationId]: failedList } };
      });
    }
  },

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

  setConversationStatus: async (conversationId, statusStr) => {
    set((state) => ({
      conversations: state.conversations.map((c) =>
        c.id === conversationId ? { ...c, status: statusStr as any } : c
      ),
    }));
    await apiService.updateConversationStatus(conversationId, statusStr);
  },

  assignAgentToConversation: async (conversationId, agentId) => {
    set((state) => ({
      conversations: state.conversations.map((c) =>
        c.id === conversationId ? { ...c, assigned_agent_id: agentId || undefined } : c
      ),
    }));
    await apiService.assignAgent(conversationId, agentId);
  },

  setConversationPriority: async (conversationId, priority) => {
    set((state) => ({
      conversations: state.conversations.map((c) =>
        c.id === conversationId ? { ...c, priority } : c
      ),
    }));
    await apiService.updatePriority(conversationId, priority);
  },

  updateConversationBrand: async (conversationId: string, brand: string) => {
    set((state) => ({
      conversations: state.conversations.map((c) =>
        c.id === conversationId ? { ...c, brand } : c
      ),
    }));
    await apiService.updateBrand(conversationId, brand);
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

  handleRealtimeEvent: (event) => {
    if (event.type === 'ADMIN_SECURITY_ALERT' || (event as any).type === 'admin_security_alert') {
      const alertData = event as any;
      const alertId =
        alertData.id ||
        `alert-${alertData.alert_type}-${alertData.conversation_id}-${alertData.deleted_text || alertData.content_snippet || Date.now()}`;

      // Deduplicate: Check if an alert with identical ID or identical content in this conversation was received recently
      const currentAlerts = get().adminSecurityAlerts;
      const isDuplicate = currentAlerts.some((a) => {
        if (a.id === alertId) return true;
        if (
          a.alert_type === alertData.alert_type &&
          a.conversation_id === alertData.conversation_id &&
          (a.deleted_text === alertData.deleted_text || a.content_snippet === alertData.content_snippet)
        ) {
          const timeDiff = Math.abs(new Date(a.timestamp).getTime() - new Date(alertData.timestamp || Date.now()).getTime());
          if (timeDiff < 10000) return true;
        }
        return false;
      });

      if (isDuplicate) {
        return;
      }

      const newAlert: AdminSecurityAlert = {
        id: alertId,
        alert_type: alertData.alert_type || 'security_warning',
        severity: alertData.severity || 'high',
        title: alertData.title || '🚨 تنبيه أمني',
        actor_name: alertData.actor_name || alertData.deleted_by_name || 'موظف',
        actor_email: alertData.actor_email || alertData.deleted_by_email,
        actor_type: alertData.actor_type || 'agent',
        deleted_text: alertData.deleted_text,
        matched_words: alertData.matched_words,
        content_snippet: alertData.content_snippet,
        conversation_id: alertData.conversation_id,
        customer_name: alertData.customer_name || 'عميل',
        brand_name: alertData.brand_name,
        channel: alertData.channel,
        timestamp: alertData.timestamp || new Date().toISOString(),
      };

      set((state) => ({
        adminSecurityAlerts: [newAlert, ...state.adminSecurityAlerts.filter((a) => a.id !== newAlert.id).slice(0, 3)],
      }));

      // Auto-dismiss after 10 seconds
      setTimeout(() => {
        get().dismissSecurityAlert(newAlert.id);
      }, 10000);
      return;
    }

    if ((event as any).type === 'CONVERSATION_READ') {
      get().fetchUnreadSummary();
      return;
    }

    if (
      event.type === 'NEW_CONVERSATION' ||
      event.type === 'CONVERSATION_UPDATED' ||
      (event as any).type === 'new_conversation' ||
      (event as any).type === 'conversation_updated'
    ) {
      get().fetchConversations();
      get().fetchUnreadSummary();
      return;
    }

    if (event.type === 'customer_typing' || event.type === 'TYPING_INDICATOR') {
      const convId = event.conversation_id;
      if (convId) {
        const isTyping = event.is_typing !== false;
        set((state) => ({
          isTyping: { ...state.isTyping, [convId]: isTyping },
        }));
        if (isTyping) {
          setTimeout(() => {
            set((state) => ({
              isTyping: { ...state.isTyping, [convId]: false },
            }));
          }, 5000);
        }
      }
      return;
    }

    if (
      (event.type === 'MESSAGE_UPDATED' ||
        event.type === 'MESSAGE_DELETED' ||
        event.type === 'MESSAGE_REACTION_UPDATED' ||
        event.type === 'MESSAGE_PIN_UPDATED' ||
        (event as any).type === 'message_updated' ||
        (event as any).type === 'message_deleted' ||
        (event as any).type === 'message_reaction_updated' ||
        (event as any).type === 'message_pin_updated') &&
      event.conversation_id &&
      event.message
    ) {
      const convId = event.conversation_id;
      const updatedMsg = event.message;
      set((state) => {
        const convMsgs = state.messages[convId] || [];
        const newMsgs = convMsgs.map((m) =>
          m.id === updatedMsg.id || (m.external_message_id && m.external_message_id === updatedMsg.external_message_id)
            ? { ...m, ...updatedMsg }
            : m
        );
        return {
          messages: { ...state.messages, [convId]: newMsgs },
        };
      });
      return;
    }

    if ((event.type === 'NEW_MESSAGE' || (event as any).type === 'new_message') && event.conversation_id) {
      const convId = event.conversation_id;
      const msg = event.message;

      get().fetchUnreadSummary();

      // If no full message payload was attached (e.g. background poller ping), fetch from server
      if (!msg) {
        if (convId === get().activeConversationId) {
          get().fetchMessages(convId);
        }
        get().fetchConversations();
        return;
      }

      set((state) => {
        const convMsgs = state.messages[convId] || [];

        // Avoid adding duplicate if already present
        const alreadyExists = convMsgs.some(
          (m) =>
            m.id === msg.id ||
            (msg.external_message_id && m.external_message_id === msg.external_message_id)
        );
        if (alreadyExists) return state;

        // If this message corresponds to a pending optimistic message, replace the temp message
        const matchingTempIndex = convMsgs.findIndex(
          (m) =>
            m.id.startsWith('temp-') &&
            m.text === msg.text &&
            m.sender_type === msg.sender_type
        );

        let updatedMsgs: Message[];
        if (matchingTempIndex !== -1) {
          updatedMsgs = [...convMsgs];
          updatedMsgs[matchingTempIndex] = msg;
        } else {
          updatedMsgs = [...convMsgs, msg];
        }

        // Deduplicate array
        const seen = new Set<string>();
        const seenExt = new Set<string>();
        updatedMsgs = updatedMsgs.filter((m) => {
          if (!m || !m.id) return false;
          if (seen.has(m.id)) return false;
          if (m.external_message_id && seenExt.has(m.external_message_id)) return false;
          seen.add(m.id);
          if (m.external_message_id) seenExt.add(m.external_message_id);
          return true;
        });

        const exists = state.conversations.some((c) => c.id === convId);
        let updatedConvs: Conversation[];
        if (exists) {
          updatedConvs = sortConversationsByLatest(
            state.conversations.map((c) =>
              c.id === convId
                ? {
                    ...c,
                    last_message_text: msg.text || 'مرفق جديد',
                    last_message_at: msg.created_at || new Date().toISOString(),
                    last_activity_at: msg.created_at || new Date().toISOString(),
                    last_sender_type: msg.sender_type,
                    last_customer_message_at:
                      msg.sender_type === 'customer'
                        ? (msg.created_at || new Date().toISOString())
                        : c.last_customer_message_at,
                    customer: c.customer
                      ? { ...c.customer, last_activity_at: msg.created_at || new Date().toISOString() }
                      : c.customer,
                    unread_count:
                      c.id === state.activeConversationId
                        ? 0
                        : (c.unread_count || 0) + (msg.sender_type === 'customer' ? 1 : 0),
                  }
                : c
            )
          );
        } else {
          // Inbound message for a conversation not yet in list -> fetch fresh list
          get().fetchConversations();
          updatedConvs = state.conversations;
        }

        return {
          messages: { ...state.messages, [convId]: updatedMsgs },
          conversations: updatedConvs,
          isTyping: { ...state.isTyping, [convId]: false },
        };
      });
    }
  },

}));
