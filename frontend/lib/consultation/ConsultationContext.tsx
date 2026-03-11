'use client';
import { createContext, useContext, useState, ReactNode } from 'react';
import type { DiagnosisResult, HospitalInfo } from '@/lib/api/types';

interface ConsultationContextValue {
  sessionId: string | null;
  setSessionId: (id: string | null) => void;
  phase: string;
  setPhase: (phase: string) => void;
  diagnosisResult: DiagnosisResult | null;
  setDiagnosisResult: (result: DiagnosisResult | null) => void;
  hospitalResults: HospitalInfo[];
  setHospitalResults: (hospitals: HospitalInfo[]) => void;
  selectedHospital: HospitalInfo | null;
  setSelectedHospital: (hospital: HospitalInfo | null) => void;
  emergencyFlag: boolean;
  setEmergencyFlag: (flag: boolean) => void;
}

const ConsultationContext = createContext<ConsultationContextValue | null>(null);

export function ConsultationProvider({ children }: { children: ReactNode }) {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [phase, setPhase] = useState('onboarding');
  const [diagnosisResult, setDiagnosisResult] = useState<DiagnosisResult | null>(null);
  const [hospitalResults, setHospitalResults] = useState<HospitalInfo[]>([]);
  const [selectedHospital, setSelectedHospital] = useState<HospitalInfo | null>(null);
  const [emergencyFlag, setEmergencyFlag] = useState(false);

  return (
    <ConsultationContext.Provider value={{
      sessionId, setSessionId,
      phase, setPhase,
      diagnosisResult, setDiagnosisResult,
      hospitalResults, setHospitalResults,
      selectedHospital, setSelectedHospital,
      emergencyFlag, setEmergencyFlag,
    }}>
      {children}
    </ConsultationContext.Provider>
  );
}

export function useConsultation() {
  const ctx = useContext(ConsultationContext);
  if (!ctx) throw new Error('useConsultation must be used within ConsultationProvider');
  return ctx;
}
