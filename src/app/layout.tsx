import type { Metadata } from 'next';
import './globals.css';
import { CommerceProvider } from '@/features/commerce/CommerceProvider';
import { CurrencyProvider } from '@/features/currency/CurrencyProvider';
import { SiteChrome } from '@/components/layout/SiteChrome';

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
          <SiteChrome>{children}</SiteChrome>
        </CommerceProvider></CurrencyProvider>
      </body>
    </html>
  );
}
