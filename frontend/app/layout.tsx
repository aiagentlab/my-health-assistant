import type { Metadata } from 'next';
import Script from 'next/script';
import { AppRouterCacheProvider } from '@mui/material-nextjs/v15-appRouter';
import { Providers } from './providers';

export const metadata: Metadata = {
  title: '건강상담 도우미',
  description: 'AI 기반 증상 문진 및 병원 안내 서비스',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const naverClientId = process.env.NEXT_PUBLIC_NAVER_MAPS_CLIENT_ID;
  return (
    <html lang="ko">
      <body>
        {naverClientId && (
          <Script
            src={`https://openapi.map.naver.com/openapi/v3/maps.js?ncpClientId=${naverClientId}`}
            strategy="beforeInteractive"
          />
        )}
        <AppRouterCacheProvider>
          <Providers>
            {children}
          </Providers>
        </AppRouterCacheProvider>
      </body>
    </html>
  );
}
