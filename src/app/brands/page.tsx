import React from 'react';
import Link from 'next/link';
import { Container, Section } from '@/components/ui/Container';
import { GlassPanel } from '@/components/ui/GlassPanel';
import { createClient } from '@/lib/supabase/server';

export default async function BrandsPage() {
  const supabase = await createClient();
  const { data: dbBrands } = await supabase
    .from('brands')
    .select('*')
    .order('name', { ascending: true });

  const fallbackBrands = [
    { name: 'Nike', slug: 'nike' },
    { name: 'Jordan', slug: 'jordan' },
    { name: 'Supreme', slug: 'supreme' },
    { name: 'Dior', slug: 'dior' },
    { name: 'Off-White', slug: 'off-white' },
    { name: 'Balenciaga', slug: 'balenciaga' },
    { name: 'Prada', slug: 'prada' },
    { name: 'Louis Vuitton', slug: 'louis-vuitton' },
    { name: 'Stussy', slug: 'stussy' },
    { name: 'Corteiz', slug: 'corteiz' },
    { name: 'BAPE', slug: 'bape' },
    { name: 'Fear of God', slug: 'fear-of-god' },
    { name: 'New Balance', slug: 'new-balance' },
    { name: 'Adidas', slug: 'adidas' },
  ];

  const brands = dbBrands && dbBrands.length > 0 ? dbBrands : fallbackBrands;

  return (
    <Section>
      <Container>
        <div className="mb-8 border-b border-white/10 pb-6">
          <span className="text-[10px] font-mono tracking-widest text-acid uppercase block mb-1">
            CURATED DIRECTORY
          </span>
          <h1 className="text-3xl sm:text-4xl font-black uppercase tracking-tight text-white">
            BRANDS INDEX
          </h1>
          <p className="mt-1 text-xs font-mono text-neutral-400">
            Explore authentic offerings across premier streetwear and luxury maisons
          </p>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
          {brands.map((b) => (
            <Link key={b.slug} href={`/brands/${b.slug}`}>
              <GlassPanel
                intensity="subtle"
                interactive
                className="p-6 border-white/10 text-center hover:border-acid/40"
              >
                <h3 className="text-sm font-bold font-mono uppercase tracking-wider text-white hover:text-acid transition-colors">
                  {b.name}
                </h3>
              </GlassPanel>
            </Link>
          ))}
        </div>
      </Container>
    </Section>
  );
}
