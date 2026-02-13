import { create } from 'zustand';

export interface DropNotification {
  id: string;
  fromDid: string;
  memoryCid: string;
  bucket: string;
  timestamp: string; // RFC3339
  status: 'pending' | 'accepted' | 'rejected';
}

interface DropStore {
  drops: DropNotification[];
  pendingCount: number;
  addDrop: (drop: DropNotification) => void;
  acceptDrop: (id: string) => void;
  rejectDrop: (id: string) => void;
}

export const useDropStore = create<DropStore>((set, get) => ({
  drops: [],
  pendingCount: 0,
  addDrop: (drop) =>
    set((s) => ({
      drops: [drop, ...s.drops],
      pendingCount: s.pendingCount + 1,
    })),
  acceptDrop: (id) =>
    set((s) => ({
      drops: s.drops.map((d) => (d.id === id ? { ...d, status: 'accepted' as const } : d)),
      pendingCount: Math.max(0, s.pendingCount - 1),
    })),
  rejectDrop: (id) =>
    set((s) => ({
      drops: s.drops.map((d) => (d.id === id ? { ...d, status: 'rejected' as const } : d)),
      pendingCount: Math.max(0, s.pendingCount - 1),
    })),
}));
