/**
 * Blind Index — HMAC-SHA256 based blind entity hashing.
 *
 * Allows the database to match and traverse graph nodes by entity name
 * without the server ever seeing the plaintext entity name.
 *
 * The blind hash is deterministic per (user_key, canonical_name) pair,
 * so the same entity always produces the same hash for the same user.
 */
import { createHmac, createHash } from 'node:crypto';
import { config } from '../config.js';

let _blindKey: Buffer | null = null;

/**
 * Derives a blind-index key from the encryption secret.
 * Uses SHA-256 of `config.encryption.secret + ':blind'` to get a different key from the encryption key.
 *
 * @returns 32-byte blind-index key
 */
export function getBlindKey(): Buffer {
  if (!_blindKey) {
    _blindKey = createHash('sha256')
      .update(config.encryption.secret + ':blind')
      .digest();
  }
  return _blindKey;
}

/**
 * Normalizes an entity name by lowercasing, trimming, and collapsing whitespace.
 *
 * @param name - The raw entity name
 * @returns Normalized string
 */
export function normalizeEntityName(name: string): string {
  if (!name) return '';
  return name.toLowerCase().trim().replace(/\s+/g, ' ');
}

/**
 * Computes a deterministic blind hash for an entity name.
 * Formula: HMAC_SHA256(blindKey, normalizeEntityName(canonicalName) + ':' + userId)
 *
 * @param canonicalName - The entity name to hash
 * @param userId - Optional user ID for namespacing
 * @returns 32-character hex string (first 32 chars of HMAC)
 */
export function computeBlindHash(canonicalName: string, userId?: number): string {
  const normalized = normalizeEntityName(canonicalName);
  const data = userId ? `${normalized}:${userId}` : normalized;
  
  return createHmac('sha256', getBlindKey())
    .update(data, 'utf8')
    .digest('hex')
    .substring(0, 32);
}

/**
 * Computes blind hashes for a batch of entity names.
 *
 * @param names - Array of raw entity names
 * @param userId - Optional user ID for namespacing
 * @returns Map of raw name to blind hash
 */
export function computeBlindHashBatch(names: string[], userId?: number): Map<string, string> {
  const result = new Map<string, string>();
  for (const name of names) {
    result.set(name, computeBlindHash(name, userId));
  }
  return result;
}
