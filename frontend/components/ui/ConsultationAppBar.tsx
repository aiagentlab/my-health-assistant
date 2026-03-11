'use client';
import AppBar from '@mui/material/AppBar';
import Toolbar from '@mui/material/Toolbar';
import IconButton from '@mui/material/IconButton';
import Typography from '@mui/material/Typography';
import ArrowBackIosNewIcon from '@mui/icons-material/ArrowBackIosNew';
import Box from '@mui/material/Box';
import { useRouter } from 'next/navigation';

interface ConsultationAppBarProps {
  title: string;
  currentStep?: number;
  totalSteps?: number;
  showBack?: boolean;
  onBack?: () => void;
}

/**
 * 상담 화면 상단 AppBar
 * 화면설계서 §9: 뒤로가기 버튼 + 타이틀 + 단계 인디케이터
 */
export default function ConsultationAppBar({
  title,
  currentStep,
  totalSteps,
  showBack = true,
  onBack,
}: ConsultationAppBarProps) {
  const router = useRouter();

  const handleBack = () => {
    if (onBack) {
      onBack();
    } else {
      router.back();
    }
  };

  return (
    <AppBar
      position="sticky"
      elevation={0}
      sx={{
        bgcolor: 'white',
        borderBottom: '1px solid #E2E8EE',
        color: '#1A2B3C',
      }}
    >
      <Toolbar sx={{ minHeight: 56, px: 1 }}>
        {showBack && (
          <IconButton
            onClick={handleBack}
            edge="start"
            aria-label="뒤로가기"
            sx={{
              minWidth: 44,
              minHeight: 44,
              color: '#1A2B3C',
            }}
          >
            <ArrowBackIosNewIcon fontSize="small" />
          </IconButton>
        )}
        <Typography
          variant="body1"
          fontWeight={600}
          sx={{ flex: 1, textAlign: 'center', ml: showBack ? 0 : 1 }}
        >
          {title}
        </Typography>
        {currentStep && totalSteps && (
          <Box
            sx={{
              minWidth: 44,
              textAlign: 'right',
              pr: 1,
            }}
          >
            <Typography variant="caption" color="text.secondary">
              {currentStep}/{totalSteps}
            </Typography>
          </Box>
        )}
        {!(currentStep && totalSteps) && showBack && (
          <Box sx={{ minWidth: 44 }} /> // Spacer for centering
        )}
      </Toolbar>
    </AppBar>
  );
}
