import type { TrustScore, TrustAttestation } from '@memron/shared-types';

/**
 * TrustScoreCalculator — Computes aggregate trust scores from attestations.
 */
export class TrustScoreCalculator {
  /** Calculate aggregate score from attestations */
  calculate(attestations: TrustAttestation[]): number {
    if (attestations.length === 0) return 0;

    // Weighted average — recent attestations weigh more
    const now = Date.now();
    let weightedSum = 0;
    let totalWeight = 0;

    for (const att of attestations) {
      const age = now - new Date(att.timestamp).getTime();
      const weight = 1 / (1 + age / (30 * 24 * 60 * 60 * 1000)); // Decay over 30 days
      weightedSum += att.score * weight;
      totalWeight += weight;
    }

    return Math.round(weightedSum / totalWeight);
  }

  /** Detect anomalous trust patterns (sybil, collusion) */
  detectAnomalies(attestations: TrustAttestation[]): string[] {
    const warnings: string[] = [];

    // Check for self-attestation
    const selfAttestations = attestations.filter((a) => a.fromDid === a.toDid);
    if (selfAttestations.length > 0) {
      warnings.push('Self-attestation detected');
    }

    // Check for rapid attestation (potential sybil)
    const sorted = [...attestations].sort(
      (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
    );
    for (let i = 1; i < sorted.length; i++) {
      const gap = new Date(sorted[i].timestamp).getTime() - new Date(sorted[i - 1].timestamp).getTime();
      if (gap < 60000) {
        // Less than 1 minute between attestations
        warnings.push('Rapid attestation pattern detected');
        break;
      }
    }

    return warnings;
  }
}
