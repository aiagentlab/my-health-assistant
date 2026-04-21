'use client';
import { useRouter } from 'next/navigation';
import Fab from '@mui/material/Fab';
import HomeIcon from '@mui/icons-material/Home';
import { ConsultationProvider } from '@/lib/consultation/ConsultationContext';

export default function ConsultationLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();

  const handleHome = () => {
    sessionStorage.removeItem('health_session_id');
    sessionStorage.removeItem('diagnosis_result');
    sessionStorage.removeItem('selected_hospital');
    sessionStorage.removeItem('search_dept_code');
    sessionStorage.removeItem('search_dept_name');
    sessionStorage.removeItem('user_location');
    sessionStorage.removeItem('search_address');
    router.push('/consultation/onboarding');
  };

  return (
    <ConsultationProvider>
      {children}
      <Fab
        size="small"
        onClick={handleHome}
        sx={{
          position: 'fixed',
          bottom: 24,
          right: 24,
          bgcolor: '#1B6B5A',
          color: 'white',
          '&:hover': { bgcolor: '#155548' },
          boxShadow: '0 4px 12px rgba(27, 107, 90, 0.4)',
          zIndex: 1000,
        }}
      >
        <HomeIcon fontSize="small" />
      </Fab>
    </ConsultationProvider>
  );
}
