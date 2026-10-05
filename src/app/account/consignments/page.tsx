import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ArrowLeft, ArrowUpRight } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import { consignmentLabels } from '@/lib/commerce/labels';
import { formatDate, formatPrice } from '@/lib/utils';

export default async function AccountConsignmentsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/auth/sign-in?redirectTo=/account/consignments');

  const { data: submissions, error } = await supabase.from('consignment_submissions')
    .select('id, brand_name, product_name, size, status, expected_price, currency, created_at')
    .eq('seller_id', user.id).order('created_at', { ascending: false });
  if (error) throw new Error('Consignments are temporarily unavailable.');

  return (
    <main className="min-h-screen bg-[#fbfaf6] px-4 pb-20 pt-32 text-black sm:px-6 lg:px-10">
      <div className="mx-auto max-w-5xl">
        <Link href="/account" className="inline-flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-black/45 hover:text-black"><ArrowLeft className="h-4 w-4" /> Back to account</Link>
        <div className="mt-10 flex flex-wrap items-end justify-between gap-4"><div><p className="text-[10px] font-bold uppercase tracking-widest text-black/45">Your pieces with us</p><h1 className="mt-2 text-5xl font-black tracking-[-0.07em] sm:text-7xl">CONSIGNMENTS.</h1></div><Link href="/consign/new" className="rounded-full bg-black px-6 py-3 text-xs font-bold uppercase tracking-wider text-white">Submit a piece</Link></div>
        {!submissions?.length ? <div className="mt-10 rounded-[2rem] bg-[#efede6] p-8 sm:p-12"><h2 className="text-2xl font-black">No submissions yet.</h2><p className="mt-2 text-sm text-black/55">Start with a piece you are ready to sell.</p></div> : (
          <div className="mt-10 space-y-3">{submissions.map((item) => <Link key={item.id} href={`/account/consignments/${item.id}`} className="group flex items-center justify-between gap-5 rounded-[1.5rem] bg-white p-5 shadow-sm transition hover:shadow-md sm:p-7"><div><p className="text-[10px] font-bold uppercase tracking-widest text-black/40">{item.brand_name} · {formatDate(item.created_at)}</p><h2 className="mt-2 text-lg font-black">{item.product_name}</h2><p className="mt-2 text-xs text-black/50">Size {item.size} · {consignmentLabels[item.status] ?? 'In progress'} · Asking {formatPrice(Number(item.expected_price), item.currency)}</p></div><ArrowUpRight className="h-5 w-5 shrink-0 transition group-hover:-translate-y-1 group-hover:translate-x-1" /></Link>)}</div>
        )}
      </div>
    </main>
  );
}
