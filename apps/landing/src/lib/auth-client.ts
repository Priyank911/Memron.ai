'use client';

/**
 * Auth API Client — WorkOS AuthKit (custom UI)
 *
 * Thin fetch wrappers around /api/auth/* endpoints. All helpers:
 * - Never throw for expected failures (they return structured results)
 * - Include credentials so the httpOnly session cookie flows
 *
 * Replaces the previous Firebase client-side module.
 */

// ─── Types ───────────────────────────────────────────────────────────────────

export interface SessionUser {
  uid: string;
  email: string | null;
  emailVerified: boolean;
  firstName: string | null;
  lastName: string | null;
  displayName: string | null;
  photoURL: string | null;
  providerId: string;
}

export interface ApiResult<T = Record<string, unknown>> {
  ok: boolean;
  status: number;
  data: T & { error?: string };
}

async function post<T = Record<string, unknown>>(
  path: string,
  body?: unknown,
): Promise<ApiResult<T>> {
  try {
    const res = await fetch(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
      credentials: 'include',
    });
    const data = await res.json().catch(() => ({}));
    return { ok: res.ok, status: res.status, data: data as ApiResult<T>['data'] };
  } catch (err: any) {
    return {
      ok: false,
      status: 0,
      data: { error: err?.message || 'Network error. Please check your connection.' } as ApiResult<T>['data'],
    };
  }
}

// ─── Session ─────────────────────────────────────────────────────────────────

export async function getSession(): Promise<
  ApiResult<{ authenticated: boolean; user?: SessionUser }>
> {
  try {
    const res = await fetch('/api/auth', { credentials: 'include' });
    const data = await res.json().catch(() => ({ authenticated: false }));
    return { ok: res.ok, status: res.status, data };
  } catch {
    return { ok: false, status: 0, data: { authenticated: false } };
  }
}

export async function signOut(): Promise<{ success: boolean }> {
  const primary = await fetch('/api/auth', { method: 'DELETE', credentials: 'include' });
  if (primary.ok) return { success: true };
  // Fallback: some proxies strip unusual verbs.
  const fallback = await post('/api/auth/logout');
  return { success: fallback.ok };
}

// ─── Email + password flows ──────────────────────────────────────────────────

export type SignupStatus = 'success' | 'verification_required';

export async function signUp(input: {
  email: string;
  password: string;
  firstName?: string;
  lastName?: string;
}): Promise<ApiResult<{ status?: SignupStatus; email?: string }>> {
  return post('/api/auth/signup', input);
}

export async function signInWithEmail(
  email: string,
  password: string,
): Promise<ApiResult<{ user?: SessionUser; verificationRequired?: boolean; email?: string }>> {
  return post('/api/auth/login', { email, password });
}

export async function resendVerificationEmail(): Promise<ApiResult> {
  return post('/api/auth/resend-verification');
}

export async function verifyEmailCode(code: string): Promise<ApiResult> {
  return post('/api/auth/verify-email', { code });
}

export async function sendPasswordReset(email: string): Promise<ApiResult> {
  return post('/api/auth/forgot-password', { email });
}

export async function resetPassword(
  token: string,
  newPassword: string,
): Promise<ApiResult> {
  return post('/api/auth/reset-password', { token, newPassword });
}

// ─── OAuth ───────────────────────────────────────────────────────────────────

/** Full-page redirect into the WorkOS hosted OAuth flow. */
export function signInWithProvider(provider: 'google' | 'github'): void {
  window.location.href = `/api/auth/oauth/${provider}`;
}
