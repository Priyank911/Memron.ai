/**
 * Trust Registry — collaborative memory scores.
 */
export interface TrustScore {
  /** DID of the scored agent */
  agentDid: string;
  /** Aggregate trust score (0-1000) */
  score: number;
  /** Number of successful memory exchanges */
  successfulExchanges: number;
  /** Number of disputes or rollbacks */
  disputes: number;
  /** Number of unique collaborators */
  collaborators: number;
  /** Verification status */
  verified: boolean;
  /** RFC3339 timestamp of last score update */
  lastUpdated: string;
}

export interface TrustAttestation {
  fromDid: string;
  toDid: string;
  score: number;
  reason: string;
  timestamp: string; // RFC3339
}
