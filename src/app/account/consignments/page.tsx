import React from 'react';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { Container } from '@/components/ui/Container';
import { GlassPanel } from '@/components/ui/GlassPanel';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { formatPrice, formatDate } from '@/lib/utils';
import { ArrowLeft, Plus } from 'lucide-react';

export default async function AccountConsignmentsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/auth/sign-in?redirectTo=/account/consignments');
  }

  const { data: submissions } = await supabase
    .from('consignment_submissions')
    .select('*')
    .eq('seller_id', user.id)
    .order('created_at', { ascending: false });

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

          <Link href="/consign/new">
            <Button variant="acid" size="sm" className="gap-1.5">
              <Plus className="h-3.5 w-3.5" />
              <span>SUBMIT NEW ITEM</span>
            </Button>
          </Link>
        </div>

        <div className="mb-8">
          <span className="text-[10px] font-mono tracking-widest text-acid uppercase block mb-1">
            CONSIGNOR DASHBOARD
          </span>
          <h1 className="text-2xl sm:text-3xl font-black uppercase tracking-tight text-white">
            MY CONSIGNMENTS
          </h1>
        </div>

        {!submissions || submissions.length === 0 ? (
          <EmptyState
            title="NO CONSIGNMENTS RECORDED"
            description="You have not submitted any items for consignment yet. Turn your high-value sneakers and luxury pieces into cash."
            actionText="START CONSIGNMENT INTAKE"
            actionHref="/consign/new"
          />
        ) : (
          <div className="space-y-4">
            {submissions.map((item) => (
              <GlassPanel key={item.id} intensity="medium" className="p-6 border-white/10">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div>
                    <div className="text-xs font-mono text-neutral-400 uppercase">
                      {item.brand_name}
                    </div>
                    <h3 className="text-base font-bold text-white">{item.product_name}</h3>
                    <div className="text-xs font-mono text-neutral-400 mt-1">
                      SIZE: {item.size} • CONDITION: {item.condition} • SUBMITTED:{' '}
                      {formatDate(item.created_at)}
                    </div>
                  </div>

                  <div className="flex items-center gap-6">
                    <div className="text-right">
                      <span className="text-[10px] font-mono text-neutral-500 uppercase block">
                        EXPECTED ASKING
                      </span>
                      <span className="text-base font-mono font-bold text-white">
                        {formatPrice(item.expected_price, item.currency)}
                      </span>
                    </div>

                    <StatusBadge status={item.status} />

                    <Link
                      href={`/account/consignments/${item.id}`}
                      className="text-xs font-mono text-acid hover:underline"
                    >
                      VIEW TIMELINE →
                    </Link>
                  </div>
                </div>
              </GlassPanel>
            ))}
          </div>
        )}
      </Container>
    </div>
  );
}
