'use client';
import Snackbar from '@mui/material/Snackbar';
import Alert from '@mui/material/Alert';
import type { ToastVariant } from '@/lib/toast/useToast';

interface ToastProps {
  open: boolean;
  message: string;
  variant: ToastVariant;
  onClose: () => void;
  duration?: number;
}

/**
 * 4가지 변형: success/info/warning/error
 */
export default function Toast({ open, message, variant, onClose, duration = 3000 }: ToastProps) {
  return (
    <Snackbar
      open={open}
      autoHideDuration={duration}
      onClose={onClose}
      anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      sx={{ bottom: { xs: 80, sm: 24 } }}
    >
      <Alert
        onClose={onClose}
        severity={variant}
        variant="filled"
        sx={{
          width: '100%',
          borderRadius: 2,
          fontWeight: 500,
        }}
      >
        {message}
      </Alert>
    </Snackbar>
  );
}
