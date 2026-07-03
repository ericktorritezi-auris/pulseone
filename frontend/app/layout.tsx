import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'PulseOne',
  description: 'Transformando percepções em desenvolvimento.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
