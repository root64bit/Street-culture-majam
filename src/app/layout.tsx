import type { Metadata } from 'next';
import './globals.css';
import { Header } from '@/components/layout/Header';
import { TrustStrip } from '@/components/layout/TrustStrip';
import { Footer } from '@/components/layout/Footer';

export const metadata: Metadata = {
  title: 'STREET CULTURE — Archival Grail Vault & Consignment',
  description:
    'Premium authenticated fashion resale and consignment marketplace for rare sneakers, streetwear, luxury maison garments, and collectibles.',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body className="bg-vault-950 text-vault-50 antialiased min-h-screen flex flex-col selection:bg-acid selection:text-black">
        <Header />
        <TrustStrip />
        <main className="flex-1">{children}</main>
        <Footer />
      </body>
    </html>
  );
}
