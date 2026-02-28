/**
 * JWT Token Utilities — signing and verification for access & refresh tokens.
 *
 * Access tokens: Short-lived (1hr), contain user identity + scopes.
 * Refresh tokens: Long-lived (30d), used to obtain new access tokens.
 * API keys: Also accepted as bearer tokens (verified against DB hash).
 */
import { SignJWT, jwtVerify, type JWTPayload } from 'jose';
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { config } from '../config.js';

// ─── Token Payload Types ────────────────────────────────────

export interface AccessTokenPayload extends JWTPayload {
  /** User database ID */
  sub: string;
  /** OAuth client ID */
  cid: string;
  /** Organization ID (optional) */
  org?: string;
  /** User email */
  email: string;
  /** Granted scopes */
  scopes: string[];
}

export interface RefreshTokenPayload extends JWTPayload {
  /** User database ID */
  sub: string;
  /** OAuth client ID */
  cid: string;
  /** Granted scopes */
  scopes: string[];
  /** Token type marker */
  type: 'refresh';
}

// ─── Key Derivation ─────────────────────────────────────────

const encoder = new TextEncoder();

function getSigningKey(): Uint8Array {
  return encoder.encode(config.jwt.secret);
}

// ─── Access Tokens ──────────────────────────────────────────

/**
 * Sign an access token JWT.
 * Contains full user identity — used for all MCP requests.
 */
export async function signAccessToken(payload: {
  sub: string;
  cid: string;
  org?: string;
  email: string;
  scopes: string[];
}): Promise<string> {
  return new SignJWT({ ...payload } as unknown as JWTPayload)
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setIssuedAt()
    .setIssuer(config.jwt.issuer)
    .setExpirationTime(`${config.jwt.accessTokenTtlSeconds}s`)
    .sign(getSigningKey());
}

/**
 * Verify and decode an access token.
 * @throws if token is expired, malformed, or signature is invalid
 */
export async function verifyAccessToken(token: string): Promise<AccessTokenPayload> {
  const { payload } = await jwtVerify(token, getSigningKey(), {
    issuer: config.jwt.issuer,
  });
  return payload as unknown as AccessTokenPayload;
}

// ─── Refresh Tokens ─────────────────────────────────────────

/**
 * Sign a refresh token JWT.
 * Longer-lived, contains minimal claims.
 */
export async function signRefreshToken(payload: {
  sub: string;
  cid: string;
  scopes: string[];
}): Promise<string> {
  return new SignJWT({ ...payload, type: 'refresh' } as unknown as JWTPayload)
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setIssuedAt()
    .setIssuer(config.jwt.issuer)
    .setExpirationTime(`${config.jwt.refreshTokenTtlSeconds}s`)
    .sign(getSigningKey());
}

/**
 * Verify and decode a refresh token.
 */
export async function verifyRefreshToken(token: string): Promise<RefreshTokenPayload> {
  const { payload } = await jwtVerify(token, getSigningKey(), {
    issuer: config.jwt.issuer,
  });
  if ((payload as any).type !== 'refresh') {
    throw new Error('Not a refresh token');
  }
  return payload as unknown as RefreshTokenPayload;
}

// ─── Opaque Token Helpers ───────────────────────────────────

/**
 * Generate a cryptographically random authorization code.
 */
export function generateAuthCode(): string {
  return randomBytes(32).toString('base64url');
}

/**
 * Generate a cryptographically random opaque refresh token.
 */
export function generateOpaqueRefreshToken(): string {
  return randomBytes(48).toString('base64url');
}

/**
 * SHA-256 hash a token for secure storage.
 */
export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/**
 * Timing-safe string comparison to prevent timing attacks.
 */
export function timingSafeCompare(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  try {
    return timingSafeEqual(Buffer.from(a, 'utf8'), Buffer.from(b, 'utf8'));
  } catch {
    return false;
  }
}

// ─── API Key Helpers ────────────────────────────────────────

const API_KEY_PATTERN = /^mm_(live|test|dev)_[A-Za-z0-9_-]{48}$/;

/**
 * Check if a string matches the Memron API key format.
 */
export function isApiKey(token: string): boolean {
  return API_KEY_PATTERN.test(token);
}

/**
 * Hash an API key for database lookup.
 */
export function hashApiKey(key: string): string {
  return createHash('sha256').update(key).digest('hex');
}
