/**
 * Access Control — granular R/W permissions with RFC3339 expiration.
 */
export type AccessPermission = 'read' | 'write' | 'admin';

export interface AccessGrant {
  id: string;
  /** DID of the entity granting access */
  granterDid: string;
  /** DID of the entity receiving access */
  granteeDid: string;
  /** Permission level */
  permission: AccessPermission;
  /** Scope — which memory buckets or CIDs this grant covers */
  scope: AccessScope;
  /** RFC3339 timestamp when the grant was issued */
  issuedAt: string;
  /** RFC3339 timestamp when the grant expires */
  expiresAt: string;
  /** Whether the grant has been revoked before expiration */
  revoked: boolean;
  /** RFC3339 timestamp of revocation, if applicable */
  revokedAt?: string;
}

export interface AccessScope {
  /** If set, grant applies only to these specific CIDs */
  cids?: string[];
  /** If set, grant applies only to these buckets */
  buckets?: string[];
  /** If true, grant covers all memories of the granter */
  global: boolean;
}

export interface AccessPolicy {
  ownerDid: string;
  defaultPermission: AccessPermission;
  grants: AccessGrant[];
  maxGrantDurationMs: number;
}
