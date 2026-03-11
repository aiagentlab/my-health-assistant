'use client';
import Dialog from '@mui/material/Dialog';
import DialogContent from '@mui/material/DialogContent';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import LocalHospitalIcon from '@mui/icons-material/LocalHospital';
import PhoneIcon from '@mui/icons-material/Phone';

interface EmergencyModalProps {
  open: boolean;
  keywords?: string[];
  onCall119: () => void;
  onContinue: () => void;
}

/**
 * 응급 증상 감지 시 표시되는 모달
 * LangGraph emergency_flag=true 상태에서 Next.js가 표시
 * 화면설계서: 119 전화 버튼 + 상담 계속하기 옵션
 */
export default function EmergencyModal({ open, keywords, onCall119, onContinue }: EmergencyModalProps) {
  return (
    <Dialog
      open={open}
      maxWidth="xs"
      fullWidth
      PaperProps={{
        sx: { borderRadius: 3, mx: 2 }
      }}
    >
      <DialogContent sx={{ p: 3, textAlign: 'center' }}>
        <Box
          sx={{
            width: 64,
            height: 64,
            borderRadius: '50%',
            bgcolor: '#FEF2F2',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            mx: 'auto',
            mb: 2,
          }}
        >
          <LocalHospitalIcon sx={{ fontSize: 32, color: '#D64545' }} />
        </Box>

        <Typography variant="h3" fontWeight={700} color="#D64545" sx={{ mb: 1 }}>
          응급 증상 감지
        </Typography>

        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          입력하신 증상 중 응급 상황이 의심됩니다.
          즉시 119에 연락하거나 응급실을 방문하세요.
        </Typography>

        {keywords && keywords.length > 0 && (
          <Box sx={{
            bgcolor: '#FEF2F2',
            borderRadius: 2,
            p: 1.5,
            mb: 2,
            display: 'flex',
            flexWrap: 'wrap',
            gap: 0.5,
            justifyContent: 'center'
          }}>
            {keywords.map(kw => (
              <Box
                key={kw}
                component="span"
                sx={{
                  px: 1,
                  py: 0.25,
                  bgcolor: '#D64545',
                  color: 'white',
                  borderRadius: 1,
                  fontSize: '0.75rem',
                  fontWeight: 600,
                }}
              >
                {kw}
              </Box>
            ))}
          </Box>
        )}

        <Button
          variant="contained"
          fullWidth
          size="large"
          startIcon={<PhoneIcon />}
          onClick={onCall119}
          href="tel:119"
          component="a"
          sx={{
            bgcolor: '#D64545',
            mb: 1.5,
            '&:hover': { bgcolor: '#b93a3a' },
            minHeight: 52,
          }}
        >
          119 응급신고
        </Button>

        <Button
          variant="outlined"
          fullWidth
          onClick={onContinue}
          sx={{
            borderColor: '#E2E8EE',
            color: '#6B7D8E',
            minHeight: 48,
          }}
        >
          일반 증상으로 상담 계속
        </Button>
      </DialogContent>
    </Dialog>
  );
}
