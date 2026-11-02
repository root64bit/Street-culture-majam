import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { decodeSavedAddresses } from '@/lib/checkout-addresses';
import { SavedAddresses } from '@/components/account/SavedAddresses';
export default async function AddressesPage() {
  const db = await createClient(),
    {
      data: { user },
    } = await db.auth.getUser();
  if (!user) redirect('/auth/sign-in?redirectTo=/account/addresses');
  const { data, error } = await db
    .from('customer_addresses')
    .select('id,label,details,is_default,revision')
    .eq('user_id', user.id)
    .order('is_default', { ascending: false })
    .order('created_at');
  if (error) throw new Error('Your saved addresses are temporarily unavailable.');
  return (
    <main className="mx-auto min-h-[70vh] max-w-5xl px-4 py-16 text-black sm:px-6">
      <Link href="/account" className="text-sm font-bold underline">
        Back to my account
      </Link>
      <p className="mt-10 text-xs font-bold uppercase tracking-wider text-neutral-600">
        Your delivery details
      </p>
      <h1 className="mb-5 mt-2 text-4xl font-black tracking-tight">Saved addresses.</h1>
      <SavedAddresses initial={decodeSavedAddresses(data)} />
    </main>
  );
}
