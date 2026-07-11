'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '../../lib/auth-context';
import { Sidebar } from '../../components/shared/Sidebar';
import { Topbar } from '../../components/shared/Topbar';
import { Footer } from '../../components/shared/Footer';
import { SystemNpsModal } from '../../components/shared/SystemNpsModal';

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    if (!loading && !user) {
      router.replace('/login');
    }
  }, [loading, user, router]);

  if (loading || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-p-bg">
        <p className="text-p-neutral">Carregando...</p>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-p-bg">
      <Sidebar mobileOpen={mobileMenuOpen} onMobileClose={() => setMobileMenuOpen(false)} />
      <div className="flex-1 flex flex-col min-w-0">
        <Topbar onMenuClick={() => setMobileMenuOpen(true)} />
        <main className="flex-1 p-6 overflow-y-auto">{children}</main>
        <Footer />
      </div>
      <SystemNpsModal />
    </div>
  );
}
