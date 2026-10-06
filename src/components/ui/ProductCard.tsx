import React from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { formatPrice } from '@/lib/utils';
import { DisplayPrice } from '@/features/currency/CurrencyProvider';
import { VerifiedBadge } from './VerifiedBadge';

export interface ProductCardProps {
  id: string;
  name: string;
  slug: string;
  brandName: string;
  price: number;
  currency?: string;
  imageUrl?: string;
  condition?: string;
  specimenNumber?: string;
  size?: string;
}

export function ProductCard({
  name,
  slug,
  brandName,
  price,
  currency = 'USD',
  imageUrl,
  condition = 'NEW / UNWORN',
  specimenNumber,
  size,
}: ProductCardProps) {
  return (
    <Link
      href={`/products/${slug}`}
      className="group relative flex flex-col overflow-hidden rounded-xl border border-white/10 bg-white/[0.03] transition-all duration-300 hover:border-white/20 hover:bg-white/[0.06] hover:shadow-glass"
    >
      {/* Media container */}
      <div className="relative aspect-square w-full overflow-hidden bg-vault-900/60 p-6 flex items-center justify-center">
        {imageUrl ? (
          <Image
            src={imageUrl}
            alt={name}
            fill
            sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
            className="object-contain p-4 transition-transform duration-500 group-hover:scale-105"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-neutral-600 font-mono text-xs">
            [SPECIMEN ARCHIVE]
          </div>
        )}

        {/* Specimen Tag */}
        <div className="absolute top-3 left-3 flex items-center gap-1.5 rounded-full border border-white/10 bg-black/60 backdrop-blur-md px-2.5 py-1 text-[10px] font-mono text-neutral-300 uppercase">
          <span className="h-1 w-1 rounded-full bg-acid animate-pulse" />
          <span>{specimenNumber ? `SPECIMEN #${specimenNumber}` : 'VAULT VERIFIED'}</span>
        </div>

        {/* Size Badge */}
        {size && (
          <div className="absolute bottom-3 right-3 rounded border border-white/10 bg-black/60 backdrop-blur-md px-2 py-0.5 text-[10px] font-mono text-neutral-300">
            {size}
          </div>
        )}
      </div>

      {/* Meta details */}
      <div className="flex flex-1 flex-col p-4">
        <div className="flex items-center justify-between text-[11px] font-mono uppercase tracking-wider text-neutral-400 mb-1">
          <span>{brandName}</span>
          <span className="text-[10px] text-neutral-500">{condition}</span>
        </div>

        <h3 className="line-clamp-1 text-sm font-semibold tracking-wide text-white group-hover:text-acid transition-colors">
          {name}
        </h3>

        <div className="mt-3 flex items-center justify-between pt-3 border-t border-white/5">
          <div className="flex flex-col">
            <span className="text-[10px] font-mono uppercase tracking-wider text-neutral-500">
              ASKING PRICE
            </span>
            <span className="text-base font-bold font-mono tracking-tight text-white group-hover:text-acid transition-colors">
              {currency === 'MZN' ? <DisplayPrice amount={price} /> : formatPrice(price, currency)}
            </span>
          </div>

          <VerifiedBadge variant="compact" />
        </div>
      </div>
    </Link>
  );
}
