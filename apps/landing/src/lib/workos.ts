/**
 * WorkOS AuthKit — Server-only client
 *
 * Central place to obtain the WorkOS SDK instance. Returns null (instead of
 * throwing) when environment variables are missing so routes can respond with
 * a clean 503 and the UI can show a friendly message instead of crashing.
 *
 * Required environment variables:
 *   WORKOS_API_KEY          — sk_test_... / sk_live_... from WorkOS dashboard
 *   WORKOS_CLIENT_ID        — client_... from WorkOS dashboard
 *   WORKOS_COOKIE_PASSWORD  — random string, min 32 chars (session sealing)
 */

import { WorkOS, type User } from '@workos-inc/node';

// ─── Singleton ───────────────────────────────────────────────────────────────

let cachedClient: WorkOS | null = null;

export function isWorkOSConfigured(): boolean {
  return Boolean(
    process.env.WORKOS_API_KEY &&
    process.env.WORKOS_CLIENT_ID
  );
}

export function getWorkOS(): WorkOS | null {
  const apiKey = process.env.WORKOS_API_KEY;
  const clientId = process.env.WORKOS_CLIENT_ID;

  if (!apiKey || !clientId) {
    if (!cachedWarned) {
      console.warn(
        '[WorkOS] Missing WORKOS_API_KEY or WORKOS_CLIENT_ID — authentication disabled. ' +
        'Add them to .env.local (see .env.example).'
      );
      cachedWarned = true;
    }
    return null;
  }

  if (!cachedClient) {
    cachedClient = new WorkOS({ apiKey, clientId });
  }
  return cachedClient;
}

let cachedWarned = false;

export function getWorkOSClientId(): string | null {
  return process.env.WORKOS_CLIENT_ID ?? null;
}

/** Human-readable reason why auth is unavailable (for API error payloads). */
export function workosConfigError(): string {
  return 'Authentication service is not configured. Set WORKOS_API_KEY, WORKOS_CLIENT_ID and WORKOS_COOKIE_PASSWORD.';
}

// ─── Shared helpers ──────────────────────────────────────────────────────────

/** Normalized user shape used across the app (derived from a WorkOS User). */
export interface AuthProfile {
  uid: string;
  email: string;
  emailVerified: boolean;
  firstName: string | null;
  lastName: string | null;
  fullName: string | null;
  imageUrl: string | null;
  /** 'password' for email/password users; provider name for OAuth users. */
  provider: string;
}

export function toAuthProfile(user: User, provider = 'password'): AuthProfile {
  return {
    uid: user.id,
    email: user.email,
    emailVerified: user.emailVerified,
    firstName: user.firstName ?? null,
    lastName: user.lastName ?? null,
    fullName: user.firstName || user.lastName
      ? [user.firstName, user.lastName].filter(Boolean).join(' ')
      : user.name ?? null,
    imageUrl: user.profilePictureUrl ?? null,
    provider,
  };
}

/** True when the provider is an OAuth/social provider (emails auto-verified). */
export function isOAuthProvider(provider: string | undefined | null): boolean {
  return Boolean(provider && provider !== 'password');
}

/**
 * Look up a WorkOS user by email. Returns null when not found or when the
 * lookup fails (best-effort — callers must handle null gracefully).
 */
export async function findUserByEmail(email: string): Promise<User | null> {
  const workos = getWorkOS();
  if (!workos) return null;

  try {
    const { data } = await workos.userManagement.listUsers({ email, limit: 1 });
    return data[0] ?? null;
  } catch (error) {
    console.warn('[WorkOS] listUsers lookup failed:', error instanceof Error ? error.message : error);
    return null;
  }
}
