'use client';
import { useAuth } from '@clerk/nextjs';

/**
 * Returns the Clerk session token for authenticating FastAPI backend calls
 */
export function useClerkToken() {
  const { getToken, isSignedIn, isLoaded } = useAuth();

  const getAuthToken = async (): Promise<string | null> => {
    if (!isSignedIn) return null;
    return getToken();
  };

  return { getAuthToken, isSignedIn, isLoaded };
}
