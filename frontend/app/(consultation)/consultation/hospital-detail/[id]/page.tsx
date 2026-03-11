import S05HospitalDetailScreen from '@/components/screens/S05HospitalDetail';
import type { Metadata } from 'next';
export const metadata: Metadata = { title: '건강상담도우미 — 병원 상세' };
export default function HospitalDetailPage({ params }: { params: { id: string } }) {
  return <S05HospitalDetailScreen hospitalId={params.id} />;
}
