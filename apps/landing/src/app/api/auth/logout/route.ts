/**
 * POST /api/auth/logout — Sign out (alias for DELETE /api/auth).
 * Kept as a separate route because some proxies strip DELETE bodies/verbs.
 */

export const runtime = 'nodejs';

import { NextResponse } from 'next/server';
import { clearAuxiliaryCookies, clearSessionCookie } from '@/lib/session';

export async function POST() {
  const response = NextResponse.json({ success: true });
  clearSessionCookie(response);
  clearAuxiliaryCookies(response);
  return response;
}
