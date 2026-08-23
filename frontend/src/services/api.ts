import { Conversation, Customer, Message, PaginatedResponse } from '../types/crm';

const API_BASE = import.meta.env.VITE_API_URL
  ? `${import.meta.env.VITE_API_URL}/api/v1`
  : '/api/v1';
const FALLBACK_API_BASE = import.meta.env.VITE_API_URL
  ? `${import.meta.env.VITE_API_URL}/api/v1`
  : 'http://localhost:8000/api/v1';


export const getAuthHeaders = (customHeaders: Record<string, string> = {}): Record<string, string> => {
  const token = typeof window !== 'undefined' ? localStorage.getItem('auth_token') : null;
  const headers: Record<string, string> = { ...customHeaders };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  return headers;
};

export const getConversationsDirect = async (brand_id?: string, channel?: string, country?: string): Promise<any> => {
  const params = new URLSearchParams();
  if (brand_id && brand_id.toLowerCase() !== 'all' && brand_id !== 'الكل') {
    params.set('brand', brand_id);
  }
  if (channel && channel.toLowerCase() !== 'all') {
    params.set('channel', channel);
  }
  if (country && country.toLowerCase() !== 'all') {
    params.set('country', country);
  }
  const query = params.toString() ? `?${params.toString()}` : '';

  const urls = [
    `${API_BASE}/conversations${query}`,
    `${FALLBACK_API_BASE}/conversations${query}`,
    `http://127.0.0.1:8000/api/v1/conversations${query}`
  ];

  const headers = getAuthHeaders({ 'Accept': 'application/json' });

  for (const url of urls) {
    try {
      const res = await fetch(url, {
        method: 'GET',
        headers,
      });
      if (res.ok) {
        const data = await res.json();
        console.log(`[API] Successfully fetched conversations from ${url}:`, data);
        return data;
      }
    } catch (e) {
      console.warn(`[API] Failed to fetch conversations from ${url}, trying next...`, e);
    }
  }
  throw new Error('All conversation API endpoints failed');
};

export const getMessagesDirect = async (conversationId: string): Promise<any> => {
  const urls = [
    `${API_BASE}/conversations/${conversationId}/messages?page_size=200&order=asc`,
    `${FALLBACK_API_BASE}/conversations/${conversationId}/messages?page_size=200&order=asc`,
    `http://127.0.0.1:8000/api/v1/conversations/${conversationId}/messages?page_size=200&order=asc`
  ];

  const headers = getAuthHeaders({ 'Accept': 'application/json' });

  for (const url of urls) {
    try {
      const res = await fetch(url, {
        method: 'GET',
        headers,
      });
      if (res.ok) {
        return await res.json();
      }
    } catch (e) {
      // try next
    }
  }
  return { items: [], total: 0 };
};

async function safeFetch(path: string, init?: RequestInit): Promise<Response> {
  const headers = getAuthHeaders((init?.headers as Record<string, string>) || {});
  const reqInit = { ...init, headers };

  try {
    const res = await fetch(`${API_BASE}${path}`, reqInit);
    if (res.ok) return res;
    console.warn(`Primary fetch ${API_BASE}${path} returned HTTP ${res.status}, trying fallback...`);
  } catch (err) {
    console.warn(`Primary fetch ${API_BASE}${path} failed, trying fallback:`, err);
  }
  return await fetch(`${FALLBACK_API_BASE}${path}`, reqInit);
}

export const getUnreadSummaryDirect = async (): Promise<any> => {
  try {
    const res = await safeFetch('/conversations/unread-summary', {
      method: 'GET',
      headers: getAuthHeaders({ 'Accept': 'application/json' })
    });
    if (res && res.ok) {
      return await res.json();
    }
  } catch (e) {
    console.warn('[API] getUnreadSummaryDirect error:', e);
  }
  return { total_unread: 0, channels: { all: 0, messenger: 0, instagram: 0, whatsapp: 0 }, brands: {} };
};

export const markConversationReadDirect = async (conversationId: string): Promise<boolean> => {
  try {
    const res = await safeFetch(`/conversations/${conversationId}/read`, {
      method: 'POST',
      headers: getAuthHeaders({ 'Content-Type': 'application/json' })
    });
    return res ? res.ok : false;
  } catch (e) {
    return false;
  }
};

export const MOCK_BRANDS = [
  { id: 'all', name: 'كل الماركات', avatar: 'ALL', color: 'from-slate-700 to-slate-800', page_id: '' },
  { id: 'LAVVA', name: 'LAVVA', avatar: 'LV', color: 'from-teal-600 to-teal-700', page_id: '1302055352987458' },
  { id: 'LUXIRA', name: 'LUXIRA', avatar: 'LX', color: 'from-[#1A73E8] to-blue-600', page_id: '1302055352987459' },
  { id: 'MOON LIGHT', name: 'MOON LIGHT', avatar: 'ML', color: 'from-indigo-600 to-indigo-700', page_id: '100099887766554' },
  { id: 'LOTUS BLUE', name: 'LOTUS BLUE', avatar: 'LB', color: 'from-cyan-600 to-cyan-700', page_id: '100099887766555' },
  { id: 'BEAUTY CENTER', name: 'BEAUTY CENTER', avatar: 'BC', color: 'from-rose-600 to-rose-700', page_id: '100099887766556' },
  { id: 'LOXX KING', name: 'LOXX KING', avatar: 'LK', color: 'from-amber-600 to-amber-700', page_id: '100099887766557' },
  { id: 'FLARE', name: 'FLARE', avatar: 'FL', color: 'from-orange-600 to-orange-700', page_id: '100099887766558' },
];

export const apiService = {
  async getConversations(params?: {
    page?: number;
    page_size?: number;
    search?: string;
    status?: string;
    brand_id?: string;
  }): Promise<PaginatedResponse<Conversation>> {
    try {
      const data = await getConversationsDirect(params?.brand_id);
      let items: Conversation[] = [];
      if (Array.isArray(data)) {
        items = data;
      } else if (data && Array.isArray(data.items)) {
        items = data.items;
      } else if (data && Array.isArray(data.conversations)) {
        items = data.conversations;
      } else if (data && Array.isArray(data.data)) {
        items = data.data;
      }
      return { items, total: items.length, page: 1, page_size: items.length || 20 };
    } catch (e) {
      console.warn('API getConversations failed:', e);
    }

    return { items: [], total: 0, page: 1, page_size: 20 };
  },

  async getMessages(conversationId: string, cursor?: string, limit = 200): Promise<PaginatedResponse<Message>> {
    try {
      const data = await getMessagesDirect(conversationId);
      let items: Message[] = [];
      if (Array.isArray(data)) {
        items = data;
      } else if (data && Array.isArray(data.items)) {
        items = data.items;
      } else if (data && Array.isArray(data.messages)) {
        items = data.messages;
      } else if (data && Array.isArray(data.data)) {
        items = data.data;
      }
      return { items, total: items.length, page: 1, page_size: limit };
    } catch (e) {
      console.warn('API getMessages failed:', e);
    }

    return { items: [], total: 0, page: 1, page_size: limit };
  },

  async sendMessage(
    conversationId: string,
    text: string,
    attachments?: any[],
    meta_tag?: string,
    reply_to_message_id?: string
  ): Promise<Message> {
    const payload = { text, attachments, meta_tag, reply_to_message_id };
    const res = await safeFetch(`/conversations/${conversationId}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!res || !res.ok) {
      const err = await res?.json().catch(() => ({ detail: 'Failed to send message' }));
      throw new Error(err?.detail || 'Meta Send API Error');
    }

    return await res.json();
  },

  async uploadMedia(file: File): Promise<{ url: string; media_type: string; filename: string; size: number }> {
    const formData = new FormData();
    formData.append('file', file);

    const res = await safeFetch(`/media/upload`, {
      method: 'POST',
      body: formData,
    });

    if (!res || !res.ok) {
      throw new Error('Media upload failed');
    }

    return await res.json();
  },

  async updateCustomerTags(customerId: string, tags: string[]): Promise<boolean> {
    try {
      const res = await safeFetch(`/customers/${customerId}/tags`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tags }),
      });
      return res ? res.ok : false;
    } catch (e) {
      return true;
    }
  },

  async updateConversationStatus(conversationId: string, status: string): Promise<boolean> {
    try {
      const res = await safeFetch(`/conversations/${conversationId}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      return res ? res.ok : false;
    } catch (e) {
      return true;
    }
  },

  async assignAgent(conversationId: string, agentId: string | null): Promise<boolean> {
    try {
      const res = await safeFetch(`/conversations/${conversationId}/assign`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agent_id: agentId }),
      });
      return res ? res.ok : false;
    } catch (e) {
      return true;
    }
  },

  async updatePriority(conversationId: string, priority: string): Promise<boolean> {
    try {
      const res = await safeFetch(`/conversations/${conversationId}/priority`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ priority }),
      });
      return res ? res.ok : false;
    } catch (e) {
      return true;
    }
  },

  async updateBrand(conversationId: string, brand: string): Promise<boolean> {
    try {
      const res = await safeFetch(`/conversations/${conversationId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ brand }),
      });
      return res ? res.ok : false;
    } catch (e) {
      return true;
    }
  },

  async updateCustomerProfile(customerId: string, payload: Partial<Customer>): Promise<Customer | null> {
    try {
      const res = await safeFetch(`/customers/${customerId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (res && res.ok) {
        return await res.json();
      }
    } catch (e) {
      console.warn('[API] Customer update error:', e);
    }
    return null;
  },
};


export interface AutomationRule {
  id: string;
  name: string;
  brand_id?: string | null;
  channels: string[];
  trigger_type: string;
  match_type: string;
  keywords: string[];
  response_text: string;
  response_media_url?: string | null;
  cooldown_minutes: number;
  is_active: boolean;
  created_by?: string | null;
  created_at: string;
}

export interface AutomationExecutionLog {
  id: string;
  rule_id: string;
  conversation_id: string;
  customer_id: string;
  executed_at: string;
  rule_name?: string | null;
}

export const automationApi = {
  async listRules(): Promise<AutomationRule[]> {
    const res = await safeFetch('/admin/automations', {
      method: 'GET',
      headers: getAuthHeaders({ 'Accept': 'application/json' }),
    });
    if (res && res.ok) {
      return await res.json();
    }
    return [];
  },

  async createRule(payload: Partial<AutomationRule>): Promise<AutomationRule> {
    const res = await safeFetch('/admin/automations', {
      method: 'POST',
      headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(payload),
    });
    if (!res || !res.ok) {
      const err = await res?.json().catch(() => ({ detail: 'فشل في إنشاء قاعدة الأتمتة' }));
      throw new Error(err?.detail || 'فشل في إنشاء قاعدة الأتمتة');
    }
    return await res.json();
  },

  async updateRule(id: string, payload: Partial<AutomationRule>): Promise<AutomationRule> {
    const res = await safeFetch(`/admin/automations/${id}`, {
      method: 'PATCH',
      headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(payload),
    });
    if (!res || !res.ok) {
      const err = await res?.json().catch(() => ({ detail: 'فشل في تحديث قاعدة الأتمتة' }));
      throw new Error(err?.detail || 'فشل في تحديث قاعدة الأتمتة');
    }
    return await res.json();
  },

  async deleteRule(id: string): Promise<boolean> {
    const res = await safeFetch(`/admin/automations/${id}`, {
      method: 'DELETE',
      headers: getAuthHeaders(),
    });
    return res ? res.ok : false;
  },

  async listLogs(): Promise<AutomationExecutionLog[]> {
    const res = await safeFetch('/admin/automations/logs', {
      method: 'GET',
      headers: getAuthHeaders({ 'Accept': 'application/json' }),
    });
    if (res && res.ok) {
      return await res.json();
    }
    return [];
  },
};

export interface AnalyticsOverview {
  total_conversations: number;
  unresolved_conversations: number;
  total_inbound_messages: number;
  total_outbound_messages: number;
  automation_resolutions: number;
  automation_resolution_rate: number;
}

export interface ChannelItem {
  channel: string;
  count: number;
  percentage: number;
}

export interface ChannelDistribution {
  total: number;
  channels: ChannelItem[];
}

export interface BrandItem {
  brand: string;
  total_conversations: number;
  active_unread: number;
  total_messages: number;
}

export interface BrandVolume {
  brands: BrandItem[];
}

export interface HourItem {
  hour: number;
  message_count: number;
}

export interface PeakHours {
  hours: HourItem[];
  peak_hour: number;
  peak_count: number;
}

export interface SlaMetrics {
  avg_first_response_minutes: number;
  within_sla_count: number;
  total_evaluated: number;
  sla_compliance_rate: number;
}

export const analyticsApi = {
  async getOverview(brand?: string, days: number = 30): Promise<AnalyticsOverview> {
    const params = new URLSearchParams({ days: days.toString() });
    if (brand && brand !== 'all') params.append('brand', brand);
    const res = await safeFetch(`/admin/analytics/overview?${params.toString()}`, {
      method: 'GET',
      headers: getAuthHeaders({ 'Accept': 'application/json' }),
    });
    if (res && res.ok) return await res.json();
    return {
      total_conversations: 0,
      unresolved_conversations: 0,
      total_inbound_messages: 0,
      total_outbound_messages: 0,
      automation_resolutions: 0,
      automation_resolution_rate: 0,
    };
  },

  async getChannels(brand?: string): Promise<ChannelDistribution> {
    const params = new URLSearchParams();
    if (brand && brand !== 'all') params.append('brand', brand);
    const res = await safeFetch(`/admin/analytics/channels?${params.toString()}`, {
      method: 'GET',
      headers: getAuthHeaders({ 'Accept': 'application/json' }),
    });
    if (res && res.ok) return await res.json();
    return { total: 0, channels: [] };
  },

  async getBrands(): Promise<BrandVolume> {
    const res = await safeFetch('/admin/analytics/brands', {
      method: 'GET',
      headers: getAuthHeaders({ 'Accept': 'application/json' }),
    });
    if (res && res.ok) return await res.json();
    return { brands: [] };
  },

  async getPeakHours(brand?: string, days: number = 30): Promise<PeakHours> {
    const params = new URLSearchParams({ days: days.toString() });
    if (brand && brand !== 'all') params.append('brand', brand);
    const res = await safeFetch(`/admin/analytics/peak-hours?${params.toString()}`, {
      method: 'GET',
      headers: getAuthHeaders({ 'Accept': 'application/json' }),
    });
    if (res && res.ok) return await res.json();
    return { hours: [], peak_hour: 0, peak_count: 0 };
  },

  async getSla(brand?: string): Promise<SlaMetrics> {
    const params = new URLSearchParams();
    if (brand && brand !== 'all') params.append('brand', brand);
    const res = await safeFetch(`/admin/analytics/sla?${params.toString()}`, {
      method: 'GET',
      headers: getAuthHeaders({ 'Accept': 'application/json' }),
    });
    if (res && res.ok) return await res.json();
    return {
      avg_first_response_minutes: 0,
      within_sla_count: 0,
      total_evaluated: 0,
      sla_compliance_rate: 0,
    };
  },
};

export interface AdminCustomerList {
  items: Customer[];
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
}

export interface CustomerStats {
  total_customers: number;
  stages: { stage: string; count: number }[];
  tiers: { tier: string; count: number }[];
}

export const adminCustomerApi = {
  async listCustomers(filters: {
    query?: string;
    brand?: string;
    tier?: string;
    skin_type?: string;
    stage?: string;
    country?: string;
    page?: number;
    page_size?: number;
  }): Promise<AdminCustomerList> {
    const params = new URLSearchParams();
    if (filters.query) params.append('query', filters.query);
    if (filters.brand && filters.brand !== 'all') params.append('brand', filters.brand);
    if (filters.tier && filters.tier !== 'all') params.append('tier', filters.tier);
    if (filters.skin_type && filters.skin_type !== 'all') params.append('skin_type', filters.skin_type);
    if (filters.stage && filters.stage !== 'all') params.append('stage', filters.stage);
    if (filters.country && filters.country !== 'all') params.append('country', filters.country);
    if (filters.page) params.append('page', filters.page.toString());
    if (filters.page_size) params.append('page_size', filters.page_size.toString());

    const res = await safeFetch(`/admin/customers?${params.toString()}`, {
      method: 'GET',
      headers: getAuthHeaders({ 'Accept': 'application/json' }),
    });
    if (res && res.ok) return await res.json();
    return { items: [], total: 0, page: 1, page_size: 50, total_pages: 1 };
  },

  async downloadExportCsv(filters: { brand?: string; stage?: string; tier?: string }): Promise<void> {
    const params = new URLSearchParams();
    if (filters.brand && filters.brand !== 'all') params.append('brand', filters.brand);
    if (filters.stage && filters.stage !== 'all') params.append('stage', filters.stage);
    if (filters.tier && filters.tier !== 'all') params.append('tier', filters.tier);

    const res = await safeFetch(`/admin/customers/export?${params.toString()}`, {
      method: 'GET',
      headers: getAuthHeaders(),
    });

    if (res && res.ok) {
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'luxira_customers_export.csv';
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    }
  },

  async getStats(): Promise<CustomerStats> {
    const res = await safeFetch('/admin/customers/stats', {
      method: 'GET',
      headers: getAuthHeaders({ 'Accept': 'application/json' }),
    });
    if (res && res.ok) return await res.json();
    return { total_customers: 0, stages: [], tiers: [] };
  },
};

export interface CustomerNote {
  id: string;
  customer_id: string;
  author_user_id?: string;
  author_name?: string;
  text: string;
  created_at: string;
}

export interface CustomerTimelineEvent {
  id: string;
  customer_id: string;
  event_type: string;
  channel: string;
  summary: string;
  details?: Record<string, any>;
  created_at: string;
}

export const customerApi = {
  async getLocations(): Promise<string[]> {
    const res = await safeFetch(`/customers/locations`, {
      method: 'GET',
      headers: getAuthHeaders({ 'Accept': 'application/json' }),
    });
    if (res && res.ok) {
      const data = await res.json();
      return data.locations || [];
    }
    return [];
  },

  async updateCustomer(customerId: string, payload: Partial<Customer>): Promise<Customer> {
    const res = await safeFetch(`/customers/${customerId}`, {
      method: 'PATCH',
      headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(payload),
    });
    if (res && res.ok) return await res.json();
    throw new Error('Failed to update customer');
  },

  async getTimeline(customerId: string, page: number = 1): Promise<{ items: any[]; total: number }> {
    const res = await safeFetch(`/customers/${customerId}/timeline?page=${page}`, {
      method: 'GET',
      headers: getAuthHeaders({ 'Accept': 'application/json' }),
    });
    if (res && res.ok) return await res.json();
    return { items: [], total: 0 };
  },

  async getNotes(customerId: string): Promise<CustomerNote[]> {
    const res = await safeFetch(`/customers/${customerId}/notes`, {
      method: 'GET',
      headers: getAuthHeaders({ 'Accept': 'application/json' }),
    });
    if (res && res.ok) return await res.json();
    return [];
  },

  async addNote(customerId: string, text: string): Promise<any> {
    const res = await safeFetch(`/customers/${customerId}/notes`, {
      method: 'POST',
      headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ text }),
    });
    if (res && res.ok) return await res.json();
    throw new Error('Failed to add note');
  },

  async deleteNote(customerId: string, noteId: string): Promise<boolean> {
    const res = await safeFetch(`/customers/${customerId}/notes/${noteId}`, {
      method: 'DELETE',
      headers: getAuthHeaders(),
    });
    return res !== null && res.ok;
  },

  async blockCustomer(customerId: string, reason?: string): Promise<Customer> {
    const res = await safeFetch(`/customers/${customerId}/block`, {
      method: 'POST',
      headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ reason }),
    });
    if (!res || !res.ok) {
      const err = await res?.json().catch(() => ({ detail: 'فشل حظر العميل' }));
      throw new Error(err?.detail || 'فشل حظر العميل (يتطلب صلاحيات المشرف)');
    }
    return await res.json();
  },

  async unblockCustomer(customerId: string): Promise<Customer> {
    const res = await safeFetch(`/customers/${customerId}/unblock`, {
      method: 'POST',
      headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({}),
    });
    if (!res || !res.ok) {
      const err = await res?.json().catch(() => ({ detail: 'فشل إلغاء حظر العميل' }));
      throw new Error(err?.detail || 'فشل إلغاء حظر العميل (يتطلب صلاحيات المشرف)');
    }
    return await res.json();
  },
};

export interface TeamMember {
  id: string;
  email: string;
  full_name: string;
  role: 'admin' | 'supervisor' | 'agent' | string;
  brand_access: string[];
  channel_access?: string[];
  is_active: boolean;
  created_at: string;
  last_login_at?: string | null;
  last_active_at?: string | null;
  active_conversations_count: number;
}

export interface AuditLog {
  id: string;
  user_id?: string | null;
  action: string;
  resource_type: string;
  resource_id?: string | null;
  payload?: any;
  ip_address?: string | null;
  created_at: string;
  user_name?: string | null;
  user_email?: string | null;
}

export interface AuditLogListResponse {
  items: AuditLog[];
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
}

export const teamApi = {
  async listSupportedChannels(): Promise<string[]> {
    const res = await safeFetch('/admin/team/channels', {
      method: 'GET',
      headers: getAuthHeaders({ 'Accept': 'application/json' }),
    });
    if (res && res.ok) return await res.json();
    return ['messenger', 'instagram', 'whatsapp', 'tiktok'];
  },

  async listMembers(): Promise<TeamMember[]> {
    const res = await safeFetch('/admin/team/members', {
      method: 'GET',
      headers: getAuthHeaders({ 'Accept': 'application/json' }),
    });
    if (res && res.ok) return await res.json();
    return [];
  },

  async createMember(payload: {
    email: string;
    password?: string;
    full_name: string;
    role: string;
    brand_access: string[];
    channel_access?: string[];
    is_active?: boolean;
  }): Promise<TeamMember> {
    const res = await safeFetch('/admin/team/members', {
      method: 'POST',
      headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(payload),
    });
    if (!res || !res.ok) {
      const err = await res?.json().catch(() => ({ detail: 'فشل إضافة العضو' }));
      throw new Error(err?.detail || 'فشل إضافة العضو');
    }
    return await res.json();
  },

  async updateMember(
    id: string,
    payload: {
      full_name?: string;
      role?: string;
      brand_access?: string[];
      channel_access?: string[];
      is_active?: boolean;
      password?: string;
    }
  ): Promise<TeamMember> {
    const res = await safeFetch(`/admin/team/members/${id}`, {
      method: 'PATCH',
      headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(payload),
    });
    if (!res || !res.ok) {
      const err = await res?.json().catch(() => ({ detail: 'فشل تحديث بيانات العضو' }));
      throw new Error(err?.detail || 'فشل تحديث بيانات العضو');
    }
    return await res.json();
  },

  async deleteMember(id: string): Promise<boolean> {
    const res = await safeFetch(`/admin/team/members/${id}`, {
      method: 'DELETE',
      headers: getAuthHeaders(),
    });
    return res ? res.ok : false;
  },

  async listAuditLogs(filters?: {
    action?: string;
    user_id?: string;
    resource_type?: string;
    search?: string;
    page?: number;
    page_size?: number;
  }): Promise<AuditLogListResponse> {
    const params = new URLSearchParams();
    if (filters?.action && filters.action !== 'all') params.append('action', filters.action);
    if (filters?.user_id) params.append('user_id', filters.user_id);
    if (filters?.resource_type) params.append('resource_type', filters.resource_type);
    if (filters?.search && filters.search.trim()) params.append('search', filters.search.trim());
    if (filters?.page) params.append('page', filters.page.toString());
    if (filters?.page_size) params.append('page_size', filters.page_size.toString());

    const res = await safeFetch(`/admin/team/audit-logs?${params.toString()}`, {
      method: 'GET',
      headers: getAuthHeaders({ 'Accept': 'application/json' }),
    });
    if (res && res.ok) return await res.json();
    return { items: [], total: 0, page: 1, page_size: 50, total_pages: 1 };
  },
};

export interface AIAnalysisResult {
  conversation_id: string;
  ai_summary?: string;
  detected_intent?: string;
  detected_sentiment?: string;
  ai_suggested_replies: string[];
  updated_priority?: string;
}

export const aiApi = {
  async analyzeConversation(conversationId: string): Promise<AIAnalysisResult> {
    const res = await safeFetch(`/conversations/${conversationId}/ai-analyze`, {
      method: 'POST',
      headers: getAuthHeaders({ 'Accept': 'application/json' }),
    });
    if (res && res.ok) return await res.json();
    throw new Error('Failed to analyze conversation');
  },

  async getInsights(conversationId: string): Promise<AIAnalysisResult> {
    const res = await safeFetch(`/conversations/${conversationId}/ai-insights`, {
      method: 'GET',
      headers: getAuthHeaders({ 'Accept': 'application/json' }),
    });
    if (res && res.ok) return await res.json();
    return {
      conversation_id: conversationId,
      ai_suggested_replies: [],
    };
  },
};

export const metaApi = {
  async getIntegrationsStatus() {
    const res = await safeFetch('/meta/integrations/status', {
      method: 'GET',
      headers: getAuthHeaders({ 'Accept': 'application/json' }),
    });
    if (res && res.ok) return await res.json();
    return null;
  },

  async sendTestPing(channel: string) {
    const res = await safeFetch('/meta/test-ping', {
      method: 'POST',
      headers: getAuthHeaders({ 'Content-Type': 'application/json', 'Accept': 'application/json' }),
      body: JSON.stringify({ channel }),
    });
    if (res && res.ok) return await res.json();
    throw new Error('Test ping failed');
  },

  async publishPost(message: string, link?: string): Promise<{ post_id?: string }> {
    const res = await safeFetch('/meta/posts', {
      method: 'POST',
      headers: getAuthHeaders({ 'Content-Type': 'application/json', 'Accept': 'application/json' }),
      body: JSON.stringify({ message, link }),
    });
    if (!res || !res.ok) {
      let detail = 'Failed to publish post';
      if (res) {
        try {
          const err = await res.json();
          detail = err.detail || detail;
        } catch { /* keep default detail */ }
      }
      throw new Error(detail);
    }
    return await res.json();
  },
};

export interface SocialComment {
  id: string;
  post_id: string;
  post_title?: string;
  post_url?: string;
  post_thumbnail?: string;
  comment_id: string;
  author_name: string;
  author_id: string;
  text: string;
  channel: string;
  brand?: string;
  sentiment: string;
  is_hidden: boolean;
  is_deleted: boolean;
  auto_replied: boolean;
  reply_text?: string;
  dm_thread_id?: string;
  created_at: string;
}

export const commentsApi = {
  getComments: async (brand?: string, channel?: string, sentiment?: string, status?: string): Promise<SocialComment[]> => {
    const params = new URLSearchParams();
    if (brand && brand !== 'all') params.set('brand', brand);
    if (channel && channel !== 'all') params.set('channel', channel);
    if (sentiment && sentiment !== 'all') params.set('sentiment', sentiment);
    if (status) params.set('status', status);
    const res = await fetch(`/api/v1/comments?${params.toString()}`, {
      headers: getAuthHeaders({ Accept: 'application/json' }),
    });
    if (!res.ok) return [];
    return res.json();
  },

  replyToComment: async (id: string, message: string, privateDm: boolean = false): Promise<SocialComment> => {
    const res = await fetch(`/api/v1/comments/${id}/reply`, {
      method: 'POST',
      headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ message, private_dm: privateDm }),
    });
    if (!res.ok) throw new Error('Failed to reply to comment');
    return res.json();
  },

  toggleHide: async (id: string, isHidden: boolean): Promise<SocialComment> => {
    const res = await fetch(`/api/v1/comments/${id}/hide`, {
      method: 'PATCH',
      headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ is_hidden: isHidden }),
    });
    if (!res.ok) throw new Error('Failed to toggle hide on comment');
    return res.json();
  },

  deleteComment: async (id: string): Promise<void> => {
    const res = await fetch(`/api/v1/comments/${id}`, {
      method: 'DELETE',
      headers: getAuthHeaders(),
    });
    if (!res.ok) throw new Error('Failed to delete comment');
  },

  syncComments: async (): Promise<any> => {
    const res = await fetch(`/api/v1/comments/sync`, {
      method: 'POST',
      headers: getAuthHeaders({ Accept: 'application/json' }),
    });
    if (!res.ok) return { status: 'error' };
    return res.json();
  },

  getCommentAutomations: async (): Promise<any[]> => {
    const res = await fetch('/api/v1/comments/automations', {
      headers: getAuthHeaders({ Accept: 'application/json' }),
    });
    if (!res.ok) return [];
    return res.json();
  },
};

export const messageActionsApi = {
  async editMessage(conversationId: string, messageId: string, text: string): Promise<Message> {
    const res = await safeFetch(`/conversations/${conversationId}/messages/${messageId}`, {
      method: 'PATCH',
      headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ text }),
    });
    if (!res || !res.ok) {
      const err = await res?.json().catch(() => ({ detail: 'فشل تعديل الرسالة' }));
      throw new Error(err?.detail || 'فشل تعديل الرسالة');
    }
    return await res.json();
  },

  async deleteMessage(conversationId: string, messageId: string): Promise<Message> {
    const res = await safeFetch(`/conversations/${conversationId}/messages/${messageId}`, {
      method: 'DELETE',
      headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
    });
    if (!res || !res.ok) {
      const err = await res?.json().catch(() => ({ detail: 'فشل حذف الرسالة' }));
      throw new Error(err?.detail || 'فشل حذف الرسالة');
    }
    return await res.json();
  },

  async toggleReaction(conversationId: string, messageId: string, emoji: string): Promise<Message> {
    const res = await safeFetch(`/conversations/${conversationId}/messages/${messageId}/reactions`, {
      method: 'POST',
      headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ emoji }),
    });
    if (!res || !res.ok) {
      const err = await res?.json().catch(() => ({ detail: 'فشل إضافة التفاعل' }));
      throw new Error(err?.detail || 'فشل إضافة التفاعل');
    }
    return await res.json();
  },

  async togglePin(conversationId: string, messageId: string): Promise<Message> {
    const res = await safeFetch(`/conversations/${conversationId}/messages/${messageId}/pin`, {
      method: 'POST',
      headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
    });
    if (!res || !res.ok) {
      const err = await res?.json().catch(() => ({ detail: 'فشل تثبيت/إلغاء تثبيت الرسالة' }));
      throw new Error(err?.detail || 'فشل تثبيت/إلغاء تثبيت الرسالة');
    }
    return await res.json();
  },

  async forwardMessage(conversationId: string, messageId: string, targetConversationId: string): Promise<Message> {
    const res = await safeFetch(`/conversations/${conversationId}/messages/${messageId}/forward`, {
      method: 'POST',
      headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ target_conversation_id: targetConversationId }),
    });
    if (!res || !res.ok) {
      const err = await res?.json().catch(() => ({ detail: 'فشل إعادة توجيه الرسالة' }));
      throw new Error(err?.detail || 'فشل إعادة توجيه الرسالة');
    }
    return await res.json();
  },
};

export interface SocialCommentItem {
  id: string;
  brand: string;
  platform: 'facebook' | 'instagram';
  post_id: string;
  post_title: string;
  post_thumbnail?: string;
  author_name: string;
  author_avatar?: string;
  comment_text: string;
  sentiment: 'positive' | 'neutral_inquiry' | 'negative' | 'spam';
  sentiment_score: number;
  moderation_status: 'active' | 'auto_deleted' | 'auto_hidden' | 'replied' | 'flagged';
  ai_action_reason?: string;
  auto_replied_text?: string;
  likes_count: number;
  replies_count: number;
  is_direct_message_sent: boolean;
  created_at: string;
}

export interface CommentStats {
  total_comments: number;
  auto_deleted_or_hidden: number;
  auto_replied_dms: number;
  positive_rate: number;
  active_auto_delete_enabled: boolean;
}

export interface ModerationSettings {
  auto_delete_negative: boolean;
  auto_hide_spam: boolean;
  auto_reply_inquiries: boolean;
  strictness_level: 'strict' | 'balanced' | 'relaxed';
  action_for_negative: 'delete' | 'hide' | 'delete_and_dm';
  negative_keywords: string[];
  inquiry_keywords: string[];
  inquiry_reply_text: string;
  inquiry_dm_text: string;
  negative_dm_apology_text: string;
}

export interface ModerationLog {
  id: string;
  comment_id?: string;
  comment_author: string;
  action_type: string;
  performed_by: string;
  details?: Record<string, any>;
  created_at: string;
}

export const socialCommentsApi = {
  async getComments(params?: {
    brand?: string;
    platform?: string;
    sentiment?: string;
    status?: string;
    search?: string;
    page?: number;
    page_size?: number;
  }): Promise<{ items: SocialCommentItem[]; total: number; total_pages: number }> {
    const q = new URLSearchParams();
    if (params?.brand && params.brand !== 'all' && params.brand !== 'الكل') q.append('brand', params.brand);
    if (params?.platform && params.platform !== 'all') q.append('platform', params.platform);
    if (params?.sentiment && params.sentiment !== 'all') q.append('sentiment', params.sentiment);
    if (params?.status && params.status !== 'all') q.append('status', params.status);
    if (params?.search) q.append('search', params.search);
    if (params?.page) q.append('page', params.page.toString());
    if (params?.page_size) q.append('page_size', params.page_size.toString());

    const res = await safeFetch(`/comments?${q.toString()}`, {
      method: 'GET',
      headers: getAuthHeaders({ Accept: 'application/json' }),
    });
    if (res && res.ok) return await res.json();
    return { items: [], total: 0, total_pages: 1 };
  },

  async getStats(): Promise<CommentStats> {
    const res = await safeFetch('/comments/stats', {
      method: 'GET',
      headers: getAuthHeaders({ Accept: 'application/json' }),
    });
    if (res && res.ok) return await res.json();
    return {
      total_comments: 0,
      auto_deleted_or_hidden: 0,
      auto_replied_dms: 0,
      positive_rate: 50,
      active_auto_delete_enabled: true,
    };
  },

  async updateCommentStatus(commentId: string, status: string, reason?: string): Promise<SocialCommentItem> {
    const res = await safeFetch(`/comments/${commentId}/status`, {
      method: 'POST',
      headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ status, reason }),
    });
    if (res && res.ok) return await res.json();
    throw new Error('Failed to update comment status');
  },

  async replyToComment(commentId: string, replyText: string, sendDm: boolean = false, dmText?: string): Promise<SocialCommentItem> {
    const res = await safeFetch(`/comments/${commentId}/reply`, {
      method: 'POST',
      headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ reply_text: replyText, send_dm: sendDm, dm_text: dmText }),
    });
    if (res && res.ok) return await res.json();
    throw new Error('Failed to post reply to comment');
  },

  async getSettings(brand: string = 'all'): Promise<ModerationSettings> {
    const res = await safeFetch(`/comments/settings?brand=${brand}`, {
      method: 'GET',
      headers: getAuthHeaders({ Accept: 'application/json' }),
    });
    if (res && res.ok) return await res.json();
    throw new Error('Failed to fetch settings');
  },

  async updateSettings(settings: ModerationSettings, brand: string = 'all'): Promise<ModerationSettings> {
    const res = await safeFetch(`/comments/settings?brand=${brand}`, {
      method: 'PUT',
      headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(settings),
    });
    if (res && res.ok) return await res.json();
    throw new Error('Failed to update settings');
  },

  async getLogs(): Promise<ModerationLog[]> {
    const res = await safeFetch('/comments/logs', {
      method: 'GET',
      headers: getAuthHeaders({ Accept: 'application/json' }),
    });
    if (res && res.ok) return await res.json();
    return [];
  },

  async simulateAi(commentText: string, brand: string = 'all'): Promise<any> {
    const res = await safeFetch('/comments/simulate-ai', {
      method: 'POST',
      headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ comment_text: commentText, brand }),
    });
    if (res && res.ok) return await res.json();
    throw new Error('Failed to simulate AI check');
  },
};




