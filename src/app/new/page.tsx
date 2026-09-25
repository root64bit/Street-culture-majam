import React from 'react';
import { Container, Section } from '@/components/ui/Container';
import { ProductCard } from '@/components/ui/ProductCard';
import { ProductGrid } from '@/components/ui/ProductGrid';
import { createClient } from '@/lib/supabase/server';

export default async function NewInPage() {
  const supabase = await createClient();
  const { data: dbProducts } = await supabase
    .from('products')
    .select('id, name, slug, retail_price, brands(name)')
    .order('created_at', { ascending: false })
    .limit(12);

  const fallbackItems = [
    {
      id: 'n1',
      name: "A/X Prototype Runner 'Acid Void'",
      slug: 'ax-prototype-runner-acid-void',
      brandName: 'OFF-WHITE',
      price: 2840,
      specimenNumber: '9084',
    },
    {
      id: 'n2',
      name: "Supreme Box Logo Hooded Sweatshirt 'Heather Grey'",
      slug: 'supreme-box-logo-hooded-sweatshirt-heather-grey',
      brandName: 'SUPREME',
      price: 680,
      specimenNumber: '2109',
    },
    {
      id: 'n3',
      name: 'Louis Vuitton Horizon 55 Monogram Eclipse',
      slug: 'louis-vuitton-horizon-55-monogram-eclipse',
      brandName: 'LOUIS VUITTON',
      price: 3400,
      specimenNumber: '5501',
    },
  ];

  const items =
    dbProducts && dbProducts.length > 0
      ? dbProducts.map((p, idx) => ({
          id: p.id,
          name: p.name,
          slug: p.slug,
          brandName: (p.brands as { name: string } | null)?.name || 'STREET CULTURE',
          price: Number(p.retail_price) || 950,
          specimenNumber: `0${idx + 1}77`,
        }))
      : fallbackItems;

  return (
    <Section>
      <Container>
        <div className="mb-8 border-b border-white/10 pb-6">
          <span className="text-[10px] font-mono tracking-widest text-acid uppercase block mb-1">
            VAULT INTAKE STREAM
          </span>
          <h1 className="text-3xl sm:text-4xl font-black uppercase tracking-tight text-white">
            NEW ARRIVALS
          </h1>
          <p className="mt-1 text-xs font-mono text-neutral-400">
            Freshly inspected and authenticated archival artifacts added to vault inventory
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
