// HealthConsultationState matching backend state.py
export interface HealthConsultationState {
  session_id: string;
  phase: 'onboarding' | 'screening' | 'diagnosis' | 'search' | 'info' | 'complete';
  messages: Message[];
  screening_data: ScreeningData;
  diagnosis_result: DiagnosisResult;
  hospital_results: HospitalInfo[];
  selected_hospital: HospitalInfo | null;
  emergency_flag: boolean;
  emergency_keywords: string[];
  user_location: UserLocation;
}

export interface Message {
  role: 'human' | 'ai' | 'system';
  content: string;
}

export interface ScreeningData {
  chief_complaint?: string;
  body_part?: string;
  duration_days?: number;
  severity?: number; // 1-10
  accompanying_symptoms?: string[];
  medical_history?: string;
  medications?: string;
  onset_type?: '급성' | '만성' | '반복성';
  step?: number;
}

export interface DiagnosisResult {
  primary_department: string;
  primary_dept_code: string;
  secondary_department?: string;
  secondary_dept_code?: string;
  urgency: '일반' | '조기방문권장' | '응급';
  reasoning: string;
  disclaimer: string;
}

export interface HospitalInfo {
  id: string;
  name: string;
  address: string;
  phone: string;
  lat: number;
  lng: number;
  departments: string[];
  operating_hours: string;
  distance_m: number;
  rating?: number;
  is_open_now: boolean;
}

export interface UserLocation {
  lat?: number;
  lng?: number;
  address?: string;
}

// API Request/Response types
export interface StartConsultationResponse {
  session_id: string;
  phase: string;
}

export interface MessageRequest {
  session_id: string;
  message: string;
}

export interface SSEChunk {
  content?: string;
  done: boolean;
  phase?: string;
  emergency_flag?: boolean;
  error?: string;
}

export interface HospitalSearchResponse {
  hospitals: HospitalInfo[];
  total: number;
  dept_code: string;
}

export interface DirectionsResponse {
  walking_min: number | null;
  transit_min: number | null;
  driving_min: number | null;
}
