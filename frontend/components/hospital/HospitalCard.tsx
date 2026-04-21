'use client';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Chip from '@mui/material/Chip';
import StarIcon from '@mui/icons-material/Star';
import DirectionsWalkIcon from '@mui/icons-material/DirectionsWalk';
import type { HospitalInfo } from '@/lib/api/types';

interface HospitalCardProps {
  hospital: HospitalInfo;
  rank?: number;
  onClick?: () => void;
}

function formatDistance(meters: number): string {
  if (meters < 1000) return `${meters}m`;
  return `${(meters / 1000).toFixed(1)}km`;
}

export default function HospitalCard({ hospital, rank, onClick }: HospitalCardProps) {
  return (
    <Box
      onClick={onClick}
      sx={{
        bgcolor: 'white',
        borderRadius: 3,
        p: 2,
        border: '1px solid #E2E8EE',
        cursor: onClick ? 'pointer' : 'default',
        transition: 'border-color 0.15s',
        '&:hover': onClick ? { borderColor: '#1B6B5A' } : {},
      }}
    >
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 1 }}>
        <Box sx={{ flex: 1 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, mb: 0.25 }}>
            {rank && (
              <Box
                sx={{
                  width: 22,
                  height: 22,
                  borderRadius: '50%',
                  bgcolor: rank === 1 ? '#1B6B5A' : rank === 2 ? '#2E9E6B' : '#6B7D8E',
                  color: 'white',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '0.7rem',
                  fontWeight: 700,
                  flexShrink: 0,
                }}
              >
                {rank}
              </Box>
            )}
            <Typography variant="body1" fontWeight={700}>{hospital.name}</Typography>
          </Box>
          <Typography variant="caption" color="text.secondary">{hospital.address}</Typography>
        </Box>
        {hospital.hospital_type && (
          <Typography variant="caption" color="text.secondary" sx={{ ml: 1, flexShrink: 0 }}>
            {hospital.hospital_type}
          </Typography>
        )}
      </Box>

      <Box sx={{ display: 'flex', gap: 2 }}>
        {hospital.rating && (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.25 }}>
            <StarIcon sx={{ fontSize: 14, color: '#E8913A' }} />
            <Typography variant="caption" fontWeight={600}>{hospital.rating}</Typography>
          </Box>
        )}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.25 }}>
          <DirectionsWalkIcon sx={{ fontSize: 14, color: '#6B7D8E' }} />
          <Typography variant="caption" color="text.secondary">{formatDistance(hospital.distance_m)}</Typography>
        </Box>
      </Box>
    </Box>
  );
}
