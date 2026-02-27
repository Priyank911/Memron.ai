/** Bridge-specific types */
export interface BridgeConfig {
  tunnelId: string;
  serverPort: number;
  maxContextTokens: number;
  targetCompressionRate: number;
  enableForensicSnapshots: boolean;
}

export interface BridgeStatus {
  connected: boolean;
  activeTunnels: number;
  totalPointers: number;
  compressionRate: number;
  uptime: number;
}
