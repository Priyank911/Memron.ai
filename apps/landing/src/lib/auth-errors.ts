/**
 * WorkOS Error → User-Friendly Message Mapping
 *
 * Converts WorkOS SDK exceptions into clean, actionable messages that match
 * the Memron design language. Replaces the previous Firebase error mapper.
 */

export interface AuthErrorInfo {
  message: string;
  /** When true, callers should silently ignore (e.g. user cancelled OAuth). */
  silent?: boolean;
}

/** Well-known WorkOS error codes we map explicitly. */
const CODE_MAP: Record<string, string> = {
  // Authentication failures
  invalid_credentials: 'The email or password you entered is incorrect.',
  email_verification_required: 'Please verify your email before signing in. Check your inbox for the verification code.',
  mfa_enrollment_required: 'Your account requires additional security setup. Please contact support.',
  mfa_challenge_required: 'Additional authentication is required for your account.',

  // Registration conflicts
  user_already_exists: 'An account with this email already exists. Try signing in instead.',

  // Validation
  password_too_short: 'Your password must be at least 8 characters long. Please choose a stronger password.',
  password_too_weak: 'This password is too weak. Please choose a stronger one (min. 8 characters).',
  invalid_email: 'Please enter a valid email address.',

  // Verification / reset flows
  invalid_email_verification_code: 'That verification code is invalid or has expired. Request a new code and try again.',
  email_verification_expired: 'This verification code has expired. Please request a new one.',
  too_many_requests: 'Too many attempts. Please wait a few minutes and try again.',

  // Account state
  user_not_found: 'No account exists with this email address.',
};

/** Map a thrown WorkOS error to a friendly message. */
export function getAuthErrorInfo(error: unknown): AuthErrorInfo {
  const err = error as {
    code?: string;
    status?: number;
    message?: string;
    error?: string;
    errorDescription?: string;
    rawError?: { message?: string };
  };

  const code = err?.code || '';

  if (code && CODE_MAP[code]) {
    return { message: CODE_MAP[code] };
  }

  // OAuth redirect errors (user denied consent, closed window, provider failure)
  if (err?.error) {
    const oauthError = String(err.error);
    if (
      oauthError === 'access_denied' ||
      oauthError === 'user_cancelled_authorization' ||
      oauthError === 'consent_required' ||
      oauthError === 'interaction_required'
    ) {
      return { message: '', silent: true };
    }
    if (err.errorDescription) {
      return { message: `Sign-in failed: ${err.errorDescription}` };
    }
    return { message: 'Could not complete sign-in with the provider. Please try again.' };
  }

  // Rate limiting by HTTP status
  if (err?.status === 429) {
    return { message: CODE_MAP.too_many_requests };
  }

  // Password validation errors arrive as UnprocessableEntityException (422)
  if (err?.status === 422) {
    return {
      message:
        err?.message?.toLowerCase().includes('password')
          ? 'This password does not meet the requirements (min. 8 characters).'
          : err?.message || 'We could not process that request. Please check your input and try again.',
    };
  }

  if (err?.message) {
    return { message: err.message };
  }

  return { message: 'Something went wrong during authentication. Please try again.' };
}

/** Convenience wrapper — returns '' for silent errors. */
export function formatAuthError(error: unknown): string {
  const info = getAuthErrorInfo(error);
  return info.silent ? '' : info.message;
}
