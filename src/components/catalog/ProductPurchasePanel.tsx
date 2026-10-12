'use client';

import Image from 'next/image';
import Link from 'next/link';
import {
  ArrowLeft,
  ArrowUpRight,
  Heart,
  Maximize2,
  ShieldCheck,
  ShoppingBag,
  Truck,
  WalletCards,
  X,
} from 'lucide-react';
import { useState } from 'react';
import type { StoreProduct } from '@/data/storefront';
import { useCommerce } from '@/features/commerce/CommerceProvider';
import { DisplayPrice } from '@/features/currency/CurrencyProvider';
import { useWishlist } from '@/features/commerce/useWishlist';

type ProductImage = { id: string; src: string; alt: string };

export function ProductPurchasePanel({
  productId,
  name,
  brand,
  category,
  description,
  model,
  styleCode,
  colorway,
  releaseYear,
  images,
  listings,
  related,
}: {
  productId: string;
  name: string;
  brand: string;
  category: string;
  description: string | null;
  model: string | null;
  styleCode: string | null;
  colorway: string | null;
  releaseYear: number | null;
  images: ProductImage[];
  listings: StoreProduct[];
  related: StoreProduct[];
}) {
  const [selectedId, setSelectedId] = useState(listings[0]?.listingId ?? '');
  const [activeImage, setActiveImage] = useState(0);
  const [viewerOpen, setViewerOpen] = useState(false);
  const [shareStatus, setShareStatus] = useState('');
  const selected = listings.find((listing) => listing.listingId === selectedId);
  const gallery = images.length
    ? images
    : [{ id: 'fallback', src: '/images/street-culture-products.png', alt: name }];
  const { addToCart, openQuickBuy } = useCommerce();
  const { saved, toggle } = useWishlist();

  function purchase(buyNow: boolean) {
    if (!selected) return;
    addToCart(selected, selected.sizes[0], buyNow);
  }

  async function share() {
    const url = window.location.href;
    try {
      if (navigator.share) {
        await navigator.share({ title: `${brand} ${name}`, url });
        setShareStatus('Shared');
      } else {
        await navigator.clipboard.writeText(url);
        setShareStatus('Link copied');
      }
    } catch {
      setShareStatus('');
    }
  }

  return (
    <main className="min-h-screen bg-[#f7f6f2] pb-28 pt-28 text-black lg:pb-20">
      <div className="mx-auto max-w-[1500px] px-4 sm:px-6 lg:px-10">
        <Link
          href="/shop"
          className="inline-flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-black/45 hover:text-black"
        >
          <ArrowLeft className="h-4 w-4" /> Back to all products
        </Link>

        <div className="mt-6 grid gap-10 lg:grid-cols-[minmax(0,1.15fr)_minmax(400px,0.85fr)] lg:gap-14">
          <section aria-label="Product gallery" className="min-w-0">
            <button
              type="button"
              onClick={() => setViewerOpen(true)}
              className="group relative block aspect-[0.88] w-full overflow-hidden rounded-[2rem] bg-[#e8e5dd]"
              aria-label={`Open full-screen image of ${name}`}
            >
              <Image
                src={gallery[activeImage].src}
                alt={gallery[activeImage].alt}
                fill
                priority
                sizes="(max-width: 1024px) 100vw, 58vw"
                className="object-cover transition duration-700 group-hover:scale-[1.02]"
              />
              <span className="absolute right-5 top-5 grid h-11 w-11 place-items-center rounded-full border border-white/40 bg-white/80 backdrop-blur-xl">
                <Maximize2 className="h-4 w-4" />
              </span>
              <span className="absolute left-5 top-5 inline-flex items-center gap-2 rounded-full bg-white/85 px-4 py-2 text-[10px] font-bold uppercase tracking-wider backdrop-blur-xl">
                <span className="h-2 w-2 rounded-full bg-[#c6ff00]" /> Verified piece
              </span>
            </button>
            {gallery.length > 1 && (
              <div
                className="mt-4 flex snap-x gap-3 overflow-x-auto pb-2"
                aria-label="Product thumbnails"
              >
                {gallery.map((image, index) => (
                  <button
                    key={image.id}
                    type="button"
                    onClick={() => setActiveImage(index)}
                    aria-label={`Show product image ${index + 1}`}
                    aria-pressed={activeImage === index}
                    className={`relative aspect-square w-24 shrink-0 snap-start overflow-hidden rounded-2xl border-2 bg-[#e8e5dd] ${activeImage === index ? 'border-black' : 'border-transparent'}`}
                  >
                    <Image src={image.src} alt="" fill sizes="96px" className="object-cover" />
                  </button>
                ))}
              </div>
            )}
          </section>

          <section className="lg:sticky lg:top-28 lg:self-start">
            <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-[#006b50]">
              {brand}
            </p>
            <h1 className="mt-3 max-w-[14ch] text-5xl font-black uppercase leading-[0.88] tracking-[-0.07em] sm:text-7xl">
              {name}
            </h1>
            <p className="mt-4 text-sm text-black/50">
              {category}
              {model ? ` · ${model}` : ''}
            </p>
            <p className="mt-6 text-3xl font-black">
              {selected ? <DisplayPrice amount={selected.price} /> : 'Currently unavailable'}
            </p>

            {listings.length > 0 ? (
              <>
                <div className="mt-8 flex items-end justify-between gap-4">
                  <h2 className="text-xs font-bold uppercase tracking-wider">
                    Choose your exact piece
                  </h2>
                  <span className="text-xs text-black/45">{listings.length} available</span>
                </div>
                <div
                  className="mt-3 grid gap-2 sm:grid-cols-2"
                  role="radiogroup"
                  aria-label="Available listings"
                >
                  {listings.map((listing) => (
                    <button
                      key={listing.listingId}
                      type="button"
                      role="radio"
                      aria-checked={selectedId === listing.listingId}
                      onClick={() => setSelectedId(listing.listingId ?? '')}
                      className={`rounded-2xl border p-4 text-left transition ${selectedId === listing.listingId ? 'border-black bg-black text-white' : 'border-black/15 bg-white hover:border-black'}`}
                    >
                      <span className="block text-sm font-bold">Size {listing.sizes[0]}</span>
                      <span className="mt-1 block text-xs opacity-70">
                        {listing.condition} ·{' '}
                        {listing.ownershipType === 'STREET_CULTURE' ? 'Store stock' : 'Consignment'}
                      </span>
                      <span className="mt-2 block text-sm font-black">
                        <DisplayPrice amount={listing.price} />
                      </span>
                    </button>
                  ))}
                </div>
                <div className="mt-6 grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => purchase(false)}
                    disabled={!selected}
                    className="inline-flex h-14 items-center justify-center gap-2 rounded-full border border-black bg-white px-5 text-xs font-bold uppercase tracking-wider transition hover:bg-black hover:text-white disabled:opacity-50"
                  >
                    <ShoppingBag className="h-4 w-4" /> Add to bag
                  </button>
                  <button
                    type="button"
                    onClick={() => purchase(true)}
                    disabled={!selected}
                    className="inline-flex h-14 items-center justify-center rounded-full bg-black px-5 text-xs font-bold uppercase tracking-wider text-white transition hover:bg-[#c6ff00] hover:text-black disabled:opacity-50"
                  >
                    Buy now
                  </button>
                </div>
              </>
            ) : (
              <div className="mt-8 rounded-2xl bg-[#eeede7] p-5">
                <p className="text-sm font-bold">Sold out for now.</p>
                <p className="mt-1 text-xs text-black/55">
                  There is no verified live listing for this product.
                </p>
              </div>
            )}

            <div className="mt-5 flex flex-wrap gap-x-6 gap-y-3 text-xs font-bold uppercase tracking-wider">
              <button
                type="button"
                onClick={() => void toggle(productId)}
                aria-pressed={saved.includes(productId)}
                className="inline-flex items-center gap-2"
              >
                <Heart className={`h-4 w-4 ${saved.includes(productId) ? 'fill-black' : ''}`} />{' '}
                {saved.includes(productId) ? 'Saved' : 'Wishlist'}
              </button>
              <button
                type="button"
                onClick={() => void share()}
                className="inline-flex items-center gap-2"
              >
                <ArrowUpRight className="h-4 w-4" /> {shareStatus || 'Share product'}
              </button>
              <a href="#details" className="underline underline-offset-4">
                Size & details
              </a>
            </div>

            <div className="mt-8 grid gap-3 rounded-[1.5rem] border border-black/10 bg-white/65 p-5 backdrop-blur sm:grid-cols-3 lg:grid-cols-1 xl:grid-cols-3">
              {[
                [ShieldCheck, 'Authenticated', 'Item-level review'],
                [WalletCards, 'Secure payment', 'M-Pesa when enabled'],
                [Truck, 'Delivery', 'Calculated at checkout'],
              ].map(([Icon, title, body]) => {
                const TrustIcon = Icon as typeof ShieldCheck;
                return (
                  <div key={String(title)} className="flex gap-3">
                    <TrustIcon className="mt-0.5 h-4 w-4 shrink-0 text-[#006b50]" />
                    <div>
                      <p className="text-xs font-bold">{String(title)}</p>
                      <p className="mt-1 text-[10px] text-black/45">{String(body)}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        </div>

        <section
          id="details"
          className="mt-16 grid gap-8 border-t border-black/10 pt-12 lg:grid-cols-[0.7fr_1.3fr]"
        >
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-black/45">
              The full record
            </p>
            <h2 className="mt-3 text-4xl font-black uppercase tracking-[-0.06em]">
              Product details.
            </h2>
          </div>
          <div className="grid gap-8 sm:grid-cols-2">
            <dl className="grid grid-cols-2 gap-x-4 gap-y-5 text-sm">
              {[
                ['Brand', brand],
                ['Category', category],
                ['Model', model],
                ['Colorway', colorway],
                ['Style code', styleCode],
                ['Release year', releaseYear ? String(releaseYear) : null],
              ].map(([label, detail]) => (
                <div key={label}>
                  <dt className="text-[10px] font-bold uppercase tracking-wider text-black/40">
                    {label}
                  </dt>
                  <dd className="mt-1 font-semibold">{detail || '—'}</dd>
                </div>
              ))}
            </dl>
            <div className="text-sm leading-7 text-black/60">
              <p>{description || 'This product record has no additional description yet.'}</p>
              <p className="mt-5">
                Only the selected live listing ID is carried into the bag and revalidated by the
                server before checkout.
              </p>
            </div>
          </div>
        </section>

        <section className="mt-14 divide-y divide-black/10 border-y border-black/10">
          {[
            [
              'Condition & authentication',
              selected
                ? `${selected.condition}. This exact listing passed the required item-level review before publication.`
                : 'No live listing is available.',
            ],
            [
              'Shipping & returns',
              'Delivery choices and price are shown for the customer’s Mozambique province during checkout. Return eligibility is confirmed with the order details.',
            ],
            [
              'Consignment assurance',
              'One-of-one listings stay tied to their original listing record from product selection through checkout.',
            ],
          ].map(([title, body]) => (
            <details key={title} className="py-5">
              <summary className="cursor-pointer list-none text-sm font-bold">{title}</summary>
              <p className="max-w-3xl pt-3 text-sm leading-7 text-black/55">{body}</p>
            </details>
          ))}
        </section>

        {related.length > 0 && (
          <section className="mt-16">
            <div className="mb-7 flex items-end justify-between">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-black/45">
                  More from the edit
                </p>
                <h2 className="mt-2 text-4xl font-black uppercase tracking-[-0.06em]">
                  You may also like.
                </h2>
              </div>
              <Link
                href={`/shop?category=${encodeURIComponent(related[0].category)}`}
                className="text-[10px] font-bold uppercase tracking-wider"
              >
                View category
              </Link>
            </div>
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
              {related.map((product) => (
                <article key={product.id} className="group min-w-0">
                  <div className="relative aspect-[0.84] overflow-hidden rounded-2xl bg-[#e8e5dd]">
                    <Link href={`/products/${product.slug}`} className="absolute inset-0">
                      <Image
                        src={product.image}
                        alt={product.name}
                        fill
                        sizes="(max-width: 640px) 50vw, 25vw"
                        className="object-cover transition duration-700 group-hover:scale-105"
                      />
                    </Link>
                    <button
                      type="button"
                      onClick={() => openQuickBuy(product)}
                      className="absolute inset-x-3 bottom-3 h-11 rounded-full bg-white/90 text-[9px] font-bold uppercase tracking-wider backdrop-blur"
                    >
                      Quick view
                    </button>
                  </div>
                  <p className="mt-3 text-[9px] font-bold uppercase tracking-widest text-black/45">
                    {product.brand}
                  </p>
                  <Link href={`/products/${product.slug}`} className="mt-1 block text-sm font-bold">
                    {product.name}
                  </Link>
                  <p className="mt-2 text-sm font-black">
                    <DisplayPrice amount={product.price} />
                  </p>
                </article>
              ))}
            </div>
          </section>
        )}
      </div>

      {selected && (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t border-black/10 bg-white/90 p-3 backdrop-blur-xl lg:hidden">
          <div className="mx-auto flex max-w-lg items-center gap-3">
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-bold">
                {name} · {selected.sizes[0]}
              </p>
              <p className="text-sm font-black">
                <DisplayPrice amount={selected.price} />
              </p>
            </div>
            <button
              type="button"
              onClick={() => purchase(false)}
              className="h-12 rounded-full border border-black px-4 text-[10px] font-bold uppercase"
            >
              Add
            </button>
            <button
              type="button"
              onClick={() => purchase(true)}
              className="h-12 rounded-full bg-black px-5 text-[10px] font-bold uppercase text-white"
            >
              Buy now
            </button>
          </div>
        </div>
      )}

      {viewerOpen && (
        <div
          className="fixed inset-0 z-[120] bg-black/95 p-4"
          role="dialog"
          aria-modal="true"
          aria-label={`${name} full-screen image`}
        >
          <button
            type="button"
            onClick={() => setViewerOpen(false)}
            className="absolute right-5 top-5 z-10 grid h-12 w-12 place-items-center rounded-full bg-white text-black"
            aria-label="Close full-screen image"
          >
            <X className="h-5 w-5" />
          </button>
          <div className="relative h-full w-full">
            <Image
              src={gallery[activeImage].src}
              alt={gallery[activeImage].alt}
              fill
              sizes="100vw"
              className="object-contain"
            />
          </div>
        </div>
      )}
    </main>
  );
}
