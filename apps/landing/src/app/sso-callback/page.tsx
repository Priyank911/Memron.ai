/**
 * Legacy SSO Callback Page
 * 
 * This page was used for Clerk SSO callbacks but is no longer needed
 * with Firebase Auth. Redirects to login for any stray navigation.
 */
import { redirect } from 'next/navigation';

export default function SsoCallbackPage() {
  redirect('/login');
}