export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';

const CLERK_SECRET = process.env.CLERK_SECRET_KEY!;

// Simple in-memory rate limit: max 5 calls per IP per 10 minutes
const rateLimitMap = new Map<string, { count: number; reset: number }>();
const RATE_LIMIT = 5;
const WINDOW_MS = 10 * 60 * 1000;

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(ip);
  if (!entry || now > entry.reset) {
    rateLimitMap.set(ip, { count: 1, reset: now + WINDOW_MS });
    return true;
  }
  if (entry.count >= RATE_LIMIT) return false;
  entry.count++;
  return true;
}

/**
 * POST /api/auth/reset-mfa
 * Removes TOTP enrollment from a user via Clerk Backend REST API.
 * Tries three methods: DELETE /totp, DELETE /mfa, PATCH user metadata.
 */
export async function POST(req: NextRequest) {
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
  if (!checkRateLimit(ip)) {
    return NextResponse.json({ error: 'Too many requests. Try again later.' }, { status: 429 });
  }

  try {
    const { email } = await req.json();
    if (!email || typeof email !== 'string') {
      return NextResponse.json({ error: 'Email is required' }, { status: 400 });
    }

    const headers = {
      Authorization: `Bearer ${CLERK_SECRET}`,
      'Content-Type': 'application/json',
    };

    // Find user by email via REST
    const listRes = await fetch(
      `https://api.clerk.com/v1/users?email_address=${encodeURIComponent(email)}&limit=1`,
      { headers },
    );
    if (!listRes.ok) {
      return NextResponse.json({ error: 'Failed to look up user' }, { status: 500 });
    }
    const users = await listRes.json();
    if (!Array.isArray(users) || !users.length) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const userId = users[0].id;
    const hasTOTP = users[0].totp_enabled;

    if (!hasTOTP) {
      return NextResponse.json({ success: true, method: 'no_totp' });
    }

    // Method 1: DELETE /v1/users/{id}/totp
    const r1 = await fetch(`https://api.clerk.com/v1/users/${userId}/totp`, {
      method: 'DELETE',
      headers,
    });
    if (r1.ok) {
      return NextResponse.json({ success: true, method: 'delete_totp' });
    }

    // Method 2: DELETE /v1/users/{id}/mfa
    const r2 = await fetch(`https://api.clerk.com/v1/users/${userId}/mfa`, {
      method: 'DELETE',
      headers,
    });
    if (r2.ok) {
      return NextResponse.json({ success: true, method: 'delete_mfa' });
    }

    // Both failed — return the error details so the frontend can fall back
    const errBody = await r2.text().catch(() => '');
    console.error('[reset-mfa] All methods failed. Last response:', r2.status, errBody);
    return NextResponse.json(
      { error: 'Could not remove TOTP — your Clerk plan may restrict this.', fallback: true },
      { status: 422 },
    );
  } catch (err: any) {
    console.error('[reset-mfa]', err?.message || err);
    return NextResponse.json(
      { error: err?.errors?.[0]?.message || 'Failed to reset MFA' },
      { status: 500 },
    );
  }
}
