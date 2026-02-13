export interface DropNotification {
    id: string;
    fromDid: string;
    memoryCid: string;
    bucket: string;
    timestamp: string;
    status: 'pending' | 'accepted' | 'rejected';
}
interface DropStore {
    drops: DropNotification[];
    pendingCount: number;
    addDrop: (drop: DropNotification) => void;
    acceptDrop: (id: string) => void;
    rejectDrop: (id: string) => void;
}
export declare const useDropStore: import("zustand").UseBoundStore<import("zustand").StoreApi<DropStore>>;
export {};
//# sourceMappingURL=drop-store.d.ts.map