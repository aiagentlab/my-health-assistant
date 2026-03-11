'use client';
import Chip from '@mui/material/Chip';
import AccessTimeIcon from '@mui/icons-material/AccessTime';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import LocalHospitalIcon from '@mui/icons-material/LocalHospital';

interface UrgencyBadgeProps {
  urgency: '일반' | '조기방문권장' | '응급';
}

const URGENCY_CONFIG = {
  일반: { color: '#2E9E6B', bg: '#E6F7EE', icon: AccessTimeIcon, label: '일반 — 1-2주 내 방문 권장' },
  조기방문권장: { color: '#E8913A', bg: '#FFF3E6', icon: WarningAmberIcon, label: '조기방문 권장 — 3-7일 내 방문' },
  응급: { color: '#D64545', bg: '#FEF2F2', icon: LocalHospitalIcon, label: '응급 — 즉시 방문 필요' },
};

export default function UrgencyBadge({ urgency }: UrgencyBadgeProps) {
  const config = URGENCY_CONFIG[urgency] || URGENCY_CONFIG['일반'];
  const Icon = config.icon;

  return (
    <Chip
      icon={<Icon sx={{ fontSize: '16px !important', color: `${config.color} !important` }} />}
      label={config.label}
      sx={{
        bgcolor: config.bg,
        color: config.color,
        fontWeight: 600,
        fontSize: '0.75rem',
        height: 28,
        borderRadius: 2,
      }}
    />
  );
}
