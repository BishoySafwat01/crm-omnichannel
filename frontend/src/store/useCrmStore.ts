import { create } from 'zustand';
import { Conversation, Customer, FilterTab, Message, MetaMessageTag, WebSocketEvent } from '../types/crm';
import { apiService, getConversationsDirect, getMessagesDirect, getUnreadSummaryDirect, markConversationReadDirect } from '../services/api';
import { realtimeService } from '../services/websocket';

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
  const byPermanentId = new Map<string, Message>();
  const byExternalId = new Map<string, Message>();
  const tempToPermMap = new Map<string, string>();

  // Process incoming messages first to establish permanent truth
  incoming.forEach((msg) => {
    if (msg.id) byPermanentId.set(msg.id, msg);
    if (msg.external_message_id) byExternalId.set(msg.external_message_id, msg);
    if ((msg as any).temp_id && msg.id) {
      tempToPermMap.set((msg as any).temp_id, msg.id);
    }
  });

  // Merge with existing items, discarding replaced temp placeholders
  existing.forEach((msg) => {
    const isReplacedTemp = (msg as any).temp_id && tempToPermMap.has((msg as any).temp_id);
    const isKnownExternal = msg.external_message_id && byExternalId.has(msg.external_message_id);

    if (!isReplacedTemp && !isKnownExternal && !byPermanentId.has(msg.id)) {
      byPermanentId.set(msg.id, msg);
      if (msg.external_message_id) byExternalId.set(msg.external_message_id, msg);
    }
  });

  return Array.from(byPermanentId.values()).sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
  );
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
    (lastA as any).delivery_status === (lastB as any).delivery_status
  );
};

interface CrmState {
  selectedBrandId: string;
  selectedChannel: ChannelFilterType;
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
  draftText: string;
  error: string | null;
  unreadSummary: UnreadSummary;

  // Actions
  setSelectedBrandId: (brandId: string) => void;
  setSelectedChannel: (channel: ChannelFilterType) => void;
  setSearchQuery: (query: string) => void;
  setActiveFilterTab: (tab: FilterTab) => void;
  setActiveConversationId: (id: string) => void;
  setSelectedMetaTag: (tag: MetaMessageTag) => void;
  setDraftText: (text: string) => void;
  fetchConversations: () => Promise<void>;
  fetchUnreadSummary: () => Promise<void>;
  markConversationAsRead: (conversationId: string) => Promise<void>;
  fetchMessages: (conversationId: string) => Promise<void>;
  loadMoreMessages: () => Promise<void>;
  sendMessage: (text: string, attachments?: any[]) => Promise<void>;
  retryMessage: (messageId: string) => Promise<void>;
  deleteMessage: (messageId: string) => void;
  uploadAndSendMedia: (file: File) => Promise<void>;
  toggleCustomerTag: (tagLabel: string, templateText?: string) => Promise<void>;
  setConversationStatus: (conversationId: string, status: string) => Promise<void>;
  assignAgentToConversation: (conversationId: string, agentId: string | null) => Promise<void>;
  setConversationPriority: (conversationId: string, priority: 'low' | 'normal' | 'high' | 'urgent') => Promise<void>;
  updateConversationBrand: (conversationId: string, brand: string) => Promise<void>;
  updateCustomerProfile: (customerId: string, payload: Partial<Customer>) => Promise<void>;
  handleRealtimeEvent: (event: WebSocketEvent) => void;
}

export const useCrmStore = create<CrmState>((set, get) => ({
  selectedBrandId: 'all',
  selectedChannel: 'all',
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
  draftText: '',
  error: null,
  unreadSummary: {
    total_unread: 0,
    channels: { all: 0, messenger: 0, instagram: 0, whatsapp: 0 },
    brands: {},
  },


  setSelectedBrandId: (brandId) => {
    set({ selectedBrandId: brandId });
    get().fetchConversations();
  },

  setSelectedChannel: (channel) => {
    set({ selectedChannel: channel });
  },

  setSearchQuery: (query) => {
    set({ searchQuery: query });
    get().fetchConversations();
  },

  setActiveFilterTab: (tab) => {
    set({ activeFilterTab: tab });
    get().fetchConversations();
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
      const updatedConvs = state.conversations.map((c) =>
        c.id === id ? { ...c, unread_count: 0 } : c
      );
      return { activeConversationId: id, conversations: updatedConvs };
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
    set((state) => ({
      conversations: state.conversations.map((c) =>
        c.id === id ? { ...c, unread_count: 0 } : c
      ),
    }));
    await markConversationReadDirect(id);
    get().fetchUnreadSummary();
  },


  fetchConversations: async () => {
    try {
      const selectedBrand = get().selectedBrandId;
      const raw = await getConversationsDirect(selectedBrand);

      let items: Conversation[] = [];
      if (Array.isArray(raw)) {
        items = raw;
      } else if (raw && Array.isArray((raw as any).items)) {
        items = (raw as any).items;
      } else if (raw && Array.isArray((raw as any).data)) {
        items = (raw as any).data;
      } else if (raw && Array.isArray((raw as any).conversations)) {
        items = (raw as any).conversations;
      }

      if (items.length > 0) {
        const currentActive = get().activeConversationId;
        const validActive = items.find((c) => c.id === currentActive) ? currentActive : items[0].id;
        const currentConvs = get().conversations;

        const mergedItems = items.map((c) => {
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
        });

        if (!areConversationsEqual(currentConvs, mergedItems) || get().activeConversationId !== validActive) {
          set({
            conversations: mergedItems,
            isLoadingConversations: false,
            activeConversationId: validActive,
            error: null,
          });
        } else if (get().isLoadingConversations) {
          set({ isLoadingConversations: false });
        }

        if (validActive) {
          get().fetchMessages(validActive);
        }
      }
    } catch (err: any) {
      console.warn('[Store] Live fetch error, keeping existing state:', err);
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
    const { activeConversationId, conversations, messages, selectedMetaTag } = get();
    if (!activeConversationId || (!text.trim() && attachments.length === 0)) return;

    const activeConv = conversations.find((c) => c.id === activeConversationId);
    const lastCustomerMsgAt = activeConv?.last_customer_message_at
      ? new Date(activeConv.last_customer_message_at).getTime()
      : Date.now();
    const isExpired = Date.now() - lastCustomerMsgAt > 24 * 3600 * 1000;

    const currentMsgs = messages[activeConversationId] || [];
    const tempId = `temp-${Date.now()}`;

    // 1. Optimistic append with status = 'pending'
    const optimisticMessage: Message = {
      id: tempId,
      conversation_id: activeConversationId,
      sender_type: 'agent',
      message_type: attachments.length > 0 ? attachments[0].type : 'text',
      text: text.trim(),
      attachments,
      created_at: new Date().toISOString(),
      delivery_status: 'pending',
      meta_tag: isExpired ? selectedMetaTag : undefined,
    };

    const updatedMsgs = [...currentMsgs, optimisticMessage];
    const updatedConvs = conversations.map((c) =>
      c.id === activeConversationId
        ? {
            ...c,
            last_message_text: text.trim() || 'مرفق وسائط',
            last_message_at: optimisticMessage.created_at,
          }
        : c
    );

    set({
      messages: { ...get().messages, [activeConversationId]: updatedMsgs },
      conversations: updatedConvs,
      draftText: '',
    });

    // 2. Dispatch via API
    try {
      const persistedMsg = await apiService.sendMessage(
        activeConversationId,
        text.trim(),
        attachments,
        isExpired ? selectedMetaTag : undefined
      );

      // Transition to 'sent' / 'delivered' & Update customer location reactively with deduplication
      const newLoc = (persistedMsg as any)?.updated_customer_location;
      set((state) => {
        const list = state.messages[activeConversationId] || [];
        let replaced = list.map((m) =>
          m.id === tempId
            ? { ...persistedMsg, delivery_status: 'sent' as const }
            : m
        );

        // Strict deduplication by ID
        const seenIds = new Set<string>();
        replaced = replaced.filter((m) => {
          if (!m.id) return true;
          if (seenIds.has(m.id)) return false;
          seenIds.add(m.id);
          return true;
        });

        const updatedConvs = newLoc
          ? state.conversations.map((c) =>
              c.id === activeConversationId
                ? {
                    ...c,
                    customer: c.customer
                      ? { ...c.customer, location: newLoc }
                      : ({ id: c.customer_id || '', display_name: c.customer_display_name || '', location: newLoc, created_at: '', updated_at: '' } as any),
                  }
                : c
            )
          : state.conversations;

        return {
          messages: { ...state.messages, [activeConversationId]: replaced },
          conversations: updatedConvs,
        };
      });
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

  deleteMessage: (messageId) => {
    const { activeConversationId } = get();
    if (!activeConversationId) return;

    set((state) => {
      const list = state.messages[activeConversationId] || [];
      return {
        messages: {
          ...state.messages,
          [activeConversationId]: list.filter((m) => m.id !== messageId),
        },
      };
    });
  },

  uploadAndSendMedia: async (file) => {
    const { activeConversationId, sendMessage, draftText } = get();
    if (!activeConversationId) return;

    try {
      const uploaded = await apiService.uploadMedia(file);
      const fileNameLower = (file.name || uploaded.filename || '').toLowerCase();
      const isImage = file.type.startsWith('image/') || ['png', 'jpg', 'jpeg', 'webp', 'gif'].some((ext) => fileNameLower.endsWith(ext));
      const isAudio = file.type.startsWith('audio/') || ['webm', 'ogg', 'opus', 'mp3', 'm4a', 'mp4', 'wav'].some((ext) => fileNameLower.endsWith(ext));
      const mediaType = isImage ? 'image' : (isAudio ? 'audio' : (uploaded.media_type || 'file'));

      const attachment = {
        id: `att-${Date.now()}`,
        type: mediaType as any,
        url: uploaded.url,
        title: uploaded.filename || file.name,
        file_size: uploaded.size,
      };

      await sendMessage(draftText.trim(), [attachment]);
    } catch (e) {
      console.error('Failed to upload and send media:', e);
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
  },

  handleRealtimeEvent: (event) => {
    if ((event as any).type === 'CONVERSATION_READ') {
      get().fetchUnreadSummary();
      return;
    }

    if (event.type === 'NEW_MESSAGE' && event.conversation_id && event.message) {
      const convId = event.conversation_id;
      const msg = event.message;

      get().fetchUnreadSummary();

      set((state) => {
        const convMsgs = state.messages[convId] || [];
        if (convMsgs.some((m) => m.id === msg.id || m.external_message_id === msg.external_message_id)) {
          return state;
        }

        const updatedMsgs = [...convMsgs, msg];
        const updatedConvs = state.conversations.map((c) =>
          c.id === convId
            ? {
                ...c,
                last_message_text: msg.text || 'مرفق جديد',
                last_message_at: msg.created_at,
                last_customer_message_at:
                  msg.sender_type === 'customer' ? msg.created_at : c.last_customer_message_at,
                unread_count:
                  c.id === state.activeConversationId
                    ? 0
                    : (c.unread_count || 0) + (msg.sender_type === 'customer' ? 1 : 0),
              }
            : c
        );

        return {
          messages: { ...state.messages, [convId]: updatedMsgs },
          conversations: updatedConvs,
          isTyping: { ...state.isTyping, [convId]: false },
        };
      });
    }
  },

}));
