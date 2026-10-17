import Link from 'next/link';
import { ArrowLeft, BadgeCheck } from 'lucide-react';
import { businessDetails } from '@/lib/storefront/business';

export function PolicyPage({
  eyebrow,
  title,
  summary,
  children,
}: {
  eyebrow: string;
  title: string;
  summary: string;
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-[#f5f2ea] px-4 pb-24 pt-32 text-[#10211a] sm:px-6 sm:pt-36">
      <div className="mx-auto max-w-5xl">
        <Link
          href="/"
          className="inline-flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.16em] text-black/55 transition hover:text-black"
        >
          <ArrowLeft className="h-4 w-4" /> Back to the store
        </Link>

        <header className="mt-8 overflow-hidden rounded-[2rem] bg-[#0d211a] px-6 py-10 text-white sm:px-10 sm:py-14">
          <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-acid">{eyebrow}</p>
          <h1 className="mt-4 max-w-4xl text-4xl font-black leading-[0.94] tracking-[-0.055em] sm:text-6xl">
            {title}
          </h1>
          <p className="mt-6 max-w-3xl text-sm leading-7 text-white/65 sm:text-base">{summary}</p>
          <div className="mt-8 flex flex-wrap gap-2 text-[10px] font-bold uppercase tracking-[0.12em] text-white/70">
            <span className="rounded-full border border-white/15 bg-white/5 px-3 py-2">
              Updated {businessDetails.lastPolicyUpdate}
            </span>
            <span className="inline-flex items-center gap-2 rounded-full border border-acid/35 bg-acid/10 px-3 py-2 text-acid">
              <BadgeCheck className="h-3.5 w-3.5" /> Plain-language policy
            </span>
          </div>
        </header>

        <div className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,1fr)_260px]">
          <article className="space-y-6 rounded-[2rem] border border-black/10 bg-white p-6 shadow-[0_18px_60px_rgba(13,33,26,0.06)] sm:p-10 [&_a]:font-semibold [&_a]:underline [&_a]:decoration-black/25 [&_a]:underline-offset-4 [&_h2]:pt-2 [&_h2]:text-2xl [&_h2]:font-black [&_h2]:tracking-[-0.035em] [&_h3]:pt-1 [&_h3]:text-base [&_h3]:font-black [&_li]:pl-1 [&_ol]:ml-5 [&_ol]:list-decimal [&_ol]:space-y-2 [&_p]:text-sm [&_p]:leading-7 [&_p]:text-black/65 [&_strong]:text-black [&_ul]:ml-5 [&_ul]:list-disc [&_ul]:space-y-2 [&_ul]:text-sm [&_ul]:leading-7 [&_ul]:text-black/65">
            {children}
          </article>

          <aside className="h-fit rounded-[1.5rem] border border-black/10 bg-[#ece8dc] p-5 lg:sticky lg:top-28">
            <p className="text-[10px] font-black uppercase tracking-[0.18em] text-black/45">
              Business disclosure
            </p>
            <p className="mt-4 text-sm font-black">{businessDetails.tradingName}</p>
            <p className="mt-2 text-xs leading-5 text-black/60">
              Operating location: {businessDetails.operatingLocation}
            </p>
            <p className="mt-2 text-xs leading-5 text-black/60">
              Online store: {businessDetails.website.replace('https://', '')}
            </p>
            <Link
              href="/contact"
              className="mt-5 inline-flex w-full items-center justify-center rounded-full bg-black px-4 py-3 text-[10px] font-black uppercase tracking-[0.12em] text-white no-underline"
            >
              Contact support
            </Link>
          </aside>
        </div>
      </div>
    </div>
  );
}
