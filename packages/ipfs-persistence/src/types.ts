export interface IPFSConfig {
  gatewayUrl: string;
  apiUrl?: string;
  web3StorageToken?: string;
  pinningServices?: string[];
}

export interface StorageReceipt {
  cid: string;
  sizeBytes: number;
  storedAt: string; // RFC3339
  pinned: boolean;
  gateway: string;
}

export type PinStatusType = 'queued' | 'pinning' | 'pinned' | 'failed';

export interface PinStatus {
  cid: string;
  name: string;
  status: PinStatusType;
  createdAt: string; // RFC3339
  error?: string;
}
