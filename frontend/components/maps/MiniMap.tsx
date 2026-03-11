'use client';
import { useEffect, useRef } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import type { HospitalInfo } from '@/lib/api/types';

interface MiniMapProps {
  hospitals: HospitalInfo[];
  userLocation?: { lat: number; lng: number } | null;
}

declare global {
  interface Window {
    naver: any;
  }
}

/**
 * Naver Maps mini map showing hospital markers
 * Loaded via next/script in layout — SSR safe
 */
export default function MiniMap({ hospitals, userLocation }: MiniMapProps) {
  const mapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!mapRef.current || !window.naver || hospitals.length === 0) return;

    const center = userLocation
      ? new window.naver.maps.LatLng(userLocation.lat, userLocation.lng)
      : new window.naver.maps.LatLng(hospitals[0].lat, hospitals[0].lng);

    const map = new window.naver.maps.Map(mapRef.current, {
      center,
      zoom: 15,
      zoomControl: false,
      mapDataControl: false,
    });

    // Hospital markers ❶❷❸
    hospitals.slice(0, 3).forEach((hosp, i) => {
      new window.naver.maps.Marker({
        position: new window.naver.maps.LatLng(hosp.lat, hosp.lng),
        map,
        icon: {
          content: `<div style="background:#1B6B5A;color:white;border-radius:50%;width:28px;height:28px;display:flex;align-items:center;justify-content:center;font-size:14px;font-weight:700;box-shadow:0 2px 4px rgba(0,0,0,0.3);">${i + 1}</div>`,
          anchor: new window.naver.maps.Point(14, 14),
        },
      });
    });

    // User location marker
    if (userLocation) {
      new window.naver.maps.Marker({
        position: center,
        map,
        icon: {
          content: '<div style="width:12px;height:12px;border-radius:50%;background:#1B6B5A;border:2px solid white;box-shadow:0 0 0 3px rgba(27,107,90,0.3);"></div>',
          anchor: new window.naver.maps.Point(6, 6),
        },
      });
    }
  }, [hospitals, userLocation]);

  return (
    <Box sx={{ borderRadius: 3, overflow: 'hidden', border: '1px solid #E2E8EE', mb: 2 }}>
      {typeof window !== 'undefined' && window.naver ? (
        <div ref={mapRef} style={{ height: 120, width: '100%' }} />
      ) : (
        <Box
          sx={{
            height: 120,
            bgcolor: '#E8F5F1',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Typography variant="caption" color="text.secondary">지도 로딩 중...</Typography>
        </Box>
      )}
    </Box>
  );
}
