import S05HospitalDetailScreen from '@/components/screens/S05HospitalDetail';
import type { Metadata } from 'next';
export const metadata: Metadata = { title: '건강상담도우미 — 병원 상세' };
export default async function HospitalDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <S05HospitalDetailScreen hospitalId={id} />;
}
