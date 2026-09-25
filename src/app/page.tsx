import React from 'react';
import Link from 'next/link';
import { Hero } from '@/components/home/Hero';
import { ProductCard } from '@/components/ui/ProductCard';
import { ProductGrid } from '@/components/ui/ProductGrid';
import { Container, Section } from '@/components/ui/Container';
import { Button } from '@/components/ui/Button';
import { GlassPanel } from '@/components/ui/GlassPanel';
import { ShieldCheck, ArrowRight, PackageCheck, Zap } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';

// Default fallback specimens for demonstration when DB is initializing
const fallbackSpecimens = [
  {
    id: 'p1',
    name: "A/X Prototype Runner 'Acid Void'",
    slug: 'ax-prototype-runner-acid-void',
    brandName: 'OFF-WHITE',
    price: 2840,
    specimenNumber: '9084',
    condition: 'DEADSTOCK',
    size: 'US 10.5',
  },
  {
    id: 'p2',
    name: "Air Jordan 1 Retro High OG 'Chicago Lost & Found'",
    slug: 'air-jordan-1-retro-high-og-chicago-lost-and-found',
    brandName: 'JORDAN',
    price: 395,
    specimenNumber: '4412',
    condition: 'NEW / UNWORN',
    size: 'US 10.0',
  },
  {
    id: 'p3',
    name: "Supreme Box Logo Hooded Sweatshirt 'Heather Grey'",
    slug: 'supreme-box-logo-hooded-sweatshirt-heather-grey',
    brandName: 'SUPREME',
    price: 680,
    specimenNumber: '2109',
    condition: 'ARCHIVAL GRADE',
    size: 'SIZE L',
  },
  {
    id: 'p4',
    name: 'Dior x Air Jordan 1 High OG',
    slug: 'dior-x-air-jordan-1-high-og',
    brandName: 'DIOR',
    price: 7850,
    specimenNumber: '0833',
    condition: 'CERTIFIED VAULT',
    size: 'US 10.0',
  },
];

export default async function HomePage() {
  let products = fallbackSpecimens;

  try {
    const supabase = await createClient();
    const { data: dbProducts, error } = await supabase
      .from('products')
      .select('id, name, slug, retail_price, brands(name)')
      .limit(8);

    if (!error && dbProducts && dbProducts.length > 0) {
      products = dbProducts.map((p, idx) => ({
        id: p.id,
        name: p.name,
        slug: p.slug,
        brandName: (p.brands as { name: string } | null)?.name || 'STREET CULTURE',
        price: Number(p.retail_price) || 1200,
        specimenNumber: `0${idx + 1}84`,
        condition: 'CERTIFIED VAULT',
        size: 'US 10.5',
      }));
    }
  } catch {
    // If Supabase is offline during build time, fallback specimens render cleanly
  }

  return (
    <div className="flex flex-col">
      {/* Canonical Hero */}
      <Hero />

      {/* Curated Specimens Section */}
      <Section className="border-t border-white/5 bg-vault-900/30">
        <Container>
          <div className="flex flex-col md:flex-row md:items-end justify-between mb-8 gap-4">
            <div>
              <div className="flex items-center gap-2 text-xs font-mono tracking-widest text-acid uppercase mb-1">
                <span className="h-1.5 w-1.5 rounded-full bg-acid animate-pulse" />
                <span>AUTHENTICATED RELEASES</span>
              </div>
              <h2 className="text-2xl sm:text-3xl font-black uppercase tracking-tight text-white">
                CURATED VAULT SPECIMENS
              </h2>
            </div>

            <div className="flex items-center gap-2 overflow-x-auto pb-2 md:pb-0 text-xs font-mono">
              <span className="rounded-full bg-white text-black px-4 py-1.5 font-bold cursor-pointer">
                ALL
              </span>
              <span className="rounded-full border border-white/10 bg-white/[0.04] text-neutral-300 px-4 py-1.5 hover:text-white cursor-pointer transition-colors">
                SNEAKERS
              </span>
              <span className="rounded-full border border-white/10 bg-white/[0.04] text-neutral-300 px-4 py-1.5 hover:text-white cursor-pointer transition-colors">
                STREETWEAR
              </span>
              <span className="rounded-full border border-white/10 bg-white/[0.04] text-neutral-300 px-4 py-1.5 hover:text-white cursor-pointer transition-colors">
                LUXURY
              </span>
            </div>
          </div>

          <ProductGrid>
            {products.map((item) => (
              <ProductCard
                key={item.id}
                id={item.id}
                name={item.name}
                slug={item.slug}
                brandName={item.brandName}
                price={item.price}
                condition={item.condition}
                specimenNumber={item.specimenNumber}
                size={item.size}
              />
            ))}
          </ProductGrid>

          <div className="mt-12 text-center">
            <Link href="/sneakers">
              <Button variant="glass" size="lg" className="gap-2">
                <span>VIEW COMPLETE VAULT INDEX</span>
                <ArrowRight className="h-4 w-4 text-acid" />
              </Button>
            </Link>
          </div>
        </Container>
      </Section>

      {/* Consignment Intake Protocol Banner */}
      <Section className="border-t border-white/10 bg-gradient-to-b from-vault-950 via-vault-900 to-vault-950 relative">
        <Container>
          <GlassPanel intensity="heavy" className="p-8 sm:p-12 border-acid/20 relative overflow-hidden">
            <div className="absolute -right-16 -top-16 w-80 h-80 bg-acid/10 rounded-full blur-[100px] pointer-events-none" />

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
              <div className="lg:col-span-8 space-y-4">
                <div className="inline-flex items-center gap-2 rounded-full border border-acid/30 bg-acid/10 px-3 py-1 text-[10px] font-mono text-acid uppercase tracking-wider">
                  <PackageCheck className="h-3.5 w-3.5" />
                  <span>CONSIGNMENT PROTOCOL</span>
                </div>

                <h3 className="text-2xl sm:text-4xl font-black uppercase tracking-tight text-white">
                  TURN YOUR GRAILS INTO LIQUIDITY
                </h3>

                <p className="max-w-xl text-xs sm:text-sm text-neutral-300 font-sans leading-relaxed">
                  Consign authenticated luxury fashion and sneakers with Street Culture. We manage
                  insured transit, multi-point specialist verification, professional studio
                  photography, and global marketplace exposure with 48-hour disbursal upon sale.
                </p>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2 text-xs font-mono text-neutral-300">
                  <div className="flex items-center gap-2">
                    <ShieldCheck className="h-4 w-4 text-acid" />
                    <span>0% FRAUD RISK</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Zap className="h-4 w-4 text-acid" />
                    <span>LOW PROTOCOL FEE</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full bg-acid" />
                    <span>VAULT CUSTODY</span>
                  </div>
                </div>
              </div>

              <div className="lg:col-span-4 flex flex-col gap-3 sm:items-end">
                <Link href="/consign/new" className="w-full sm:w-auto">
                  <Button variant="acid" size="lg" className="w-full justify-center">
                    SUBMIT CONSIGNMENT
                  </Button>
                </Link>
                <Link href="/consign" className="w-full sm:w-auto">
                  <Button variant="ghost" size="sm" className="w-full justify-center">
                    LEARN HOW IT WORKS
                  </Button>
                </Link>
              </div>
            </div>
          </GlassPanel>
        </Container>
      </Section>
    </div>
  );
}
