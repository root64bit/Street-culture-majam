import type { Metadata } from 'next';
import './globals.css';
import { Header } from '@/components/layout/Header';
import { Footer } from '@/components/layout/Footer';
import { CommerceProvider } from '@/features/commerce/CommerceProvider';
import { CommerceOverlays } from '@/components/commerce/CommerceOverlays';
import { CurrencyProvider } from '@/features/currency/CurrencyProvider';

export const metadata: Metadata = {
  title: 'STREET CULTURE — Authenticity is the culture',
  description:
    'Curated sneakers, streetwear and luxury. Every item is verified before it reaches you.',
  icons: {
    icon: '/brand/street-culture-icon.png',
    apple: '/brand/street-culture-icon.png',
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-[#fbfaf6] text-black antialiased selection:bg-acid selection:text-black">
        <CurrencyProvider><CommerceProvider>
          <Header />
          <main className="flex-1">{children}</main>
          <Footer />
          <CommerceOverlays />
        </CommerceProvider></CurrencyProvider>
      </body>
    </html>
  );
}
