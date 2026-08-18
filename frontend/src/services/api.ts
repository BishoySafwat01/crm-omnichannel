import { Conversation, Customer, Message, PaginatedResponse } from '../types/crm';

const API_BASE = '/api/v1';
const FALLBACK_API_BASE = 'http://localhost:8000/api/v1';

async function safeFetch(path: string, init?: RequestInit): Promise<Response> {
  try {
    const res = await fetch(`${API_BASE}${path}`, init);
    if (res.ok) return res;
  } catch (err) {
    console.warn(`Primary fetch ${API_BASE}${path} failed, trying fallback:`, err);
  }
  return await fetch(`${FALLBACK_API_BASE}${path}`, init);
}

export const MOCK_BRANDS = [
  { id: 'all', name: 'الكل', avatar: 'ALL', color: 'from-slate-700 to-slate-800', page_id: '' },
  { id: 'lavva', name: 'LAVVA', avatar: 'LV', color: 'from-teal-600 to-teal-700', page_id: '1302055352987458' },
  { id: 'moonlight', name: 'MOON LIGHT', avatar: 'ML', color: 'from-indigo-600 to-indigo-700', page_id: '100099887766554' },
  { id: 'lotusblue', name: 'LOTUS BLUE', avatar: 'LB', color: 'from-cyan-600 to-cyan-700', page_id: '100099887766555' },
  { id: 'beautycenter', name: 'BEAUTY CENTER', avatar: 'BC', color: 'from-rose-600 to-rose-700', page_id: '100099887766556' },
  { id: 'loxxking', name: 'LOXX KING', avatar: 'LK', color: 'from-amber-600 to-amber-700', page_id: '100099887766557' },
  { id: 'flare', name: 'FLARE', avatar: 'FL', color: 'from-orange-600 to-orange-700', page_id: '100099887766558' },
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
      const query = new URLSearchParams();
      if (params?.page) query.append('page', params.page.toString());
      if (params?.page_size) query.append('page_size', params.page_size.toString());
      if (params?.search) query.append('search', params.search);
      if (params?.status) query.append('status', params.status);

      const res = await safeFetch(`/conversations?${query.toString()}`);
      if (res.ok) {
        return await res.json();
      }
    } catch (e) {
      console.warn('API getConversations failed:', e);
    }

    return { items: [], total: 0, page: 1, page_size: 20 };
  },

  async getMessages(conversationId: string, cursor?: string, limit = 200): Promise<PaginatedResponse<Message>> {
    try {
      const query = new URLSearchParams();
      query.append('order', 'asc');
      query.append('page_size', limit.toString());
      if (cursor) query.append('cursor', cursor);

      const res = await safeFetch(`/conversations/${conversationId}/messages?${query.toString()}`);
      if (res.ok) {
        return await res.json();
      }
    } catch (e) {
      console.warn('API getMessages failed:', e);
    }

    return { items: [], total: 0, page: 1, page_size: limit };
  },

  async sendMessage(
    conversationId: string,
    text: string,
    attachments?: any[],
    meta_tag?: string
  ): Promise<Message> {
    const payload = { text, attachments, meta_tag };
    const res = await safeFetch(`/conversations/${conversationId}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: 'Failed to send message' }));
      throw new Error(err.detail || 'Meta Send API Error');
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

    if (!res.ok) {
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
      return res.ok;
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
      return res.ok;
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
      return res.ok;
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
      return res.ok;
    } catch (e) {
      return true;
    }
  },
};
