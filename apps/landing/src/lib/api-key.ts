/**
 * Memron API Key Generator
 * 
 * Generates secure, production-grade API keys with the format:
 * mm_{environment}_{random_string}
 * 
 * Example: mm_live_7kXf9mP2qR4tW8vZ...
 */

import { createHash, randomBytes } from 'crypto';

// Key configuration
const KEY_PREFIX = 'mm'; // Memron marker
const KEY_LENGTH = 48; // Total random characters
const HASH_ALGORITHM = 'sha256';

export type KeyEnvironment = 'live' | 'test' | 'dev';

export interface GeneratedApiKey {
    /** Full API key (show ONCE to user, never store) */
    fullKey: string;
    /** First 12 chars for display: mm_live_xxxx */
    prefix: string;
    /** SHA-256 hash for storage */
    hash: string;
    /** Environment: live, test, dev */
    environment: KeyEnvironment;
    /** When the key was generated */
    createdAt: Date;
}

/**
 * Generate a cryptographically secure random string
 * Uses URL-safe base64 characters: A-Za-z0-9_-
 */
function generateSecureRandom(length: number): string {
    // Generate more bytes than needed, then slice to desired length
    const bytes = randomBytes(Math.ceil(length * 0.75));
    return bytes
        .toString('base64')
        .replace(/\+/g, '_')  // Replace + with _
        .replace(/\//g, '-')  // Replace / with -
        .replace(/=/g, '')    // Remove padding
        .slice(0, length);
}

/**
 * Hash an API key using SHA-256
 * This is what we store in the database
 */
export function hashApiKey(key: string): string {
    return createHash(HASH_ALGORITHM)
        .update(key)
        .digest('hex');
}

/**
 * Generate a new Memron API key
 * 
 * @param environment - 'live' for production, 'test' for testing, 'dev' for development
 * @returns Generated API key with full key, prefix, and hash
 * 
 * @example
 * const key = generateApiKey('live');
 * // Returns:
 * // {
 * //   fullKey: 'mm_live_7kXf9mP2qR4tW8vZ1nB3dC5hJ6kL8mN0pQ2rS4tU6vW8xY0z',
 * //   prefix: 'mm_live_7kXf',
 * //   hash: 'a1b2c3d4e5f6...',
 * //   environment: 'live',
 * //   createdAt: Date
 * // }
 */
export function generateApiKey(environment: KeyEnvironment = 'live'): GeneratedApiKey {
    // Generate the random portion
    const randomPart = generateSecureRandom(KEY_LENGTH);
    
    // Construct full key: mm_live_randomstring
    const fullKey = `${KEY_PREFIX}_${environment}_${randomPart}`;
    
    // Create prefix for display (first 12 chars visible)
    const prefix = `${KEY_PREFIX}_${environment}_${randomPart.slice(0, 4)}`;
    
    // Hash for secure storage
    const hash = hashApiKey(fullKey);
    
    return {
        fullKey,
        prefix,
        hash,
        environment,
        createdAt: new Date(),
    };
}

/**
 * Validate API key format
 * Returns true if the key follows our format
 */
export function isValidApiKeyFormat(key: string): boolean {
    // Pattern: mm_{env}_{48 alphanumeric chars}
    const pattern = /^mm_(live|test|dev)_[A-Za-z0-9_-]{48}$/;
    return pattern.test(key);
}

/**
 * Extract prefix from a full API key
 * Used for looking up keys in database
 */
export function extractKeyPrefix(fullKey: string): string | null {
    if (!isValidApiKeyFormat(fullKey)) {
        return null;
    }
    
    const parts = fullKey.split('_');
    if (parts.length !== 3) return null;
    
    // Return: mm_{env}_{first 4 chars}
    return `${parts[0]}_${parts[1]}_${parts[2].slice(0, 4)}`;
}

/**
 * Mask an API key for display
 * Shows only prefix and last 4 characters
 * 
 * @example
 * maskApiKey('mm_live_7kXf9mP2qR4tW8vZ1nB3dC5hJ6kL8mN0pQ2rS4tU6vW8xY0z')
 * // Returns: 'mm_live_7kXf••••••••••••••••••••••••••••••••••••Y0z'
 */
export function maskApiKey(fullKey: string): string {
    if (!isValidApiKeyFormat(fullKey)) {
        return '••••••••••••';
    }
    
    const parts = fullKey.split('_');
    const random = parts[2];
    const masked = random.slice(0, 4) + '•'.repeat(random.length - 8) + random.slice(-4);
    
    return `${parts[0]}_${parts[1]}_${masked}`;
}

/**
 * Verify an API key against its stored hash
 */
export function verifyApiKey(fullKey: string, storedHash: string): boolean {
    if (!isValidApiKeyFormat(fullKey)) {
        return false;
    }
    
    const computedHash = hashApiKey(fullKey);
    
    // Use timing-safe comparison to prevent timing attacks
    if (computedHash.length !== storedHash.length) {
        return false;
    }
    
    let result = 0;
    for (let i = 0; i < computedHash.length; i++) {
        result |= computedHash.charCodeAt(i) ^ storedHash.charCodeAt(i);
    }
    
    return result === 0;
}

/**
 * Generate a unique organization slug from name
 */
export function generateOrgSlug(name: string): string {
    const baseSlug = name
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9\s-]/g, '') // Remove special chars
        .replace(/\s+/g, '-')          // Replace spaces with hyphens
        .replace(/-+/g, '-')           // Remove consecutive hyphens
        .slice(0, 30);                 // Limit length
    
    // Add random suffix for uniqueness
    const suffix = generateSecureRandom(6).toLowerCase();
    
    return `${baseSlug}-${suffix}`;
}
