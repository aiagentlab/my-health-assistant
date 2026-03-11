'use client';
import Box from '@mui/material/Box';
import Chip from '@mui/material/Chip';

interface QuickReplyProps {
  options: string[];
  onSelect: (option: string) => void;
  disabled?: boolean;
}

export default function QuickReply({ options, onSelect, disabled }: QuickReplyProps) {
  if (!options.length) return null;

  return (
    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, mb: 2, px: 0.5 }}>
      {options.map(option => (
        <Chip
          key={option}
          label={option}
          onClick={() => !disabled && onSelect(option)}
          disabled={disabled}
          sx={{
            bgcolor: '#E8F5F1',
            color: '#1B6B5A',
            fontWeight: 600,
            border: '1px solid #1B6B5A',
            '&:hover': { bgcolor: '#d0ede5' },
            cursor: disabled ? 'not-allowed' : 'pointer',
          }}
        />
      ))}
    </Box>
  );
}
