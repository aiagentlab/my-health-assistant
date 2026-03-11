'use client';
import { useEffect, useRef, useState } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import type { HospitalInfo } from '@/lib/api/types';

interface MiniMapProps {
  hospitals: HospitalInfo[];
  userLocation?: { lat: number; lng: number } | null;
}

declare global {
  interface Window { naver: any; }
}

export default function MiniMap({ hospitals, userLocation }: MiniMapProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);

  // 네이버 지도 스크립트 로드 완료 대기
  useEffect(() => {
    if (window.naver?.maps) { setReady(true); return; }
    const interval = setInterval(() => {
      if (window.naver?.maps) { setReady(true); clearInterval(interval); }
    }, 100);
    return () => clearInterval(interval);
  }, []);

  // 지도 초기화
  useEffect(() => {
    if (!ready || !mapRef.current || hospitals.length === 0) return;

    const center = userLocation
      ? new window.naver.maps.LatLng(userLocation.lat, userLocation.lng)
      : new window.naver.maps.LatLng(hospitals[0].lat, hospitals[0].lng);

    const map = new window.naver.maps.Map(mapRef.current, {
      center,
      zoom: 15,
      zoomControl: false,
      mapDataControl: false,
    });

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
  }, [ready, hospitals, userLocation]);

  return (
    <Box sx={{ borderRadius: 3, overflow: 'hidden', border: '1px solid #E2E8EE', mb: 2 }}>
      {!ready ? (
        <Box sx={{ height: 120, bgcolor: '#E8F5F1', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Typography variant="caption" color="text.secondary">지도 로딩 중...</Typography>
        </Box>
      ) : (
        <div ref={mapRef} style={{ height: 120, width: '100%' }} />
      )}
    </Box>
  );
}
