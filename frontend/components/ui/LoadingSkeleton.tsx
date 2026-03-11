'use client';
import Box from '@mui/material/Box';
import Skeleton from '@mui/material/Skeleton';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';

interface LoadingSkeletonProps {
  variant?: 'card' | 'list' | 'chat' | 'map';
  count?: number;
}

/**
 * 로딩 스켈레톤 — card/list/chat/map 변형
 */
export default function LoadingSkeleton({ variant = 'card', count = 3 }: LoadingSkeletonProps) {
  if (variant === 'chat') {
    return (
      <Box sx={{ p: 2, display: 'flex', flexDirection: 'column', gap: 2 }}>
        {Array.from({ length: count }).map((_, i) => (
          <Box key={i} sx={{ display: 'flex', justifyContent: i % 2 === 0 ? 'flex-start' : 'flex-end' }}>
            <Skeleton
              variant="rounded"
              width={i % 2 === 0 ? '70%' : '55%'}
              height={56}
              sx={{ borderRadius: i % 2 === 0 ? '4px 16px 16px 16px' : '16px 4px 16px 16px' }}
            />
          </Box>
        ))}
      </Box>
    );
  }

  if (variant === 'map') {
    return (
      <Skeleton
        variant="rounded"
        width="100%"
        height={120}
        sx={{ borderRadius: 2 }}
      />
    );
  }

  if (variant === 'list') {
    return (
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
        {Array.from({ length: count }).map((_, i) => (
          <Box key={i} sx={{ display: 'flex', alignItems: 'center', gap: 1.5, p: 1 }}>
            <Skeleton variant="circular" width={40} height={40} />
            <Box sx={{ flex: 1 }}>
              <Skeleton variant="text" width="60%" />
              <Skeleton variant="text" width="80%" />
            </Box>
          </Box>
        ))}
      </Box>
    );
  }

  // Default: card
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      {Array.from({ length: count }).map((_, i) => (
        <Card key={i} sx={{ borderRadius: 3 }}>
          <CardContent>
            <Box sx={{ display: 'flex', gap: 1.5, mb: 1.5 }}>
              <Skeleton variant="rounded" width={48} height={48} sx={{ borderRadius: 2, flexShrink: 0 }} />
              <Box sx={{ flex: 1 }}>
                <Skeleton variant="text" width="50%" height={20} />
                <Skeleton variant="text" width="30%" height={16} />
              </Box>
            </Box>
            <Skeleton variant="text" width="90%" />
            <Skeleton variant="text" width="75%" />
          </CardContent>
        </Card>
      ))}
    </Box>
  );
}
