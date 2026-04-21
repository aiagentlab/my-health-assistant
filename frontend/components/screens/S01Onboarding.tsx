'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import FormControlLabel from '@mui/material/FormControlLabel';
import Checkbox from '@mui/material/Checkbox';
import Link from '@mui/material/Link';
import Divider from '@mui/material/Divider';
import CircularProgress from '@mui/material/CircularProgress';

import ChatOutlinedIcon from '@mui/icons-material/ChatOutlined';
import LocalHospitalOutlinedIcon from '@mui/icons-material/LocalHospitalOutlined';
import LocationOnOutlinedIcon from '@mui/icons-material/LocationOnOutlined';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';

import { startConsultation } from '@/lib/api/consultation';
import { useClerkToken } from '@/lib/auth/useClerkToken';

const FEATURES = [
  {
    icon: ChatOutlinedIcon,
    title: 'AI 문진 상담',
    description: 'AI와 대화로 증상을 체계적으로 정리해드려요',
    color: '#1B6B5A',
    bgColor: '#E8F5F1',
  },
  {
    icon: LocalHospitalOutlinedIcon,
    title: '진료과 추천',
    description: '증상에 맞는 적합한 진료과를 안내해드려요',
    color: '#E8913A',
    bgColor: '#FFF3E6',
  },
  {
    icon: LocationOnOutlinedIcon,
    title: '주변 병원 안내',
    description: '위치 기반으로 가까운 병의원을 찾아드려요',
    color: '#1B6B5A',
    bgColor: '#E8F5F1',
  },
] as const;

export default function S01OnboardingScreen() {
  const router = useRouter();
  const { getAuthToken } = useClerkToken();
  const [consentTerms, setConsentTerms] = useState(false);
  const [consentPrivacy, setConsentPrivacy] = useState(false);
  const [consentLocation, setConsentLocation] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const allRequired = consentTerms && consentPrivacy;

  const handleStartConsultation = async () => {
    setLoading(true);
    setError(null);
    try {
      const token = await getAuthToken() ?? undefined;
      const { session_id } = await startConsultation(token);
      sessionStorage.setItem('health_session_id', session_id);
      router.push('/consultation/screening');
    } catch {
      setError('서버 연결에 실패했습니다. 잠시 후 다시 시도해주세요.');
      setLoading(false);
    }
  };

  return (
    <Box
      sx={{
        minHeight: '100vh',
        bgcolor: '#F6F8FA',
        display: 'flex',
        flexDirection: 'column',
        maxWidth: 480,
        mx: 'auto',
        px: 2,
        pb: 3,
      }}
    >
      {/* Hero Section */}
      <Box sx={{ textAlign: 'center', pt: 6, pb: 4 }}>
        {/* App Icon */}
        <Box
          sx={{
            width: 80,
            height: 80,
            borderRadius: 4,
            background: 'linear-gradient(135deg, #1B6B5A 0%, #2E9E6B 100%)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            mx: 'auto',
            mb: 2,
            boxShadow: '0 4px 16px rgba(27, 107, 90, 0.3)',
          }}
        >
          <LocalHospitalOutlinedIcon sx={{ fontSize: 40, color: 'white' }} />
        </Box>

        <Typography variant="h1" fontWeight={700} color="primary" sx={{ mb: 1 }}>
          건강상담도우미
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ lineHeight: 1.7 }}>
          증상 인지부터 병원 방문까지{'\n'}
          AI와 함께 건강을 챙기세요
        </Typography>
      </Box>

      {/* Feature Cards */}
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5, mb: 3 }}>
        {FEATURES.map((feature) => {
          const Icon = feature.icon;
          return (
            <Box
              key={feature.title}
              sx={{
                display: 'flex',
                alignItems: 'center',
                gap: 2,
                bgcolor: 'white',
                borderRadius: 3,
                p: 2,
                border: '1px solid #E2E8EE',
              }}
            >
              <Box
                sx={{
                  width: 48,
                  height: 48,
                  borderRadius: 2,
                  bgcolor: feature.bgColor,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                }}
              >
                <Icon sx={{ fontSize: 24, color: feature.color }} />
              </Box>
              <Box>
                <Typography variant="body1" fontWeight={600} sx={{ mb: 0.25 }}>
                  {feature.title}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  {feature.description}
                </Typography>
              </Box>
            </Box>
          );
        })}
      </Box>

      {/* Disclaimer Banner — AC-3 */}
      <Box
        sx={{
          bgcolor: '#FFF3E6',
          border: '1px solid #F5C58A',
          borderRadius: 2,
          p: 1.5,
          display: 'flex',
          gap: 1,
          alignItems: 'flex-start',
          mb: 3,
        }}
      >
        <InfoOutlinedIcon sx={{ fontSize: 16, color: '#E8913A', flexShrink: 0, mt: 0.25 }} />
        <Typography variant="caption" color="#7A4A00" lineHeight={1.5}>
          본 서비스는 의료 진단이 아닌 병원 방문 안내 서비스입니다.
          AI 추천은 참고용이며, 정확한 진단은 반드시 의료 전문가에게 받으세요.
        </Typography>
      </Box>

      {/* Consent Checkboxes — AC-4, AC-5 */}
      <Box
        sx={{
          bgcolor: 'white',
          borderRadius: 3,
          p: 2,
          border: '1px solid #E2E8EE',
          mb: 2,
        }}
      >
        <Typography variant="body2" fontWeight={600} sx={{ mb: 1.5 }}>
          서비스 이용 동의
        </Typography>

        {/* 전체 동의 */}
        <FormControlLabel
          control={
            <Checkbox
              checked={consentTerms && consentPrivacy && consentLocation}
              indeterminate={
                (consentTerms || consentPrivacy || consentLocation) &&
                !(consentTerms && consentPrivacy && consentLocation)
              }
              onChange={(e) => {
                const checked = e.target.checked;
                setConsentTerms(checked);
                setConsentPrivacy(checked);
                setConsentLocation(checked);
              }}
              sx={{ '&.Mui-checked': { color: '#1B6B5A' } }}
            />
          }
          label={
            <Typography variant="body2" fontWeight={600}>
              전체 동의
            </Typography>
          }
          sx={{ mb: 0.5 }}
        />

        <Divider sx={{ my: 1 }} />

        {/* 필수: 이용약관 */}
        <FormControlLabel
          control={
            <Checkbox
              checked={consentTerms}
              onChange={(e) => setConsentTerms(e.target.checked)}
              sx={{ '&.Mui-checked': { color: '#1B6B5A' } }}
            />
          }
          label={
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
              <Typography component="span" variant="caption" color="error" fontWeight={700}>
                [필수]
              </Typography>
              <Typography variant="body2">이용약관 동의</Typography>
              <Link href="#" variant="caption" color="text.secondary" underline="hover">
                보기
              </Link>
            </Box>
          }
          sx={{ display: 'flex', mb: 0.5 }}
        />

        {/* 필수: 개인정보 */}
        <FormControlLabel
          control={
            <Checkbox
              checked={consentPrivacy}
              onChange={(e) => setConsentPrivacy(e.target.checked)}
              sx={{ '&.Mui-checked': { color: '#1B6B5A' } }}
            />
          }
          label={
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
              <Typography component="span" variant="caption" color="error" fontWeight={700}>
                [필수]
              </Typography>
              <Typography variant="body2">개인정보 처리방침 동의</Typography>
              <Link href="#" variant="caption" color="text.secondary" underline="hover">
                보기
              </Link>
            </Box>
          }
          sx={{ display: 'flex', mb: 0.5 }}
        />

        {/* 선택: 위치정보 */}
        <FormControlLabel
          control={
            <Checkbox
              checked={consentLocation}
              onChange={(e) => setConsentLocation(e.target.checked)}
              sx={{ '&.Mui-checked': { color: '#1B6B5A' } }}
            />
          }
          label={
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
              <Typography component="span" variant="caption" color="text.secondary" fontWeight={600}>
                [선택]
              </Typography>
              <Typography variant="body2">위치정보 이용 동의</Typography>
            </Box>
          }
          sx={{ display: 'flex' }}
        />
      </Box>

      {/* Error */}
      {error && (
        <Typography variant="caption" color="error" sx={{ mb: 1, textAlign: 'center' }}>
          {error}
        </Typography>
      )}

      {/* CTA Button — AC-4 */}
      <Button
        variant="contained"
        fullWidth
        size="large"
        disabled={!allRequired || loading}
        onClick={() => handleStartConsultation()}
        sx={{
          minHeight: 56,
          borderRadius: 3,
          fontSize: '1rem',
          fontWeight: 700,
          bgcolor: allRequired ? '#1B6B5A' : '#E2E8EE',
          color: allRequired ? 'white' : '#6B7D8E',
          boxShadow: 'none',
          '&:hover': { bgcolor: allRequired ? '#155548' : '#E2E8EE', boxShadow: 'none' },
          mb: 2,
        }}
      >
        {loading ? (
          <CircularProgress size={24} sx={{ color: 'white' }} />
        ) : (
          '상담 시작하기'
        )}
      </Button>

      {/* Emergency Footer */}
      <Box sx={{ textAlign: 'center' }}>
        <Typography variant="caption" color="text.secondary">
          응급상황이라면{' '}
          <Link
            href="tel:119"
            sx={{
              color: '#D64545',
              fontWeight: 700,
              textDecoration: 'none',
              '&:hover': { textDecoration: 'underline' },
            }}
          >
            119
          </Link>
          로 바로 연락하세요
        </Typography>
      </Box>
    </Box>
  );
}
