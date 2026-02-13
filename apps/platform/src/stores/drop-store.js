import { create } from 'zustand';
export const useDropStore = create((set, get) => ({
    drops: [],
    pendingCount: 0,
    addDrop: (drop) => set((s) => ({
        drops: [drop, ...s.drops],
        pendingCount: s.pendingCount + 1,
    })),
    acceptDrop: (id) => set((s) => ({
        drops: s.drops.map((d) => (d.id === id ? { ...d, status: 'accepted' } : d)),
        pendingCount: Math.max(0, s.pendingCount - 1),
    })),
    rejectDrop: (id) => set((s) => ({
        drops: s.drops.map((d) => (d.id === id ? { ...d, status: 'rejected' } : d)),
        pendingCount: Math.max(0, s.pendingCount - 1),
    })),
}));
//# sourceMappingURL=drop-store.js.map