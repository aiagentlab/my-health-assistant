import S06SummaryScreen from '@/components/screens/S06Summary';
import type { Metadata } from 'next';

export const metadata: Metadata = { title: '건강상담도우미 — 상담 요약' };

export default function SummaryPage() {
  return <S06SummaryScreen />;
}
