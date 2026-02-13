/**
 * CIDResolver — Resolves CIDs to their content, handling
 * gateway fallbacks and caching for performance.
 */
export class CIDResolver {
  private cache: Map<string, Uint8Array> = new Map();

  constructor(private gateways: string[]) {}

  /** Resolve a CID to its content, trying multiple gateways */
  async resolve(cid: string): Promise<Uint8Array> {
    // Check cache first
    const cached = this.cache.get(cid);
    if (cached) return cached;

    // Try each gateway
    for (const gateway of this.gateways) {
      try {
        const url = `${gateway}/ipfs/${cid}`;
        const response = await fetch(url);
        if (response.ok) {
          const data = new Uint8Array(await response.arrayBuffer());
          this.cache.set(cid, data);
          return data;
        }
      } catch {
        continue; // Try next gateway
      }
    }

    throw new Error(`Failed to resolve CID: ${cid}`);
  }

  /** Verify CID integrity */
  async verify(cid: string, content: Uint8Array): Promise<boolean> {
    // TODO: Recompute CID from content and compare
    return true;
  }

  /** Clear the resolution cache */
  clearCache(): void {
    this.cache.clear();
  }
}
