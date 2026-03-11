'use client';
import Box from '@mui/material/Box';
import Slider from '@mui/material/Slider';
import Typography from '@mui/material/Typography';

interface SeveritySliderProps {
  value: number;
  onChange: (value: number) => void;
  onSubmit: (value: number) => void;
  disabled?: boolean;
}

const SEVERITY_LABELS: Record<number, string> = {
  1: '전혀 불편하지 않음',
  3: '약간 불편함',
  5: '보통',
  7: '많이 불편함',
  10: '매우 심각함',
};

export default function SeveritySlider({ value, onChange, onSubmit, disabled }: SeveritySliderProps) {
  return (
    <Box sx={{ px: 2, py: 2, bgcolor: 'white', borderRadius: 3, border: '1px solid #E2E8EE', mb: 2 }}>
      <Typography variant="body2" fontWeight={600} sx={{ mb: 1 }}>
        불편한 정도: <Typography component="span" color="primary" fontWeight={700}>{value}/10</Typography>
      </Typography>
      <Slider
        value={value}
        onChange={(_, v) => onChange(v as number)}
        onChangeCommitted={(_, v) => onSubmit(v as number)}
        min={1}
        max={10}
        step={1}
        marks
        disabled={disabled}
        sx={{
          color: '#1B6B5A',
          '& .MuiSlider-thumb': { width: 20, height: 20 },
          '& .MuiSlider-mark': { bgcolor: '#E2E8EE' },
        }}
      />
      <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
        <Typography variant="caption" color="text.secondary">1 (가벼움)</Typography>
        <Typography variant="caption" color="text.secondary">10 (매우 심함)</Typography>
      </Box>
      {SEVERITY_LABELS[value] && (
        <Typography variant="caption" color="primary" fontWeight={600} sx={{ display: 'block', textAlign: 'center', mt: 0.5 }}>
          {SEVERITY_LABELS[value]}
        </Typography>
      )}
    </Box>
  );
}
