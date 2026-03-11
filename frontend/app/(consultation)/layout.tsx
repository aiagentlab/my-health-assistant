import { ConsultationProvider } from '@/lib/consultation/ConsultationContext';

export default function ConsultationLayout({ children }: { children: React.ReactNode }) {
  return (
    <ConsultationProvider>
      {children}
    </ConsultationProvider>
  );
}
