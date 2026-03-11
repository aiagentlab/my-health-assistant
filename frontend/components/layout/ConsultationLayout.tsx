'use client';
import { ReactNode } from 'react';
import Box from '@mui/material/Box';
import Container from '@mui/material/Container';

interface ConsultationLayoutProps {
  children: ReactNode;
}

/**
 * Mobile-first layout wrapper — max-width 480px centered
 * Screen design spec §1.3: 모바일 중심, max-width 480px 중앙 정렬
 */
export default function ConsultationLayout({ children }: ConsultationLayoutProps) {
  return (
    <Box
      sx={{
        minHeight: '100vh',
        bgcolor: '#F6F8FA',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <Container
        maxWidth={false}
        sx={{
          maxWidth: 480,
          px: { xs: 2, sm: 3 },
          py: 0,
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {children}
      </Container>
    </Box>
  );
}
