'use client';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';

interface DisclaimerBannerProps {
  message?: string;
}

/**
 * 의료 면책 고지 배너 — 항상 표시
 * 화면설계서: 배경색 #FFF3E6 (Accent Light)
 */
export default function DisclaimerBanner({ message }: DisclaimerBannerProps) {
  return (
    <Box
      sx={{
        bgcolor: '#FFF3E6',
        border: '1px solid #F5C58A',
        borderRadius: 2,
        p: 1.5,
        display: 'flex',
        gap: 1,
        alignItems: 'flex-start',
      }}
    >
      <InfoOutlinedIcon sx={{ fontSize: 16, color: '#E8913A', flexShrink: 0, mt: 0.25 }} />
      <Typography variant="caption" color="#7A4A00" lineHeight={1.5}>
        {message || '본 서비스는 의료 진단이 아닌 병원 방문 안내 서비스입니다. AI 추천은 참고용이며, 정확한 진단은 의료 전문가에게 받으세요.'}
      </Typography>
    </Box>
  );
}
