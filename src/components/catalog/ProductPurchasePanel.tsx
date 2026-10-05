'use client';

import Image from 'next/image';
import Link from 'next/link';
import { ArrowLeft, Heart, ShieldCheck, ShoppingBag } from 'lucide-react';
import { useState } from 'react';
import type { StoreProduct } from '@/data/storefront';
import { useCommerce } from '@/features/commerce/CommerceProvider';
import { formatPrice } from '@/lib/utils';
import { useWishlist } from '@/features/commerce/useWishlist';

export function ProductPurchasePanel({
  productId,
  name,
  brand,
  description,
  model,
  styleCode,
  image,
  listings,
}: {
  productId: string;
  name: string;
  brand: string;
  description: string | null;
  model: string | null;
  styleCode: string | null;
  image: string;
  listings: StoreProduct[];
}) {
  const [selectedId, setSelectedId] = useState(listings[0]?.listingId ?? '');
  const selected = listings.find((listing) => listing.listingId === selectedId);
  const { openQuickBuy } = useCommerce();
  const { saved, toggle } = useWishlist();

  return (
    <main className="min-h-screen bg-[#fbfaf6] px-4 pb-20 pt-32 text-black sm:px-6 lg:px-10">
      <div className="mx-auto max-w-[1500px]">
        <Link href="/new" className="inline-flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-black/45 hover:text-black"><ArrowLeft className="h-4 w-4" /> Back to pieces</Link>
        <div className="mt-8 grid gap-10 lg:grid-cols-[1.05fr_0.95fr] lg:gap-16">
          <div className="relative aspect-[0.9] overflow-hidden rounded-[2rem] bg-[#e8e5dd]">
            <Image src={image} alt={name} fill priority sizes="(max-width: 1024px) 100vw, 50vw" className="object-cover" />
            {listings.length > 0 && <span className="absolute left-5 top-5 rounded-full bg-white/90 px-4 py-2 text-[10px] font-bold uppercase tracking-wider">Verified</span>}
          </div>
          <div className="flex flex-col justify-center">
            <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-black/45">{brand}</p>
            <h1 className="mt-3 max-w-[14ch] text-5xl font-black leading-[0.9] tracking-[-0.07em] sm:text-7xl">{name}</h1>
            {model && <p className="mt-4 text-sm text-black/50">{model}</p>}
            <p className="mt-6 text-2xl font-black">{selected ? formatPrice(selected.price, 'MZN') : 'Currently unavailable'}</p>
            {listings.length > 0 ? <>
              <div className="mt-8 flex items-end justify-between">
                <h2 className="text-xs font-bold uppercase tracking-wider">Choose your exact piece</h2>
                <span className="text-xs text-black/45">{listings.length} live {listings.length === 1 ? 'listing' : 'listings'}</span>
              </div>
              <div className="mt-3 grid gap-2 sm:grid-cols-2" role="radiogroup" aria-label="Available listings">
                {listings.map((listing) => <button
                  key={listing.listingId}
                  type="button"
                  role="radio"
                  aria-checked={selectedId === listing.listingId}
                  onClick={() => setSelectedId(listing.listingId ?? '')}
                  className={`rounded-2xl border p-4 text-left transition ${selectedId === listing.listingId ? 'border-black bg-black text-white' : 'border-black/15 bg-white hover:border-black'}`}
                >
                  <span className="block text-sm font-bold">Size {listing.sizes[0]}</span>
                  <span className="mt-1 block text-xs opacity-70">{listing.condition} · {listing.ownershipType === 'STREET_CULTURE' ? 'Store stock' : 'Consignment'}</span>
                  <span className="mt-2 block text-sm font-black">{formatPrice(listing.price, 'MZN')}</span>
                </button>)}
              </div>
              <button type="button" onClick={() => selected && openQuickBuy(selected)} disabled={!selected} className="mt-6 inline-flex h-14 items-center justify-center gap-2 rounded-full bg-black px-7 text-xs font-bold uppercase tracking-wider text-white transition hover:bg-acid hover:text-black disabled:opacity-50"><ShoppingBag className="h-4 w-4" /> Quick buy this listing</button>
            </> : <div className="mt-8 rounded-2xl bg-[#efede6] p-5"><p className="text-sm font-bold">Sold out for now.</p><p className="mt-1 text-xs text-black/55">There is no verified live listing for this product.</p></div>}
            <button type="button" onClick={() => void toggle(productId)} aria-pressed={saved.includes(productId)} className="mt-5 inline-flex items-center gap-2 text-xs font-bold uppercase tracking-wider"><Heart className={`h-4 w-4 ${saved.includes(productId) ? 'fill-black' : ''}`} /> {saved.includes(productId) ? 'Saved to wishlist' : 'Save to wishlist'}</button>
            <p className="mt-6 flex items-center gap-2 text-xs text-black/50"><ShieldCheck className="h-4 w-4" /> Only verified live listings can be purchased.</p>
            {styleCode && <p className="mt-6 text-xs text-black/40">Style code: {styleCode}</p>}
            {description && <p className="mt-6 max-w-xl text-sm leading-7 text-black/60">{description}</p>}
          </div>
        </div>
      </div>
    </main>
  );
}
