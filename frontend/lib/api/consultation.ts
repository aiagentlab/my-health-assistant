import type {
  StartConsultationResponse,
  SSEChunk,
  HospitalSearchResponse,
  HospitalInfo,
  DirectionsResponse,
} from './types';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

// Helper to add auth headers
function getHeaders(token?: string): HeadersInit {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  return headers;
}

// POST /api/consultation/start
export async function startConsultation(token?: string): Promise<StartConsultationResponse> {
  const res = await fetch(`${API_BASE}/api/consultation/start`, {
    method: 'POST',
    headers: getHeaders(token),
    body: JSON.stringify({}),
  });
  if (!res.ok) throw new Error(`상담 시작 실패: ${res.statusText}`);
  return res.json();
}

// POST /api/consultation/message (SSE streaming)
export async function sendMessage(
  sessionId: string,
  message: string,
  onChunk: (chunk: SSEChunk) => void,
  token?: string
): Promise<void> {
  const res = await fetch(`${API_BASE}/api/consultation/message`, {
    method: 'POST',
    headers: getHeaders(token),
    body: JSON.stringify({ session_id: sessionId, message }),
  });

  if (!res.ok) throw new Error(`메시지 전송 실패: ${res.statusText}`);
  if (!res.body) throw new Error('스트리밍 응답 없음');

  const reader = res.body.getReader();
  const decoder = new TextDecoder();

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    const text = decoder.decode(value);
    const lines = text.split('\n');

    for (const line of lines) {
      if (line.startsWith('data: ')) {
        try {
          const chunk: SSEChunk = JSON.parse(line.slice(6));
          onChunk(chunk);
        } catch {
          // Skip malformed chunks
        }
      }
    }
  }
}

// GET /api/hospital/geocode
export async function geocodeAddress(
  address: string,
  token?: string
): Promise<{ lat: number; lng: number; road_address: string } | null> {
  const params = new URLSearchParams({ address });
  const res = await fetch(`${API_BASE}/api/hospital/geocode?${params}`, {
    headers: getHeaders(token),
  });
  if (!res.ok) return null;
  return res.json();
}

// GET /api/hospital/search
export async function searchHospitals(
  deptCode: string,
  lat: number,
  lng: number,
  radius = 1000,
  token?: string
): Promise<HospitalSearchResponse> {
  const params = new URLSearchParams({
    dept_code: deptCode,
    lat: lat.toString(),
    lng: lng.toString(),
    radius: radius.toString(),
  });
  const res = await fetch(`${API_BASE}/api/hospital/search?${params}`, {
    headers: getHeaders(token),
  });
  if (!res.ok) throw new Error(`병원 검색 실패: ${res.statusText}`);
  return res.json();
}

// GET /api/hospital/{id}
export async function getHospitalDetail(hospitalId: string, token?: string): Promise<HospitalInfo> {
  const res = await fetch(`${API_BASE}/api/hospital/${hospitalId}`, {
    headers: getHeaders(token),
  });
  if (!res.ok) throw new Error(`병원 정보 조회 실패: ${res.statusText}`);
  return res.json();
}

// GET /api/hospital/{id}/directions
export async function getHospitalDirections(
  hospitalId: string,
  fromLat: number,
  fromLng: number,
  toLat: number,
  toLng: number,
  token?: string
): Promise<DirectionsResponse> {
  const params = new URLSearchParams({
    from_lat: fromLat.toString(),
    from_lng: fromLng.toString(),
    to_lat: toLat.toString(),
    to_lng: toLng.toString(),
  });
  const res = await fetch(`${API_BASE}/api/hospital/${hospitalId}/directions?${params}`, {
    headers: getHeaders(token),
  });
  if (!res.ok) throw new Error(`길찾기 실패: ${res.statusText}`);
  return res.json();
}

// POST /api/consultation/pdf
export async function downloadConsultationPDF(sessionId: string, token?: string): Promise<Blob> {
  const res = await fetch(`${API_BASE}/api/consultation/pdf`, {
    method: 'POST',
    headers: getHeaders(token),
    body: JSON.stringify({ session_id: sessionId }),
  });
  if (!res.ok) throw new Error(`PDF 생성 실패: ${res.statusText}`);
  return res.blob();
}
