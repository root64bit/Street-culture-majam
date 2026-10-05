import React from 'react';
import Link from 'next/link';
import { Container } from '@/components/ui/Container';
import { GlassPanel } from '@/components/ui/GlassPanel';
import { Button } from '@/components/ui/Button';
import { ShieldCheck, Camera, DollarSign, Send, ArrowRight } from 'lucide-react';

export default function ConsignPage() {
  const steps = [
    {
      step: '01',
      title: 'ONLINE INTAKE SUBMISSION',
      desc: 'Submit your sneakers, streetwear, or luxury artifacts with initial photos and your expected asking price.',
      icon: <Send className="h-6 w-6 text-acid" />,
    },
    {
      step: '02',
      title: 'DELIVERY ARRANGEMENTS',
      desc: 'Our team will confirm how to hand over or send your item for inspection.',
      icon: <ShieldCheck className="h-6 w-6 text-acid" />,
    },
    {
      step: '03',
      title: 'PHYSICAL SPECIALIST INSPECTION',
      desc: 'Certified authenticators inspect stitching, materials, labels, and production hallmarks.',
      icon: <Camera className="h-6 w-6 text-acid" />,
    },
    {
      step: '04',
      title: 'LISTING & PAYOUT',
      desc: 'Once your item is approved, it can be listed for sale. A seller payout is recorded after the buyer payment is confirmed.',
      icon: <DollarSign className="h-6 w-6 text-acid" />,
    },
  ];

  return (
    <div className="py-12 sm:py-20">
      <Container>
        {/* Hero Banner */}
        <div className="text-center max-w-3xl mx-auto mb-16">
          <div className="inline-flex items-center gap-2 rounded-full border border-acid/30 bg-acid/10 px-3.5 py-1 text-[11px] font-mono tracking-widest text-acid uppercase mb-4">
            <span className="h-1.5 w-1.5 rounded-full bg-acid animate-pulse" />
            <span>GLOBAL CONSIGNMENT PROTOCOL</span>
          </div>

          <h1 className="text-3xl sm:text-5xl lg:text-6xl font-black uppercase tracking-tight text-white leading-tight">
            CONSIGN YOUR ARCHIVAL GRAILS WITH COMPLETE CONFIDENCE
          </h1>

          <p className="mt-4 text-sm sm:text-base text-neutral-300 font-sans leading-relaxed">
            Maximize the value of your authenticated sneakers, designer apparel, and collectibles
            through our global buyer syndicate.
          </p>

          <div className="mt-8 flex justify-center gap-4">
            <Link href="/consign/new">
              <Button variant="acid" size="lg" className="gap-2">
                <span>SUBMIT ITEM FOR CONSIGNMENT</span>
                <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
          </div>
        </div>

        {/* 4 Step Process Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-16">
          {steps.map((s, idx) => (
            <GlassPanel key={idx} intensity="heavy" className="p-6 border-white/10 flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between mb-4">
                  <div className="p-3 rounded-lg border border-white/10 bg-white/[0.04]">
                    {s.icon}
                  </div>
                  <span className="text-2xl font-black font-mono text-neutral-600">
                    {s.step}
                  </span>
                </div>
                <h3 className="text-sm font-bold font-mono uppercase tracking-wider text-white mb-2">
                  {s.title}
                </h3>
                <p className="text-xs text-neutral-400 font-sans leading-relaxed">
                  {s.desc}
                </p>
              </div>
            </GlassPanel>
          ))}
        </div>

        {/* Approved MZN consignment terms */}
        <GlassPanel intensity="medium" className="p-8 sm:p-12 border-white/10 max-w-4xl mx-auto">
          <div className="text-center mb-8">
            <span className="text-[10px] font-mono tracking-widest text-acid uppercase block mb-1">
              TRANSPARENT ECONOMICS
            </span>
            <h2 className="text-xl sm:text-3xl font-black uppercase text-white">
              CLEAR CONSIGNMENT TERMS
            </h2>
            <p className="text-xs font-mono text-neutral-400 mt-1">
              For each MZN consignment sale, STREET CULTURE retains 30% and you receive 70%.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 text-center">
            <div className="p-6 rounded-xl border border-white/10 bg-white/[0.02]">
              <span className="text-xs font-mono text-neutral-400 uppercase block mb-1">
                PLATFORM SHARE
              </span>
              <span className="text-3xl font-black font-mono text-white">30%</span>
              <span className="text-[11px] font-mono text-neutral-500 block mt-1">Retained after a confirmed sale</span>
            </div>

            <div className="p-6 rounded-xl border border-acid/40 bg-acid/10">
              <span className="text-xs font-mono text-acid uppercase block mb-1 font-bold">
                YOUR SHARE
              </span>
              <span className="text-3xl font-black font-mono text-acid">70%</span>
              <span className="text-[11px] font-mono text-neutral-300 block mt-1">A pending payout is created after buyer payment</span>
            </div>
          </div>
        </GlassPanel>
      </Container>
    </div>
  );
}
