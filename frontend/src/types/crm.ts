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
  type: 'image' | 'audio' | 'video' | 'file' | 'location';
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
  location?: string;
  country?: string;
  city?: string;
  tier?: string;
  skin_type?: string;
  stage?: string;
  tags?: string[];
  attributes?: Record<string, string>;
  created_at: string;
  updated_at: string;
  last_activity_at?: string;
  identities?: CustomerIdentity[];
  brand?: string;
  channel?: string;
  conversation_id?: string;
  conversation_status?: string;
  assigned_agent_id?: string;
  assigned_agent_name?: string;
  last_agent_name?: string;
  last_interaction?: string;
}

export interface MessageReaction {
  emoji: string;
  user_id: string;
  user_name?: string;
  created_at: string;
}

export interface MessageReplyReference {
  message_id: string;
  text?: string;
  sender_name?: string;
  sender_type?: string;
  message_type?: string;
}

export interface Message {
  id: string;
  conversation_id: string;
  sender_type: 'customer' | 'agent' | 'system';
  sender_user_id?: string;
  sender_name?: string;
  sender_external_id?: string;
  message_type: 'text' | 'image' | 'file' | 'audio' | 'video' | 'location' | 'share_reel' | 'share_post' | 'share' | 'unknown';
  text?: string;
  media_url?: string;
  attachments?: Attachment[];
  external_message_id?: string;
  created_at: string;
  delivery_status?: MessageDeliveryStatus;
  meta_tag?: MetaMessageTag;
  error_message?: string;
  metadata_?: Record<string, any>;

  // Message Actions
  reply_to?: MessageReplyReference;
  is_edited?: boolean;
  edited_at?: string;
  edited_by_user_id?: string;
  is_deleted?: boolean;
  deleted_at?: string;
  deleted_by_name?: string;
  reactions?: MessageReaction[];
  forwarded?: boolean;
  forwarded_from?: {
    original_message_id?: string;
    original_conversation_id?: string;
  };
  is_pinned?: boolean;
  pinned_at?: string;
  pinned_by_name?: string;
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
  brand?: string;
  brand_id?: string;
  brand_name?: string;
  assigned_agent_id?: string;
  priority?: 'low' | 'normal' | 'high' | 'urgent';
  unread_count?: number;
  last_message_text?: string;
  last_message_at: string;
  last_customer_message_at?: string;
  last_activity_at?: string;
  created_at: string;
  sla_due_at?: string;
  sla_status?: 'none' | 'pending' | 'met' | 'breached';
  first_response_time_seconds?: number;
  ai_summary?: string;
  detected_intent?: string;
  detected_sentiment?: string;
  ai_suggested_replies?: string[];
  customer?: Customer;
  metadata_?: Record<string, any>;
  metadata?: Record<string, any>;
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  page_size: number;
  has_next?: boolean;
  next_cursor?: string;
}

export type FilterTab = 'all' | 'unread' | 'completed' | 'tagged' | 'sla_breached';

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
  type:
    | 'NEW_MESSAGE'
    | 'MESSAGE_STATUS'
    | 'TYPING_INDICATOR'
    | 'PONG'
    | 'customer_typing'
    | 'new_message'
    | 'MESSAGE_UPDATED'
    | 'MESSAGE_DELETED'
    | 'MESSAGE_REACTION_UPDATED'
    | 'MESSAGE_PIN_UPDATED'
    | 'message_updated'
    | 'message_deleted'
    | 'message_reaction_updated'
    | 'message_pin_updated';
  conversation_id?: string;
  customer_id?: string;
  message?: Message;
  status?: MessageDeliveryStatus;
  is_typing?: boolean;
  sender_psid?: string;
}

export interface SocialComment {
  id: string;
  post_id: string;
  post_title?: string | null;
  post_url?: string | null;
  post_thumbnail?: string | null;
  comment_id: string;
  author_name: string;
  author_id: string;
  text: string;
  channel: string;
  brand?: string | null;
  sentiment: string;
  is_hidden: boolean;
  is_deleted: boolean;
  auto_replied: boolean;
  reply_text?: string | null;
  dm_thread_id?: string | null;
  created_at: string;
}

export interface CommentAutomationRule {
  id: string;
  name: string;
  channel: string;
  trigger_keywords: string[];
  public_reply_text?: string | null;
  private_dm_text?: string | null;
  is_active: boolean;
  auto_hide_toxic?: boolean;
}

