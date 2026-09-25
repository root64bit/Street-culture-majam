import React from 'react';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { Container } from '@/components/ui/Container';
import { GlassPanel } from '@/components/ui/GlassPanel';
import { EmptyState } from '@/components/ui/EmptyState';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { formatPrice, formatDate } from '@/lib/utils';
import { ArrowLeft } from 'lucide-react';

export default async function AccountOrdersPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/auth/sign-in?redirectTo=/account/orders');
  }

  const { data: orders } = await supabase
    .from('orders')
    .select('*, order_items(*)')
    .eq('user_id', user.id)
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
        </div>

        <div className="mb-8">
          <span className="text-[10px] font-mono tracking-widest text-acid uppercase block mb-1">
            PURCHASE HISTORY
          </span>
          <h1 className="text-2xl sm:text-3xl font-black uppercase tracking-tight text-white">
            VAULT ORDERS
          </h1>
        </div>

        {!orders || orders.length === 0 ? (
          <EmptyState
            title="NO ORDERS FOUND"
            description="You have not placed any orders from the Street Culture Vault yet."
            actionText="EXPLORE VAULT RELEASES"
            actionHref="/new"
          />
        ) : (
          <div className="space-y-4">
            {orders.map((order) => (
              <GlassPanel key={order.id} intensity="medium" className="p-6 border-white/10">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-white/5 pb-4 mb-4">
                  <div>
                    <span className="text-xs font-mono text-neutral-400 block">ORDER ID</span>
                    <span className="text-sm font-mono font-bold text-white">{order.order_number}</span>
                  </div>
                  <div>
                    <span className="text-xs font-mono text-neutral-400 block">DATE</span>
                    <span className="text-xs font-mono text-neutral-200">{formatDate(order.created_at)}</span>
                  </div>
                  <div>
                    <span className="text-xs font-mono text-neutral-400 block">TOTAL AMOUNT</span>
                    <span className="text-sm font-mono font-bold text-acid">{formatPrice(order.total_amount, order.currency)}</span>
                  </div>
                  <div>
                    <StatusBadge status={order.status} />
                  </div>
                </div>

                <div className="text-right">
                  <Link
                    href={`/account/orders/${order.id}`}
                    className="text-xs font-mono text-acid hover:underline"
                  >
                    VIEW ORDER DETAILS →
                  </Link>
                </div>
              </GlassPanel>
            ))}
          </div>
        )}
      </Container>
    </div>
  );
}
