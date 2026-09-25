'use client';

import React, { useState } from 'react';
import { Container, Section } from '@/components/ui/Container';
import { ProductCard } from '@/components/ui/ProductCard';
import { ProductGrid } from '@/components/ui/ProductGrid';
import { EmptyState } from '@/components/ui/EmptyState';
import { Search } from 'lucide-react';

const catalogSpecimens = [
  {
    id: 'p1',
    name: "A/X Prototype Runner 'Acid Void'",
    slug: 'ax-prototype-runner-acid-void',
    brandName: 'OFF-WHITE',
    price: 2840,
    specimenNumber: '9084',
    category: 'sneakers',
  },
  {
    id: 'p2',
    name: "Air Jordan 1 Retro High OG 'Chicago Lost & Found'",
    slug: 'air-jordan-1-retro-high-og-chicago-lost-and-found',
    brandName: 'JORDAN',
    price: 395,
    specimenNumber: '4412',
    category: 'sneakers',
  },
  {
    id: 'p3',
    name: "Supreme Box Logo Hooded Sweatshirt 'Heather Grey'",
    slug: 'supreme-box-logo-hooded-sweatshirt-heather-grey',
    brandName: 'SUPREME',
    price: 680,
    specimenNumber: '2109',
    category: 'streetwear',
  },
  {
    id: 'p4',
    name: 'Dior x Air Jordan 1 High OG',
    slug: 'dior-x-air-jordan-1-high-og',
    brandName: 'DIOR',
    price: 7850,
    specimenNumber: '0833',
    category: 'luxury',
  },
  {
    id: 'p5',
    name: 'Louis Vuitton Horizon 55 Monogram Eclipse',
    slug: 'louis-vuitton-horizon-55-monogram-eclipse',
    brandName: 'LOUIS VUITTON',
    price: 3400,
    specimenNumber: '5501',
    category: 'accessories',
  },
];

export default function SearchPage() {
  const [query, setQuery] = useState('');

  const filtered = catalogSpecimens.filter(
    (item) =>
      item.name.toLowerCase().includes(query.toLowerCase()) ||
      item.brandName.toLowerCase().includes(query.toLowerCase()) ||
      item.category.toLowerCase().includes(query.toLowerCase())
  );

  return (
    <Section>
      <Container>
        <div className="mb-8 max-w-2xl mx-auto text-center">
          <span className="text-[10px] font-mono tracking-widest text-acid uppercase block mb-1">
            ARCHIVAL SEARCH PROTOCOL
          </span>
          <h1 className="text-3xl font-black uppercase tracking-tight text-white mb-6">
            SEARCH VAULT INDEX
          </h1>

          <div className="relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-neutral-400" />
            <input
              type="text"
              placeholder="Search by brand, silhouette, SKU, or category..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="h-12 w-full rounded-xl border border-white/10 bg-white/[0.04] pl-11 pr-4 text-sm font-mono text-white placeholder:text-neutral-500 focus:border-acid/60 focus:outline-none focus:ring-1 focus:ring-acid/60"
            />
          </div>
        </div>

        {filtered.length > 0 ? (
          <ProductGrid>
            {filtered.map((item) => (
              <ProductCard
                key={item.id}
                id={item.id}
                name={item.name}
                slug={item.slug}
                brandName={item.brandName}
                price={item.price}
                specimenNumber={item.specimenNumber}
              />
            ))}
          </ProductGrid>
        ) : (
          <EmptyState
            title="NO SPECIMENS MATCHED"
            description={`No archival items matched your query "${query}". Try searching for Jordan, Supreme, Nike, or Dior.`}
          />
        )}
      </Container>
    </Section>
  );
}
