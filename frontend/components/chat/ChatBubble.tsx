'use client';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Avatar from '@mui/material/Avatar';
import SmartToyOutlinedIcon from '@mui/icons-material/SmartToyOutlined';

interface ChatBubbleProps {
  role: 'human' | 'ai';
  content: string;
  timestamp?: Date;
}

export default function ChatBubble({ role, content, timestamp }: ChatBubbleProps) {
  const isAI = role === 'ai';

  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: isAI ? 'row' : 'row-reverse',
        gap: 1,
        mb: 1.5,
        alignItems: 'flex-end',
      }}
    >
      {isAI && (
        <Avatar
          sx={{
            width: 32,
            height: 32,
            bgcolor: '#E8F5F1',
            flexShrink: 0,
            mb: 0.5,
          }}
        >
          <SmartToyOutlinedIcon sx={{ fontSize: 18, color: '#1B6B5A' }} />
        </Avatar>
      )}

      <Box sx={{ maxWidth: '75%' }}>
        <Box
          sx={{
            bgcolor: isAI ? 'white' : '#1B6B5A',
            color: isAI ? '#1A2B3C' : 'white',
            borderRadius: isAI ? '4px 16px 16px 16px' : '16px 4px 16px 16px',
            px: 2,
            py: 1.25,
            border: isAI ? '1px solid #E2E8EE' : 'none',
            boxShadow: isAI ? '0 1px 3px rgba(0,0,0,0.06)' : 'none',
          }}
        >
          <Typography variant="body2" sx={{ lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>
            {content}
          </Typography>
        </Box>
        {timestamp && (
          <Typography
            variant="caption"
            color="text.secondary"
            sx={{ display: 'block', mt: 0.25, textAlign: isAI ? 'left' : 'right', px: 0.5 }}
          >
            {timestamp.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}
          </Typography>
        )}
      </Box>
    </Box>
  );
}
