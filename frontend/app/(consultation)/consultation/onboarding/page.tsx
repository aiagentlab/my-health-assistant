import S01OnboardingScreen from '@/components/screens/S01Onboarding';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: '건강상담도우미 — 시작하기',
};

export default function OnboardingPage() {
  return <S01OnboardingScreen />;
}
