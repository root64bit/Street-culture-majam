'use client';

import Image from 'next/image';
import Link from 'next/link';
import { ArrowUpRight, ShoppingBag } from 'lucide-react';
import type { StoreProduct } from '@/data/storefront';
import { useCommerce } from '@/features/commerce/CommerceProvider';
import { DisplayPrice } from '@/features/currency/CurrencyProvider';

export function CatalogResults({ products }: { products: StoreProduct[] }) {
  const { openQuickBuy } = useCommerce();

  if (products.length === 0) {
    return (
      <div className="rounded-[2rem] bg-[#efede6] px-6 py-16 text-center">
        <p className="text-2xl font-black tracking-tight">No live pieces match yet.</p>
        <p className="mt-2 text-sm text-black/55">Try another filter or browse the latest listings.</p>
        <Link href="/new" className="mt-6 inline-flex rounded-full bg-black px-6 py-3 text-xs font-bold uppercase tracking-wider text-white">
          See all pieces
        </Link>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-x-3 gap-y-8 sm:gap-x-5 lg:grid-cols-4 lg:gap-x-6">
      {products.map((product) => (
        <article key={product.listingId} className="group min-w-0">
          <div className="relative aspect-[0.84] overflow-hidden rounded-2xl bg-[#e8e5dd]">
            <Link href={`/products/${product.slug}`} aria-label={`View ${product.name}`} className="absolute inset-0">
              <Image src={product.image} alt={product.name} fill sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw" className="object-cover transition duration-700 group-hover:scale-[1.04]" />
            </Link>
            <span className="absolute left-3 top-3 rounded-full bg-white/90 px-3 py-1.5 text-[9px] font-bold uppercase tracking-wider">Verified</span>
            <button type="button" onClick={() => openQuickBuy(product)} className="absolute inset-x-3 bottom-3 flex h-11 items-center justify-center gap-2 rounded-full bg-white/95 text-[10px] font-bold uppercase tracking-wider transition hover:bg-black hover:text-white">
              <ShoppingBag className="h-4 w-4" /> Quick buy
            </button>
          </div>
          <div className="px-1 pt-3">
            <p className="text-[10px] font-bold uppercase tracking-widest text-black/45">{product.brand}</p>
            <Link href={`/products/${product.slug}`} className="mt-1 flex items-start justify-between gap-2 text-sm font-semibold leading-5 hover:underline">
              <span className="line-clamp-2">{product.name}</span><ArrowUpRight className="h-4 w-4 shrink-0" />
            </Link>
            <p className="mt-2 text-xs text-black/55">{product.sizes[0]} · {product.condition}</p>
            <p className="mt-2 text-sm font-black"><DisplayPrice amount={product.price} /></p>
          </div>
        </article>
      ))}
    </div>
  );
}
