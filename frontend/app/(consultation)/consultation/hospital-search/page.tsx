import S04HospitalSearchScreen from '@/components/screens/S04HospitalSearch';
import type { Metadata } from 'next';
export const metadata: Metadata = { title: '건강상담도우미 — 병원 검색' };
export default function HospitalSearchPage() {
  return <S04HospitalSearchScreen />;
}
