/**
 * Firebase Error Message Mapping
 * 
 * Converts raw Firebase Auth error codes to user-friendly messages
 * matching the Memron design theme.
 */

export interface FirebaseErrorInfo {
  title: string;
  message: string;
  action?: string; // Suggested action for the user
  silent?: boolean; // If true, don't show error UI (e.g., popup closed)
}

/**
 * Maps Firebase Auth error codes to user-friendly messages
 */
export function getFirebaseErrorInfo(error: unknown): FirebaseErrorInfo {
  const err = error as { code?: string; message?: string };
  const code = err?.code || '';
  
  // ─── Authentication Errors ─────────────────────────────────────────────────
  
  // Invalid credentials (wrong email/password)
  if (code === 'auth/invalid-credential' || code === 'auth/wrong-password') {
    return {
      title: 'Invalid credentials',
      message: 'The email or password you entered is incorrect.',
      action: 'Please check your credentials and try again.',
    };
  }
  
  // User not found
  if (code === 'auth/user-not-found') {
    return {
      title: 'Account not found',
      message: 'No account exists with this email address.',
      action: 'Please sign up to create a new account.',
    };
  }
  
  // Invalid email format
  if (code === 'auth/invalid-email') {
    return {
      title: 'Invalid email',
      message: 'Please enter a valid email address.',
    };
  }
  
  // Email already in use
  if (code === 'auth/email-already-in-use') {
    return {
      title: 'Email already registered',
      message: 'An account with this email already exists.',
      action: 'Please sign in instead, or use a different email.',
    };
  }
  
  // Weak password
  if (code === 'auth/weak-password') {
    return {
      title: 'Password too weak',
      message: 'Your password must be at least 6 characters long.',
      action: 'Please choose a stronger password.',
    };
  }
  
  // User disabled
  if (code === 'auth/user-disabled') {
    return {
      title: 'Account disabled',
      message: 'This account has been disabled.',
      action: 'Please contact support for assistance.',
    };
  }
  
  // ─── OAuth / Popup Errors ──────────────────────────────────────────────────
  
  // Popup closed by user - SILENT error (don't show UI)
  if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') {
    return {
      title: '',
      message: '',
      silent: true, // User intentionally closed, no need to show error
    };
  }
  
  // Popup blocked
  if (code === 'auth/popup-blocked') {
    return {
      title: 'Popup blocked',
      message: 'Your browser blocked the sign-in popup.',
      action: 'Please allow popups for this site and try again.',
    };
  }

  if (code === 'auth/unauthorized-domain' || code === 'auth/unauthorized-continue-uri') {
    return {
      title: 'Domain not allowlisted',
      message: 'This deployment domain is not yet authorized in Firebase Auth.',
      action: 'Add this domain to Firebase Authentication > Settings > Authorized domains, then try again.',
    };
  }
  
  // Account exists with different credential
  if (code === 'auth/account-exists-with-different-credential') {
    return {
      title: 'Account exists',
      message: 'An account already exists with this email using a different sign-in method.',
      action: 'Try signing in with the method you originally used.',
    };
  }
  
  // Credential already in use
  if (code === 'auth/credential-already-in-use') {
    return {
      title: 'Credential in use',
      message: 'This credential is already associated with another account.',
    };
  }
  
  // ─── Rate Limiting / Security ──────────────────────────────────────────────
  
  // Too many requests
  if (code === 'auth/too-many-requests') {
    return {
      title: 'Too many attempts',
      message: 'Access temporarily blocked due to too many failed attempts.',
      action: 'Please wait a few minutes and try again.',
    };
  }
  
  // Operation not allowed
  if (code === 'auth/operation-not-allowed') {
    return {
      title: 'Sign-in method disabled',
      message: 'This sign-in method is currently not available.',
      action: 'Please try a different sign-in method.',
    };
  }
  
  // ─── Network / Server Errors ───────────────────────────────────────────────
  
  // Network error
  if (code === 'auth/network-request-failed') {
    return {
      title: 'Network error',
      message: 'Unable to connect to the authentication server.',
      action: 'Please check your internet connection and try again.',
    };
  }
  
  // Internal error
  if (code === 'auth/internal-error') {
    return {
      title: 'Server error',
      message: 'An unexpected error occurred.',
      action: 'Please try again in a few moments.',
    };
  }
  
  // ─── Password Reset Errors ─────────────────────────────────────────────────
  
  // Expired action code
  if (code === 'auth/expired-action-code') {
    return {
      title: 'Link expired',
      message: 'This password reset link has expired.',
      action: 'Please request a new password reset.',
    };
  }
  
  // Invalid action code
  if (code === 'auth/invalid-action-code') {
    return {
      title: 'Invalid link',
      message: 'This password reset link is invalid or has already been used.',
      action: 'Please request a new password reset.',
    };
  }
  
  // ─── Email Verification Errors ─────────────────────────────────────────────
  
  // Email not verified
  if (code === 'auth/email-not-verified') {
    return {
      title: 'Email not verified',
      message: 'Please verify your email address to continue.',
      action: 'Check your inbox for the verification email.',
    };
  }
  
  // ─── Default / Unknown Errors ──────────────────────────────────────────────
  
  // Extract cleaner message from Firebase error string
  let cleanMessage = err?.message || 'An unexpected error occurred.';
  // Remove Firebase prefix if present
  cleanMessage = cleanMessage.replace(/^Firebase:\s*/i, '');
  // Remove error code in parentheses
  cleanMessage = cleanMessage.replace(/\s*\([^)]+\)\s*\.?$/, '');
  
  return {
    title: 'Authentication error',
    message: cleanMessage || 'An unexpected error occurred.',
    action: 'Please try again.',
  };
}

/**
 * Format error for display - returns user-friendly string
 */
export function formatFirebaseError(error: unknown): string {
  const info = getFirebaseErrorInfo(error);
  if (info.silent) return '';
  
  let result = info.message;
  if (info.action) {
    result += ` ${info.action}`;
  }
  return result;
}

/**
 * Check if error should be silently ignored (e.g., user closed popup)
 */
export function isSilentError(error: unknown): boolean {
  return getFirebaseErrorInfo(error).silent === true;
}
