import S03RecommendationScreen from '@/components/screens/S03Recommendation';
import type { Metadata } from 'next';

export const metadata: Metadata = { title: '건강상담도우미 — 진료과 추천' };

export default function RecommendationPage() {
  return <S03RecommendationScreen />;
}
