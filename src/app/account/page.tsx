import React from 'react';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { Container } from '@/components/ui/Container';
import { GlassPanel } from '@/components/ui/GlassPanel';
import { Button } from '@/components/ui/Button';
import { VerifiedBadge } from '@/components/ui/VerifiedBadge';
import { Package, Heart, Tag, CreditCard, Shield, LogOut, Settings } from 'lucide-react';

export default async function AccountPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/auth/sign-in?redirectTo=/account');
  }

  // Fetch user profile
  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single();
  const { data: isStaff } = await supabase.rpc('is_staff');

  const handleSignOut = async () => {
    'use server';
    const client = await createClient();
    await client.auth.signOut();
    redirect('/auth/sign-in');
  };

  const navCards = [
    ...(isStaff ? [{
      title: 'STAFF PANEL',
      desc: 'Manage product drafts, images, and operations',
      icon: <Settings className="h-5 w-5 text-acid" />,
      href: '/admin',
    }] : []),
    {
      title: 'MY ORDERS',
      desc: 'Track active vault shipments and delivery status',
      icon: <Package className="h-5 w-5 text-acid" />,
      href: '/account/orders',
    },
    {
      title: 'SAVED GRAILS',
      desc: 'View bookmarked sneakers, apparel, and rare drops',
      icon: <Heart className="h-5 w-5 text-acid" />,
      href: '/account/wishlist',
    },
    {
      title: 'CONSIGNMENTS',
      desc: 'Submit items, track verification, and view active listings',
      icon: <Tag className="h-5 w-5 text-acid" />,
      href: '/account/consignments',
    },
    {
      title: 'PAYOUTS & BALANCE',
      desc: 'See pending and completed seller payouts',
      icon: <CreditCard className="h-5 w-5 text-acid" />,
      href: '/account/payouts',
    },
  ];

  return (
    <div className="py-12 sm:py-16">
      <Container>
        {/* Profile Card */}
        <GlassPanel intensity="heavy" className="border-white/10 mb-8 p-6 sm:p-8">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6">
            <div className="flex items-center gap-4">
              <div className="flex h-16 w-16 items-center justify-center rounded-full border border-acid/30 bg-acid/10 text-xl font-bold font-mono text-acid">
                {(profile?.display_name || user.email || 'U').charAt(0).toUpperCase()}
              </div>

              <div>
                <div className="flex items-center gap-2 mb-1">
                  <h1 className="text-xl sm:text-2xl font-black uppercase tracking-tight text-white">
                    {profile?.display_name || user.email?.split('@')[0]}
                  </h1>
                  <VerifiedBadge variant="compact" />
                </div>
                <p className="text-xs font-mono text-neutral-400">{user.email}</p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <form action={handleSignOut}>
                <Button variant="ghost" size="sm" type="submit" className="gap-2 text-neutral-400 hover:text-white">
                  <LogOut className="h-4 w-4" />
                  <span>SIGN OUT</span>
                </Button>
              </form>
            </div>
          </div>
        </GlassPanel>

        {/* Dashboard Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          {navCards.map((card, idx) => (
            <Link key={idx} href={card.href} className="group">
              <GlassPanel
                intensity="medium"
                interactive
                className="h-full flex flex-col justify-between p-6 border-white/10 hover:border-acid/40"
              >
                <div>
                  <div className="mb-4 inline-flex p-3 rounded-lg border border-white/10 bg-white/[0.04]">
                    {card.icon}
                  </div>
                  <h2 className="text-sm font-bold font-mono uppercase tracking-wider text-white group-hover:text-acid transition-colors">
                    {card.title}
                  </h2>
                  <p className="mt-1 text-xs text-neutral-400 font-sans">{card.desc}</p>
                </div>
                <div className="mt-4 flex items-center text-[10px] font-mono text-acid font-semibold uppercase tracking-wider">
                  <span>OPEN MODULE →</span>
                </div>
              </GlassPanel>
            </Link>
          ))}
        </div>

        {/* Security & Verification Banner */}
        <GlassPanel intensity="subtle" className="border-white/5 p-6 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Shield className="h-5 w-5 text-acid" />
            <div className="text-xs font-mono text-neutral-300">
              <span className="font-semibold text-white">YOUR ACCOUNT:</span> Track purchases, submitted pieces and pending payouts in one place.
            </div>
          </div>
          <Link href="/consign/new">
            <Button variant="acid" size="sm">
              NEW CONSIGNMENT INTAKE
            </Button>
          </Link>
        </GlassPanel>
      </Container>
    </div>
  );
}
