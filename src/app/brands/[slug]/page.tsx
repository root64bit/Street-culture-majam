import React from 'react';
import Link from 'next/link';
import { Container, Section } from '@/components/ui/Container';
import { ProductCard } from '@/components/ui/ProductCard';
import { ProductGrid } from '@/components/ui/ProductGrid';
import { createClient } from '@/lib/supabase/server';
import { ArrowLeft } from 'lucide-react';

interface Props {
  params: Promise<{ slug: string }>;
}

export default async function BrandSlugPage({ params }: Props) {
  const { slug } = await params;
  const supabase = await createClient();

  const { data: brand } = await supabase
    .from('brands')
    .select('*, products(*, brands(name))')
    .eq('slug', slug)
    .single();

  const brandName = brand?.name || slug.toUpperCase().replace(/-/g, ' ');

  return (
    <Section>
      <Container>
        <div className="mb-6">
          <Link
            href="/brands"
            className="inline-flex items-center gap-2 text-xs font-mono text-neutral-400 hover:text-white transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            <span>BACK TO ALL BRANDS</span>
          </Link>
        </div>

        <div className="mb-8 border-b border-white/10 pb-6">
          <span className="text-[10px] font-mono tracking-widest text-acid uppercase block mb-1">
            BRAND ARCHIVE
          </span>
          <h1 className="text-3xl sm:text-4xl font-black uppercase tracking-tight text-white">
            {brandName}
          </h1>
          <p className="mt-1 text-xs font-mono text-neutral-400">
            {brand?.description || `Explore authenticated specimens and archival releases from ${brandName}`}
          </p>
        </div>

        {brand?.products && brand.products.length > 0 ? (
          <ProductGrid>
            {brand.products.map((item) => (
              <ProductCard
                key={item.id}
                id={item.id}
                name={item.name}
                slug={item.slug}
                brandName={brandName}
                price={Number(item.retail_price) || 500}
              />
            ))}
          </ProductGrid>
        ) : (
          <div className="p-12 text-center rounded-xl border border-white/10 bg-white/[0.02]">
            <p className="text-xs font-mono text-neutral-400">
              No live specimens currently listed for {brandName}. Consign your authentic items now.
            </p>
            <div className="mt-4">
              <Link
                href="/consign/new"
                className="text-xs font-mono text-acid font-bold hover:underline"
              >
                CONSIGN {brandName.toUpperCase()} →
              </Link>
            </div>
          </div>
        )}
      </Container>
    </Section>
  );
}
