import { create } from 'zustand';
export const useTunnelStore = create((set) => ({
    tunnels: [],
    setTunnels: (tunnels) => set({ tunnels }),
    addTunnel: (tunnel) => set((s) => ({ tunnels: [tunnel, ...s.tunnels] })),
}));
//# sourceMappingURL=tunnel-store.js.map