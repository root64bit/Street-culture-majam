'use client';

import Image from 'next/image';
import Link from 'next/link';
import React, { useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  ArrowDown,
  ArrowRight,
  ArrowUpRight,
  ChevronDown,
  Heart,
  MoveRight,
  ShoppingBag,
  Truck,
  ShieldCheck,
} from 'lucide-react';
import { type ProductCategory, type StoreProduct } from '@/data/storefront';
import { useCommerce } from '@/features/commerce/CommerceProvider';
import { DisplayPrice } from '@/features/currency/CurrencyProvider';
import { cn } from '@/lib/utils';
import { TrustStrip } from '@/components/layout/TrustStrip';
import { useWishlist } from '@/features/commerce/useWishlist';

export function Storefront({
  products,
  newArrivals,
  featuredProduct,
  categories,
  brands,
}: {
  products: StoreProduct[];
  newArrivals: StoreProduct[];
  featuredProduct?: StoreProduct;
  categories: { id: string; name: string; slug: string }[];
  brands: { id: string; name: string; slug: string }[];
}) {
  const [category, setCategory] = useState<ProductCategory | 'all'>('all');
  const { saved: wishlist, toggle: toggleWishlist } = useWishlist();
  const { openQuickBuy } = useCommerce();
  const mostWantedRef = useRef<HTMLDivElement>(null);

  const visibleProducts = useMemo(
    () =>
      category === 'all'
        ? products
        : products.filter((product) => product.category === category),
    [category, products],
  );
  const newProducts = newArrivals;
  const categoryCards = categories.map((item, index) => ({
    category: item.slug,
    label: item.name.toUpperCase(),
    position: ['46% 62%', '74% 36%', '58% 40%', '52% 25%'][index % 4],
  }));

  return (
    <div className="bg-[#fbfaf6] text-black">
      <div className="border-b border-black/10 bg-acid/45 px-4 py-2.5 text-center text-[9px] font-bold uppercase tracking-[0.16em] sm:text-[10px]">
        {products.length
          ? 'Live inventory · One-of-one pieces · Verified before sale'
          : 'New pieces are being prepared · Check back for live inventory'}
      </div>

      <section className="relative min-h-[700px] overflow-hidden bg-[#e7e3d9] pt-28 sm:min-h-[760px] lg:min-h-[min(860px,100svh)]" aria-labelledby="hero-title">
        <Image
          src="/images/street-culture-hero.png"
          alt="Street Culture campaign in Maputo, featuring contemporary streetwear against sunlit coastal architecture"
          fill
          priority
          sizes="100vw"
          className="object-cover object-[66%_center]"
        />
        <div className="absolute inset-0 bg-gradient-to-r from-[#fbfaf6]/95 via-[#fbfaf6]/72 to-transparent sm:from-[#fbfaf6]/88 sm:via-[#fbfaf6]/42" />
        <div className="relative mx-auto flex min-h-[600px] max-w-[1500px] items-end px-5 pb-16 sm:min-h-[650px] sm:px-8 sm:pb-20 lg:min-h-[calc(min(860px,100svh)-7rem)] lg:items-center lg:pb-8 lg:pt-8">
          <div className="max-w-2xl">
            <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-black/10 bg-white/65 px-3 py-2 text-[9px] font-bold uppercase tracking-[0.16em] backdrop-blur-xl sm:text-[10px]">
              <span className="h-2 w-2 rounded-full bg-acid" /> STREET CULTURE VERIFIED
            </div>
            <h1 id="hero-title" className="max-w-[11ch] text-[clamp(2.8rem,10vw,8.7rem)] font-black leading-[0.82] tracking-[-0.09em]">
              AUTHENTICITY
              <br />
              IS THE CULTURE.
            </h1>
            <p className="mt-6 max-w-md text-base leading-7 text-black/65 sm:text-lg sm:leading-8">
              Curated sneakers, streetwear and luxury. Every item verified before it reaches you.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <a href="#new" className="inline-flex h-13 items-center gap-3 rounded-full bg-black px-7 text-[11px] font-bold uppercase tracking-[0.15em] text-white transition hover:bg-acid hover:text-black">
                Shop new <ArrowRight className="h-4 w-4" />
              </a>
              <a href="#sneakers" className="inline-flex h-13 items-center gap-3 rounded-full border border-black/20 bg-white/55 px-7 text-[11px] font-bold uppercase tracking-[0.15em] backdrop-blur-xl transition hover:bg-white">
                Explore sneakers <ArrowDown className="h-4 w-4" />
              </a>
            </div>
          </div>
        </div>
        <div className="absolute bottom-5 right-5 hidden rounded-full border border-white/30 bg-white/55 px-4 py-2 text-[9px] font-bold uppercase tracking-[0.15em] backdrop-blur-xl md:block">Curated in Maputo · Mozambique</div>
      </section>

      <TrustStrip />

      <section id="new" className="scroll-mt-24 px-4 py-16 sm:px-6 sm:py-24 lg:px-10">
        <div className="mx-auto max-w-[1500px]">
          <SectionHeading eyebrow="THE EDIT" title="MOST WANTED" action="View all" href="/new" />
          <div className="mb-7 flex flex-wrap gap-2" aria-label="Filter products by category">
            {[{ value: 'all', label: 'All pieces' }, ...categoryCards.map((item) => ({ value: item.category, label: item.label }))].map((item) => (
              <button
                key={item.value}
                type="button"
                onClick={() => setCategory(item.value as ProductCategory | 'all')}
                aria-pressed={category === item.value}
                className={cn('rounded-full border px-4 py-2.5 text-[10px] font-bold uppercase tracking-[0.12em] transition', category === item.value ? 'border-black bg-black text-white' : 'border-black/15 bg-white hover:border-black')}
              >
                {item.label}
              </button>
            ))}
            <div className="ml-auto hidden items-center gap-2 sm:flex">
              <button
                type="button"
                onClick={() => mostWantedRef.current?.scrollBy({ left: -360, behavior: 'smooth' })}
                className="grid h-10 w-10 place-items-center rounded-full border border-black/15 bg-white transition hover:border-black hover:bg-black hover:text-white"
                aria-label="Previous Most Wanted products"
              >
                <ArrowLeft className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => mostWantedRef.current?.scrollBy({ left: 360, behavior: 'smooth' })}
                className="grid h-10 w-10 place-items-center rounded-full border border-black/15 bg-white transition hover:border-black hover:bg-black hover:text-white"
                aria-label="Next Most Wanted products"
              >
                <ArrowRight className="h-4 w-4" />
              </button>
            </div>
          </div>
          {visibleProducts.length ? (
            <div>
              <div
                ref={mostWantedRef}
                className="-mx-4 flex snap-x snap-mandatory gap-4 overflow-x-auto px-4 pb-5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:-mx-6 sm:gap-5 sm:px-6 lg:-mx-10 lg:gap-6 lg:px-10"
                role="region"
                aria-roledescription="carousel"
                aria-label="Most Wanted products"
              >
                {visibleProducts.map((product) => (
                  <ProductTile
                    key={product.id}
                    product={product}
                    favorite={wishlist.includes(product.productId ?? product.id)}
                    onFavorite={() => void toggleWishlist(product.productId ?? product.id)}
                    onQuickBuy={() => openQuickBuy(product)}
                    className="w-[76vw] max-w-[340px] shrink-0 snap-start sm:w-[42vw] lg:w-[calc((100%-4.5rem)/4)]"
                  />
                ))}
              </div>
            </div>
          ) : (
            <p className="rounded-3xl bg-[#f0eee8] p-10 text-center text-sm text-black/55">More pieces are being added to this edit.</p>
          )}
        </div>
      </section>

      <section id="sneakers" className="scroll-mt-24 bg-[#f0eee8] px-4 py-16 sm:px-6 sm:py-24 lg:px-10">
        <div className="mx-auto max-w-[1500px]">
          <SectionHeading eyebrow="FIND YOUR NEXT PAIR" title="SHOP BY CATEGORY" />
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {categoryCards.map((item, index) => (
              <button
                key={item.category}
                type="button"
                onClick={() => {
                  setCategory(item.category);
                  document.getElementById('new')?.scrollIntoView({ behavior: 'smooth' });
                }}
                id={item.category === 'streetwear' || item.category === 'luxury' || item.category === 'accessories' ? item.category : undefined}
                className="group relative min-h-52 overflow-hidden rounded-[1.6rem] bg-[#ddd9cf] text-left sm:min-h-72 lg:min-h-[420px]"
              >
                <Image
                  src={index % 2 === 0 ? '/images/street-culture-products.png' : '/images/street-culture-hero.png'}
                  alt=""
                  fill
                  sizes="(max-width: 768px) 50vw, 25vw"
                  className="object-cover transition duration-700 group-hover:scale-105"
                  style={{ objectPosition: item.position }}
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/65 via-black/0 to-black/0" />
                <div className="absolute inset-x-0 bottom-0 flex items-end justify-between p-4 text-white sm:p-6">
                  <span className="max-w-[12ch] text-xl font-black leading-[0.9] tracking-[-0.05em] sm:text-3xl">{item.label}</span>
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-white/90 text-black transition group-hover:bg-acid"><ArrowUpRight className="h-4 w-4" /></span>
                </div>
              </button>
            ))}
          </div>
        </div>
      </section>

      {newProducts.length > 0 && <section className="overflow-hidden px-4 py-16 sm:px-6 sm:py-24 lg:px-10">
        <div className="mx-auto max-w-[1500px]">
          <SectionHeading eyebrow="FRESH FINDS" title="JUST LANDED" action="Discover new" href="/new" />
          <div className="-mx-4 flex snap-x snap-mandatory gap-4 overflow-x-auto px-4 pb-4 sm:-mx-6 sm:px-6 lg:-mx-10 lg:px-10">
            {newProducts.map((product) => (
              <div key={product.id} className="w-[76vw] max-w-[340px] shrink-0 snap-start sm:w-[36vw] lg:w-[calc((100%-3rem)/4)]">
                <ProductTile product={product} favorite={wishlist.includes(product.productId ?? product.id)} onFavorite={() => void toggleWishlist(product.productId ?? product.id)} onQuickBuy={() => openQuickBuy(product)} />
              </div>
            ))}
          </div>
        </div>
      </section>}

      {featuredProduct && <section className="px-4 pb-16 sm:px-6 sm:pb-24 lg:px-10">
        <div className="mx-auto grid max-w-[1500px] overflow-hidden rounded-[2rem] bg-[#171816] text-white lg:min-h-[560px] lg:grid-cols-2">
          <div className="relative min-h-[300px] lg:order-2 lg:min-h-full">
            <Image src={featuredProduct.image} alt={featuredProduct.name} fill sizes="(max-width: 1024px) 100vw, 50vw" className="object-cover" style={{ objectPosition: featuredProduct.imagePosition }} />
            <div className="absolute inset-0 bg-gradient-to-t from-black/35 to-transparent lg:bg-gradient-to-l lg:from-[#171816]/20 lg:to-transparent" />
            <span className="absolute right-5 top-5 rounded-full bg-white/85 px-4 py-2 text-[9px] font-bold uppercase tracking-[0.15em] text-black backdrop-blur">Featured listing</span>
          </div>
          <div className="flex flex-col justify-center px-6 py-12 sm:px-10 lg:px-16 lg:py-16">
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-acid">{featuredProduct.brand}</p>
            <h2 className="mt-5 max-w-[12ch] text-5xl font-black leading-[0.87] tracking-[-0.07em] sm:text-7xl">{featuredProduct.name}</h2>
            <p className="mt-6 max-w-md text-sm leading-7 text-white/60">Verified {featuredProduct.condition.toLowerCase()} piece · {featuredProduct.sizes.join(', ')} · <DisplayPrice amount={featuredProduct.price} /></p>
            <Link href={`/products/${featuredProduct.slug}`} className="mt-8 inline-flex h-13 w-fit items-center gap-3 rounded-full bg-white px-6 text-[10px] font-bold uppercase tracking-[0.14em] text-black transition hover:bg-acid">View this piece <ArrowRight className="h-4 w-4" /></Link>
          </div>
        </div>
      </section>}

      {brands.length > 0 && <section className="px-4 pb-16 sm:px-6 sm:pb-24 lg:px-10" aria-label="Shop by brand">
        <div className="mx-auto max-w-[1500px] border-y border-black/10 py-8">
          <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-black/45">THE BRANDS</p>
          <div className="mt-5 flex flex-wrap gap-x-8 gap-y-4">
            {brands.map((brand) => <Link key={brand.id} href={`/brands/${brand.slug}`} className="text-sm font-black uppercase tracking-[-0.02em] hover:underline">{brand.name}</Link>)}
          </div>
        </div>
      </section>}

      <section id="authenticity" className="scroll-mt-24 bg-[#efede6] px-4 py-16 sm:px-6 sm:py-24 lg:px-10">
        <div className="mx-auto grid max-w-[1500px] gap-10 lg:grid-cols-[0.95fr_1.05fr] lg:items-center lg:gap-20">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-black/45">A closer look</p>
            <h2 className="mt-5 max-w-[9ch] text-6xl font-black leading-[0.83] tracking-[-0.08em] sm:text-8xl">REAL RECOGNISES REAL.</h2>
            <p className="mt-7 max-w-lg text-sm leading-7 text-black/60 sm:text-base">Every piece is inspected by STREET CULTURE before it is approved for sale. We look closely, so you can wear it with confidence.</p>
            <Link href="/consign" className="mt-7 inline-flex items-center gap-3 text-[10px] font-bold uppercase tracking-[0.15em]">How we verify <MoveRight className="h-4 w-4" /></Link>
          </div>
          <div className="relative min-h-[360px] overflow-hidden rounded-[2rem] bg-[#ddd9cf] sm:min-h-[520px]">
            <Image src="/images/street-culture-hero.png" alt="A STREET CULTURE verified fashion piece, ready for inspection" fill sizes="(max-width: 1024px) 100vw, 50vw" className="object-cover" style={{ objectPosition: '77% center' }} />
            <div className="absolute bottom-4 left-4 right-4 grid grid-cols-2 gap-2 sm:bottom-6 sm:left-6 sm:right-6 sm:grid-cols-4">
              {['Received', 'Inspected', 'Verified', 'Ready to ship'].map((step, index) => (
                <div key={step} className="rounded-2xl border border-white/40 bg-white/75 p-3 backdrop-blur-xl sm:p-4">
                  <span className="grid h-6 w-6 place-items-center rounded-full bg-acid text-[9px] font-black">{index + 1}</span>
                  <span className="mt-3 block text-[9px] font-bold uppercase tracking-[0.1em] sm:text-[10px]">{step}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section id="sell" className="scroll-mt-24 px-4 py-16 sm:px-6 sm:py-24 lg:px-10">
        <div className="mx-auto grid max-w-[1500px] overflow-hidden rounded-[2rem] bg-acid lg:min-h-[480px] lg:grid-cols-[1.1fr_0.9fr]">
          <div className="relative min-h-[300px] lg:order-2 lg:min-h-full">
            <Image src="/images/street-culture-hero.png" alt="A seller bringing a considered wardrobe piece to Street Culture" fill sizes="(max-width: 1024px) 100vw, 45vw" className="object-cover" style={{ objectPosition: '84% center' }} />
          </div>
          <div className="flex flex-col justify-center p-6 sm:p-12 lg:p-16">
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-black/55">Sell with STREET CULTURE</p>
            <h2 className="mt-5 max-w-[9ch] text-5xl font-black leading-[0.86] tracking-[-0.07em] sm:text-7xl">YOUR CLOSET HAS VALUE.</h2>
            <p className="mt-6 max-w-md text-sm leading-7 text-black/65">Sell authentic sneakers, streetwear and luxury pieces through STREET CULTURE. We inspect it, list it, sell it. You get paid.</p>
            <div className="mt-7 flex flex-wrap gap-3">
              <Link href="/consign/new" className="inline-flex h-13 items-center gap-3 rounded-full bg-black px-7 text-[10px] font-bold uppercase tracking-[0.14em] text-white">Start selling <ArrowRight className="h-4 w-4" /></Link>
              <Link href="/consign" className="inline-flex h-13 items-center rounded-full border border-black/20 px-6 text-[10px] font-bold uppercase tracking-[0.14em]">How it works</Link>
            </div>
          </div>
        </div>
      </section>

      <section className="bg-black px-4 py-14 text-white sm:px-6 sm:py-20 lg:px-10">
        <div className="mx-auto grid max-w-[1500px] gap-8 sm:grid-cols-3">
          {[
            { icon: ShieldCheck, title: 'Verified before shipping', body: 'Each item is inspected before it is approved for sale.' },
            { icon: LockKeyholeIcon, title: 'Secure local payments', body: 'Payment options will reflect what is configured for Mozambique.' },
            { icon: Truck, title: 'Tracked orders', body: 'Delivery updates keep you informed as your order moves.' },
          ].map(({ icon: Icon, title, body }) => (
            <div key={title} className="flex gap-4 border-t border-white/20 pt-5">
              <Icon className="mt-0.5 h-5 w-5 shrink-0 text-acid" />
              <div><h3 className="text-sm font-bold">{title}</h3><p className="mt-2 text-xs leading-5 text-white/55">{body}</p></div>
            </div>
          ))}
        </div>
      </section>

      <section id="faq" className="scroll-mt-24 px-4 py-16 sm:px-6 sm:py-24 lg:px-10">
        <div className="mx-auto grid max-w-[1500px] gap-10 lg:grid-cols-[0.75fr_1.25fr]">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-black/45">Good to know</p>
            <h2 className="mt-4 text-5xl font-black leading-[0.88] tracking-[-0.07em] sm:text-7xl">A FEW QUICK ANSWERS.</h2>
          </div>
          <div className="divide-y divide-black/10 border-y border-black/10">
            {[
              ['Are all products authentic?', 'Every item is inspected by STREET CULTURE before it is approved for sale.'],
              ['How does authentication work?', 'Our team checks each piece in person before it is listed and again before it ships.'],
              ['Can I sell my sneakers?', 'Yes. Submit your item through the consignment form and our team will guide you through the next steps.'],
              ['How long does delivery take?', 'Delivery timing depends on your location. We will share the available estimate before you place an order.'],
              ['What payment methods are accepted?', 'M-Pesa is the local payment option when checkout is available. You approve the request securely on your phone.'],
              ['Can I return an item?', 'Return options are shown with the product and order details. Contact the team if you need help with a purchase.'],
              ['What if an item fails authentication?', 'It is not approved for sale and will not be shipped to the buyer.'],
            ].map(([question, answer]) => (
              <details key={question} className="group py-5">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-sm font-bold sm:text-base">
                  {question}<ChevronDown className="h-4 w-4 shrink-0 transition group-open:rotate-180" />
                </summary>
                <p className="max-w-2xl pt-3 text-sm leading-6 text-black/55">{answer}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      <section className="px-4 pb-16 sm:px-6 sm:pb-24 lg:px-10">
        <div className="mx-auto flex max-w-[1500px] flex-col items-start justify-between gap-6 rounded-[2rem] bg-[#efede6] p-6 sm:p-10 md:flex-row md:items-center">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-black/45">A better way to find your next piece</p>
            <h2 className="mt-3 max-w-[12ch] text-4xl font-black tracking-[-0.07em] sm:text-6xl">MAKE IT YOURS.</h2>
          </div>
          <a href="#new" className="inline-flex h-13 shrink-0 items-center gap-3 rounded-full bg-black px-7 text-[10px] font-bold uppercase tracking-[0.14em] text-white transition hover:bg-acid hover:text-black">Shop the edit <ArrowRight className="h-4 w-4" /></a>
        </div>
      </section>
    </div>
  );
}

function ProductTile({
  product,
  favorite,
  onFavorite,
  onQuickBuy,
  className,
}: {
  product: StoreProduct;
  favorite: boolean;
  onFavorite: () => void;
  onQuickBuy: () => void;
  className?: string;
}) {
  return (
    <article className={cn('group min-w-0', className)}>
      <div className="relative aspect-[0.84] overflow-hidden rounded-2xl bg-[#e8e5dd] sm:rounded-[1.6rem]">
        <Image src={product.image} alt={product.name} fill sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw" className="object-cover transition duration-700 group-hover:scale-[1.04]" style={{ objectPosition: product.imagePosition }} />
        <span className="absolute left-3 top-3 inline-flex items-center gap-1.5 rounded-full bg-white/85 px-2.5 py-1.5 text-[8px] font-bold uppercase tracking-[0.12em] backdrop-blur sm:left-4 sm:top-4 sm:px-3 sm:text-[9px]"><span className="h-1.5 w-1.5 rounded-full bg-acid" /> Verified</span>
        {product.isNew && <span className="absolute bottom-3 left-3 rounded-full bg-black px-2.5 py-1.5 text-[8px] font-bold uppercase tracking-[0.12em] text-white sm:bottom-4 sm:left-4 sm:px-3 sm:text-[9px]">Just landed</span>}
        <button type="button" onClick={onFavorite} aria-label={favorite ? `Remove ${product.name} from wishlist` : `Add ${product.name} to wishlist`} aria-pressed={favorite} className="absolute right-3 top-3 grid h-9 w-9 place-items-center rounded-full bg-white/85 backdrop-blur transition hover:bg-white sm:right-4 sm:top-4 sm:h-10 sm:w-10">
          <Heart className={cn('h-4 w-4', favorite && 'fill-black')} />
        </button>
        <button type="button" onClick={onQuickBuy} className="absolute inset-x-2 bottom-2 flex h-11 items-center justify-center gap-2 rounded-full bg-white/92 text-[9px] font-bold uppercase tracking-[0.13em] opacity-100 backdrop-blur transition hover:bg-black hover:text-white sm:inset-x-3 sm:bottom-3 sm:h-12 sm:text-[10px] sm:opacity-0 sm:group-hover:opacity-100 sm:focus:opacity-100">
          <ShoppingBag className="h-3.5 w-3.5" /> Quick buy
        </button>
      </div>
      <div className="px-1 pt-3 sm:px-2 sm:pt-4">
        <p className="text-[8px] font-bold uppercase tracking-[0.16em] text-black/45 sm:text-[9px]">{product.brand}</p>
        <h3 className="mt-1 line-clamp-2 min-h-10 text-xs font-semibold leading-5 sm:text-sm">{product.name}</h3>
        <div className="mt-2 flex items-center justify-between gap-2">
          <p className="text-xs font-black sm:text-sm"><DisplayPrice amount={product.price} /></p>
          <p className="truncate text-[9px] text-black/45 sm:text-[10px]">{product.sizes.slice(0, 3).join(' · ')}{product.sizes.length > 3 ? ' +' : ''}</p>
        </div>
      </div>
    </article>
  );
}

function SectionHeading({ eyebrow, title, action, href }: { eyebrow: string; title: string; action?: string; href?: string }) {
  return (
    <div className="mb-7 flex items-end justify-between gap-4 sm:mb-9">
      <div>
        <p className="text-[9px] font-bold uppercase tracking-[0.18em] text-black/45 sm:text-[10px]">{eyebrow}</p>
        <h2 className="mt-2 text-4xl font-black leading-none tracking-[-0.07em] sm:text-6xl">{title}</h2>
      </div>
      {action && href && <Link href={href} className="inline-flex shrink-0 items-center gap-2 pb-1 text-[9px] font-bold uppercase tracking-[0.12em] sm:text-[10px]">{action}<ArrowUpRight className="h-3.5 w-3.5" /></Link>}
    </div>
  );
}

function LockKeyholeIcon(props: React.ComponentProps<'svg'>) {
  return <ShieldCheck {...props} />;
}
