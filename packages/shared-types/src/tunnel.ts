/**
 * Memory Tunnel — the conduit through which agents exchange pointer-based context.
 */
export type TunnelStatus = 'active' | 'paused' | 'closed' | 'error';

export interface MemoryTunnelConfig {
  id: string;
  label: string;
  /** DIDs of participating agents */
  participants: string[];
  /** Target compression rate (0.89 - 0.95) */
  targetCompressionRate: number;
  /** Max context window tokens for connected agents */
  maxContextTokens: number;
  /** Buckets to include in this tunnel */
  activeBuckets: string[];
  /** Whether to enable forensic snapshots */
  forensicSnapshotsEnabled: boolean;
  /** RFC3339 creation timestamp */
  createdAt: string;
  status: TunnelStatus;
}

export interface TunnelMessage {
  tunnelId: string;
  fromDid: string;
  toDid: string;
  /** Pointer IDs being sent through the tunnel */
  pointerIds: string[];
  /** RFC3339 timestamp */
  timestamp: string;
  /** Message type */
  type: 'sync' | 'drop' | 'ack' | 'revoke';
}
