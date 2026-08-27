/**
 * Sealed Session Cookies — WorkOS AuthKit (custom UI)
 *
 * After a successful WorkOS authentication we seal the user's identity into an
 * AES-256-GCM encrypted cookie. This mirrors the "sealed session" pattern
 * WorkOS itself uses, while keeping the app fully in control of the UI.
 *
 * Cookie format:  v1.<iv>.<ciphertext>.<tag>   (base64url segments)
 * Cookie name:    __session (httpOnly, SameSite=Lax, Secure in production)
 *
 * SECURITY NOTES
 * - WORKOS_COOKIE_PASSWORD must be a random string of at least 32 characters.
 * - The seal contains identity claims only — no WorkOS tokens are stored in
 *   the browser. API routes trust the seal for identity; sensitive operations
 *   re-verify against the WorkOS API when needed.
 */

import crypto from 'crypto';
import { NextRequest } from 'next/server';

// ─── Configuration ───────────────────────────────────────────────────────────

export const SESSION_COOKIE_NAME = '__session';
export const EMAIL_VERIFIED_COOKIE_NAME = 'memron_email_verified';
export const ONBOARDED_COOKIE_NAME = 'memron_onboarded';

/** Default session lifetime: 30 days (seconds). */
export const SESSION_TTL_SECONDS = 30 * 24 * 60 * 60;

const SEAL_VERSION = 'v1';
const KEY_INFO = 'memron.workos.session.v1';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface SessionClaims {
  /** WorkOS user id (user_...) */
  sub: string;
  email: string;
  emailVerified: boolean;
  firstName: string | null;
  lastName: string | null;
  fullName: string | null;
  imageUrl: string | null;
  /** 'password' | 'google' | 'github' */
  provider: string;
  iat: number;
  exp: number;
}

// ─── Key derivation ──────────────────────────────────────────────────────────

let cachedKey: Buffer | null = null;

function getSessionKey(): Buffer | null {
  const secret = process.env.WORKOS_COOKIE_PASSWORD;
  if (!secret || secret.length < 32) {
    if (!keyWarned) {
      console.warn(
        '[Session] WORKOS_COOKIE_PASSWORD missing or shorter than 32 chars — session sealing disabled.'
      );
      keyWarned = true;
    }
    return null;
  }
  if (!cachedKey) {
    cachedKey = crypto.scryptSync(secret, KEY_INFO, 32);
  }
  return cachedKey;
}

let keyWarned = false;

// ─── Seal / Unseal ───────────────────────────────────────────────────────────

const b64url = (buf: Buffer) => buf.toString('base64url');

/**
 * Encrypt session claims into the wire format stored in the cookie.
 * Returns null when the server is not configured (missing cookie password).
 */
export function sealSession(
  claims: Omit<SessionClaims, 'iat' | 'exp'>,
  ttlSeconds: number = SESSION_TTL_SECONDS,
): string | null {
  const key = getSessionKey();
  if (!key) return null;

  const now = Math.floor(Date.now() / 1000);
  const payload: SessionClaims = { ...claims, iat: now, exp: now + ttlSeconds };

  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([
    cipher.update(JSON.stringify(payload), 'utf8'),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();

  return [SEAL_VERSION, b64url(iv), b64url(ciphertext), b64url(tag)].join('.');
}

/**
 * Decrypt and validate a sealed session string. Returns claims or null when
 * the value is malformed, tampered with, or expired. Never throws.
 */
export function unsealSession(sealed: string | undefined | null): SessionClaims | null {
  if (!sealed) return null;

  try {
    const parts = sealed.split('.');
    if (parts.length !== 4 || parts[0] !== SEAL_VERSION) return null;

    const key = getSessionKey();
    if (!key) return null;

    const iv = Buffer.from(parts[1], 'base64url');
    const ciphertext = Buffer.from(parts[2], 'base64url');
    const tag = Buffer.from(parts[3], 'base64url');

    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(tag);
    const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);

    const claims = JSON.parse(plaintext.toString('utf8')) as SessionClaims;

    if (!claims?.sub || typeof claims.exp !== 'number') return null;
    if (claims.exp < Math.floor(Date.now() / 1000)) return null;

    return claims;
  } catch {
    // Tampered, malformed, wrong key, expired — all treated identically.
    return null;
  }
}

/** Extract claims from an incoming request's cookie. Never throws. */
export function getSessionFromRequest(request?: NextRequest | Request): SessionClaims | null {
  const cookieHeader =
    request instanceof NextRequest
      ? request.cookies.get(SESSION_COOKIE_NAME)?.value
      : request?.headers
        ?.get('cookie')
        ?.split(';')
        .map((c) => c.trim())
        .find((c) => c.startsWith(`${SESSION_COOKIE_NAME}=`))
        ?.slice(SESSION_COOKIE_NAME.length + 1);

  if (!cookieHeader || cookieHeader === 'undefined' || cookieHeader === 'null') {
    return null;
  }

  return unsealSession(cookieHeader);
}

/** Lightweight format check (safe for Edge middleware). Full validation is GCM. */
export function looksLikeSealedSession(value: string | undefined | null): boolean {
  if (!value || value === 'undefined' || value === 'null' || value.length < 40) return false;
  const parts = value.split('.');
  return parts.length === 4 && parts[0] === SEAL_VERSION && parts.every((p) => p.length > 0);
}

// ─── Cookie writers ──────────────────────────────────────────────────────────

interface CookieOptions {
  httpOnly?: boolean;
  secure?: boolean;
  sameSite?: 'lax' | 'strict' | 'none';
  maxAge?: number;
  path?: string;
}

/** Serializable subset of NextResponse needed to set cookies. */
interface CookieSetter {
  cookies: {
    set(options: { name: string; value: string } & CookieOptions): unknown;
  };
}

export function setSessionCookie(
  response: CookieSetter,
  sealed: string,
  maxAgeSeconds: number = SESSION_TTL_SECONDS,
): void {
  response.cookies.set({
    name: SESSION_COOKIE_NAME,
    value: sealed,
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: maxAgeSeconds,
    path: '/',
  });
}

export function clearSessionCookie(response: CookieSetter): void {
  response.cookies.set({
    name: SESSION_COOKIE_NAME,
    value: '',
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 0,
    path: '/',
  });
}

/**
 * Mirror email-verification state for middleware route decisions.
 * Readable by client JS on purpose (the middleware needs it before hydration).
 */
export function setEmailVerifiedCookie(response: CookieSetter, verified: boolean): void {
  response.cookies.set({
    name: EMAIL_VERIFIED_COOKIE_NAME,
    value: verified ? 'true' : 'false',
    httpOnly: false,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: SESSION_TTL_SECONDS,
    path: '/',
  });
}

export function clearAuxiliaryCookies(response: CookieSetter): void {
  for (const name of [EMAIL_VERIFIED_COOKIE_NAME, ONBOARDED_COOKIE_NAME]) {
    response.cookies.set({
      name,
      value: '',
      httpOnly: false,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 0,
      path: '/',
    });
  }
}
