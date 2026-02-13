export interface MemoryTunnel {
    id: string;
    label: string;
    agentDids: string[];
    compressionRate: number;
    activePointers: number;
    status: 'active' | 'paused' | 'closed';
    createdAt: string;
}
interface TunnelStore {
    tunnels: MemoryTunnel[];
    setTunnels: (tunnels: MemoryTunnel[]) => void;
    addTunnel: (tunnel: MemoryTunnel) => void;
}
export declare const useTunnelStore: import("zustand").UseBoundStore<import("zustand").StoreApi<TunnelStore>>;
export {};
//# sourceMappingURL=tunnel-store.d.ts.map