import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ArrowLeft, ArrowUpRight } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';

export default async function WishlistPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/auth/sign-in?redirectTo=/account/wishlist');
  const { data: items, error } = await supabase.from('wishlist_items')
    .select('id, products(name, slug)')
    .eq('user_id', user.id).order('created_at', { ascending: false });
  if (error) throw new Error('Wishlist is temporarily unavailable.');

  return (
    <main className="min-h-screen bg-[#fbfaf6] px-4 pb-20 pt-32 text-black sm:px-6 lg:px-10">
      <div className="mx-auto max-w-5xl">
        <Link href="/account" className="inline-flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-black/45 hover:text-black"><ArrowLeft className="h-4 w-4" /> Back to account</Link>
        <p className="mt-10 text-[10px] font-bold uppercase tracking-widest text-black/45">Saved pieces</p>
        <h1 className="mt-2 text-5xl font-black tracking-[-0.07em] sm:text-7xl">WISHLIST.</h1>
        {!items?.length ? <div className="mt-10 rounded-[2rem] bg-[#efede6] p-8 sm:p-12"><h2 className="text-2xl font-black">Nothing saved yet.</h2><p className="mt-2 text-sm text-black/55">Tap the heart on a piece to find it here.</p><Link href="/new" className="mt-6 inline-flex rounded-full bg-black px-6 py-3 text-xs font-bold uppercase tracking-wider text-white">Explore pieces</Link></div> : <div className="mt-10 grid gap-3 sm:grid-cols-2">{items.map((item) => item.products && <Link key={item.id} href={`/products/${item.products.slug}`} className="group flex items-center justify-between gap-4 rounded-[1.5rem] bg-white p-6 shadow-sm transition hover:shadow-md"><span className="font-bold">{item.products.name}</span><ArrowUpRight className="h-5 w-5 shrink-0 transition group-hover:-translate-y-1 group-hover:translate-x-1" /></Link>)}</div>}
      </div>
    </main>
  );
}
