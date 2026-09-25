import React from 'react';
import { Container, Section } from '@/components/ui/Container';
import { ProductCard } from '@/components/ui/ProductCard';
import { ProductGrid } from '@/components/ui/ProductGrid';
import { createClient } from '@/lib/supabase/server';

export default async function StreetwearPage() {
  const supabase = await createClient();
  const { data: dbProducts } = await supabase
    .from('products')
    .select('id, name, slug, retail_price, brands(name)')
    .limit(12);

  const fallbackItems = [
    {
      id: 'sw1',
      name: "Supreme Box Logo Hooded Sweatshirt 'Heather Grey'",
      slug: 'supreme-box-logo-hooded-sweatshirt-heather-grey',
      brandName: 'SUPREME',
      price: 680,
      specimenNumber: '2109',
    },
  ];

  const items =
    dbProducts && dbProducts.length > 0
      ? dbProducts.map((p, idx) => ({
          id: p.id,
          name: p.name,
          slug: p.slug,
          brandName: (p.brands as { name: string } | null)?.name || 'STREETWEAR',
          price: Number(p.retail_price) || 450,
          specimenNumber: `0${idx + 1}55`,
        }))
      : fallbackItems;

  return (
    <Section>
      <Container>
        <div className="mb-8 border-b border-white/10 pb-6">
          <span className="text-[10px] font-mono tracking-widest text-acid uppercase block mb-1">
            CONTEMPORARY APPAREL
          </span>
          <h1 className="text-3xl sm:text-4xl font-black uppercase tracking-tight text-white">
            HIGH STREETWEAR
          </h1>
          <p className="mt-1 text-xs font-mono text-neutral-400">
            Supreme, Corteiz, BAPE, Stussy, and Off-White curated grails
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
