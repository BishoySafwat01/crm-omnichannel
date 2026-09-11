import { StateCreator } from 'zustand';
import { AdminSecurityAlert, Conversation, Message } from '../../types/crm';
import {
  apiService,
  getConversationsDirect,
  getMessagesDirect,
  getUnreadSummaryDirect,
  markConversationReadDirect,
  messageActionsApi,
} from '../../services/api';
import { realtimeService } from '../../services/websocket';
import { useAuthStore } from '../useAuthStore';
import { ChatSlice, CrmState } from './types';
import {
  areMessagesEqual,
  mergeAndDeduplicateMessages,
  sortConversationsByLatest,
} from './chatHelpers';

export const createChatSlice: StateCreator<CrmState, [], [], ChatSlice> = (set, get) => ({
  conversations: [],
  activeConversationId: null,
  messages: {},
  isTyping: {},
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

  replyingToMessage: null,
  editingMessage: null,
  isForwardModalOpen: false,
  forwardingMessage: null,

  dismissSecurityAlert: (id) =>
    set((state) => ({
      adminSecurityAlerts: state.adminSecurityAlerts.filter((a) => a.id !== id),
    })),

  setReplyingToMessage: (msg) => set({ replyingToMessage: msg }),
  setEditingMessage: (msg) => set({ editingMessage: msg }),
  setIsForwardModalOpen: (open, msg) => set({ isForwardModalOpen: open, forwardingMessage: msg || null }),

  setDraftText: (text) => {
    set({ draftText: text });
  },

  setActiveConversationId: (id) => {
    if (!id) return;
    const prevId = get().activeConversationId;
    if (prevId && prevId !== id) {
      try {
        realtimeService.send({ type: 'LEAVE_CONVERSATION', conversation_id: prevId });
      } catch {}
    }
    try {
      realtimeService.send({ type: 'JOIN_CONVERSATION', conversation_id: id });
    } catch {}

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
      const isCompletedTab = get().activeFilterTab === 'completed';
      const isBlockedTab = get().activeFilterTab === 'blocked';
      const showArchived = isCompletedTab || isBlockedTab || Boolean(get().showArchived);
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
      const isCompletedTab = get().activeFilterTab === 'completed';
      const effectiveShowArchived = isCompletedTab || Boolean(showArchived);
      const raw = await getConversationsDirect(
        targetBrand,
        selectedChannel,
        selectedCountry,
        undefined,
        nextPage,
        50,
        selectedProvider,
        effectiveShowArchived
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

      // Capture baseline location BEFORE store mutation
      const activeConvBefore = get().conversations.find((c) => c.id === activeConversationId);
      const previousLoc = (activeConvBefore?.customer?.location || '').trim();

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

      // Location Detection Notification Trigger (fires when genuine new location is detected)
      const locDetected = (newLoc || (persistedMsg as any)?.detected_location || '').trim();
      if (locDetected && locDetected !== previousLoc) {
        const activeConv = get().conversations.find((c) => c.id === activeConversationId);
        const custName = activeConv?.customer_display_name || activeConv?.customer?.display_name || 'العميل';
        get().addLocationAlert({
          type: 'detected',
          location: locDetected,
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
        const alreadyHasPersisted = list.some((m) => m.id === persistedMsg.id);
        let replaced: Message[];
        if (alreadyHasPersisted) {
          replaced = list.filter((m) => m.id !== tempId);
        } else {
          replaced = list.map((m) =>
            m.id === tempId ? { ...persistedMsg, delivery_status: 'sent' as const } : m
          );
        }

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

  setConversationStatus: async (conversationId, statusStr) => {
    const rawStatus = (statusStr || '').toLowerCase();
    const isTargetClosed = rawStatus === 'completed' || rawStatus === 'closed';
    const isTargetPending = rawStatus === 'pending';
    const storeStatus: any = isTargetClosed ? 'closed' : isTargetPending ? 'pending' : 'open';
    const apiStatus = isTargetClosed ? 'closed' : isTargetPending ? 'pending' : 'open';

    set((state) => ({
      conversations: state.conversations.map((c) =>
        c.id === conversationId ? { ...c, status: storeStatus } : c
      ),
    }));

    await apiService.updateConversationStatus(conversationId, apiStatus);

    const activeFilterTab = get().activeFilterTab;
    const isCompletedTab = activeFilterTab === 'completed';

    // If conversation transitioned across the active/completed boundary,
    // re-fetch to maintain synchronized pagination and queue lists
    if ((isCompletedTab && !isTargetClosed) || (!isCompletedTab && isTargetClosed)) {
      get().fetchConversations();
    }
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
            ((m.text && msg.text && m.text === msg.text) || (!m.text && !msg.text)) &&
            m.sender_type?.toLowerCase() === msg.sender_type?.toLowerCase()
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
});
