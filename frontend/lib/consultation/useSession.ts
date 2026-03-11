'use client';
import { useState, useCallback } from 'react';
import { startConsultation } from '@/lib/api/consultation';
import type { HealthConsultationState } from '@/lib/api/types';

export function useConsultationSession() {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [phase, setPhase] = useState<HealthConsultationState['phase']>('onboarding');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const initSession = useCallback(async (token?: string) => {
    setLoading(true);
    setError(null);
    try {
      const { session_id, phase: initialPhase } = await startConsultation(token);
      setSessionId(session_id);
      setPhase(initialPhase as HealthConsultationState['phase']);
      // Persist session ID across page refreshes
      if (typeof window !== 'undefined') {
        sessionStorage.setItem('health_session_id', session_id);
      }
      return session_id;
    } catch (err) {
      setError(err instanceof Error ? err.message : '세션 시작 실패');
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  const restoreSession = useCallback(() => {
    if (typeof window !== 'undefined') {
      const stored = sessionStorage.getItem('health_session_id');
      if (stored) {
        setSessionId(stored);
        return stored;
      }
    }
    return null;
  }, []);

  const clearSession = useCallback(() => {
    setSessionId(null);
    setPhase('onboarding');
    if (typeof window !== 'undefined') {
      sessionStorage.removeItem('health_session_id');
    }
  }, []);

  return { sessionId, phase, setPhase, loading, error, initSession, restoreSession, clearSession };
}
