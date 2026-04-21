export const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

export function buildAuthHeaders(token?: string): HeadersInit {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  return headers;
}
