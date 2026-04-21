'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import CircularProgress from '@mui/material/CircularProgress';
import Alert from '@mui/material/Alert';
import Divider from '@mui/material/Divider';
import Accordion from '@mui/material/Accordion';
import AccordionSummary from '@mui/material/AccordionSummary';
import AccordionDetails from '@mui/material/AccordionDetails';
import LocalHospitalOutlinedIcon from '@mui/icons-material/LocalHospitalOutlined';
import PhoneIcon from '@mui/icons-material/Phone';
import ReplayIcon from '@mui/icons-material/Replay';
import SearchIcon from '@mui/icons-material/Search';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';

import ConsultationAppBar from '@/components/ui/ConsultationAppBar';
import ProgressBar from '@/components/ui/ProgressBar';
import DepartmentCard from '@/components/recommendation/DepartmentCard';
import UrgencyBadge from '@/components/recommendation/UrgencyBadge';
import DisclaimerBanner from '@/components/ui/DisclaimerBanner';
import { getDiagnosis } from '@/lib/api/consultation';
import { useClerkToken } from '@/lib/auth/useClerkToken';
import type { DiagnosisResult } from '@/lib/api/types';

function readCachedDiagnosis(): DiagnosisResult | null {
  if (typeof window === 'undefined') return null;
  const cached = sessionStorage.getItem('diagnosis_result');
  if (!cached) return null;
  try {
    const parsed = JSON.parse(cached) as DiagnosisResult;
    return parsed?.primary_department ? parsed : null;
  } catch {
    return null;
  }
}

export default function S03RecommendationScreen() {
  const router = useRouter();
  const { getAuthToken } = useClerkToken();
  const [initialCachedDiagnosis] = useState<DiagnosisResult | null>(() => readCachedDiagnosis());
  const [sessionId] = useState<string | null>(() => {
    if (typeof window === 'undefined') return null;
    return sessionStorage.getItem('health_session_id');
  });
  const initialError =
    !initialCachedDiagnosis && !sessionId
      ? '세션 정보가 없습니다. 상담을 다시 시작해주세요.'
      : null;
  const [diagnosis, setDiagnosis] = useState<DiagnosisResult | null>(initialCachedDiagnosis);
  const [loading, setLoading] = useState(initialCachedDiagnosis === null && !initialError);
  const [error, setError] = useState<string | null>(initialError);

  useEffect(() => {
    // 1. S02에서 pre-fetch한 결과가 있으면 API 호출 생략
    if (initialCachedDiagnosis) {
      sessionStorage.removeItem('diagnosis_result');
      return;
    }

    // 2. Fallback: API에서 직접 조회
    if (!sessionId) return;

    const fetchWithRetry = async (retries = 5, delay = 2000) => {
      const token = (await getAuthToken()) ?? undefined;
      for (let i = 0; i < retries; i++) {
        try {
          const result = await getDiagnosis(sessionId, token);
          setDiagnosis(result);
          return;
        } catch (err) {
          const errMsg = err instanceof Error ? err.message : '';
          if (errMsg.includes('Not Found')) {
            sessionStorage.removeItem('health_session_id');
            setError('세션이 만료되었습니다. 상담을 다시 시작해주세요.');
            return;
          }
          if (i < retries - 1) {
            await new Promise(r => setTimeout(r, delay));
            continue;
          }
          console.error('진단 결과 조회 실패:', err);
          setError('진단 결과를 불러오지 못했습니다. 다시 시도해주세요.');
        }
      }
    };

    fetchWithRetry().finally(() => setLoading(false));
  }, [getAuthToken, initialCachedDiagnosis, sessionId]);

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

  if (error || !diagnosis) {
    return (
      <Box sx={{ display: 'flex', flexDirection: 'column', height: '100vh', maxWidth: 480, mx: 'auto' }}>
        <ConsultationAppBar title="진료과 추천" currentStep={3} totalSteps={6} />
        <Box sx={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', px: 3 }}>
          <Alert
            severity="warning"
            sx={{ borderRadius: 2 }}
            action={
              <Button color="inherit" size="small" onClick={() => router.push('/consultation/screening')}>
                다시 상담
              </Button>
            }
          >
            {error || '진단 결과를 불러오지 못했습니다.'}
          </Alert>
        </Box>
      </Box>
    );
  }

  const isEmergency = diagnosis.urgency === '응급';
  const ragContext = diagnosis.rag_context;
  const matchedSymptoms = ragContext?.matched_symptoms ?? [];
  const knowledgeChunks = ragContext?.knowledge_chunks ?? [];
  const recommendedDepartments = ragContext?.recommended_departments ?? [];
  const hasRagData =
    matchedSymptoms.length > 0 ||
    knowledgeChunks.length > 0 ||
    recommendedDepartments.length > 0;
  const sourceLabelMap: Record<string, string> = {
    kormedmcqa: '한국의학시험',
    medqa_textbook: '의학교과서',
    medqa_question: 'USMLE',
  };

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

        {/* RAG Context */}
        {hasRagData && (
          <Accordion
            disableGutters
            sx={{
              borderRadius: 3,
              border: '1px solid #E2E8EE',
              '&:before': { display: 'none' },
            }}
          >
            <AccordionSummary expandIcon={<ExpandMoreIcon sx={{ color: '#1B6B5A' }} />}>
              <Typography variant="body2" fontWeight={700} sx={{ color: '#1B6B5A' }}>
                AI 분석 근거 보기
              </Typography>
            </AccordionSummary>
            <AccordionDetails sx={{ pt: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
              {matchedSymptoms.length > 0 && (
                <Box>
                  <Typography variant="caption" fontWeight={700} sx={{ color: '#1B6B5A', mb: 1, display: 'block' }}>
                    DB 유사 증상 매칭
                  </Typography>
                  <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75 }}>
                    {matchedSymptoms.map((symptom, idx) => (
                      <Chip
                        key={`${symptom.name_ko}-${idx}`}
                        size="small"
                        label={`${symptom.name_ko} · ${symptom.category} · ${symptom.similarity.toFixed(2)}`}
                        sx={{ bgcolor: '#E8F5F1', color: '#1B6B5A' }}
                      />
                    ))}
                  </Box>
                </Box>
              )}

              {knowledgeChunks.length > 0 && (
                <Box>
                  <Typography variant="caption" fontWeight={700} sx={{ color: '#1B6B5A', mb: 1, display: 'block' }}>
                    관련 의학 지식
                  </Typography>
                  <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                    {knowledgeChunks.map((chunk, idx) => (
                      <Box key={`${chunk.source}-${idx}`} sx={{ bgcolor: '#E8F5F1', borderRadius: 2, p: 1.25 }}>
                        <Typography variant="caption" sx={{ color: '#E8913A', fontWeight: 700 }}>
                          {sourceLabelMap[chunk.source] || chunk.source} · 유사도 {chunk.similarity.toFixed(2)}
                        </Typography>
                        <Typography variant="caption" display="block" color="text.secondary" sx={{ mt: 0.5, lineHeight: 1.5 }}>
                          {chunk.content.length > 200 ? `${chunk.content.slice(0, 200)}...` : chunk.content}
                        </Typography>
                      </Box>
                    ))}
                  </Box>
                </Box>
              )}

              {recommendedDepartments.length > 0 && (
                <Box>
                  <Typography variant="caption" fontWeight={700} sx={{ color: '#1B6B5A', mb: 1, display: 'block' }}>
                    DB 추천 진료과
                  </Typography>
                  <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.75 }}>
                    {recommendedDepartments.map((dept, idx) => (
                      <Box
                        key={`${dept.department_code}-${idx}`}
                        sx={{ border: '1px solid #E2E8EE', borderRadius: 2, p: 1.25, bgcolor: '#FFFFFF' }}
                      >
                        <Typography variant="caption" fontWeight={700} sx={{ color: '#1B6B5A' }}>
                          {dept.priority}순위 · {dept.department_name} ({dept.department_code})
                        </Typography>
                        <Typography variant="caption" display="block" color="text.secondary" sx={{ mt: 0.25 }}>
                          신뢰도 {dept.confidence.toFixed(2)} · 긴급도 {dept.urgency}
                        </Typography>
                      </Box>
                    ))}
                  </Box>
                </Box>
              )}
            </AccordionDetails>
          </Accordion>
        )}

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
