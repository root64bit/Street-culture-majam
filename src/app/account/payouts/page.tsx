import React from 'react';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { Container } from '@/components/ui/Container';
import { GlassPanel } from '@/components/ui/GlassPanel';
import { EmptyState } from '@/components/ui/EmptyState';
import { ArrowLeft } from 'lucide-react';

export default async function PayoutsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/auth/sign-in?redirectTo=/account/payouts');
  }

  const { data: payouts } = await supabase
    .from('seller_payouts')
    .select('*')
    .eq('seller_id', user.id);

  return (
    <div className="py-12 sm:py-16">
      <Container>
        <div className="mb-6 flex items-center justify-between">
          <Link
            href="/account"
            className="inline-flex items-center gap-2 text-xs font-mono text-neutral-400 hover:text-white transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            <span>BACK TO ACCOUNT</span>
          </Link>
        </div>

        <div className="mb-8">
          <span className="text-[10px] font-mono tracking-widest text-acid uppercase block mb-1">
            CONSIGNOR SETTLEMENT
          </span>
          <h1 className="text-2xl sm:text-3xl font-black uppercase tracking-tight text-white">
            PAYOUTS & BALANCE
          </h1>
        </div>

        {/* Balance Overview Card */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 mb-8">
          <GlassPanel intensity="medium" className="p-6 border-white/10">
            <span className="text-xs font-mono text-neutral-400 uppercase block mb-1">
              AVAILABLE BALANCE
            </span>
            <span className="text-3xl font-black font-mono text-acid">$0.00</span>
          </GlassPanel>

          <GlassPanel intensity="medium" className="p-6 border-white/10">
            <span className="text-xs font-mono text-neutral-400 uppercase block mb-1">
              PENDING ESCROW
            </span>
            <span className="text-3xl font-black font-mono text-white">$0.00</span>
          </GlassPanel>

          <GlassPanel intensity="medium" className="p-6 border-white/10">
            <span className="text-xs font-mono text-neutral-400 uppercase block mb-1">
              LIFETIME DISBURSED
            </span>
            <span className="text-3xl font-black font-mono text-white">$0.00</span>
          </GlassPanel>
        </div>

        {!payouts || payouts.length === 0 ? (
          <EmptyState
            title="NO PAYOUT RECORDS"
            description="Your disbursal history is empty. Once your consigned specimens are sold and authenticated, settlements appear here."
            actionText="VIEW CONSIGNMENTS"
            actionHref="/account/consignments"
          />
        ) : (
          <div className="space-y-4">
            {/* List payout rows if available */}
          </div>
        )}
      </Container>
    </div>
  );
}
