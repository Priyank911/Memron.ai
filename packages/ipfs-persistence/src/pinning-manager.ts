import type { PinStatus } from './types';

/**
 * PinningManager — Manages pinning of CIDs across multiple
 * pinning services for redundancy and availability.
 */
export class PinningManager {
  private pins: Map<string, PinStatus> = new Map();

  /** Pin a CID for persistent storage */
  async pin(cid: string, name?: string): Promise<PinStatus> {
    const status: PinStatus = {
      cid,
      name: name ?? cid,
      status: 'queued',
      createdAt: new Date().toISOString(),
    };
    this.pins.set(cid, status);
    // TODO: Submit to pinning service
    return status;
  }

  /** Unpin a CID */
  async unpin(cid: string): Promise<void> {
    this.pins.delete(cid);
    // TODO: Remove from pinning service
  }

  /** Get pin status for a CID */
  getStatus(cid: string): PinStatus | undefined {
    return this.pins.get(cid);
  }

  /** List all active pins */
  listPins(): PinStatus[] {
    return Array.from(this.pins.values());
  }
}
