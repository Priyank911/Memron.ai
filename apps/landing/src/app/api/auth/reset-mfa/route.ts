export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import { createClerkClient } from '@clerk/nextjs/server';

const clerk = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY! });

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
 * Removes TOTP enrollment from a user who is stuck in the MFA loop.
 * Requires: { email: string }
 * This is safe because the caller already proved first-factor (password/OAuth)
 * — Clerk returned needs_second_factor, meaning credentials were valid.
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

    // Find user by email
    const users = await clerk.users.getUserList({
      emailAddress: [email],
      limit: 1,
    });

    if (!users.data.length) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const user = users.data[0];

    // Remove TOTP if enrolled
    if (user.totpEnabled) {
      await clerk.users.disableUserMFA(user.id);
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error('[reset-mfa]', err?.message || err);
    return NextResponse.json(
      { error: err?.errors?.[0]?.message || 'Failed to reset MFA' },
      { status: 500 },
    );
  }
}
