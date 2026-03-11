'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import Divider from '@mui/material/Divider';
import Chip from '@mui/material/Chip';
import CircularProgress from '@mui/material/CircularProgress';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import DownloadIcon from '@mui/icons-material/Download';
import RefreshIcon from '@mui/icons-material/Refresh';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import LocalHospitalIcon from '@mui/icons-material/LocalHospital';
import MedicalInformationIcon from '@mui/icons-material/MedicalInformation';

import ConsultationAppBar from '@/components/ui/ConsultationAppBar';
import ProgressBar from '@/components/ui/ProgressBar';
import DisclaimerBanner from '@/components/ui/DisclaimerBanner';
import Toast from '@/components/ui/Toast';
import { downloadConsultationPDF } from '@/lib/api/consultation';
import type { DiagnosisResult, HospitalInfo } from '@/lib/api/types';
import { useToast } from '@/lib/toast/useToast';

interface SummaryData {
  symptoms: string[];
  bodyPart: string;
  severity: number;
  duration: string;
  diagnosis: DiagnosisResult;
  hospital: HospitalInfo | null;
}

// Mock summary data for development
const MOCK_SUMMARY: SummaryData = {
  symptoms: ['두통', '어지러움'],
  bodyPart: '머리',
  severity: 6,
  duration: '3일 전부터',
  diagnosis: {
    primary_department: '신경과',
    primary_dept_code: 'D004',
    secondary_department: '내과',
    secondary_dept_code: 'D001',
    urgency: '조기방문권장',
    reasoning: '지속적인 두통과 어지러움은 신경계 이상이 의심됩니다.',
    disclaimer: '본 추천은 AI 분석 결과입니다.',
  },
  hospital: {
    id: 'hosp-001',
    name: '강남 신경과 의원',
    address: '서울 강남구 테헤란로 123',
    phone: '02-1234-5678',
    lat: 37.508,
    lng: 127.0622,
    departments: ['신경과'],
    operating_hours: '평일 09:00-18:00',
    distance_m: 350,
    rating: 4.7,
    is_open_now: true,
  },
};

const URGENCY_COLORS = {
  '일반': { color: '#2E9E6B', bg: '#E6F7EE' },
  '조기방문권장': { color: '#E8913A', bg: '#FFF3E6' },
  '응급': { color: '#D64545', bg: '#FEF2F2' },
};

export default function S06SummaryScreen() {
  const router = useRouter();
  const [summary, setSummary] = useState<SummaryData | null>(null);
  const [pdfLoading, setPdfLoading] = useState(false);
  const { toast, showToast, hideToast } = useToast();

  useEffect(() => {
    // Load data from sessionStorage
    const storedHospital = sessionStorage.getItem('selected_hospital');

    // TODO: fetch from API using session_id
    setSummary({
      ...MOCK_SUMMARY,
      hospital: storedHospital ? JSON.parse(storedHospital) : MOCK_SUMMARY.hospital,
    });
  }, []);

  const handleDownloadPDF = async () => {
    const sessionId = sessionStorage.getItem('health_session_id');
    if (!sessionId) {
      showToast('세션이 만료되었습니다.', 'error');
      return;
    }

    setPdfLoading(true);
    try {
      const blob = await downloadConsultationPDF(sessionId);
      // Trigger download
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `건강상담결과_${new Date().toISOString().slice(0, 10)}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      showToast('PDF 다운로드가 완료되었습니다.', 'success');
    } catch {
      showToast('PDF 생성에 실패했습니다. 잠시 후 다시 시도해주세요.', 'error');
    } finally {
      setPdfLoading(false);
    }
  };

  const handleNewConsultation = () => {
    sessionStorage.removeItem('health_session_id');
    sessionStorage.removeItem('selected_hospital');
    sessionStorage.removeItem('search_dept_code');
    sessionStorage.removeItem('search_dept_name');
    router.push('/consultation/onboarding');
  };

  if (!summary) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
        <CircularProgress sx={{ color: '#1B6B5A' }} />
      </Box>
    );
  }

  const urgencyConfig = URGENCY_COLORS[summary.diagnosis.urgency as keyof typeof URGENCY_COLORS] || URGENCY_COLORS['일반'];

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', minHeight: '100vh', bgcolor: '#F6F8FA', maxWidth: 480, mx: 'auto' }}>
      <ConsultationAppBar title="상담 요약" currentStep={6} totalSteps={6} showBack={false} />
      <ProgressBar current={6} total={6} />

      <Box sx={{ px: 2, py: 3, display: 'flex', flexDirection: 'column', gap: 2 }}>
        {/* Success Header */}
        <Box sx={{ textAlign: 'center', py: 2 }}>
          <Box
            sx={{
              width: 56,
              height: 56,
              borderRadius: '50%',
              background: 'linear-gradient(135deg, #1B6B5A 0%, #2E9E6B 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              mx: 'auto',
              mb: 1.5,
              boxShadow: '0 4px 16px rgba(27, 107, 90, 0.3)',
            }}
          >
            <CheckCircleIcon sx={{ fontSize: 32, color: 'white' }} />
          </Box>
          <Typography variant="h2" fontWeight={700} sx={{ mb: 0.5 }}>
            상담이 완료되었습니다
          </Typography>
          <Typography variant="body2" color="text.secondary">
            아래 상담 결과를 확인하고 병원을 방문하세요
          </Typography>
        </Box>

        {/* Urgency Reminder */}
        <Box
          sx={{
            bgcolor: urgencyConfig.bg,
            border: `1px solid ${urgencyConfig.color}30`,
            borderRadius: 2,
            p: 1.5,
            display: 'flex',
            gap: 1,
            alignItems: 'center',
          }}
        >
          <WarningAmberIcon sx={{ fontSize: 18, color: urgencyConfig.color, flexShrink: 0 }} />
          <Typography variant="body2" sx={{ color: urgencyConfig.color, fontWeight: 600 }}>
            {summary.diagnosis.urgency === '일반' && '1-2주 내 외래 방문을 권장합니다'}
            {summary.diagnosis.urgency === '조기방문권장' && '3-7일 내 빠른 방문을 권장합니다'}
            {summary.diagnosis.urgency === '응급' && '즉시 응급실 방문 또는 119를 호출하세요'}
          </Typography>
        </Box>

        {/* Summary Card */}
        <Box sx={{ bgcolor: 'white', borderRadius: 3, border: '1px solid #E2E8EE', overflow: 'hidden' }}>
          {/* Section 1: Symptoms */}
          <Box sx={{ p: 2, borderBottom: '1px solid #F6F8FA' }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
              <MedicalInformationIcon sx={{ fontSize: 18, color: '#6B7D8E' }} />
              <Typography variant="body2" fontWeight={600} color="text.secondary">증상 정보</Typography>
            </Box>
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75, mb: 1 }}>
              {summary.symptoms.map(symptom => (
                <Chip
                  key={symptom}
                  label={symptom}
                  size="small"
                  sx={{ bgcolor: '#E8F5F1', color: '#1B6B5A', fontWeight: 600 }}
                />
              ))}
            </Box>
            <Typography variant="caption" color="text.secondary">
              부위: {summary.bodyPart} · 기간: {summary.duration} · 강도: {summary.severity}/10
            </Typography>
          </Box>

          {/* Section 2: Department */}
          <Box sx={{ p: 2, borderBottom: '1px solid #F6F8FA' }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
              <LocalHospitalIcon sx={{ fontSize: 18, color: '#6B7D8E' }} />
              <Typography variant="body2" fontWeight={600} color="text.secondary">추천 진료과</Typography>
            </Box>
            <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
              <Chip
                label={`1순위: ${summary.diagnosis.primary_department}`}
                sx={{ bgcolor: '#1B6B5A', color: 'white', fontWeight: 700 }}
              />
              {summary.diagnosis.secondary_department && (
                <Chip
                  label={`2순위: ${summary.diagnosis.secondary_department}`}
                  sx={{ bgcolor: '#E8F5F1', color: '#1B6B5A', fontWeight: 600 }}
                />
              )}
            </Box>
          </Box>

          {/* Section 3: Hospital */}
          {summary.hospital && (
            <Box sx={{ p: 2 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                <LocalHospitalIcon sx={{ fontSize: 18, color: '#6B7D8E' }} />
                <Typography variant="body2" fontWeight={600} color="text.secondary">선택한 병원</Typography>
              </Box>
              <Typography variant="body1" fontWeight={700}>{summary.hospital.name}</Typography>
              <Typography variant="caption" color="text.secondary">{summary.hospital.address}</Typography>
              <Typography variant="caption" display="block" color="primary" fontWeight={600}>
                {summary.hospital.phone}
              </Typography>
            </Box>
          )}
        </Box>

        {/* Disclaimer */}
        <DisclaimerBanner />

        {/* PDF Download */}
        <Button
          variant="contained"
          fullWidth
          size="large"
          startIcon={pdfLoading ? <CircularProgress size={18} sx={{ color: 'white' }} /> : <DownloadIcon />}
          onClick={handleDownloadPDF}
          disabled={pdfLoading}
          sx={{
            minHeight: 56,
            borderRadius: 3,
            fontWeight: 700,
            bgcolor: '#1B6B5A',
            boxShadow: 'none',
          }}
        >
          {pdfLoading ? 'PDF 생성 중...' : '상담 결과 PDF 다운로드'}
        </Button>

        {/* New Consultation */}
        <Box sx={{ textAlign: 'center' }}>
          <Button
            variant="text"
            startIcon={<RefreshIcon />}
            onClick={handleNewConsultation}
            sx={{ color: '#6B7D8E' }}
          >
            새로운 상담 시작하기
          </Button>
        </Box>

        {/* NOTE: 결과저장/카카오톡공유/피드백 기능은 techstack.md에 따라 구현하지 않음 */}
      </Box>

      <Toast open={toast.open} message={toast.message} variant={toast.variant} onClose={hideToast} />
    </Box>
  );
}
