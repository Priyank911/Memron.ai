/**
 * Pointer — short identifier that references a full memory record.
 * Used by the Memory Tunnel to achieve 89-95% token compression.
 * Instead of passing raw conversation data, agents exchange pointers.
 */
export interface Pointer {
  /** Short unique identifier (8-12 chars) */
  id: string;
  /** Storage ID of the underlying memory record */
  targetStorageId: string;
  /** DID of the pointer creator */
  creatorDid: string;
  /** Token count of the original content this pointer replaces */
  originalTokens: number;
  /** Token count of the pointer representation */
  pointerTokens: number;
  /** Compression ratio: 1 - (pointerTokens / originalTokens) */
  compressionRate: number;
  /** RFC3339 creation timestamp */
  createdAt: string;
  /** RFC3339 expiration (pointer can become stale) */
  expiresAt?: string;
  /** Bucket hint for fast resolution */
  bucket: string;
}

export interface PointerResolution {
  pointer: Pointer;
  resolved: boolean;
  contextSlice?: string;
  resolvedAt?: string; // RFC3339
  error?: string;
}

export interface CompressionStats {
  totalOriginalTokens: number;
  totalCompressedTokens: number;
  overallRate: number;
  pointerCount: number;
}
