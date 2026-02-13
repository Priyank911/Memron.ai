import type { TrustAttestation } from '@memron/shared-types';

/**
 * AttestationManager — Manages the creation, validation, and
 * submission of trust attestations to the on-chain registry.
 */
export class AttestationManager {
  /** Create and sign a trust attestation */
  async createAttestation(
    fromDid: string,
    toDid: string,
    score: number,
    reason: string,
  ): Promise<TrustAttestation> {
    if (score < 0 || score > 1000) {
      throw new Error('Trust score must be between 0 and 1000');
    }
    if (fromDid === toDid) {
      throw new Error('Self-attestation is not allowed');
    }

    return {
      fromDid,
      toDid,
      score,
      reason,
      timestamp: new Date().toISOString(),
      txHash: '', // Set after on-chain submission
    };
  }

  /** Validate an attestation before submission */
  validate(attestation: TrustAttestation): { valid: boolean; errors: string[] } {
    const errors: string[] = [];
    if (!attestation.fromDid) errors.push('Missing fromDid');
    if (!attestation.toDid) errors.push('Missing toDid');
    if (attestation.score < 0 || attestation.score > 1000) errors.push('Invalid score range');
    if (attestation.fromDid === attestation.toDid) errors.push('Self-attestation');
    return { valid: errors.length === 0, errors };
  }
}
