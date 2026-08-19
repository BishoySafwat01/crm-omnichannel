import { Conversation, Customer, Message, PaginatedResponse } from '../types/crm';

const API_BASE = '/api/v1';
const FALLBACK_API_BASE = 'http://localhost:8000/api/v1';

export const getConversationsDirect = async (brand_id?: string): Promise<any> => {
  const query = (brand_id && brand_id.toLowerCase() !== 'all' && brand_id !== 'الكل')
    ? `?brand=${encodeURIComponent(brand_id)}`
    : '';

  const urls = [
    `${API_BASE}/conversations${query}`,
    `${FALLBACK_API_BASE}/conversations${query}`,
    `http://127.0.0.1:8000/api/v1/conversations${query}`
  ];

  for (const url of urls) {
    try {
      const res = await fetch(url, {
        method: 'GET',
        headers: { 'Accept': 'application/json' }
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

  for (const url of urls) {
    try {
      const res = await fetch(url, {
        method: 'GET',
        headers: { 'Accept': 'application/json' }
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
  try {
    const res = await fetch(`${API_BASE}${path}`, init);
    if (res.ok) return res;
    console.warn(`Primary fetch ${API_BASE}${path} returned HTTP ${res.status}, trying fallback...`);
  } catch (err) {
    console.warn(`Primary fetch ${API_BASE}${path} failed, trying fallback:`, err);
  }
  return await fetch(`${FALLBACK_API_BASE}${path}`, init);
}

export const MOCK_BRANDS = [
  { id: 'all', name: 'الكل', avatar: 'ALL', color: 'from-slate-700 to-slate-800', page_id: '' },
  { id: 'LAVVA', name: 'LAVVA', avatar: 'LV', color: 'from-teal-600 to-teal-700', page_id: '1302055352987458' },
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
    meta_tag?: string
  ): Promise<Message> {
    const payload = { text, attachments, meta_tag };
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
