'use client';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import Button from '@mui/material/Button';
import Typography from '@mui/material/Typography';

interface ExitConfirmModalProps {
  open: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export default function ExitConfirmModal({ open, onConfirm, onCancel }: ExitConfirmModalProps) {
  return (
    <Dialog
      open={open}
      maxWidth="xs"
      fullWidth
      PaperProps={{ sx: { borderRadius: 3, mx: 2 } }}
    >
      <DialogTitle sx={{ fontWeight: 700, pb: 1 }}>상담을 종료할까요?</DialogTitle>
      <DialogContent>
        <Typography variant="body2" color="text.secondary">
          현재까지의 상담 내용은 저장되지 않습니다.
          처음부터 다시 상담을 시작해야 합니다.
        </Typography>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2.5, gap: 1 }}>
        <Button
          onClick={onCancel}
          variant="outlined"
          fullWidth
          sx={{ borderColor: '#E2E8EE', color: '#6B7D8E' }}
        >
          계속하기
        </Button>
        <Button
          onClick={onConfirm}
          variant="contained"
          fullWidth
          sx={{ bgcolor: '#D64545', '&:hover': { bgcolor: '#b93a3a' } }}
        >
          종료하기
        </Button>
      </DialogActions>
    </Dialog>
  );
}
