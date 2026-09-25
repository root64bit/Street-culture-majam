import React from 'react';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { Container } from '@/components/ui/Container';
import { GlassPanel } from '@/components/ui/GlassPanel';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { formatPrice, formatDate } from '@/lib/utils';
import { ArrowLeft, CheckCircle2, Clock } from 'lucide-react';

interface Props {
  params: Promise<{ id: string }>;
}

export default async function ConsignmentDetailPage({ params }: Props) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/auth/sign-in');
  }

  const { data: item } = await supabase
    .from('consignment_submissions')
    .select('*, consignment_media(*)')
    .eq('id', id)
    .single();


  return (
    <div className="py-12 sm:py-16">
      <Container className="max-w-4xl">
        <div className="mb-6 flex items-center justify-between">
          <Link
            href="/account/consignments"
            className="inline-flex items-center gap-2 text-xs font-mono text-neutral-400 hover:text-white transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            <span>BACK TO CONSIGNMENTS</span>
          </Link>
        </div>

        <GlassPanel intensity="heavy" className="border-white/10 p-6 sm:p-8">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-white/10 pb-6 mb-8">
            <div>
              <span className="text-[10px] font-mono tracking-widest text-acid uppercase block mb-1">
                CONSIGNMENT INTAKE RECORD
              </span>
              <h1 className="text-xl sm:text-2xl font-black uppercase text-white">
                {item?.product_name || 'Consignment Specimen'}
              </h1>
              <p className="text-xs font-mono text-neutral-400 mt-1">
                BRAND: {item?.brand_name} • SIZE: {item?.size} • SUBMITTED:{' '}
                {item ? formatDate(item.created_at) : 'N/A'}
              </p>
            </div>

            <div className="flex items-center gap-3">
              {item && <StatusBadge status={item.status} />}
            </div>
          </div>

          {/* Verification Protocol Progress Timeline */}
          <div className="mb-10">
            <h3 className="text-xs font-mono font-semibold uppercase tracking-wider text-white mb-6">
              PROTOCOL LIFECYCLE TIMELINE
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="p-4 rounded-lg border border-acid/30 bg-acid/10">
                <div className="flex items-center gap-2 text-xs font-mono text-acid font-bold">
                  <CheckCircle2 className="h-4 w-4" />
                  <span>1. INTAKE VALIDATED</span>
                </div>
                <p className="text-[11px] font-mono text-neutral-300 mt-1">
                  Item details and provenance verified.
                </p>
              </div>

              <div className="p-4 rounded-lg border border-white/10 bg-white/[0.02]">
                <div className="flex items-center gap-2 text-xs font-mono text-white font-bold">
                  <Clock className="h-4 w-4 text-neutral-400" />
                  <span>2. VAULT INSPECTION</span>
                </div>
                <p className="text-[11px] font-mono text-neutral-400 mt-1">
                  Multi-point physical specialist review.
                </p>
              </div>

              <div className="p-4 rounded-lg border border-white/10 bg-white/[0.02]">
                <div className="flex items-center gap-2 text-xs font-mono text-neutral-400 font-bold">
                  <span>3. MARKETPLACE & PAYOUT</span>
                </div>
                <p className="text-[11px] font-mono text-neutral-500 mt-1">
                  Vault listing and 48-hour disbursal.
                </p>
              </div>
            </div>
          </div>

          <div className="border-t border-white/10 pt-6 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs font-mono">
            <div className="text-neutral-400">
              DELIVERY METHOD: <span className="text-white font-semibold">{item?.delivery_method || 'SHIP_TO_VAULT'}</span>
            </div>
            <div className="text-base font-bold text-acid">
              EXPECTED PRICE: {item ? formatPrice(item.expected_price, item.currency) : '$0.00'}
            </div>
          </div>
        </GlassPanel>
      </Container>
    </div>
  );
}
