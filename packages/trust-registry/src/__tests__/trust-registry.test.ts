import { describe, it, expect, beforeEach } from 'vitest';
import { TrustScoreCalculator } from '../score-calculator.js';
import { AttestationManager } from '../attestation-manager.js';
import { TrustRegistryClient } from '../registry-client.js';

// ─────────────────────────────────────────────────────────────
// TrustScoreCalculator
// ─────────────────────────────────────────────────────────────

describe('TrustScoreCalculator', () => {
  let calculator: TrustScoreCalculator;

  beforeEach(() => {
    calculator = new TrustScoreCalculator();
  });

  describe('calculate()', () => {
    it('returns 0 for empty attestations', () => {
      expect(calculator.calculate([])).toBe(0);
    });

    it('returns the score for a single recent attestation', () => {
      const result = calculator.calculate([
        { fromDid: 'a', toDid: 'b', score: 800, reason: 'good', timestamp: new Date().toISOString() },
      ]);
      expect(result).toBe(800);
    });

    it('returns weighted average for multiple attestations', () => {
      const now = new Date();
      const result = calculator.calculate([
        { fromDid: 'a', toDid: 'b', score: 1000, reason: 'great', timestamp: now.toISOString() },
        { fromDid: 'c', toDid: 'b', score: 500, reason: 'ok', timestamp: now.toISOString() },
      ]);
      // Same timestamp → equal weight → average = 750
      expect(result).toBe(750);
    });

    it('weighs recent attestations more than old ones', () => {
      const now = new Date();
      const sixtyDaysAgo = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000);

      const result = calculator.calculate([
        { fromDid: 'a', toDid: 'b', score: 1000, reason: 'recent', timestamp: now.toISOString() },
        { fromDid: 'c', toDid: 'b', score: 0, reason: 'old', timestamp: sixtyDaysAgo.toISOString() },
      ]);

      // Recent (score=1000) should dominate, result should be > 500
      expect(result).toBeGreaterThan(500);
    });

    it('handles all very old attestations', () => {
      const yearAgo = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString();
      const result = calculator.calculate([
        { fromDid: 'a', toDid: 'b', score: 500, reason: 'old', timestamp: yearAgo },
        { fromDid: 'c', toDid: 'b', score: 500, reason: 'old', timestamp: yearAgo },
      ]);
      // Both same age, same score → 500
      expect(result).toBe(500);
    });

    it('returns integer (rounds result)', () => {
      const result = calculator.calculate([
        { fromDid: 'a', toDid: 'b', score: 333, reason: 'test', timestamp: new Date().toISOString() },
      ]);
      expect(Number.isInteger(result)).toBe(true);
    });
  });

  describe('detectAnomalies()', () => {
    it('returns empty array for no anomalies', () => {
      const result = calculator.detectAnomalies([
        { fromDid: 'a', toDid: 'b', score: 500, reason: 'ok', timestamp: '2024-01-01T00:00:00Z' },
        { fromDid: 'c', toDid: 'd', score: 600, reason: 'ok', timestamp: '2024-01-01T01:00:00Z' },
      ]);
      expect(result).toEqual([]);
    });

    it('detects self-attestation', () => {
      const result = calculator.detectAnomalies([
        { fromDid: 'agent-1', toDid: 'agent-1', score: 1000, reason: 'self', timestamp: '2024-01-01T00:00:00Z' },
      ]);
      expect(result).toContain('Self-attestation detected');
    });

    it('detects rapid attestation pattern', () => {
      const base = new Date('2024-01-01T00:00:00Z').getTime();
      const result = calculator.detectAnomalies([
        { fromDid: 'a', toDid: 'b', score: 500, reason: 'ok', timestamp: new Date(base).toISOString() },
        { fromDid: 'c', toDid: 'd', score: 600, reason: 'ok', timestamp: new Date(base + 30_000).toISOString() }, // 30s gap
      ]);
      expect(result).toContain('Rapid attestation pattern detected');
    });

    it('does not flag attestations exactly 1 minute apart', () => {
      const base = new Date('2024-01-01T00:00:00Z').getTime();
      const result = calculator.detectAnomalies([
        { fromDid: 'a', toDid: 'b', score: 500, reason: 'ok', timestamp: new Date(base).toISOString() },
        { fromDid: 'c', toDid: 'd', score: 600, reason: 'ok', timestamp: new Date(base + 60_000).toISOString() },
      ]);
      expect(result).not.toContain('Rapid attestation pattern detected');
    });

    it('detects both self-attestation and rapid attestation', () => {
      const base = new Date('2024-01-01T00:00:00Z').getTime();
      const result = calculator.detectAnomalies([
        { fromDid: 'x', toDid: 'x', score: 1000, reason: 'self', timestamp: new Date(base).toISOString() },
        { fromDid: 'a', toDid: 'b', score: 500, reason: 'ok', timestamp: new Date(base + 10_000).toISOString() },
      ]);
      expect(result).toContain('Self-attestation detected');
      expect(result).toContain('Rapid attestation pattern detected');
    });

    it('handles empty array', () => {
      expect(calculator.detectAnomalies([])).toEqual([]);
    });

    it('handles single attestation (no rapid pattern possible)', () => {
      const result = calculator.detectAnomalies([
        { fromDid: 'a', toDid: 'b', score: 500, reason: 'ok', timestamp: '2024-01-01T00:00:00Z' },
      ]);
      expect(result).toEqual([]);
    });
  });
});

// ─────────────────────────────────────────────────────────────
// AttestationManager
// ─────────────────────────────────────────────────────────────

describe('AttestationManager', () => {
  let manager: AttestationManager;

  beforeEach(() => {
    manager = new AttestationManager();
  });

  describe('createAttestation()', () => {
    it('creates a valid attestation', async () => {
      const att = await manager.createAttestation('did:from', 'did:to', 750, 'reliable agent');
      expect(att.fromDid).toBe('did:from');
      expect(att.toDid).toBe('did:to');
      expect(att.score).toBe(750);
      expect(att.reason).toBe('reliable agent');
      expect(att.timestamp).toBeDefined();
    });

    it('rejects score below 0', async () => {
      await expect(manager.createAttestation('a', 'b', -1, 'bad')).rejects.toThrow('between 0 and 1000');
    });

    it('rejects score above 1000', async () => {
      await expect(manager.createAttestation('a', 'b', 1001, 'too high')).rejects.toThrow('between 0 and 1000');
    });

    it('allows score at boundary 0', async () => {
      const att = await manager.createAttestation('a', 'b', 0, 'zero trust');
      expect(att.score).toBe(0);
    });

    it('allows score at boundary 1000', async () => {
      const att = await manager.createAttestation('a', 'b', 1000, 'max trust');
      expect(att.score).toBe(1000);
    });

    it('rejects self-attestation', async () => {
      await expect(manager.createAttestation('did:self', 'did:self', 500, 'self')).rejects.toThrow('Self-attestation');
    });
  });

  describe('validate()', () => {
    it('validates a correct attestation', () => {
      const result = manager.validate({
        fromDid: 'a', toDid: 'b', score: 500, reason: 'ok', timestamp: new Date().toISOString(),
      });
      expect(result.valid).toBe(true);
      expect(result.errors).toEqual([]);
    });

    it('catches missing fromDid', () => {
      const result = manager.validate({
        fromDid: '', toDid: 'b', score: 500, reason: 'ok', timestamp: new Date().toISOString(),
      });
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Missing fromDid');
    });

    it('catches missing toDid', () => {
      const result = manager.validate({
        fromDid: 'a', toDid: '', score: 500, reason: 'ok', timestamp: new Date().toISOString(),
      });
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Missing toDid');
    });

    it('catches invalid score range (negative)', () => {
      const result = manager.validate({
        fromDid: 'a', toDid: 'b', score: -5, reason: 'ok', timestamp: new Date().toISOString(),
      });
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Invalid score range');
    });

    it('catches invalid score range (over 1000)', () => {
      const result = manager.validate({
        fromDid: 'a', toDid: 'b', score: 2000, reason: 'ok', timestamp: new Date().toISOString(),
      });
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Invalid score range');
    });

    it('catches self-attestation', () => {
      const result = manager.validate({
        fromDid: 'same', toDid: 'same', score: 500, reason: 'self', timestamp: new Date().toISOString(),
      });
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Self-attestation');
    });

    it('catches multiple errors at once', () => {
      const result = manager.validate({
        fromDid: '', toDid: '', score: -1, reason: '', timestamp: '',
      });
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThanOrEqual(3);
    });
  });
});

// ─────────────────────────────────────────────────────────────
// TrustRegistryClient (TODO stubs)
// ─────────────────────────────────────────────────────────────

describe('TrustRegistryClient', () => {
  let client: TrustRegistryClient;

  beforeEach(() => {
    client = new TrustRegistryClient('https://registry.example.com');
  });

  it('getScore() returns null (stub)', async () => {
    expect(await client.getScore('did:agent')).toBeNull();
  });

  it('attest() returns empty string (stub)', async () => {
    expect(await client.attest('did:from', 'did:to', 500, 'reason')).toBe('');
  });

  it('getAttestations() returns empty array (stub)', async () => {
    expect(await client.getAttestations('did:agent')).toEqual([]);
  });

  it('getLeaderboard() returns empty array (stub)', async () => {
    expect(await client.getLeaderboard()).toEqual([]);
  });

  it('getLeaderboard() accepts custom limit (stub)', async () => {
    expect(await client.getLeaderboard(10)).toEqual([]);
  });
});
