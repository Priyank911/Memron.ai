// Platform API client
const API_BASE = import.meta.env.VITE_API_URL ?? '/api';

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...init?.headers,
    },
  });
  if (!res.ok) throw new Error(`API ${res.status}: ${await res.text()}`);
  return res.json();
}

export const api = {
  tunnels: {
    list: () => request<any[]>('/v1/tunnels'),
    create: (data: any) => request('/v1/tunnels', { method: 'POST', body: JSON.stringify(data) }),
    get: (id: string) => request(`/v1/tunnels/${id}`),
  },
  drops: {
    list: () => request<any[]>('/v1/drops'),
    accept: (id: string) => request(`/v1/drops/${id}/accept`, { method: 'POST' }),
    reject: (id: string) => request(`/v1/drops/${id}/reject`, { method: 'POST' }),
  },
  access: {
    grants: () => request<any[]>('/v1/access/grants'),
    issue: (data: any) => request('/v1/access/grants', { method: 'POST', body: JSON.stringify(data) }),
    revoke: (id: string) => request(`/v1/access/grants/${id}`, { method: 'DELETE' }),
  },
  trust: {
    scores: () => request<any[]>('/v1/trust/scores'),
    profile: (did: string) => request(`/v1/trust/profile/${encodeURIComponent(did)}`),
  },
  memory: {
    search: (q: string, bucket?: string) => request(`/v1/memory/search?q=${encodeURIComponent(q)}${bucket ? `&bucket=${bucket}` : ''}`),
    get: (cid: string) => request(`/v1/memory/${cid}`),
  },
};
