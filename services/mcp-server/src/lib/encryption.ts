/**
 * AES-256-GCM Encryption Service
 *
 * All memory content is encrypted at rest. The server holds the encryption key
 * (derived from ENCRYPTION_SECRET) so it can encrypt/decrypt for operations
 * like search and context building. This protects against database breaches.
 */
import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  createHash,
} from 'node:crypto';
import { config } from '../config.js';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;   // 128-bit IV
const TAG_LENGTH = 16;  // 128-bit auth tag
const KEY_LENGTH = 32;  // 256-bit key

/** Cached derived key — computed once from the secret */
let _derivedKey: Buffer | null = null;

/**
 * Derive a 256-bit encryption key from the server secret using SHA-256.
 */
export function getEncryptionKey(): Buffer {
  if (!_derivedKey) {
    _derivedKey = createHash('sha256')
      .update(config.encryption.secret)
      .digest()
      .subarray(0, KEY_LENGTH);
  }
  return _derivedKey;
}

export interface EncryptedPayload {
  /** Ciphertext */
  encrypted: Buffer;
  /** Initialization vector (16 bytes) */
  iv: Buffer;
  /** GCM authentication tag (16 bytes) */
  tag: Buffer;
}

/**
 * Encrypt plaintext content using AES-256-GCM.
 *
 * @param plaintext - The string content to encrypt
 * @param key - 32-byte encryption key (defaults to derived key)
 * @returns Encrypted payload with ciphertext, IV, and auth tag
 */
export function encrypt(plaintext: string, key?: Buffer): EncryptedPayload {
  const encKey = key ?? getEncryptionKey();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, encKey, iv, { authTagLength: TAG_LENGTH });

  const encrypted = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final(),
  ]);

  return {
    encrypted,
    iv,
    tag: cipher.getAuthTag(),
  };
}

/**
 * Decrypt ciphertext using AES-256-GCM.
 *
 * @param payload - The encrypted payload (ciphertext + IV + tag)
 * @param key - 32-byte encryption key (defaults to derived key)
 * @returns Decrypted plaintext string
 * @throws If the ciphertext has been tampered with (auth tag mismatch)
 */
export function decrypt(payload: EncryptedPayload, key?: Buffer): string {
  const encKey = key ?? getEncryptionKey();
  const decipher = createDecipheriv(ALGORITHM, encKey, payload.iv, { authTagLength: TAG_LENGTH });
  decipher.setAuthTag(payload.tag);

  return Buffer.concat([
    decipher.update(payload.encrypted),
    decipher.final(),
  ]).toString('utf8');
}

/**
 * Hash content with SHA-256 for integrity verification.
 */
export function hashContent(content: string): string {
  return createHash('sha256').update(content).digest('hex');
}

/**
 * Test that encryption round-trips successfully.
 * Called during server startup as a health check.
 */
export function testEncryption(): boolean {
  try {
    const testData = 'memron-encryption-selftest';
    const payload = encrypt(testData);
    const decrypted = decrypt(payload);
    return decrypted === testData;
  } catch {
    return false;
  }
}
