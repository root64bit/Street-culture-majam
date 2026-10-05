import Link from 'next/link';
import { ArrowRight, Boxes, ClipboardList, Package } from 'lucide-react';
import { requireStaffPage } from '@/lib/admin/access';

export default async function AdminDashboardPage() {
  const { supabase, user } = await requireStaffPage('/admin');
  const [products, liveListings, draftListings, openOrders] = await Promise.all([
    supabase.from('products').select('id', { count: 'exact', head: true }),
    supabase.from('listings').select('id', { count: 'exact', head: true }).eq('status', 'LIVE'),
    supabase.from('listings').select('id', { count: 'exact', head: true }).eq('status', 'DRAFT'),
    supabase.from('orders').select('id', { count: 'exact', head: true }).in('status', ['PENDING', 'CONFIRMED', 'PROCESSING']),
  ]);
  if ([products, liveListings, draftListings, openOrders].some((result) => result.error)) {
    throw new Error('Admin data is temporarily unavailable.');
  }

  return (
    <section className="min-h-screen bg-[#fbfaf6] px-4 pb-24 pt-32 text-black sm:px-6 lg:px-10">
      <div className="mx-auto max-w-6xl">
        <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#065f46]">Street Culture operations</p>
        <h1 className="mt-3 text-5xl font-black tracking-[-0.07em] sm:text-7xl">ADMIN.</h1>
        <p className="mt-3 text-sm text-black/55">Signed in as {user.email}. Only staff can see this workspace.</p>
        <Link href="/account" className="mt-3 inline-block text-xs font-bold uppercase tracking-wider text-[#065f46] hover:underline">Account & sign out →</Link>

        <div className="mt-10 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[
            ['Products', products.count ?? 0],
            ['Live listings', liveListings.count ?? 0],
            ['Draft listings', draftListings.count ?? 0],
            ['Open orders', openOrders.count ?? 0],
          ].map(([label, count]) => (
            <div key={label} className="rounded-3xl border border-black/10 bg-white p-6">
              <p className="text-[10px] font-bold uppercase tracking-widest text-black/45">{label}</p>
              <p className="mt-4 text-4xl font-black tabular-nums">{count}</p>
            </div>
          ))}
        </div>

        <Link href="/admin/products" className="group mt-7 flex items-center justify-between gap-6 rounded-[2rem] bg-black p-7 text-white transition hover:bg-[#065f46] sm:p-10">
          <span className="flex items-start gap-5">
            <Package className="mt-1 h-7 w-7 shrink-0" />
            <span><strong className="block text-2xl font-black tracking-tight">Products & photography</strong><span className="mt-2 block max-w-xl text-sm text-white/65">Create unpublished product drafts, organize brands and categories, and attach images before inventory is verified for sale.</span></span>
          </span>
          <ArrowRight className="h-6 w-6 shrink-0 transition group-hover:translate-x-1" />
        </Link>

        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div className="rounded-[2rem] border border-black/10 bg-white p-7"><Boxes className="h-6 w-6 text-[#065f46]" /><h2 className="mt-4 text-lg font-black">Inventory listings</h2><p className="mt-2 text-sm text-black/55">Pricing, authentication, and publication remain separate from catalog drafts. No item becomes sellable just by adding a product.</p></div>
          <div className="rounded-[2rem] border border-black/10 bg-white p-7"><ClipboardList className="h-6 w-6 text-[#065f46]" /><h2 className="mt-4 text-lg font-black">Orders & fulfillment</h2><p className="mt-2 text-sm text-black/55">Live counts above reflect the database. An operator order-management screen is not yet configured.</p></div>
        </div>
      </div>
    </section>
  );
}
