import Link from 'next/link';
import { ShieldCheck, ArrowUpRight } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import { safeAuthRedirect } from '@/lib/auth-redirect';
import { SwitchAccountButton } from '@/components/auth/SwitchAccountButton';
export const metadata = {
  title: 'Private access | Street Culture',
  robots: { index: false, follow: false },
};
export default async function AccessPage({
  searchParams,
}: {
  searchParams: Promise<{ area?: string; redirectTo?: string }>;
}) {
  const params = await searchParams,
    staff = params.area === 'staff';
  const requested = safeAuthRedirect(params.redirectTo),
    returnTo = requested.startsWith('/auth/') ? '/account' : requested;
  const {
    data: { user },
  } = await (await createClient()).auth.getUser();
  return (
    <main className="min-h-[70vh] bg-[#fbfaf6] px-4 py-16 text-black sm:py-24">
      <section className="mx-auto max-w-xl overflow-hidden rounded-[2rem] border border-black/10 bg-white shadow-xl">
        <div className="h-3 bg-acid" />
        <div className="p-7 sm:p-10">
          <span className="inline-flex rounded-2xl bg-[#f0f6dd] p-4">
            <ShieldCheck className="h-7 w-7" />
          </span>
          <p className="mt-6 text-xs font-bold uppercase tracking-[0.18em] text-neutral-600">
            Private access · Street Culture
          </p>
          <h1 className="mt-3 text-3xl font-black tracking-tight sm:text-4xl">
            Let’s get you to the right account.
          </h1>
          <p className="mt-5 text-base leading-7 text-neutral-700">
            {staff
              ? 'This area is for authorized store staff. Your current session may not have the access this link requires.'
              : 'We can’t open this private order link with your current session. Please use the account that placed the order, or the original checkout browser for a guest purchase.'}
          </p>
          <p className="mt-3 text-sm leading-6 text-neutral-600">
            For your privacy, we don’t show order details or confirm which email owns an order here.
            If the link is old or you still need help, contact our team.
          </p>
          <div className="mt-7 flex flex-wrap items-center gap-4">
            {user ? (
              <SwitchAccountButton returnTo={returnTo} />
            ) : (
              <Link
                className="rounded-full bg-acid px-6 py-3 text-sm font-bold text-black"
                href={`/auth/sign-in?redirectTo=${encodeURIComponent(returnTo)}`}
              >
                Sign in to continue
              </Link>
            )}
            <Link className="text-sm font-bold underline" href="/account">
              My account
            </Link>
          </div>
          <a
            className="mt-7 inline-flex items-center gap-2 text-sm font-semibold text-neutral-700"
            href="mailto:support@streetculturevault.com"
          >
            Contact support <ArrowUpRight className="h-4 w-4" />
          </a>
        </div>
      </section>
    </main>
  );
}
