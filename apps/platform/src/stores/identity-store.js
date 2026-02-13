import { create } from 'zustand';
export const useIdentityStore = create((set) => ({
    did: null,
    address: null,
    isConnected: false,
    setIdentity: (did, address) => set({ did, address, isConnected: true }),
    disconnect: () => set({ did: null, address: null, isConnected: false }),
}));
//# sourceMappingURL=identity-store.js.map