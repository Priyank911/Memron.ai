// DID utilities — identity helpers
export function shortenDid(did, chars = 6) {
    if (!did)
        return '';
    const parts = did.split(':');
    const addr = parts[parts.length - 1];
    return `${did.slice(0, did.length - addr.length)}${addr.slice(0, chars)}...${addr.slice(-4)}`;
}
export function isValidDid(did) {
    return /^did:[a-z]+:.+$/.test(did);
}
//# sourceMappingURL=did-utils.js.map