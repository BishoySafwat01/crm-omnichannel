import { create } from 'zustand';
import { Conversation, FilterTab, Message, MetaMessageTag, WebSocketEvent } from '../types/crm';
import { apiService } from '../services/api';
import { realtimeService } from '../services/websocket';

interface CrmState {
  selectedBrandId: string;
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

  // Actions
  setSelectedBrandId: (brandId: string) => void;
  setSearchQuery: (query: string) => void;
  setActiveFilterTab: (tab: FilterTab) => void;
  setActiveConversationId: (id: string) => void;
  setSelectedMetaTag: (tag: MetaMessageTag) => void;
  setDraftText: (text: string) => void;
  fetchConversations: () => Promise<void>;
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
  handleRealtimeEvent: (event: WebSocketEvent) => void;
}

export const useCrmStore = create<CrmState>((set, get) => ({
  selectedBrandId: 'all',
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

  setSelectedBrandId: (brandId) => {
    set({ selectedBrandId: brandId });
    get().fetchConversations();
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
    set((state) => {
      const updatedConvs = state.conversations.map((c) =>
        c.id === id ? { ...c, unread_count: 0 } : c
      );
      return { activeConversationId: id, conversations: updatedConvs };
    });
    get().fetchMessages(id);
  },

  fetchConversations: async () => {
    set({ isLoadingConversations: true, error: null });

    try {
      const res = await apiService.getConversations();

      let items: Conversation[] = [];
      if (Array.isArray(res)) {
        items = res;
      } else if (res && Array.isArray((res as any).items)) {
        items = (res as any).items;
      } else if (res && Array.isArray((res as any).data)) {
        items = (res as any).data;
      } else if (res && Array.isArray((res as any).conversations)) {
        items = (res as any).conversations;
      }

      console.log('[Store] Fetched conversations raw response:', res);
      console.log('[Store] Parsed conversations count:', items.length);

      const activeId = get().activeConversationId || (items.length > 0 ? items[0].id : null);

      set({
        conversations: items,
        isLoadingConversations: false,
        activeConversationId: activeId,
        error: null,
      });

      if (activeId) {
        get().fetchMessages(activeId);
      }
    } catch (err: any) {
      console.error('[Store] fetchConversations error:', err);
      set({
        isLoadingConversations: false,
        error: err?.response?.data?.detail || err?.message || 'Failed to load conversations',
      });
    }
  },

  fetchMessages: async (conversationId) => {
    set({ isLoadingMessages: true });
    const res = await apiService.getMessages(conversationId, undefined, 200);
    set((state) => ({
      messages: { ...state.messages, [conversationId]: res.items },
      isLoadingMessages: false,
    }));
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

      // Transition to 'sent' / 'delivered'
      set((state) => {
        const list = state.messages[activeConversationId] || [];
        const replaced = list.map((m) =>
          m.id === tempId
            ? { ...persistedMsg, delivery_status: 'sent' as const }
            : m
        );
        return { messages: { ...state.messages, [activeConversationId]: replaced } };
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

  handleRealtimeEvent: (event) => {
    if (event.type === 'NEW_MESSAGE' && event.conversation_id && event.message) {
      const convId = event.conversation_id;
      const msg = event.message;

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
