import S02ScreeningScreen from '@/components/screens/S02Screening';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: '건강상담도우미 — AI 문진',
};

export default function ScreeningPage() {
  return <S02ScreeningScreen />;
}
