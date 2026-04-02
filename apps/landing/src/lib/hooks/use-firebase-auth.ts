/**
 * Firebase Authentication Hook
 * 
 * Drop-in replacement for Clerk's useUser hook.
 * Provides user data and authentication state.
 */

'use client';

import { useAuth, useUser, type AuthUser } from '@/components/auth-provider';

export { useAuth, useUser, type AuthUser };

/**
 * Hook that returns user data formatted like Clerk's user object
 * for easier migration from Clerk
 */
export function useFirebaseUser() {
  const { user, firebaseUser, isLoaded, isSignedIn } = useAuth();
  
  // Format user data similar to Clerk's structure
  const formattedUser = user ? {
    id: user.uid,
    primaryEmailAddress: user.email ? {
      emailAddress: user.email,
      verified: user.emailVerified,
    } : null,
    emailAddresses: user.email ? [{
      id: user.uid,
      emailAddress: user.email,
    }] : [],
    firstName: user.displayName?.split(' ')[0] || null,
    lastName: user.displayName?.split(' ').slice(1).join(' ') || null,
    fullName: user.displayName,
    imageUrl: user.photoURL,
    primaryEmailAddressId: user.uid,
    externalAccounts: [{
      provider: user.providerId,
    }],
  } : null;
  
  return {
    user: formattedUser,
    isLoaded,
    isSignedIn,
  };
}
