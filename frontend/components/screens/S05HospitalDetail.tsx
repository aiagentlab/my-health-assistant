'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import CircularProgress from '@mui/material/CircularProgress';
import Skeleton from '@mui/material/Skeleton';
import PhoneIcon from '@mui/icons-material/Phone';
import DirectionsWalkIcon from '@mui/icons-material/DirectionsWalk';
import DirectionsBusIcon from '@mui/icons-material/DirectionsBus';
import DriveEtaIcon from '@mui/icons-material/DriveEta';
import AccessTimeIcon from '@mui/icons-material/AccessTime';
import LocationOnIcon from '@mui/icons-material/LocationOn';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import StarIcon from '@mui/icons-material/Star';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';

import ConsultationAppBar from '@/components/ui/ConsultationAppBar';
import ProgressBar from '@/components/ui/ProgressBar';
import NaverMapEmbed from '@/components/maps/NaverMapEmbed';
import type { HospitalInfo } from '@/lib/api/types';
import { getHospitalDirections } from '@/lib/api/consultation';
import { useClerkToken } from '@/lib/auth/useClerkToken';

interface S05Props {
  hospitalId: string;
}

type Directions = {
  walking_min: number | null;
  transit_min: number | null;
  driving_min: number | null;
};

export default function S05HospitalDetailScreen({ hospitalId }: S05Props) {
  const router = useRouter();
  const { getAuthToken } = useClerkToken();
  const [hospital, setHospital] = useState<HospitalInfo | null>(null);
  const [directions, setDirections] = useState<Directions | null>(null);
  const [directionsLoading, setDirectionsLoading] = useState(false);

  // 1단계: sessionStorage에서 병원 정보 로드
  useEffect(() => {
    const stored = sessionStorage.getItem('selected_hospital');
    if (stored) {
      setHospital(JSON.parse(stored));
    }
  }, [hospitalId]);

  // 2단계: 병원 정보 로드 후 길찾기 API 호출
  useEffect(() => {
    if (!hospital) return;

    const fetchDirections = async () => {
      setDirectionsLoading(true);

      // S04에서 저장한 사용자 위치 읽기
      const userLocRaw = sessionStorage.getItem('user_location');

      if (!userLocRaw) {
        // 사용자 위치 없으면 거리 기반 추정값 사용
        const dist = hospital.distance_m || 500;
        setDirections({
          walking_min: Math.max(1, Math.round(dist / 67)),
          transit_min: dist <= 1000 ? Math.max(1, Math.round(dist / 67)) : Math.max(1, Math.round(dist / 300) + 5),
          driving_min: Math.max(1, Math.round(dist / 500)),
        });
        setDirectionsLoading(false);
        return;
      }

      const userLoc = JSON.parse(userLocRaw) as { lat: number; lng: number };

      try {
        const token = await getAuthToken() ?? undefined;
        const result = await getHospitalDirections(
          hospital.id,
          userLoc.lat,
          userLoc.lng,
          hospital.lat,
          hospital.lng,
          token
        );
        setDirections(result);
      } catch {
        // API 실패 시 거리 기반 추정값 fallback
        const dist = hospital.distance_m || 500;
        setDirections({
          walking_min: Math.max(1, Math.round(dist / 67)),
          transit_min: dist <= 1000 ? Math.max(1, Math.round(dist / 67)) : Math.max(1, Math.round(dist / 300) + 5),
          driving_min: Math.max(1, Math.round(dist / 500)),
        });
      } finally {
        setDirectionsLoading(false);
      }
    };

    fetchDirections();
  }, [hospital]);

  if (!hospital) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
        <CircularProgress sx={{ color: '#1B6B5A' }} />
      </Box>
    );
  }

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', minHeight: '100vh', bgcolor: '#F6F8FA', maxWidth: 480, mx: 'auto' }}>
      <ConsultationAppBar title="병원 상세 정보" currentStep={5} totalSteps={6} />
      <ProgressBar current={5} total={6} />

      {/* Hospital Header */}
      <Box sx={{ bgcolor: 'white', px: 2, py: 2.5, borderBottom: '1px solid #E2E8EE' }}>
        <Box sx={{ display: 'flex', gap: 1, mb: 0.75 }}>
          {hospital.departments.map(dept => (
            <Chip key={dept} label={dept} size="small" sx={{ bgcolor: '#E8F5F1', color: '#1B6B5A', fontWeight: 600 }} />
          ))}
          {hospital.hospital_type && (
            <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600 }}>
              {hospital.hospital_type}
            </Typography>
          )}
        </Box>
        <Typography variant="h2" fontWeight={700} sx={{ mb: 0.25 }}>{hospital.name}</Typography>
        {hospital.rating && (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
            <StarIcon sx={{ fontSize: 16, color: '#E8913A' }} />
            <Typography variant="body2" fontWeight={600}>{hospital.rating}</Typography>
            <Typography variant="caption" color="text.secondary">/ 5.0</Typography>
          </Box>
        )}
      </Box>

      {/* Map */}
      <NaverMapEmbed lat={hospital.lat} lng={hospital.lng} name={hospital.name} />

      {/* Directions */}
      <Box sx={{ bgcolor: 'white', px: 2, py: 2, borderBottom: '1px solid #E2E8EE' }}>
        <Typography variant="body2" fontWeight={600}>예상 소요 시간</Typography>
        <Typography variant="caption" color="text.secondary" sx={{ mb: 1.5, display: 'block' }}>
          {(() => {
            const loc = typeof window !== 'undefined' ? sessionStorage.getItem('user_location') : null;
            const addr = typeof window !== 'undefined' ? sessionStorage.getItem('search_address') : null;
            return addr ? `${addr}에서 출발` : loc ? '검색 위치에서 출발' : '';
          })()}
        </Typography>
        <Box sx={{ display: 'flex', gap: 1.5 }}>
          {directionsLoading
            ? [0, 1, 2].map(i => (
                <Skeleton key={i} variant="rounded" sx={{ flex: 1, height: 72, borderRadius: 2 }} />
              ))
            : [
                { icon: DirectionsWalkIcon, label: '도보', min: directions?.walking_min ?? null, color: '#1B6B5A' },
                { icon: DirectionsBusIcon, label: '대중교통', min: directions?.transit_min ?? null, color: '#2E9E6B' },
                { icon: DriveEtaIcon, label: '자가용', min: directions?.driving_min ?? null, color: '#E8913A' },
              ].map(({ icon: Icon, label, min, color }) => (
                <Box
                  key={label}
                  sx={{ flex: 1, bgcolor: '#F6F8FA', borderRadius: 2, p: 1.5, textAlign: 'center', border: '1px solid #E2E8EE' }}
                >
                  <Icon sx={{ fontSize: 20, color, mb: 0.25 }} />
                  <Typography variant="caption" display="block" color="text.secondary">{label}</Typography>
                  <Typography variant="body2" fontWeight={700}>
                    {min != null ? `${min}분` : '-'}
                  </Typography>
                </Box>
              ))}
        </Box>
      </Box>

      {/* Info Card */}
      <Box sx={{ bgcolor: 'white', px: 2, py: 2, mx: 2, my: 2, borderRadius: 3, border: '1px solid #E2E8EE' }}>
        {[
          { icon: LocationOnIcon, label: '주소', value: hospital.address },
          { icon: PhoneIcon, label: '전화', value: hospital.phone },
          { icon: AccessTimeIcon, label: '진료시간', value: hospital.operating_hours },
        ].map(({ icon: Icon, label, value }) => (
          <Box key={label} sx={{ display: 'flex', gap: 1.5, py: 1, borderBottom: '1px solid #F6F8FA' }}>
            <Icon sx={{ fontSize: 18, color: '#6B7D8E', flexShrink: 0, mt: 0.25 }} />
            <Box>
              <Typography variant="caption" color="text.secondary" display="block">{label}</Typography>
              <Typography variant="body2">{value}</Typography>
            </Box>
          </Box>
        ))}
      </Box>

      {/* Action Buttons */}
      <Box sx={{ px: 2, pb: 3, display: 'flex', flexDirection: 'column', gap: 1.5 }}>
        <Button
          variant="contained"
          fullWidth
          size="large"
          startIcon={<PhoneIcon />}
          href={`tel:${hospital.phone}`}
          component="a"
          sx={{ minHeight: 52, borderRadius: 3, bgcolor: '#1B6B5A', fontWeight: 700, boxShadow: 'none' }}
        >
          {hospital.phone} 전화하기
        </Button>

        <Button
          variant="outlined"
          fullWidth
          startIcon={<OpenInNewIcon />}
          href={`https://map.naver.com/v5/search/${encodeURIComponent(hospital.name)}`}
          target="_blank"
          rel="noopener noreferrer"
          component="a"
          sx={{ borderColor: '#E2E8EE', color: '#6B7D8E', borderRadius: 3 }}
        >
          네이버 지도에서 보기
        </Button>

        <Button
          variant="contained"
          fullWidth
          onClick={() => router.push('/consultation/summary')}
          sx={{ minHeight: 52, borderRadius: 3, fontWeight: 700, boxShadow: 'none' }}
        >
          상담 요약 보기
        </Button>
      </Box>
    </Box>
  );
}
