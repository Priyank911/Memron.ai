/**
 * Production-Grade User Cache
 *
 * In-memory cache with:
 * - Thread-safe operations
 * - Request deduplication (prevents thundering herd)
 * - Cache hit/miss logging for monitoring
 * - Automatic cleanup of expired entries
 * - Stats for observability
 */

interface CachedUser {
  id: number;
  universal_id: string;
  firebase_uid: string | null;
  clerk_id: string | null;
  email: string;
  first_name: string | null;
  last_name: string | null;
  full_name: string | null;
  image_url: string | null;
  is_active: boolean;
  api_key_id: number;
  key_scopes: string[];
  key_org_id: number | null;
}

interface CacheEntry {
  data: CachedUser;
  expiresAt: number;
}

// Pending requests map to prevent thundering herd
type PendingRequest = Promise<CachedUser | null>;

class UserCache {
  private cache = new Map<string, CacheEntry>();
  private pending = new Map<string, PendingRequest>();
  private readonly TTL_MS = 5 * 60 * 1000; // 5 minutes

  // Stats for monitoring
  private hits = 0;
  private misses = 0;
  private errors = 0;

  /**
   * Get user from cache by API key hash
   */
  get(keyHash: string): CachedUser | null {
    const entry = this.cache.get(keyHash);

    if (!entry) {
      this.misses++;
      return null;
    }

    // Check expiration
    if (Date.now() > entry.expiresAt) {
      this.cache.delete(keyHash);
      this.misses++;
      return null;
    }

    this.hits++;
    return entry.data;
  }

  /**
   * Store user in cache
   */
  set(keyHash: string, userData: CachedUser): void {
    this.cache.set(keyHash, {
      data: userData,
      expiresAt: Date.now() + this.TTL_MS,
    });
  }

  /**
   * Check if a request is already pending (prevents thundering herd)
   */
  getPending(keyHash: string): PendingRequest | undefined {
    return this.pending.get(keyHash);
  }

  /**
   * Set a pending request
   */
  setPending(keyHash: string, promise: PendingRequest): void {
    this.pending.set(keyHash, promise);
  }

  /**
   * Clear a pending request
   */
  clearPending(keyHash: string): void {
    this.pending.delete(keyHash);
  }

  /**
   * Invalidate specific user (e.g., after profile update)
   */
  invalidate(keyHash: string): void {
    this.cache.delete(keyHash);
    this.pending.delete(keyHash);
  }

  /**
   * Invalidate all users
   */
  clear(): void {
    this.cache.clear();
    this.pending.clear();
  }

  /**
   * Get cache stats for monitoring
   */
  getStats(): {
    size: number;
    hits: number;
    misses: number;
    errors: number;
    hitRate: string;
    pendingRequests: number;
  } {
    const total = this.hits + this.misses;
    const hitRate = total > 0 ? ((this.hits / total) * 100).toFixed(1) + '%' : '0%';
    return {
      size: this.cache.size,
      hits: this.hits,
      misses: this.misses,
      errors: this.errors,
      hitRate,
      pendingRequests: this.pending.size,
    };
  }

  /**
   * Log stats periodically (call from monitoring)
   */
  logStats(): void {
    const stats = this.getStats();
    if (stats.hits + stats.misses > 0) {
      console.log(`[UserCache] Stats: ${stats.size} entries, ${stats.hitRate} hit rate (${stats.hits} hits, ${stats.misses} misses)`);
    }
  }

  /**
   * Increment error count
   */
  recordError(): void {
    this.errors++;
  }

  /**
   * Periodic cleanup of expired entries
   */
  cleanup(): void {
    const now = Date.now();
    let cleaned = 0;
    for (const [key, entry] of this.cache.entries()) {
      if (now > entry.expiresAt) {
        this.cache.delete(key);
        cleaned++;
      }
    }
    if (cleaned > 0) {
      console.log(`[UserCache] Cleaned ${cleaned} expired entries`);
    }
  }
}

// Singleton instance - guaranteed single instance
export const userCache = new UserCache();

// Run cleanup every 2 minutes
const cleanupInterval = setInterval(() => userCache.cleanup(), 2 * 60 * 1000);

// Log stats every 5 minutes (in production)
const statsInterval = setInterval(() => userCache.logStats(), 5 * 60 * 1000);

// Cleanup intervals on process exit
if (typeof process !== 'undefined') {
  process.on('beforeExit', () => {
    clearInterval(cleanupInterval);
    clearInterval(statsInterval);
  });
}

// Export types for use in queries
export type { CachedUser };
