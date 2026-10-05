import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import { formatDate, formatPrice } from '@/lib/utils';

export default async function PayoutsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/auth/sign-in?redirectTo=/account/payouts');
  const { data: payouts, error } = await supabase.from('seller_payouts')
    .select('id, status, gross_amount, commission_amount, net_amount, currency, created_at, processed_at')
    .eq('seller_id', user.id).order('created_at', { ascending: false });
  if (error) throw new Error('Payout history is temporarily unavailable.');
  const pending = (payouts ?? []).filter((payout) => payout.status !== 'PAID' && payout.status !== 'CANCELLED').reduce((total, payout) => total + Number(payout.net_amount), 0);
  const paid = (payouts ?? []).filter((payout) => payout.status === 'PAID').reduce((total, payout) => total + Number(payout.net_amount), 0);

  return (
    <main className="min-h-screen bg-[#fbfaf6] px-4 pb-20 pt-32 text-black sm:px-6 lg:px-10">
      <div className="mx-auto max-w-5xl">
        <Link href="/account" className="inline-flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-black/45 hover:text-black"><ArrowLeft className="h-4 w-4" /> Back to account</Link>
        <p className="mt-10 text-[10px] font-bold uppercase tracking-widest text-black/45">Consignor earnings</p>
        <h1 className="mt-2 text-5xl font-black tracking-[-0.07em] sm:text-7xl">PAYOUTS.</h1>
        <div className="mt-10 grid gap-3 sm:grid-cols-2"><div className="rounded-[1.5rem] bg-acid p-6"><p className="text-[10px] font-bold uppercase tracking-wider">Pending payout obligations</p><p className="mt-3 text-3xl font-black">{formatPrice(pending, 'MZN')}</p></div><div className="rounded-[1.5rem] bg-[#efede6] p-6"><p className="text-[10px] font-bold uppercase tracking-wider">Paid to you</p><p className="mt-3 text-3xl font-black">{formatPrice(paid, 'MZN')}</p></div></div>
        {!payouts?.length ? <div className="mt-6 rounded-[1.5rem] bg-white p-8 text-sm text-black/55">No payout records yet. A pending payout appears after a consigned item is sold and its buyer payment is confirmed.</div> : <div className="mt-6 divide-y divide-black/10 rounded-[1.5rem] bg-white px-6">{payouts.map((payout) => <div key={payout.id} className="flex flex-wrap items-center justify-between gap-4 py-5 text-sm"><div><p className="font-bold">{payout.status === 'PAID' ? 'Paid' : 'Pending payout'}</p><p className="mt-1 text-xs text-black/45">{formatDate(payout.processed_at ?? payout.created_at)} · Sale {formatPrice(Number(payout.gross_amount), payout.currency)} · Platform share {formatPrice(Number(payout.commission_amount), payout.currency)}</p></div><strong>{formatPrice(Number(payout.net_amount), payout.currency)}</strong></div>)}</div>}
      </div>
    </main>
  );
}
