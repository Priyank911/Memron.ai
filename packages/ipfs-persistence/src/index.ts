// ═══════════════════════════════════════════════════════════════════
// @memron/ipfs-persistence — Immutable conversation state anchoring via IPFS
// Every memory record is pinned as a CID for permanent, verifiable storage.
// ═══════════════════════════════════════════════════════════════════

export { IPFSPersistenceService } from './persistence-service';
export { CIDResolver } from './cid-resolver';
export { PinningManager } from './pinning-manager';
export type { IPFSConfig, PinStatus, StorageReceipt } from './types';
