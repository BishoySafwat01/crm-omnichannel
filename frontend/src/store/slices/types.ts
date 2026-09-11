import { AdminSecurityAlert, Conversation, Customer, FilterTab, LocationAlert, Message, MetaMessageTag, WebSocketEvent } from '../../types/crm';
import { TeamMember } from '../../services/api';

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

export interface FilterSlice {
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
  selectedMetaTag: MetaMessageTag;

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
  setSelectedMetaTag: (tag: MetaMessageTag) => void;
}

export interface CustomerSlice {
  locationAlerts: LocationAlert[];
  addLocationAlert: (alert: Omit<LocationAlert, 'id' | 'timestamp'>) => void;
  dismissLocationAlert: (id: string) => void;
  updateCustomerProfile: (customerId: string, payload: Partial<Customer>) => Promise<void>;
  blockCustomer: (customerId: string, reason?: string) => Promise<void>;
  unblockCustomer: (customerId: string) => Promise<void>;
  toggleCustomerTag: (tagLabel: string, templateText?: string) => Promise<void>;
}

export interface ChatSlice {
  conversations: Conversation[];
  activeConversationId: string | null;
  messages: Record<string, Message[]>;
  isTyping: Record<string, boolean>;
  isLoadingConversations: boolean;
  isLoadingMessages: boolean;
  isFetchingMore: boolean;
  conversationsPage: number;
  hasMoreConversations: boolean;
  isLoadingMoreConversations: boolean;
  draftText: string;
  error: string | null;
  unreadSummary: UnreadSummary;
  adminSecurityAlerts: AdminSecurityAlert[];

  replyingToMessage: Message | null;
  editingMessage: Message | null;
  isForwardModalOpen: boolean;
  forwardingMessage: Message | null;

  dismissSecurityAlert: (id: string) => void;
  setReplyingToMessage: (msg: Message | null) => void;
  setEditingMessage: (msg: Message | null) => void;
  setIsForwardModalOpen: (open: boolean, msg?: Message | null) => void;
  setDraftText: (text: string) => void;
  setActiveConversationId: (id: string) => void;
  fetchUnreadSummary: () => Promise<void>;
  markConversationAsRead: (conversationId: string) => Promise<void>;
  fetchConversations: () => Promise<void>;
  loadMoreConversations: () => Promise<void>;
  fetchMessages: (conversationId: string) => Promise<void>;
  loadMoreMessages: () => Promise<void>;
  sendMessage: (text: string, attachments?: any[]) => Promise<void>;
  retryMessage: (messageId: string) => Promise<void>;
  editMessage: (messageId: string, text: string) => Promise<void>;
  deleteMessage: (messageId: string) => Promise<void>;
  toggleReaction: (messageId: string, emoji: string) => Promise<void>;
  togglePin: (messageId: string) => Promise<void>;
  forwardMessage: (targetConversationId: string) => Promise<void>;
  uploadAndSendMedia: (file: File, caption?: string) => Promise<void>;
  setConversationStatus: (conversationId: string, status: string) => Promise<void>;
  assignAgentToConversation: (conversationId: string, agentId: string | null) => Promise<void>;
  setConversationPriority: (conversationId: string, priority: 'low' | 'normal' | 'high' | 'urgent') => Promise<void>;
  updateConversationBrand: (conversationId: string, brand: string) => Promise<void>;
  handleRealtimeEvent: (event: WebSocketEvent) => void;
}

export type CrmState = FilterSlice & CustomerSlice & ChatSlice;
