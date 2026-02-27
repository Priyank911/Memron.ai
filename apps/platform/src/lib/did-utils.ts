// DID utilities — identity helpers
export function shortenDid(did: string, chars = 6): string {
  if (!did) return '';
  const parts = did.split(':');
  const addr = parts[parts.length - 1];
  return `${did.slice(0, did.length - addr.length)}${addr.slice(0, chars)}...${addr.slice(-4)}`;
}

export function isValidDid(did: string): boolean {
  return /^did:[a-z]+:.+$/.test(did);
}
