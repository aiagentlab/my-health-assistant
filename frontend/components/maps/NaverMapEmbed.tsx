'use client';
import { useEffect, useRef, useState } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';

interface NaverMapEmbedProps {
  lat: number;
  lng: number;
  name: string;
  zoom?: number;
}

type NaverMapsSDK = {
  LatLng: new (lat: number, lng: number) => unknown;
  Map: new (element: HTMLElement, options: Record<string, unknown>) => unknown;
  Marker: new (options: Record<string, unknown>) => unknown;
};

type NaverWindow = Window & {
  naver?: {
    maps?: NaverMapsSDK;
  };
};

function initMap(container: HTMLDivElement, lat: number, lng: number, name: string, zoom: number) {
  const maps = (window as NaverWindow).naver?.maps;
  if (!maps) return;
  const position = new maps.LatLng(lat, lng);
  const map = new maps.Map(container, {
    center: position,
    zoom,
    zoomControl: false,
    mapDataControl: false,
  });
  new maps.Marker({
    position,
    map,
    title: name,
    icon: {
      content: `<div style="background:#1B6B5A;color:white;border-radius:8px;padding:4px 8px;font-size:12px;font-weight:700;white-space:nowrap;box-shadow:0 2px 8px rgba(0,0,0,0.3);">🏥 ${name}</div>`,
    },
  });
}

export default function NaverMapEmbed({ lat, lng, name, zoom = 16 }: NaverMapEmbedProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(
    () => typeof window !== 'undefined' && Boolean((window as NaverWindow).naver?.maps)
  );

  // 네이버 지도 스크립트 로드 완료 대기
  useEffect(() => {
    if (ready) return;
    const interval = setInterval(() => {
      if ((window as NaverWindow).naver?.maps) {
        setReady(true);
        clearInterval(interval);
      }
    }, 100);
    return () => clearInterval(interval);
  }, [ready]);

  // 지도 초기화 (ready + DOM 마운트 이후)
  useEffect(() => {
    if (!ready || !mapRef.current) return;
    initMap(mapRef.current, lat, lng, name, zoom);
  }, [ready, lat, lng, name, zoom]);

  return (
    <Box sx={{ width: '100%', height: 200, bgcolor: '#E8F5F1', overflow: 'hidden' }}>
      {!ready ? (
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
          <Typography variant="caption" color="text.secondary">지도를 불러오는 중...</Typography>
        </Box>
      ) : (
        <div ref={mapRef} style={{ height: '100%', width: '100%' }} />
      )}
    </Box>
  );
}
