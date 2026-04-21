'use client';

const clerkEnabled = !!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;

type ClerkSession = {
  getToken: () => Promise<string | null>;
};

declare global {
  interface Window {
    Clerk?: {
      loaded?: boolean;
      session?: ClerkSession | null;
    };
  }
}

/**
 * Clerk가 설정된 경우 window.Clerk 세션 토큰을 사용하고,
 * 설정되지 않은 경우 개발용 no-op으로 동작한다.
 */
export function useClerkToken() {
  const getAuthToken = async (): Promise<string | null> => {
    if (!clerkEnabled || typeof window === 'undefined') return null;
    const session = window.Clerk?.session;
    if (!session) return null;
    return session.getToken();
  };

  const isSignedIn = clerkEnabled && typeof window !== 'undefined' && Boolean(window.Clerk?.session);
  const isLoaded = !clerkEnabled || typeof window === 'undefined' || Boolean(window.Clerk?.loaded);

  return { getAuthToken, isSignedIn, isLoaded };
}
