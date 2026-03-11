'use client';
import { createTheme } from '@mui/material/styles';

// 화면설계서 §1.4 디자인 토큰
export const theme = createTheme({
  palette: {
    primary: {
      main: '#1B6B5A',
      light: '#E8F5F1',
      contrastText: '#FFFFFF',
    },
    secondary: {
      main: '#E8913A',
    },
    error: {
      main: '#D64545',
    },
    success: {
      main: '#2E9E6B',
    },
    text: {
      primary: '#1A2B3C',
      secondary: '#6B7D8E',
    },
    background: {
      default: '#F6F8FA',
      paper: '#FFFFFF',
    },
    divider: '#E2E8EE',
  },
  typography: {
    fontFamily: '"Pretendard", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    h1: { fontSize: '1.75rem', fontWeight: 700 },
    h2: { fontSize: '1.5rem', fontWeight: 700 },
    h3: { fontSize: '1.25rem', fontWeight: 600 },
    body1: { fontSize: '1rem', lineHeight: 1.6 },
    body2: { fontSize: '0.875rem', lineHeight: 1.5 },
  },
  shape: {
    borderRadius: 12,
  },
  components: {
    MuiButton: {
      styleOverrides: {
        root: {
          textTransform: 'none',
          fontWeight: 600,
          minHeight: 48,
          borderRadius: 12,
        },
        contained: {
          boxShadow: 'none',
          '&:hover': { boxShadow: 'none' },
        },
      },
    },
    MuiCard: {
      styleOverrides: {
        root: {
          boxShadow: '0 1px 4px rgba(0,0,0,0.08)',
          borderRadius: 16,
          border: '1px solid #E2E8EE',
        },
      },
    },
  },
});
