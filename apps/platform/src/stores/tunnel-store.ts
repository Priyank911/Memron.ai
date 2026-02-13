import { create } from 'zustand';

export interface MemoryTunnel {
  id: string;
  label: string;
  agentDids: string[];
  compressionRate: number;
  activePointers: number;
  status: 'active' | 'paused' | 'closed';
  createdAt: string; // RFC3339
}

interface TunnelStore {
  tunnels: MemoryTunnel[];
  setTunnels: (tunnels: MemoryTunnel[]) => void;
  addTunnel: (tunnel: MemoryTunnel) => void;
}

export const useTunnelStore = create<TunnelStore>((set) => ({
  tunnels: [],
  setTunnels: (tunnels) => set({ tunnels }),
  addTunnel: (tunnel) => set((s) => ({ tunnels: [tunnel, ...s.tunnels] })),
}));
