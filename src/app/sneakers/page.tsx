import React from 'react';
import { Container, Section } from '@/components/ui/Container';
import { ProductCard } from '@/components/ui/ProductCard';
import { ProductGrid } from '@/components/ui/ProductGrid';
import { createClient } from '@/lib/supabase/server';

export default async function SneakersPage() {
  const supabase = await createClient();
  const { data: dbProducts } = await supabase
    .from('products')
    .select('id, name, slug, retail_price, brands(name), categories(name)')
    .limit(12);

  const fallbackItems = [
    {
      id: 's1',
      name: "A/X Prototype Runner 'Acid Void'",
      slug: 'ax-prototype-runner-acid-void',
      brandName: 'OFF-WHITE',
      price: 2840,
      specimenNumber: '9084',
    },
    {
      id: 's2',
      name: "Air Jordan 1 Retro High OG 'Chicago Lost & Found'",
      slug: 'air-jordan-1-retro-high-og-chicago-lost-and-found',
      brandName: 'JORDAN',
      price: 395,
      specimenNumber: '4412',
    },
    {
      id: 's3',
      name: 'Dior x Air Jordan 1 High OG',
      slug: 'dior-x-air-jordan-1-high-og',
      brandName: 'DIOR',
      price: 7850,
      specimenNumber: '0833',
    },
  ];

  const items =
    dbProducts && dbProducts.length > 0
      ? dbProducts.map((p, idx) => ({
          id: p.id,
          name: p.name,
          slug: p.slug,
          brandName: (p.brands as { name: string } | null)?.name || 'STREET CULTURE',
          price: Number(p.retail_price) || 850,
          specimenNumber: `0${idx + 1}92`,
        }))
      : fallbackItems;

  return (
    <Section>
      <Container>
        <div className="mb-8 border-b border-white/10 pb-6">
          <span className="text-[10px] font-mono tracking-widest text-acid uppercase block mb-1">
            ARCHIVAL FOOTWEAR
          </span>
          <h1 className="text-3xl sm:text-4xl font-black uppercase tracking-tight text-white">
            AUTHENTICATED SNEAKERS
          </h1>
          <p className="mt-1 text-xs font-mono text-neutral-400">
            Certified deadstock and archival specimens verified through multi-point specialist inspection
          </p>
        </div>

        <ProductGrid>
          {items.map((item) => (
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
      </Container>
    </Section>
  );
}
