'use client';
import Box from '@mui/material/Box';
import Avatar from '@mui/material/Avatar';
import SmartToyOutlinedIcon from '@mui/icons-material/SmartToyOutlined';

/**
 * AI 타이핑 인디케이터 — 3개 점 애니메이션
 */
export default function TypingIndicator() {
  return (
    <Box sx={{ display: 'flex', gap: 1, mb: 1.5, alignItems: 'flex-end' }}>
      <Avatar sx={{ width: 32, height: 32, bgcolor: '#E8F5F1', flexShrink: 0 }}>
        <SmartToyOutlinedIcon sx={{ fontSize: 18, color: '#1B6B5A' }} />
      </Avatar>
      <Box
        sx={{
          bgcolor: 'white',
          border: '1px solid #E2E8EE',
          borderRadius: '4px 16px 16px 16px',
          px: 2,
          py: 1.5,
          display: 'flex',
          gap: 0.5,
          alignItems: 'center',
        }}
      >
        {[0, 1, 2].map(i => (
          <Box
            key={i}
            sx={{
              width: 6,
              height: 6,
              borderRadius: '50%',
              bgcolor: '#6B7D8E',
              animation: 'bounce 1.2s infinite',
              animationDelay: `${i * 0.2}s`,
              '@keyframes bounce': {
                '0%, 100%': { transform: 'translateY(0)' },
                '50%': { transform: 'translateY(-4px)' },
              },
            }}
          />
        ))}
      </Box>
    </Box>
  );
}
