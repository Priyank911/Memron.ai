/** Immutable memory record anchored to IPFS via CID */
export interface MemoryRecord {
  /** Content Identifier — IPFS hash of the immutable conversation state */
  cid: string;
  /** DID of the memory owner */
  ownerDid: string;
  /** DID of the agent that created this memory */
  agentDid: string;
  /** Thematic bucket this memory belongs to */
  bucket: MemoryBucket;
  /** RFC3339 timestamp of creation */
  createdAt: string;
  /** RFC3339 timestamp of last access */
  lastAccessedAt: string;
  /** Size in bytes of the raw context */
  sizeBytes: number;
  /** Token count of the original context */
  tokenCount: number;
  /** Tags for semantic retrieval */
  tags: string[];
  /** Optional forensic snapshot ID for rollback */
  snapshotId?: string;
  /** Encryption metadata */
  encryption: EncryptionMeta;
}

export interface EncryptionMeta {
  /** Lit Protocol Access Control Condition hash */
  accHash: string;
  /** Encryption algorithm used */
  algorithm: 'lit-threshold' | 'aes-256-gcm';
  /** Encrypted symmetric key (base64) */
  encryptedSymmetricKey: string;
}

export type MemoryBucket =
  | 'conversation'
  | 'tool-results'
  | 'preferences'
  | 'knowledge'
  | 'system'
  | 'custom';

export interface MemorySearchResult {
  record: MemoryRecord;
  relevanceScore: number;
  contextSlice: string;
}

/** Forensic snapshot for poisoning rollback */
export interface ForensicSnapshot {
  id: string;
  memoryCid: string;
  ownerDid: string;
  snapshotCid: string;
  reason: 'scheduled' | 'pre-mutation' | 'manual';
  createdAt: string; // RFC3339
  integrityHash: string;
}
