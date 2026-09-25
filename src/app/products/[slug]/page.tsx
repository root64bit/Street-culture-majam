import React from 'react';
import Link from 'next/link';
import { Container, Section } from '@/components/ui/Container';
import { GlassPanel } from '@/components/ui/GlassPanel';
import { Button } from '@/components/ui/Button';
import { VerifiedBadge } from '@/components/ui/VerifiedBadge';
import { formatPrice } from '@/lib/utils';
import { createClient } from '@/lib/supabase/server';
import { ArrowLeft, ShieldCheck, CheckCircle2 } from 'lucide-react';

interface Props {
  params: Promise<{ slug: string }>;
}

export default async function ProductDetailPage({ params }: Props) {
  const { slug } = await params;
  const supabase = await createClient();

  const { data: product } = await supabase
    .from('products')
    .select('*, brands(name), categories(name), product_variants(*), product_media(*)')
    .eq('slug', slug)
    .single();

  const fallbackData = {
    name: "A/X Prototype Runner 'Acid Void'",
    brandName: 'OFF-WHITE',
    price: 2840,
    model: 'Prototype Runner V4',
    sku: 'AX-PROTO-9084',
    colorway: 'Acid Void / Black / Neon',
    releaseYear: 2024,
    description:
      'Archival high-top concept runner featuring carbon-fiber support trusses, tactical quick-cord lacing, and reactive UV neon highlights. Every individual specimen is verified through physical multi-point inspection by certified specialists before vault release.',
  };

  const name = product?.name || fallbackData.name;
  const brandName = (product?.brands as { name: string } | null)?.name || fallbackData.brandName;
  const price = Number(product?.retail_price) || fallbackData.price;
  const description = product?.description || fallbackData.description;
  const sku = product?.sku || product?.style_code || fallbackData.sku;
  const colorway = product?.colorway || fallbackData.colorway;
  const releaseYear = product?.release_year || fallbackData.releaseYear;

  const sizes = product?.product_variants && product.product_variants.length > 0
    ? product.product_variants.map((v) => v.size)
    : ['US 9.0', 'US 9.5', 'US 10.0', 'US 10.5', 'US 11.0'];

  return (
    <Section>
      <Container>
        <div className="mb-6">
          <Link
            href="/"
            className="inline-flex items-center gap-2 text-xs font-mono text-neutral-400 hover:text-white transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            <span>BACK TO VAULT INDEX</span>
          </Link>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-10">
          {/* Left Column: Specimen Showcase Gallery */}
          <div className="lg:col-span-7">
            <GlassPanel intensity="heavy" className="p-8 border-white/10 aspect-[4/3] flex items-center justify-center relative overflow-hidden">
              <div className="absolute top-4 left-4 flex items-center gap-2 rounded-full border border-white/10 bg-black/60 backdrop-blur-md px-3 py-1 text-[11px] font-mono text-neutral-300">
                <span className="h-1.5 w-1.5 rounded-full bg-acid animate-pulse" />
                <span>PHYSICAL SPECIMEN CERTIFIED</span>
              </div>

              {/* Specimen Visual Mock */}
              <div className="relative w-full h-full flex items-center justify-center">
                <svg
                  viewBox="0 0 500 300"
                  className="w-4/5 h-4/5 object-contain filter drop-shadow-[0_20px_35px_rgba(0,0,0,0.9)]"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <path
                    d="M 60 230 C 100 230 140 240 200 240 C 270 240 330 235 440 220 C 430 180 390 140 360 120 C 330 100 310 70 290 60 C 270 50 250 80 230 110 C 200 130 150 160 110 180 Z"
                    fill="#16181d"
                    stroke="#2a2e38"
                    strokeWidth="3"
                  />
                  <path
                    d="M 50 230 L 450 215 C 455 235 440 250 420 255 L 70 260 C 50 255 45 240 50 230 Z"
                    fill="#0d0e11"
                    stroke="#c6ff00"
                    strokeWidth="2"
                  />
                  <path
                    d="M 230 120 L 290 150 L 340 180"
                    stroke="#c6ff00"
                    strokeWidth="4"
                    strokeLinecap="round"
                  />
                  <circle cx="290" cy="150" r="5" fill="#c6ff00" />
                </svg>
              </div>
            </GlassPanel>
          </div>

          {/* Right Column: Specification & Purchase Engine */}
          <div className="lg:col-span-5 flex flex-col space-y-6">
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-mono font-bold uppercase tracking-wider text-acid">
                  {brandName}
                </span>
                <VerifiedBadge variant="compact" />
              </div>

              <h1 className="text-2xl sm:text-3xl font-black uppercase tracking-tight text-white leading-tight">
                {name}
              </h1>

              <div className="mt-3 flex items-baseline gap-3">
                <span className="text-3xl font-black font-mono text-white tracking-tight">
                  {formatPrice(price)}
                </span>
                <span className="text-[11px] font-mono text-neutral-400 uppercase">
                  CURRENT ASKING PRICE
                </span>
              </div>
            </div>

            {/* Size Matrix */}
            <div>
              <div className="flex items-center justify-between text-xs font-mono mb-2">
                <span className="text-neutral-400 uppercase">SELECT SIZE</span>
                <span className="text-acid underline cursor-pointer">SIZE GUIDE</span>
              </div>

              <div className="grid grid-cols-4 gap-2">
                {sizes.map((s, idx) => (
                  <button
                    key={idx}
                    type="button"
                    className={`h-11 rounded-lg border font-mono text-xs font-bold transition-all ${
                      idx === 1
                        ? 'border-acid bg-acid text-black shadow-glow'
                        : 'border-white/10 bg-white/[0.03] text-white hover:border-white/20'
                    }`}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>

            {/* CTAs */}
            <div className="flex flex-col gap-3 pt-2">
              <Button variant="acid" size="lg" className="w-full justify-center text-sm font-bold">
                INSTANT PURCHASE — {formatPrice(price)}
              </Button>
              <Button variant="glass" size="lg" className="w-full justify-center text-sm">
                MAKE AN OFFER
              </Button>
            </div>

            {/* Specimen Inspection Checklist */}
            <GlassPanel intensity="subtle" className="p-5 border-white/5 space-y-3">
              <div className="flex items-center gap-2 text-xs font-mono text-white font-semibold uppercase">
                <ShieldCheck className="h-4 w-4 text-acid" />
                <span>VAULT AUTHENTICATION GUARANTEE</span>
              </div>
              <ul className="text-xs font-mono text-neutral-400 space-y-2">
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="h-3.5 w-3.5 text-acid" />
                  <span>Physical multi-point specialist verification</span>
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="h-3.5 w-3.5 text-acid" />
                  <span>Condition confirmed: New / Unworn Deadstock</span>
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="h-3.5 w-3.5 text-acid" />
                  <span>Dispatched in tamper-evident vault security packaging</span>
                </li>
              </ul>
            </GlassPanel>

            {/* Specification Meta */}
            <div className="border-t border-white/10 pt-4 grid grid-cols-2 gap-3 text-xs font-mono">
              <div>
                <span className="text-neutral-500 uppercase block">STYLE CODE / SKU</span>
                <span className="text-neutral-200">{sku}</span>
              </div>
              <div>
                <span className="text-neutral-500 uppercase block">COLORWAY</span>
                <span className="text-neutral-200">{colorway}</span>
              </div>
              <div>
                <span className="text-neutral-500 uppercase block">RELEASE YEAR</span>
                <span className="text-neutral-200">{releaseYear}</span>
              </div>
              <div>
                <span className="text-neutral-500 uppercase block">INVENTORY TYPE</span>
                <span className="text-acid">VERIFIED CONSIGNMENT</span>
              </div>
            </div>

            {/* Description */}
            <div className="border-t border-white/10 pt-4">
              <span className="text-xs font-mono uppercase text-neutral-400 block mb-1">
                ARCHIVAL NOTES
              </span>
              <p className="text-xs text-neutral-300 font-sans leading-relaxed">
                {description}
              </p>
            </div>
          </div>
        </div>
      </Container>
    </Section>
  );
}
