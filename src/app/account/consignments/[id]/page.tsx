import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import { consignmentLabels } from '@/lib/commerce/labels';
import { formatDate, formatPrice } from '@/lib/utils';

export default async function ConsignmentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/auth/sign-in?redirectTo=/account/consignments');
  const { data: item } = await supabase.from('consignment_submissions')
    .select('id, brand_name, product_name, size, condition, status, expected_price, currency, created_at, submitted_at, approved_at, received_at')
    .eq('id', id).eq('seller_id', user.id).maybeSingle();
  if (!item) notFound();
  const { data: listings } = await supabase.from('listings')
    .select('id, status, published_at, sold_at')
    .eq('consignment_submission_id', item.id).eq('seller_id', user.id);
  const listingIds = (listings ?? []).map((listing) => listing.id);
  const { data: payouts } = listingIds.length
    ? await supabase.from('seller_payouts')
      .select('id, listing_id, status, net_amount, currency, created_at, processed_at')
      .eq('seller_id', user.id).in('listing_id', listingIds)
    : { data: [] };
  const events = [
    { label: 'Submitted', date: item.submitted_at ?? item.created_at },
    item.approved_at && { label: 'Approved', date: item.approved_at },
    item.received_at && { label: 'Item received', date: item.received_at },
    ...(listings ?? []).filter((listing) => listing.published_at).map((listing) => ({ label: 'Listed for sale', date: listing.published_at! })),
    ...(listings ?? []).filter((listing) => listing.sold_at).map((listing) => ({ label: 'Sold', date: listing.sold_at! })),
    ...(payouts ?? []).map((payout) => ({ label: payout.status === 'PAID' ? 'Payout paid' : 'Payout pending', date: payout.status === 'PAID' ? payout.processed_at ?? payout.created_at : payout.created_at })),
  ].filter((event): event is { label: string; date: string } => Boolean(event))
    .sort((a, b) => Date.parse(a.date) - Date.parse(b.date));

  return (
    <main className="min-h-screen bg-[#fbfaf6] px-4 pb-20 pt-32 text-black sm:px-6 lg:px-10">
      <div className="mx-auto max-w-4xl">
        <Link href="/account/consignments" className="inline-flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-black/45 hover:text-black"><ArrowLeft className="h-4 w-4" /> Back to consignments</Link>
        <p className="mt-10 text-[10px] font-bold uppercase tracking-widest text-black/45">{item.brand_name} · Size {item.size}</p>
        <h1 className="mt-2 text-4xl font-black tracking-[-0.07em] sm:text-6xl">{item.product_name}</h1>
        <p className="mt-3 text-sm text-black/55">{consignmentLabels[item.status] ?? 'In progress'}</p>
        <div className="mt-10 grid gap-6 md:grid-cols-2">
          <section className="rounded-[1.5rem] bg-white p-6 shadow-sm sm:p-8"><h2 className="text-xs font-bold uppercase tracking-wider">Piece details</h2><dl className="mt-6 space-y-4 text-sm"><div className="flex justify-between gap-4"><dt className="text-black/45">Condition</dt><dd className="font-bold">{item.condition}</dd></div><div className="flex justify-between gap-4"><dt className="text-black/45">Asking price</dt><dd className="font-bold">{formatPrice(Number(item.expected_price), item.currency)}</dd></div><div className="flex justify-between gap-4"><dt className="text-black/45">Current status</dt><dd className="font-bold">{consignmentLabels[item.status] ?? 'In progress'}</dd></div>{(payouts ?? []).map((payout) => <div key={payout.id} className="flex justify-between gap-4 border-t border-black/10 pt-4"><dt className="text-black/45">Seller payout · {payout.status === 'PAID' ? 'paid' : 'pending'}</dt><dd className="font-bold">{formatPrice(Number(payout.net_amount), payout.currency)}</dd></div>)}</dl></section>
          <section className="rounded-[1.5rem] bg-[#efede6] p-6 sm:p-8"><h2 className="text-xs font-bold uppercase tracking-wider">Status timeline</h2><ol className="mt-6 space-y-5">{events.map((event, index) => <li key={`${event.label}-${index}`} className="flex gap-3 text-sm"><span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-black" /><div><p className="font-bold">{event.label}</p><p className="mt-1 text-xs text-black/45">{formatDate(event.date)}</p></div></li>)}</ol></section>
        </div>
      </div>
    </main>
  );
}
