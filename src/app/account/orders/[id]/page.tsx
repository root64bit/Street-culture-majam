import React from 'react';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { Container } from '@/components/ui/Container';
import { GlassPanel } from '@/components/ui/GlassPanel';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { formatPrice, formatDate } from '@/lib/utils';
import { ArrowLeft, ShieldCheck } from 'lucide-react';

interface Props {
  params: Promise<{ id: string }>;
}

export default async function OrderDetailPage({ params }: Props) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/auth/sign-in');
  }

  const { data: order } = await supabase
    .from('orders')
    .select('*, order_items(*)')
    .eq('id', id)
    .single();

  return (
    <div className="py-12 sm:py-16">
      <Container className="max-w-4xl">
        <div className="mb-6 flex items-center justify-between">
          <Link
            href="/account/orders"
            className="inline-flex items-center gap-2 text-xs font-mono text-neutral-400 hover:text-white transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            <span>BACK TO ORDERS</span>
          </Link>
        </div>

        <GlassPanel intensity="heavy" className="border-white/10 p-6 sm:p-8">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-white/10 pb-6 mb-6">
            <div>
              <span className="text-[10px] font-mono tracking-widest text-acid uppercase block mb-1">
                VAULT INVOICE RECORD
              </span>
              <h1 className="text-xl sm:text-2xl font-black font-mono uppercase text-white">
                ORDER #{order?.order_number || id.slice(0, 8)}
              </h1>
              <p className="text-xs font-mono text-neutral-400 mt-1">
                PLACED ON {order ? formatDate(order.created_at) : 'RECENTLY'}
              </p>
            </div>

            <div className="flex items-center gap-3">
              {order && <StatusBadge status={order.status} />}
            </div>
          </div>

          <div className="space-y-4 mb-8">
            <h3 className="text-xs font-mono font-semibold uppercase tracking-wider text-white">
              AUTHENTICATED SPECIMENS
            </h3>

            {order?.order_items && order.order_items.length > 0 ? (
              order.order_items.map((item) => (
                <div
                  key={item.id}
                  className="flex items-center justify-between p-4 rounded-lg border border-white/5 bg-white/[0.02]"
                >
                  <div>
                    <div className="text-xs font-mono text-neutral-400 uppercase">
                      {item.brand_name_snapshot}
                    </div>
                    <div className="text-sm font-semibold text-white">
                      {item.product_name_snapshot}
                    </div>
                    <div className="text-xs font-mono text-neutral-500 mt-0.5">
                      SIZE: {item.size_snapshot} • CONDITION: {item.condition_snapshot}
                    </div>
                  </div>
                  <div className="text-right font-mono">
                    <div className="text-sm font-bold text-white">
                      {formatPrice(item.unit_price, order.currency)}
                    </div>
                    <div className="text-[10px] text-neutral-400">QTY: {item.quantity}</div>
                  </div>
                </div>
              ))
            ) : (
              <div className="p-4 rounded-lg border border-white/5 bg-white/[0.02] text-xs font-mono text-neutral-400">
                Order items snapshot recorded in secure vault ledger.
              </div>
            )}
          </div>

          <div className="border-t border-white/10 pt-6 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs font-mono">
            <div className="flex items-center gap-2 text-neutral-400">
              <ShieldCheck className="h-4 w-4 text-acid" />
              <span>STREET CULTURE 100% AUTHENTICITY CERTIFICATE ISSUED</span>
            </div>
            <div className="text-base font-bold text-acid">
              TOTAL: {order ? formatPrice(order.total_amount, order.currency) : '$0.00'}
            </div>
          </div>
        </GlassPanel>
      </Container>
    </div>
  );
}
