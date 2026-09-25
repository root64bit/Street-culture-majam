import React from 'react';
import Link from 'next/link';
import { ArrowRight, Zap } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { GlassPanel } from '@/components/ui/GlassPanel';

export function Hero() {
  return (
    <div className="relative overflow-hidden pt-8 pb-16 lg:pt-14 lg:pb-24">
      {/* Background radial specular glow */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[400px] bg-acid/10 rounded-full blur-[140px] pointer-events-none" />

      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-center">
          {/* Left Column: Editorial Headline & Protocol Meta */}
          <div className="lg:col-span-7 flex flex-col space-y-6">
            {/* Pill */}
            <div className="inline-flex items-center gap-2 self-start rounded-full border border-acid/30 bg-acid/10 px-3.5 py-1 text-[11px] font-mono tracking-widest text-acid uppercase">
              <span className="h-1.5 w-1.5 rounded-full bg-acid animate-pulse" />
              <span>LIVE LIQUIDITY PROTOCOL V4.2</span>
            </div>

            {/* Sub-header */}
            <p className="text-xs sm:text-sm font-mono tracking-[0.2em] text-neutral-400 uppercase font-semibold">
              AUTHENTICITY IS THE CULTURE.
            </p>

            {/* Giant Title */}
            <h1 className="text-4xl sm:text-6xl lg:text-7xl font-black tracking-tight uppercase leading-[0.95] text-white">
              ARCHIVAL <br />
              <span className="text-acid drop-shadow-glow">GRAIL VAULT</span>
            </h1>

            {/* Editorial Body */}
            <p className="max-w-xl text-sm sm:text-base text-neutral-300 font-sans leading-relaxed">
              Curated sneakers, high streetwear, and luxury maison artifacts. Every single piece
              verified through physical multi-point inspection by certified specialists before vault
              disbursal.
            </p>

            {/* CTAs */}
            <div className="flex flex-wrap items-center gap-4 pt-2">
              <Link href="/new">
                <Button variant="acid" size="lg" className="flex items-center gap-2">
                  <span>SHOP NEW ARRIVALS</span>
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </Link>
              <Link href="/sneakers">
                <Button variant="glass" size="lg" className="flex items-center gap-2">
                  <span>EXPLORE DROPS</span>
                  <Zap className="h-4 w-4 text-acid" />
                </Button>
              </Link>
            </div>

            {/* Trust Metrics Bar */}
            <div className="grid grid-cols-3 gap-4 pt-6 border-t border-white/10">
              <GlassPanel intensity="subtle" className="p-4">
                <div className="text-[10px] font-mono uppercase tracking-wider text-neutral-400">
                  AUTHENTICATED
                </div>
                <div className="text-2xl font-black font-mono text-white tracking-tight mt-0.5">
                  248K+
                </div>
              </GlassPanel>

              <GlassPanel intensity="subtle" className="p-4 border-acid/20">
                <div className="text-[10px] font-mono uppercase tracking-wider text-acid">
                  REPLICA RATE
                </div>
                <div className="text-2xl font-black font-mono text-acid tracking-tight mt-0.5">
                  0.00%
                </div>
              </GlassPanel>

              <GlassPanel intensity="subtle" className="p-4">
                <div className="text-[10px] font-mono uppercase tracking-wider text-neutral-400">
                  AVG. DISBURSAL
                </div>
                <div className="text-2xl font-black font-mono text-white tracking-tight mt-0.5">
                  48H
                </div>
              </GlassPanel>
            </div>
          </div>

          {/* Right Column: Featured Specimen Card */}
          <div className="lg:col-span-5 relative">
            <GlassPanel intensity="heavy" className="p-0 overflow-hidden border-white/15 shadow-glass">
              {/* Image Specimen Container */}
              <div className="relative aspect-[4/3] w-full bg-gradient-to-b from-neutral-900 to-vault-950 flex items-center justify-center p-8">
                {/* Visual Specimen */}
                <div className="relative w-full h-full flex items-center justify-center">
                  <div className="relative w-full h-full min-h-[260px] flex items-center justify-center">
                    {/* Atmospheric neon glow under sneaker */}
                    <div className="absolute bottom-6 w-3/4 h-8 bg-acid/20 blur-xl rounded-full" />
                    
                    {/* SVG Graphic Representation of Archival Specimen */}
                    <svg
                      viewBox="0 0 500 300"
                      className="w-full h-full object-contain filter drop-shadow-[0_15px_25px_rgba(0,0,0,0.8)]"
                      fill="none"
                      xmlns="http://www.w3.org/2000/svg"
                    >
                      {/* Technical Sneaker Outlines & Neon Trusses */}
                      <path
                        d="M 60 230 C 100 230 140 240 200 240 C 270 240 330 235 440 220 C 430 180 390 140 360 120 C 330 100 310 70 290 60 C 270 50 250 80 230 110 C 200 130 150 160 110 180 Z"
                        fill="#16181d"
                        stroke="#2a2e38"
                        strokeWidth="3"
                      />
                      {/* Sole profile */}
                      <path
                        d="M 50 230 L 450 215 C 455 235 440 250 420 255 L 70 260 C 50 255 45 240 50 230 Z"
                        fill="#0d0e11"
                        stroke="#c6ff00"
                        strokeWidth="2"
                      />
                      {/* Neon Accents */}
                      <path
                        d="M 230 120 L 290 150 L 340 180"
                        stroke="#c6ff00"
                        strokeWidth="4"
                        strokeLinecap="round"
                      />
                      <circle cx="290" cy="150" r="5" fill="#c6ff00" />
                      <text x="310" y="155" fill="#c6ff00" fontFamily="monospace" fontSize="12" fontWeight="bold">
                        A/X
                      </text>
                    </svg>
                  </div>
                </div>
              </div>

              {/* Specimen Banner info */}
              <div className="bg-vault-900/90 border-t border-white/10 p-5 flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-1.5 text-[10px] font-mono text-acid uppercase tracking-wider mb-1">
                    <span className="h-1.5 w-1.5 rounded-full bg-acid animate-pulse" />
                    <span>PHYSICAL SPECIMEN #9084</span>
                  </div>
                  <h2 className="text-base font-bold tracking-wide text-white uppercase">
                    A/X PROTOTYPE RUNNER &apos;ACID VOID&apos;
                  </h2>
                </div>

                <div className="text-right">
                  <span className="text-[9px] font-mono uppercase tracking-widest text-neutral-400 block">
                    LAST TRADED ASK
                  </span>
                  <span className="text-xl font-black font-mono text-acid">$2,840</span>
                </div>
              </div>
            </GlassPanel>
          </div>
        </div>
      </div>
    </div>
  );
}
