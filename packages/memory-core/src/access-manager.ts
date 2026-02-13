import type { AccessGrant, AccessPermission, AccessScope } from '@memron/shared-types';

/**
 * AccessManager — Enforces granular Read/Write access control
 * with RFC3339 timestamp-based expiration.
 */
export class AccessManager {
  private grants: Map<string, AccessGrant> = new Map();

  /** Issue a new access grant */
  issueGrant(
    granterDid: string,
    granteeDid: string,
    permission: AccessPermission,
    scope: AccessScope,
    durationMs: number,
  ): AccessGrant {
    const now = new Date();
    const grant: AccessGrant = {
      id: `grant_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      granterDid,
      granteeDid,
      permission,
      scope,
      issuedAt: now.toISOString(),
      expiresAt: new Date(now.getTime() + durationMs).toISOString(),
      revoked: false,
    };
    this.grants.set(grant.id, grant);
    return grant;
  }

  /** Check if a DID has a specific permission for a resource */
  checkAccess(
    did: string,
    resourceCid: string,
    requiredPermission: AccessPermission,
  ): boolean {
    for (const grant of this.grants.values()) {
      if (grant.granteeDid !== did) continue;
      if (grant.revoked) continue;
      if (new Date(grant.expiresAt) < new Date()) continue;
      if (!this.permissionSatisfies(grant.permission, requiredPermission)) continue;
      if (!this.scopeCovers(grant.scope, resourceCid)) continue;
      return true;
    }
    return false;
  }

  /** Revoke a grant */
  revokeGrant(grantId: string): void {
    const grant = this.grants.get(grantId);
    if (grant) {
      grant.revoked = true;
      grant.revokedAt = new Date().toISOString();
    }
  }

  private permissionSatisfies(granted: AccessPermission, required: AccessPermission): boolean {
    const levels: Record<AccessPermission, number> = { read: 1, write: 2, admin: 3 };
    return levels[granted] >= levels[required];
  }

  private scopeCovers(scope: AccessScope, cid: string): boolean {
    if (scope.global) return true;
    if (scope.cids?.includes(cid)) return true;
    return false;
  }
}
