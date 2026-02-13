interface IdentityState {
    did: string | null;
    address: string | null;
    isConnected: boolean;
    setIdentity: (did: string, address: string) => void;
    disconnect: () => void;
}
export declare const useIdentityStore: import("zustand").UseBoundStore<import("zustand").StoreApi<IdentityState>>;
export {};
//# sourceMappingURL=identity-store.d.ts.map