import { create } from 'zustand';

interface IdentityState {
  did: string | null;
  address: string | null;
  isConnected: boolean;
  setIdentity: (did: string, address: string) => void;
  disconnect: () => void;
}

export const useIdentityStore = create<IdentityState>((set) => ({
  did: null,
  address: null,
  isConnected: false,
  setIdentity: (did, address) => set({ did, address, isConnected: true }),
  disconnect: () => set({ did: null, address: null, isConnected: false }),
}));
