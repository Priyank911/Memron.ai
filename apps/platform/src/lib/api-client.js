// Platform API client
const API_BASE = import.meta.env.VITE_API_URL ?? '/api';
async function request(path, init) {
    const res = await fetch(`${API_BASE}${path}`, {
        ...init,
        headers: {
            'Content-Type': 'application/json',
            ...init?.headers,
        },
    });
    if (!res.ok)
        throw new Error(`API ${res.status}: ${await res.text()}`);
    return res.json();
}
export const api = {
    tunnels: {
        list: () => request('/v1/tunnels'),
        create: (data) => request('/v1/tunnels', { method: 'POST', body: JSON.stringify(data) }),
        get: (id) => request(`/v1/tunnels/${id}`),
    },
    drops: {
        list: () => request('/v1/drops'),
        accept: (id) => request(`/v1/drops/${id}/accept`, { method: 'POST' }),
        reject: (id) => request(`/v1/drops/${id}/reject`, { method: 'POST' }),
    },
    access: {
        grants: () => request('/v1/access/grants'),
        issue: (data) => request('/v1/access/grants', { method: 'POST', body: JSON.stringify(data) }),
        revoke: (id) => request(`/v1/access/grants/${id}`, { method: 'DELETE' }),
    },
    trust: {
        scores: () => request('/v1/trust/scores'),
        profile: (did) => request(`/v1/trust/profile/${encodeURIComponent(did)}`),
    },
    memory: {
        search: (q, bucket) => request(`/v1/memory/search?q=${encodeURIComponent(q)}${bucket ? `&bucket=${bucket}` : ''}`),
        get: (cid) => request(`/v1/memory/${cid}`),
    },
};
//# sourceMappingURL=api-client.js.map