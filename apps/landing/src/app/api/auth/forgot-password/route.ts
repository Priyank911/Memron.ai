/**
 * POST /api/auth/forgot-password — Trigger WorkOS password reset email.
 *
 * Always responds with success to avoid account enumeration; failures are
 * logged server-side. The reset link is delivered by WorkOS. Users who land
 * back on our app with a token use /reset-password.
 */

export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import { getWorkOS, findUserByEmail } from '@/lib/workos';

export async function POST(request: NextRequest) {
  let body: { email?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  }

  const email = body.email?.trim().toLowerCase() ?? '';
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    // Deliberately identical response shape for invalid emails (no enumeration).
    return NextResponse.json({ success: true });
  }

  const workos = getWorkOS();
  if (!workos) {
    return NextResponse.json({ success: true });
  }

  try {
    const user = await findUserByEmail(email);
    if (!user) {
      // No such account — respond identically to success.
      return NextResponse.json({ success: true });
    }
    await workos.userManagement.createPasswordReset({ email });
  } catch (error: any) {
    console.warn('[ForgotPassword]', error?.code || error?.message);
  }

  return NextResponse.json({ success: true });
}
