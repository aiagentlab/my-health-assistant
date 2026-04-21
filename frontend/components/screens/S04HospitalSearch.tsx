'use client';
import { useState, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import TextField from '@mui/material/TextField';
import InputAdornment from '@mui/material/InputAdornment';
import Select from '@mui/material/Select';
import MenuItem from '@mui/material/MenuItem';
import FormControl from '@mui/material/FormControl';
import CircularProgress from '@mui/material/CircularProgress';
import Alert from '@mui/material/Alert';
import Paper from '@mui/material/Paper';
import List from '@mui/material/List';
import ListItemButton from '@mui/material/ListItemButton';
import ListItemText from '@mui/material/ListItemText';
import LocationOnIcon from '@mui/icons-material/LocationOn';
import GpsFixedIcon from '@mui/icons-material/GpsFixed';
import SearchIcon from '@mui/icons-material/Search';
import SortIcon from '@mui/icons-material/Sort';

interface SuggestItem {
  name: string;
  address: string;
  lat: number;
  lng: number;
}

import ConsultationAppBar from '@/components/ui/ConsultationAppBar';
import ProgressBar from '@/components/ui/ProgressBar';
import HospitalCard from '@/components/hospital/HospitalCard';
import MiniMap from '@/components/maps/MiniMap';
import Toast from '@/components/ui/Toast';
import type { HospitalInfo } from '@/lib/api/types';
import { useToast } from '@/lib/toast/useToast';
import { searchHospitals, geocodeAddress, searchPlaces } from '@/lib/api/consultation';
import { useClerkToken } from '@/lib/auth/useClerkToken';

type SortOption = 'distance' | 'rating' | 'name';

// 반경 자동 확대 단계 (미터)
const RADIUS_STEPS = [1000, 3000, 5000];

export default function S04HospitalSearchScreen() {
  const router = useRouter();
  const [hospitals, setHospitals] = useState<HospitalInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [addressInput, setAddressInput] = useState('');
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [sortBy, setSortBy] = useState<SortOption>('distance');
  const [searched, setSearched] = useState(false);
  const { getAuthToken } = useClerkToken();
  const { toast, showToast, hideToast } = useToast();
  const [suggestions, setSuggestions] = useState<SuggestItem[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const debounceRef = useRef<NodeJS.Timeout | null>(null);

  const deptCode =
    typeof window !== 'undefined' ? sessionStorage.getItem('search_dept_code') || 'D004' : 'D004';
  const deptName =
    typeof window !== 'undefined' ? sessionStorage.getItem('search_dept_name') || '신경과' : '신경과';

  // 네이버 지역 검색 API로 장소 자동완성
  const searchSuggestions = useCallback(async (query: string) => {
    if (!query.trim() || query.trim().length < 2) {
      setSuggestions([]);
      setShowSuggestions(false);
      return;
    }

    try {
      const token = await getAuthToken() ?? undefined;
      const result = await searchPlaces(query, token);
      const items: SuggestItem[] = result.places.map((p) => ({
        name: p.name,
        address: p.address,
        lat: p.lat,
        lng: p.lng,
      }));
      setSuggestions(items);
      setShowSuggestions(items.length > 0);
    } catch {
      setSuggestions([]);
      setShowSuggestions(false);
    }
  }, [getAuthToken]);

  const handleInputChange = (value: string) => {
    setAddressInput(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (value.trim().length >= 2) {
      debounceRef.current = setTimeout(() => searchSuggestions(value), 300);
    } else {
      setSuggestions([]);
      setShowSuggestions(false);
    }
  };

  const handleSelectSuggestion = (item: SuggestItem) => {
    const displayName = item.address || item.name;
    setAddressInput(displayName);
    setShowSuggestions(false);
    setSuggestions([]);
    sessionStorage.setItem('search_address', item.name);
    const loc = { lat: item.lat, lng: item.lng };
    setUserLocation(loc);
    performSearch(loc);
  };

  /**
   * 위치 기반 병원 검색 — 반경 자동 확대 (1km → 3km → 5km)
   */
  const performSearch = async (location: { lat: number; lng: number }) => {
    setLoading(true);
    // S05에서 길찾기 API 호출 시 사용
    sessionStorage.setItem('user_location', JSON.stringify(location));
    const token = await getAuthToken() ?? undefined;

    let found: HospitalInfo[] = [];
    let usedRadius = RADIUS_STEPS[0];

    for (const radius of RADIUS_STEPS) {
      try {
        const result = await searchHospitals(deptCode, location.lat, location.lng, radius, token);
        if (result.hospitals.length > 0) {
          found = result.hospitals;
          usedRadius = radius;
          break;
        }
      } catch {
        // 이 반경에서 실패 → 다음 반경 시도
      }
    }

    if (found.length === 0) {
      showToast(`반경 ${RADIUS_STEPS[RADIUS_STEPS.length - 1] / 1000}km 내 ${deptName} 병원이 없습니다.`, 'warning');
    } else if (usedRadius > RADIUS_STEPS[0]) {
      showToast(`검색 반경을 ${usedRadius / 1000}km로 확대했습니다.`, 'info');
    }

    setHospitals(found);
    setSearched(true);
    setLoading(false);
  };

  const handleGPSSearch = () => {
    if (!navigator.geolocation) {
      showToast('GPS를 사용할 수 없습니다.', 'warning');
      return;
    }
    setLoading(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const loc = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        setUserLocation(loc);
        sessionStorage.setItem('search_address', '현재 위치');
        performSearch(loc);
      },
      () => {
        showToast('위치 정보를 가져올 수 없습니다. 주소를 직접 입력해주세요.', 'warning');
        setLoading(false);
      }
    );
  };

  /**
   * 주소 텍스트 → Naver Geocoding API → 좌표 → 병원 검색
   */
  const handleAddressSearch = async () => {
    if (!addressInput.trim()) return;
    setLoading(true);
    setShowSuggestions(false);
    const token = await getAuthToken() ?? undefined;

    // 1. 먼저 장소 검색 API 시도 (장소명 지원: "신정역", "강남역" 등)
    try {
      const placesResult = await searchPlaces(addressInput.trim(), token);
      if (placesResult.places.length > 0) {
        const place = placesResult.places[0];
        setAddressInput(place.address || place.name);
        sessionStorage.setItem('search_address', place.name);
        const loc = { lat: place.lat, lng: place.lng };
        setUserLocation(loc);
        await performSearch(loc);
        return;
      }
    } catch {
      // places 실패 → geocode fallback
    }

    // 2. Fallback: Geocoding API (행정 주소)
    const geocoded = await geocodeAddress(addressInput.trim(), token);
    if (!geocoded) {
      showToast('주소를 찾을 수 없습니다. 다시 입력해주세요.', 'warning');
      setLoading(false);
      return;
    }

    const loc = { lat: geocoded.lat, lng: geocoded.lng };
    setUserLocation(loc);
    await performSearch(loc);
  };

  const sortedHospitals = [...hospitals].sort((a, b) => {
    if (sortBy === 'distance') return a.distance_m - b.distance_m;
    if (sortBy === 'rating') return (b.rating || 0) - (a.rating || 0);
    return a.name.localeCompare(b.name);
  });

  const handleSelectHospital = (hospital: HospitalInfo) => {
    sessionStorage.setItem('selected_hospital', JSON.stringify(hospital));
    router.push(`/consultation/hospital-detail/${hospital.id}`);
  };

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', minHeight: '100vh', bgcolor: '#F6F8FA', maxWidth: 480, mx: 'auto' }}>
      <ConsultationAppBar title="병원 검색" currentStep={4} totalSteps={6} />
      <ProgressBar current={4} total={6} />

      <Box sx={{ px: 2, py: 2 }}>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          <Typography component="span" fontWeight={700} color="primary">{deptName}</Typography> 진료 가능 병원을 찾습니다
        </Typography>

        {/* GPS Button */}
        <Button
          variant="outlined"
          fullWidth
          startIcon={<GpsFixedIcon />}
          onClick={handleGPSSearch}
          disabled={loading}
          sx={{
            mb: 1.5,
            borderColor: '#1B6B5A',
            color: '#1B6B5A',
            borderRadius: 3,
            minHeight: 48,
          }}
        >
          현재 위치로 검색
        </Button>

        {/* Address Input with Autocomplete */}
        <Box sx={{ position: 'relative', mb: 2 }}>
          <TextField
            fullWidth
            placeholder="장소 또는 주소 입력 (예: 강남역, 서울 마포구)"
            value={addressInput}
            onChange={(e) => handleInputChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                setShowSuggestions(false);
                handleAddressSearch();
              }
            }}
            onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
            onFocus={() => { if (suggestions.length > 0) setShowSuggestions(true); }}
            InputProps={{
              endAdornment: (
                <InputAdornment position="end">
                  <Button
                    onClick={handleAddressSearch}
                    disabled={loading || !addressInput.trim()}
                    sx={{ minWidth: 0, color: '#1B6B5A' }}
                  >
                    <SearchIcon />
                  </Button>
                </InputAdornment>
              ),
            }}
            sx={{
              '& .MuiOutlinedInput-root': {
                borderRadius: 3,
                '& fieldset': { borderColor: '#E2E8EE' },
                '&.Mui-focused fieldset': { borderColor: '#1B6B5A' },
              },
            }}
          />
          {showSuggestions && suggestions.length > 0 && (
            <Paper
              sx={{
                position: 'absolute',
                top: '100%',
                left: 0,
                right: 0,
                zIndex: 10,
                mt: 0.5,
                borderRadius: 2,
                border: '1px solid #E2E8EE',
                boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
                maxHeight: 240,
                overflow: 'auto',
              }}
            >
              <List dense disablePadding>
                {suggestions.map((item, idx) => (
                  <ListItemButton
                    key={`${item.lat}-${item.lng}-${idx}`}
                    onClick={() => handleSelectSuggestion(item)}
                    sx={{ px: 2, py: 1, '&:hover': { bgcolor: '#E8F5F1' } }}
                  >
                    <LocationOnIcon sx={{ fontSize: 18, color: '#1B6B5A', mr: 1.5, flexShrink: 0 }} />
                    <ListItemText
                      primary={item.name}
                      secondary={item.address !== item.name ? item.address : undefined}
                      primaryTypographyProps={{ variant: 'body2', fontWeight: 600 }}
                      secondaryTypographyProps={{ variant: 'caption', color: 'text.secondary' }}
                    />
                  </ListItemButton>
                ))}
              </List>
            </Paper>
          )}
        </Box>

        {/* Loading */}
        {loading && (
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', py: 4, gap: 2 }}>
            <CircularProgress size={24} sx={{ color: '#1B6B5A' }} />
            <Typography variant="body2" color="text.secondary">병원 검색 중...</Typography>
          </Box>
        )}

        {/* Mini Map */}
        {searched && !loading && hospitals.length > 0 && (
          <MiniMap hospitals={sortedHospitals} userLocation={userLocation} />
        )}

        {/* Sort + Results */}
        {searched && !loading && (
          <>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1.5, mt: 2 }}>
              <Typography variant="body2" fontWeight={600}>
                검색 결과 {hospitals.length}개
              </Typography>
              <FormControl size="small">
                <Select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value as SortOption)}
                  sx={{ fontSize: '0.875rem', borderRadius: 2, '& .MuiOutlinedInput-notchedOutline': { borderColor: '#E2E8EE' } }}
                  startAdornment={<SortIcon sx={{ mr: 0.5, fontSize: 16, color: '#6B7D8E' }} />}
                >
                  <MenuItem value="distance">거리순</MenuItem>
                  <MenuItem value="rating">평점순</MenuItem>
                  <MenuItem value="name">이름순</MenuItem>
                </Select>
              </FormControl>
            </Box>

            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
              {sortedHospitals.map((hospital, idx) => (
                <HospitalCard
                  key={hospital.id}
                  hospital={hospital}
                  rank={idx + 1}
                  onClick={() => handleSelectHospital(hospital)}
                />
              ))}
            </Box>
          </>
        )}

        {searched && !loading && hospitals.length === 0 && (
          <Alert severity="info" sx={{ borderRadius: 2 }}>
            근처에 {deptName} 병원이 없습니다. 검색 반경을 넓혀보세요.
          </Alert>
        )}
      </Box>

      <Toast open={toast.open} message={toast.message} variant={toast.variant} onClose={hideToast} />
    </Box>
  );
}
