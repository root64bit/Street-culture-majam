import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';

export async function ProductAdminLink({ productId }: { productId: string }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const allowed = await supabase.rpc('has_capability', { check_capability: 'products.write' });
  if (allowed.error || !allowed.data) return null;
  return (
    <div className="mx-auto flex max-w-7xl justify-end px-5 pt-5">
      <Link
        href={`/admin/products/${productId}?tab=all`}
        className="rounded-full border border-black/20 bg-white px-5 py-3 text-xs font-bold text-black"
      >
        Edit this product
      </Link>
    </div>
  );
}
