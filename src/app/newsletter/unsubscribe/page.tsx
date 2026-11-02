import { redirect } from 'next/navigation';
import { unsubscribeNewsletter } from '@/lib/communications/newsletter';

export const metadata = {
  title: 'Unsubscribe — Street Culture',
  referrer: 'no-referrer',
  robots: { index: false, follow: false },
};
export default async function UnsubscribePage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string; status?: string }>;
}) {
  const { token = '', status } = await searchParams;
  async function unsubscribe() {
    'use server';
    let success = false;
    try {
      success = await unsubscribeNewsletter(token);
    } catch {
      /* Display a safe retry message. */
    }
    redirect(`/newsletter/unsubscribe?status=${success ? 'done' : 'invalid'}`);
  }
  return (
    <main className="mx-auto max-w-xl px-5 py-20 text-neutral-950">
      <h1 className="text-2xl font-black">
        {status === 'done' ? 'You’re unsubscribed' : 'Leave the newsletter'}
      </h1>
      <p className="mt-4 text-sm">
        {status === 'done'
          ? 'You won’t receive marketing emails. Your account, security and order emails continue as usual.'
          : status === 'invalid'
            ? 'This link is invalid. Contact support@streetculturevault.com for help.'
            : 'Unsubscribe from Street Culture news, drops and offers. Your account and order emails are separate.'}
      </p>
      {!status && token && (
        <form action={unsubscribe}>
          <button className="mt-6 rounded-lg bg-emerald-800 px-5 py-3 text-sm font-bold text-white">
            Unsubscribe
          </button>
        </form>
      )}
    </main>
  );
}
