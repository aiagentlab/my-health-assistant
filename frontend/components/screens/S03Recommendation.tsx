'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import Alert from '@mui/material/Alert';
import Divider from '@mui/material/Divider';
import LocalHospitalOutlinedIcon from '@mui/icons-material/LocalHospitalOutlined';
import PhoneIcon from '@mui/icons-material/Phone';
import ReplayIcon from '@mui/icons-material/Replay';
import SearchIcon from '@mui/icons-material/Search';

import ConsultationAppBar from '@/components/ui/ConsultationAppBar';
import ProgressBar from '@/components/ui/ProgressBar';
import DepartmentCard from '@/components/recommendation/DepartmentCard';
import UrgencyBadge from '@/components/recommendation/UrgencyBadge';
import DisclaimerBanner from '@/components/ui/DisclaimerBanner';
import type { DiagnosisResult } from '@/lib/api/types';

// Temporary mock — in production this comes from LangGraph state via API
const MOCK_DIAGNOSIS: DiagnosisResult = {
  primary_department: '신경과',
  primary_dept_code: 'D004',
  secondary_department: '내과',
  secondary_dept_code: 'D001',
  urgency: '조기방문권장',
  reasoning:
    '지속적인 두통과 어지러움 증상은 신경계 이상을 의심할 수 있습니다. 신경과 방문을 우선 권장드리며, 신경과가 어려우시면 내과에서 초기 검진 후 의뢰받는 방법도 있습니다.',
  disclaimer:
    '본 추천은 AI 분석 결과로 의사의 진단을 대체하지 않습니다. 증상이 심각하거나 갑자기 악화되면 즉시 응급실을 방문하세요.',
};

export default function S03RecommendationScreen() {
  const router = useRouter();
  const [diagnosis, setDiagnosis] = useState<DiagnosisResult | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // TODO: fetch from API using session_id
    // For now use mock data
    sessionStorage.getItem('health_session_id');
    setTimeout(() => {
      setDiagnosis(MOCK_DIAGNOSIS);
      setLoading(false);
    }, 800);
  }, []);

  if (loading) {
    return (
      <Box sx={{ display: 'flex', flexDirection: 'column', height: '100vh', maxWidth: 480, mx: 'auto' }}>
        <ConsultationAppBar title="진료과 추천" currentStep={3} totalSteps={6} />
        <Box
          sx={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexDirection: 'column',
            gap: 2,
          }}
        >
          <CircularProgress sx={{ color: '#1B6B5A' }} />
          <Typography variant="body2" color="text.secondary">
            AI가 증상을 분석중입니다...
          </Typography>
        </Box>
      </Box>
    );
  }

  if (!diagnosis) return null;

  const isEmergency = diagnosis.urgency === '응급';

  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        minHeight: '100vh',
        bgcolor: '#F6F8FA',
        maxWidth: 480,
        mx: 'auto',
      }}
    >
      <ConsultationAppBar title="진료과 추천" currentStep={3} totalSteps={6} />
      <ProgressBar current={3} total={6} />

      <Box sx={{ flex: 1, px: 2, py: 3, display: 'flex', flexDirection: 'column', gap: 2 }}>
        {/* Emergency Alert */}
        {isEmergency && (
          <Alert
            severity="error"
            icon={<LocalHospitalOutlinedIcon />}
            sx={{ borderRadius: 2 }}
            action={
              <Button
                color="error"
                variant="contained"
                size="small"
                startIcon={<PhoneIcon />}
                href="tel:119"
                component="a"
              >
                119
              </Button>
            }
          >
            응급 증상이 의심됩니다. 즉시 119에 연락하거나 응급실을 방문하세요.
          </Alert>
        )}

        {/* Title */}
        <Box>
          <Typography variant="h2" fontWeight={700} sx={{ mb: 0.5 }}>
            추천 진료과
          </Typography>
          <UrgencyBadge urgency={diagnosis.urgency} />
        </Box>

        {/* Primary Department */}
        <DepartmentCard
          rank={1}
          departmentName={diagnosis.primary_department}
          deptCode={diagnosis.primary_dept_code}
          urgency={diagnosis.urgency}
          isPrimary
        />

        {/* Secondary Department */}
        {diagnosis.secondary_department && (
          <DepartmentCard
            rank={2}
            departmentName={diagnosis.secondary_department}
            deptCode={diagnosis.secondary_dept_code ?? ''}
            urgency="일반"
            isPrimary={false}
          />
        )}

        {/* Reasoning */}
        <Box sx={{ bgcolor: '#E8F5F1', borderRadius: 3, p: 2 }}>
          <Typography variant="body2" fontWeight={600} color="primary" sx={{ mb: 0.5 }}>
            추천 이유
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ lineHeight: 1.7 }}>
            {diagnosis.reasoning}
          </Typography>
        </Box>

        {/* Disclaimer */}
        <DisclaimerBanner message={diagnosis.disclaimer} />

        <Divider />

        {/* CTAs */}
        <Button
          variant="contained"
          fullWidth
          size="large"
          startIcon={<SearchIcon />}
          onClick={() => {
            sessionStorage.setItem('search_dept_code', diagnosis.primary_dept_code);
            sessionStorage.setItem('search_dept_name', diagnosis.primary_department);
            router.push('/consultation/hospital-search');
          }}
          sx={{
            minHeight: 56,
            borderRadius: 3,
            fontWeight: 700,
            bgcolor: '#1B6B5A',
            boxShadow: 'none',
          }}
        >
          주변 {diagnosis.primary_department} 찾기
        </Button>

        <Button
          variant="outlined"
          fullWidth
          startIcon={<ReplayIcon />}
          onClick={() => router.push('/consultation/screening')}
          sx={{
            borderColor: '#E2E8EE',
            color: '#6B7D8E',
            borderRadius: 3,
          }}
        >
          다시 상담하기
        </Button>
      </Box>
    </Box>
  );
}
