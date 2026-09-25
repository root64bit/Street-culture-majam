import React from 'react';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { Container } from '@/components/ui/Container';
import { EmptyState } from '@/components/ui/EmptyState';
import { ArrowLeft } from 'lucide-react';

export default async function WishlistPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/auth/sign-in?redirectTo=/account/wishlist');
  }

  const { data: wishlistItems } = await supabase
    .from('wishlist_items')
    .select('*, products(*)')
    .eq('user_id', user.id);

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
            PERSONAL VAULT WATCHLIST
          </span>
          <h1 className="text-2xl sm:text-3xl font-black uppercase tracking-tight text-white">
            SAVED GRAILS
          </h1>
        </div>

        {!wishlistItems || wishlistItems.length === 0 ? (
          <EmptyState
            title="NO SAVED GRAILS"
            description="Your personal watchlist is currently empty. Bookmark rare archival pieces to receive liquidity and price alerts."
            actionText="DISCOVER GRAILS"
            actionHref="/new"
          />
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {wishlistItems.map((item) => (
              <div key={item.id} className="p-4 rounded-xl border border-white/10 bg-white/[0.03]">
                <div className="text-sm font-semibold text-white">
                  {(item.products as { name: string } | null)?.name || 'Archival Specimen'}
                </div>
              </div>
            ))}
          </div>
        )}
      </Container>
    </div>
  );
}
