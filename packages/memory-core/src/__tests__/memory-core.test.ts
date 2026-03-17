import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ContextRotGuard } from '../context-rot-guard.js';
import { AccessManager } from '../access-manager.js';
import { MemoryOrchestrator } from '../orchestrator.js';

// ─────────────────────────────────────────────────────────────
// ContextRotGuard
// ─────────────────────────────────────────────────────────────

describe('ContextRotGuard', () => {
  let guard: ContextRotGuard;

  beforeEach(() => {
    guard = new ContextRotGuard(); // defaults: 7 days, 0.3 threshold
  });

  describe('isRotted()', () => {
    it('returns true when memory is old AND relevance is low', () => {
      const eightDaysAgo = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString();
      expect(guard.isRotted(eightDaysAgo, 0.1)).toBe(true);
    });

    it('returns false when memory is old but relevance is high', () => {
      const eightDaysAgo = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString();
      expect(guard.isRotted(eightDaysAgo, 0.5)).toBe(false);
    });

    it('returns false when memory is fresh even with low relevance', () => {
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
      expect(guard.isRotted(oneHourAgo, 0.1)).toBe(false);
    });

    it('returns false when both age and relevance are within thresholds', () => {
      const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString();
      expect(guard.isRotted(twoDaysAgo, 0.8)).toBe(false);
    });

    it('returns false at exactly the threshold boundary (relevance == 0.3)', () => {
      const eightDaysAgo = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString();
      // relevanceScore < threshold (not <=), so 0.3 should NOT be rotted
      expect(guard.isRotted(eightDaysAgo, 0.3)).toBe(false);
    });

    it('handles future timestamps (not rotted)', () => {
      const futureDate = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
      expect(guard.isRotted(futureDate, 0.0)).toBe(false);
    });
  });

  describe('freshnessScore()', () => {
    it('returns ~1 for very recent memory', () => {
      const justNow = new Date(Date.now() - 1000).toISOString();
      expect(guard.freshnessScore(justNow)).toBeCloseTo(1, 2);
    });

    it('returns 0 for memory older than maxAge', () => {
      const tenDaysAgo = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString();
      expect(guard.freshnessScore(tenDaysAgo)).toBe(0);
    });

    it('returns ~0.5 for memory at half the maxAge', () => {
      const halfAge = new Date(Date.now() - 3.5 * 24 * 60 * 60 * 1000).toISOString();
      expect(guard.freshnessScore(halfAge)).toBeCloseTo(0.5, 1);
    });

    it('clamps to 0 (never negative)', () => {
      const veryOld = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString();
      expect(guard.freshnessScore(veryOld)).toBe(0);
    });

    it('returns > 1 for future timestamps (linear formula)', () => {
      const futureDate = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
      // age is negative → 1 - (negative / maxAge) > 1
      expect(guard.freshnessScore(futureDate)).toBeGreaterThan(1);
    });
  });

  describe('suggestArchival()', () => {
    it('returns CIDs of rotted memories', () => {
      const old = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString();
      const fresh = new Date(Date.now() - 1000).toISOString();

      const memories = [
        { cid: 'cid_rotted', lastAccessedAt: old, relevanceScore: 0.1 },
        { cid: 'cid_fresh', lastAccessedAt: fresh, relevanceScore: 0.9 },
        { cid: 'cid_old_relevant', lastAccessedAt: old, relevanceScore: 0.5 },
      ];

      expect(guard.suggestArchival(memories)).toEqual(['cid_rotted']);
    });

    it('returns empty array when nothing is rotted', () => {
      const recent = new Date(Date.now() - 1000).toISOString();
      const memories = [
        { cid: 'a', lastAccessedAt: recent, relevanceScore: 0.9 },
      ];
      expect(guard.suggestArchival(memories)).toEqual([]);
    });

    it('returns empty for empty input', () => {
      expect(guard.suggestArchival([])).toEqual([]);
    });
  });

  describe('custom thresholds', () => {
    it('uses custom maxAge', () => {
      const shortGuard = new ContextRotGuard(60_000); // 1 minute
      const twoMinAgo = new Date(Date.now() - 120_000).toISOString();
      expect(shortGuard.isRotted(twoMinAgo, 0.1)).toBe(true);
    });

    it('uses custom refreshThreshold', () => {
      const strictGuard = new ContextRotGuard(7 * 24 * 60 * 60 * 1000, 0.9);
      const eightDaysAgo = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString();
      // 0.5 relevance is below 0.9 threshold → rotted
      expect(strictGuard.isRotted(eightDaysAgo, 0.5)).toBe(true);
    });
  });
});

// ─────────────────────────────────────────────────────────────
// AccessManager
// ─────────────────────────────────────────────────────────────

describe('AccessManager', () => {
  let manager: AccessManager;

  beforeEach(() => {
    manager = new AccessManager();
  });

  describe('issueGrant()', () => {
    it('creates a grant with correct fields', () => {
      const grant = manager.issueGrant(
        'did:granter',
        'did:grantee',
        'read',
        { global: true },
        3600_000,
      );

      expect(grant.id).toMatch(/^grant_/);
      expect(grant.granterDid).toBe('did:granter');
      expect(grant.granteeDid).toBe('did:grantee');
      expect(grant.permission).toBe('read');
      expect(grant.scope).toEqual({ global: true });
      expect(grant.revoked).toBe(false);
      expect(new Date(grant.expiresAt).getTime()).toBeGreaterThan(Date.now());
    });

    it('sets expiry based on durationMs', () => {
      const before = Date.now();
      const grant = manager.issueGrant('a', 'b', 'write', { global: true }, 5000);
      const after = Date.now();

      const expiryMs = new Date(grant.expiresAt).getTime();
      expect(expiryMs).toBeGreaterThanOrEqual(before + 5000);
      expect(expiryMs).toBeLessThanOrEqual(after + 5000);
    });
  });

  describe('checkAccess()', () => {
    it('grants access for valid grant', () => {
      manager.issueGrant('owner', 'reader', 'read', { global: true }, 3600_000);
      expect(manager.checkAccess('reader', 'any-cid', 'read')).toBe(true);
    });

    it('denies access for wrong grantee', () => {
      manager.issueGrant('owner', 'reader', 'read', { global: true }, 3600_000);
      expect(manager.checkAccess('other-did', 'any-cid', 'read')).toBe(false);
    });

    it('denies access for revoked grant', () => {
      const grant = manager.issueGrant('owner', 'reader', 'read', { global: true }, 3600_000);
      manager.revokeGrant(grant.id);
      expect(manager.checkAccess('reader', 'any-cid', 'read')).toBe(false);
    });

    it('denies access for expired grant', async () => {
      // Issue grant with 1ms duration, then wait for it to expire
      manager.issueGrant('owner', 'reader', 'read', { global: true }, 1);
      await new Promise((r) => setTimeout(r, 10));
      expect(manager.checkAccess('reader', 'any-cid', 'read')).toBe(false);
    });

    it('denies access when permission level is insufficient', () => {
      manager.issueGrant('owner', 'reader', 'read', { global: true }, 3600_000);
      expect(manager.checkAccess('reader', 'any-cid', 'write')).toBe(false);
    });

    it('allows higher permission to satisfy lower requirement', () => {
      manager.issueGrant('owner', 'admin', 'admin', { global: true }, 3600_000);
      expect(manager.checkAccess('admin', 'any-cid', 'read')).toBe(true);
      expect(manager.checkAccess('admin', 'any-cid', 'write')).toBe(true);
    });

    it('write permission satisfies read requirement', () => {
      manager.issueGrant('owner', 'writer', 'write', { global: true }, 3600_000);
      expect(manager.checkAccess('writer', 'any-cid', 'read')).toBe(true);
    });

    it('denies access when scope does not cover the CID', () => {
      manager.issueGrant('owner', 'reader', 'read', { storageIds: ['cid-1', 'cid-2'], global: false }, 3600_000);
      expect(manager.checkAccess('reader', 'cid-3', 'read')).toBe(false);
    });

    it('allows access when scope includes the CID', () => {
      manager.issueGrant('owner', 'reader', 'read', { storageIds: ['cid-1', 'cid-2'], global: false }, 3600_000);
      expect(manager.checkAccess('reader', 'cid-1', 'read')).toBe(true);
    });

    it('global scope covers any CID', () => {
      manager.issueGrant('owner', 'reader', 'read', { global: true }, 3600_000);
      expect(manager.checkAccess('reader', 'random-cid-xyz', 'read')).toBe(true);
    });

    it('returns false when no grants exist', () => {
      expect(manager.checkAccess('did:nobody', 'cid', 'read')).toBe(false);
    });
  });

  describe('revokeGrant()', () => {
    it('marks grant as revoked with timestamp', () => {
      const grant = manager.issueGrant('owner', 'reader', 'read', { global: true }, 3600_000);
      expect(grant.revoked).toBe(false);

      manager.revokeGrant(grant.id);
      expect(grant.revoked).toBe(true);
      expect(grant.revokedAt).toBeDefined();
    });

    it('does nothing for unknown grant ID', () => {
      // Should not throw
      manager.revokeGrant('nonexistent-grant-id');
    });
  });
});

// ─────────────────────────────────────────────────────────────
// MemoryOrchestrator (TODO stubs)
// ─────────────────────────────────────────────────────────────

describe('MemoryOrchestrator', () => {
  let orchestrator: MemoryOrchestrator;

  beforeEach(() => {
    orchestrator = new MemoryOrchestrator();
  });

  it('ingest() throws TODO error', async () => {
    await expect(orchestrator.ingest('content', 'did:owner', 'did:agent')).rejects.toThrow('TODO');
  });

  it('recall() throws TODO error', async () => {
    await expect(orchestrator.recall('pointer-id', 'did:requester')).rejects.toThrow('TODO');
  });

  it('drop() throws TODO error', async () => {
    await expect(orchestrator.drop('pointer-id', 'did:from', 'did:to')).rejects.toThrow('TODO');
  });
});
