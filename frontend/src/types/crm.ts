export type ProviderType = 'meta' | 'respond_io';
export type ChannelType = 'messenger' | 'instagram' | 'whatsapp';
export type ConversationStatus = 'open' | 'closed' | 'resolved' | 'unread' | 'completed';
export type MessageDeliveryStatus = 'pending' | 'sent' | 'delivered' | 'read' | 'failed';
export type MetaMessageTag = 'HUMAN_AGENT' | 'CONFIRMED_EVENT_UPDATE' | 'POST_PURCHASE_UPDATE' | 'ACCOUNT_UPDATE';

export interface Brand {
  id: string;
  name: string;
  avatar: string;
  color: string;
  page_id: string;
}

export interface Attachment {
  id: string;
  type: 'image' | 'audio' | 'video' | 'file';
  url: string;
  title?: string;
  file_size?: number;
  mime_type?: string;
}

export interface CustomerIdentity {
  id: string;
  customer_id: string;
  provider: ProviderType;
  channel: ChannelType;
  external_user_id: string;
  metadata?: Record<string, any>;
  created_at: string;
  updated_at: string;
}

export interface Customer {
  id: string;
  display_name: string;
  email?: string;
  phone?: string;
  avatar_url?: string;
  locale?: string;
  tags?: string[];
  attributes?: Record<string, string>;
  created_at: string;
  updated_at: string;
  identities?: CustomerIdentity[];
}

export interface Message {
  id: string;
  conversation_id: string;
  sender_type: 'customer' | 'agent' | 'system';
  message_type: 'text' | 'image' | 'file' | 'audio' | 'video';
  text?: string;
  attachments?: Attachment[];
  external_message_id?: string;
  created_at: string;
  delivery_status?: MessageDeliveryStatus;
  meta_tag?: MetaMessageTag;
  error_message?: string;
}

export interface Conversation {
  id: string;
  customer_id: string;
  customer_display_name?: string;
  customer_avatar_url?: string;
  provider: ProviderType;
  channel: ChannelType;
  external_conversation_id: string;
  status: ConversationStatus;
  subject?: string;
  brand_id?: string;
  brand_name?: string;
  assigned_agent_id?: string;
  priority?: 'low' | 'normal' | 'high' | 'urgent';
  unread_count?: number;
  last_message_text?: string;
  last_message_at: string;
  last_customer_message_at?: string;
  created_at: string;
  customer?: Customer;
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  page_size: number;
  has_next?: boolean;
  next_cursor?: string;
}

export type FilterTab = 'all' | 'unread' | 'completed' | 'tagged';

export interface TagGroup {
  id: string;
  title: string;
  tags: {
    id: string;
    label: string;
    templateText?: string;
    color?: string;
  }[];
}

export interface WebSocketEvent {
  type: 'NEW_MESSAGE' | 'MESSAGE_STATUS' | 'TYPING_INDICATOR' | 'PONG';
  conversation_id?: string;
  message?: Message;
  status?: MessageDeliveryStatus;
  is_typing?: boolean;
  sender_psid?: string;
}
