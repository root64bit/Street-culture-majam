import { redirect } from 'next/navigation';
import { confirmNewsletter } from '@/lib/communications/newsletter';

export const metadata = {
  title: 'Confirm newsletter — Street Culture',
  referrer: 'no-referrer',
  robots: { index: false, follow: false },
};
export default async function ConfirmNewsletterPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string; status?: string }>;
}) {
  const { token = '', status } = await searchParams;
  async function confirm() {
    'use server';
    let success = false;
    try {
      success = await confirmNewsletter(token);
    } catch {
      /* Display a safe retry message. */
    }
    redirect(`/newsletter/confirm?status=${success ? 'confirmed' : 'invalid'}`);
  }
  return (
    <main className="mx-auto max-w-xl px-5 py-20 text-neutral-950">
      <h1 className="text-2xl font-black">
        {status === 'confirmed' ? 'You’re on the list' : 'Confirm your subscription'}
      </h1>
      <p className="mt-4 text-sm">
        {status === 'confirmed'
          ? 'You’ll receive Street Culture news, drops and offers. You can unsubscribe from any marketing email.'
          : status === 'invalid'
            ? 'This confirmation link is invalid or expired. Please subscribe again from the website footer.'
            : 'Choose below to receive Street Culture news, drops and offers by email.'}
      </p>
      {!status && token && (
        <form action={confirm}>
          <button className="mt-6 rounded-lg bg-emerald-800 px-5 py-3 text-sm font-bold text-white">
            Confirm subscription
          </button>
        </form>
      )}
    </main>
  );
}
