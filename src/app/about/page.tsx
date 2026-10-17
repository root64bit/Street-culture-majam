import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowRight, BadgeCheck, MapPin, SearchCheck } from 'lucide-react';

export const metadata: Metadata = {
  title: 'About Street Culture',
  description: 'Meet Street Culture, a curated sneaker, streetwear and luxury platform in Maputo.',
};

export default function AboutPage() {
  return (
    <main className="min-h-screen bg-[#f5f2ea] px-4 pb-24 pt-32 text-[#10211a] sm:px-6 sm:pt-36">
      <div className="mx-auto max-w-6xl">
        <section className="overflow-hidden rounded-[2.2rem] bg-[#0d211a] px-6 py-12 text-white sm:px-12 sm:py-16">
          <p className="text-[10px] font-black uppercase tracking-[0.24em] text-acid">About us</p>
          <h1 className="mt-5 max-w-4xl text-5xl font-black leading-[0.9] tracking-[-0.06em] sm:text-7xl">
            Culture deserves proof, not promises.
          </h1>
          <p className="mt-7 max-w-2xl text-base leading-7 text-white/65">
            Street Culture is a Maputo-based online destination for curated sneakers, streetwear,
            luxury fashion and accessories. We combine documented intake, product inspection and
            order tracking to make every transaction clearer.
          </p>
        </section>

        <section className="grid gap-5 py-10 md:grid-cols-3">
          {[
            [
              SearchCheck,
              'Inspect',
              'We check condition, identifiers, construction and provenance evidence appropriate to each item.',
            ],
            [
              BadgeCheck,
              'Document',
              'Listings, intake records and order status create a traceable path from seller to customer.',
            ],
            [
              MapPin,
              'Operate locally',
              'Our operating base is Maputo, Mozambique. This website is our online storefront.',
            ],
          ].map(([Icon, title, copy]) => {
            const CardIcon = Icon as typeof SearchCheck;
            return (
              <article
                key={String(title)}
                className="rounded-[1.7rem] border border-black/10 bg-white p-7"
              >
                <CardIcon className="h-6 w-6 text-[#087456]" />
                <h2 className="mt-5 text-xl font-black tracking-[-0.035em]">{String(title)}</h2>
                <p className="mt-3 text-sm leading-6 text-black/60">{String(copy)}</p>
              </article>
            );
          })}
        </section>

        <section className="grid gap-6 rounded-[2rem] bg-white p-7 sm:p-10 lg:grid-cols-2">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-black/40">
              How it works
            </p>
            <h2 className="mt-4 text-3xl font-black tracking-[-0.05em]">
              Direct stock and consignment
            </h2>
          </div>
          <div className="space-y-4 text-sm leading-7 text-black/60">
            <p>
              Some pieces are sold directly by Street Culture and others are accepted from sellers
              through our consignment workflow. Every accepted consignment follows documented
              seller, authentication, listing and payout steps.
            </p>
            <p>
              Checkout is charged in <strong className="text-black">MZN</strong>. EUR and ZAR
              displays are estimates only. A payment method is available only when it appears as
              active during checkout.
            </p>
          </div>
        </section>

        <section className="mt-6 flex flex-col items-start justify-between gap-6 rounded-[2rem] bg-acid p-7 sm:flex-row sm:items-center sm:p-10">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-black/55">
              Need clarity?
            </p>
            <h2 className="mt-3 text-3xl font-black tracking-[-0.05em]">
              Talk to the operations team.
            </h2>
          </div>
          <div className="flex flex-wrap gap-3">
            <Link
              href="/contact"
              className="inline-flex items-center gap-2 rounded-full bg-black px-6 py-3 text-xs font-black uppercase tracking-[0.12em] text-white"
            >
              Contact us <ArrowRight className="h-4 w-4" />
            </Link>
            <Link
              href="/shop"
              className="rounded-full border border-black/20 px-6 py-3 text-xs font-black uppercase tracking-[0.12em]"
            >
              Shop now
            </Link>
          </div>
        </section>
      </div>
    </main>
  );
}
