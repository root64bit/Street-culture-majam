import React from 'react';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { Container } from '@/components/ui/Container';
import { GlassPanel } from '@/components/ui/GlassPanel';
import { Button } from '@/components/ui/Button';
import { VerifiedBadge } from '@/components/ui/VerifiedBadge';
import { ChangePasswordForm } from '@/components/account/ChangePasswordForm';
import { PhoneVerification } from '@/components/account/PhoneVerification';
import { Package, Heart, Tag, CreditCard, Shield, LogOut, Settings, MapPin } from 'lucide-react';

export default async function AccountPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/auth/sign-in?redirectTo=/account');
  }

  // Fetch user profile
  const { data: profile } = await supabase.from('profiles').select('*').eq('id', user.id).single();
  const { data: isStaff } = await supabase.rpc('is_staff');

  const handleSignOut = async () => {
    'use server';
    const client = await createClient();
    await client.auth.signOut();
    redirect('/auth/sign-in');
  };

  const navCards = [
    {
      title: 'SAVED ADDRESSES',
      desc: 'Choose and manage private delivery contacts for future checkouts',
      icon: <MapPin className="h-5 w-5 text-emerald-700" />,
      href: '/account/addresses',
    },
    ...(isStaff
      ? [
          {
            title: 'STAFF PANEL',
            desc: 'Manage product drafts, images, and operations',
            icon: <Settings className="h-5 w-5 text-emerald-700" />,
            href: '/admin',
          },
        ]
      : []),
    {
      title: 'MY ORDERS',
      desc: 'Track active vault shipments and delivery status',
      icon: <Package className="h-5 w-5 text-emerald-700" />,
      href: '/account/orders',
    },
    {
      title: 'SAVED GRAILS',
      desc: 'View bookmarked sneakers, apparel, and rare drops',
      icon: <Heart className="h-5 w-5 text-emerald-700" />,
      href: '/account/wishlist',
    },
    {
      title: 'CONSIGNMENTS',
      desc: 'Submit items, track verification, and view active listings',
      icon: <Tag className="h-5 w-5 text-emerald-700" />,
      href: '/account/consignments',
    },
    {
      title: 'PAYOUTS & BALANCE',
      desc: 'See pending and completed seller payouts',
      icon: <CreditCard className="h-5 w-5 text-emerald-700" />,
      href: '/account/payouts',
    },
  ];

  return (
    <div className="py-12 sm:py-16">
      <Container>
        {/* Profile Card */}
        <GlassPanel
          intensity="heavy"
          className="mb-8 border-black/10 bg-white p-6 shadow-sm sm:p-8"
        >
          <div className="flex flex-col justify-between gap-6 sm:flex-row sm:items-center">
            <div className="flex items-center gap-4">
              <div className="flex h-16 w-16 items-center justify-center rounded-full border border-emerald-700/20 bg-emerald-50 font-mono text-xl font-bold text-emerald-800">
                {(profile?.display_name || user.email || 'U').charAt(0).toUpperCase()}
              </div>

              <div>
                <div className="mb-1 flex items-center gap-2">
                  <h1 className="text-xl font-black uppercase tracking-tight text-neutral-950 sm:text-2xl">
                    {profile?.display_name || user.email?.split('@')[0]}
                  </h1>
                  <VerifiedBadge variant="compact" className="text-lime-800" />
                </div>
                <p className="font-mono text-xs text-neutral-600">{user.email}</p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <form action={handleSignOut}>
                <Button
                  variant="ghost"
                  size="sm"
                  type="submit"
                  className="gap-2 text-neutral-700 hover:bg-neutral-100 hover:text-neutral-950"
                >
                  <LogOut className="h-4 w-4" />
                  <span>SIGN OUT</span>
                </Button>
              </form>
            </div>
          </div>
        </GlassPanel>

        {/* Dashboard Grid */}
        <div className="mb-8 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {navCards.map((card, idx) => (
            <Link key={idx} href={card.href} className="group">
              <GlassPanel
                intensity="medium"
                interactive
                className="flex h-full flex-col justify-between border-black/10 bg-white p-6 hover:border-emerald-700/40 hover:bg-white"
              >
                <div>
                  <div className="mb-4 inline-flex rounded-lg border border-black/10 bg-neutral-50 p-3">
                    {card.icon}
                  </div>
                  <h2 className="font-mono text-sm font-bold uppercase tracking-wider text-neutral-950 transition-colors group-hover:text-emerald-800">
                    {card.title}
                  </h2>
                  <p className="mt-1 font-sans text-xs text-neutral-600">{card.desc}</p>
                </div>
                <div className="mt-4 flex items-center font-mono text-[10px] font-semibold uppercase tracking-wider text-emerald-800">
                  <span>OPEN MODULE →</span>
                </div>
              </GlassPanel>
            </Link>
          ))}
        </div>

        {/* Security & Verification Banner */}
        <GlassPanel
          intensity="subtle"
          className="mb-8 flex flex-col items-center justify-between gap-4 border-black/10 bg-white p-6 sm:flex-row"
        >
          <div className="flex items-center gap-3">
            <Shield className="h-5 w-5 text-emerald-700" />
            <div className="font-mono text-xs text-neutral-600">
              <span className="font-semibold text-neutral-950">YOUR ACCOUNT:</span> Track purchases,
              submitted pieces and pending payouts in one place.
            </div>
          </div>
          <Link href="/consign/new">
            <Button variant="acid" size="sm">
              NEW CONSIGNMENT INTAKE
            </Button>
          </Link>
        </GlassPanel>

        {process.env.NEXT_PUBLIC_PHONE_OTP_ENABLED === 'true' && (
          <PhoneVerification currentPhone={user.phone} />
        )}
        <ChangePasswordForm email={user.email || ''} />
      </Container>
    </div>
  );
}
