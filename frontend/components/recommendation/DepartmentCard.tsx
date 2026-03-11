'use client';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import LocalHospitalOutlinedIcon from '@mui/icons-material/LocalHospitalOutlined';

interface DepartmentCardProps {
  rank: 1 | 2;
  departmentName: string;
  deptCode: string;
  urgency: string;
  isPrimary: boolean;
}

const DEPT_DESCRIPTIONS: Record<string, string> = {
  신경과: '두통, 어지러움, 마비, 신경계 질환',
  내과: '발열, 소화기, 호흡기, 일반 내과 증상',
  정형외과: '관절, 근육, 뼈, 척추 관련 질환',
  피부과: '피부 발진, 가려움, 두드러기',
  이비인후과: '귀, 코, 목 관련 증상',
  심장내과: '흉통, 심계항진, 심장 관련',
  호흡기내과: '기침, 호흡곤란, 폐 관련',
  안과: '시력, 눈 충혈, 안구 통증',
};

export default function DepartmentCard({ rank, departmentName, deptCode, urgency, isPrimary }: DepartmentCardProps) {
  return (
    <Box
      sx={{
        bgcolor: 'white',
        borderRadius: 3,
        p: 2,
        border: isPrimary ? '2px solid #1B6B5A' : '1px solid #E2E8EE',
        position: 'relative',
      }}
    >
      {/* Rank Badge */}
      <Box
        sx={{
          position: 'absolute',
          top: -10,
          left: 16,
          bgcolor: isPrimary ? '#1B6B5A' : '#6B7D8E',
          color: 'white',
          borderRadius: 2,
          px: 1,
          py: 0.25,
          fontSize: '0.75rem',
          fontWeight: 700,
        }}
      >
        {rank}순위
      </Box>

      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mt: 0.5 }}>
        <Box
          sx={{
            width: 48,
            height: 48,
            borderRadius: 2,
            bgcolor: isPrimary ? '#E8F5F1' : '#F6F8FA',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}
        >
          <LocalHospitalOutlinedIcon sx={{ color: isPrimary ? '#1B6B5A' : '#6B7D8E' }} />
        </Box>
        <Box sx={{ flex: 1 }}>
          <Typography variant="body1" fontWeight={700} sx={{ mb: 0.25 }}>
            {departmentName}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            {DEPT_DESCRIPTIONS[departmentName] || '전문 진료과'}
          </Typography>
        </Box>
      </Box>
    </Box>
  );
}
