'use client';
import Box from '@mui/material/Box';
import LinearProgress from '@mui/material/LinearProgress';
import Typography from '@mui/material/Typography';

interface ProgressBarProps {
  current: number;
  total: number;
  label?: string;
  stepLabels?: string[];
}

/**
 * 상담 진행률 표시 바
 * 화면설계서: 퍼센트 + 단계 레이블
 */
export default function ProgressBar({ current, total, label, stepLabels }: ProgressBarProps) {
  const percentage = Math.round((current / total) * 100);

  return (
    <Box sx={{ px: 2, py: 1.5, bgcolor: 'white', borderBottom: '1px solid #E2E8EE' }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
        <Typography variant="caption" color="text.secondary">
          {label || `${current}단계`}
        </Typography>
        <Typography variant="caption" color="primary" fontWeight={600}>
          {percentage}%
        </Typography>
      </Box>
      <LinearProgress
        variant="determinate"
        value={percentage}
        sx={{
          height: 6,
          borderRadius: 3,
          bgcolor: '#E8F5F1',
          '& .MuiLinearProgress-bar': {
            bgcolor: '#1B6B5A',
            borderRadius: 3,
          },
        }}
      />
      {stepLabels && (
        <Box sx={{ display: 'flex', justifyContent: 'space-between', mt: 0.5 }}>
          {stepLabels.map((label, i) => (
            <Typography
              key={i}
              variant="caption"
              sx={{
                fontSize: '0.625rem',
                color: i < current ? '#1B6B5A' : '#6B7D8E',
                fontWeight: i === current - 1 ? 600 : 400,
              }}
            >
              {label}
            </Typography>
          ))}
        </Box>
      )}
    </Box>
  );
}
