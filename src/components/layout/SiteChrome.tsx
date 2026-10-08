'use client';

import { usePathname } from 'next/navigation';
import { Header } from '@/components/layout/Header';
import { Footer } from '@/components/layout/Footer';
import { CommerceOverlays } from '@/components/commerce/CommerceOverlays';

export function SiteChrome({ children }: { children: React.ReactNode }) {
  const isAdmin = usePathname().startsWith('/admin');
  return <>
    {!isAdmin && <Header />}
    <main className="flex-1">{children}</main>
    {!isAdmin && <Footer />}
    {!isAdmin && <CommerceOverlays />}
  </>;
}
