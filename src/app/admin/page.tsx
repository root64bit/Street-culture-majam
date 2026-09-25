import React from 'react';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { Container, Section } from '@/components/ui/Container';
import { GlassPanel } from '@/components/ui/GlassPanel';
import {
  ShieldAlert,
  Package,
  CheckCircle2,
  Users,
  DollarSign,
  Layers,
  Settings,
  Tag,
} from 'lucide-react';

export default async function AdminDashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/auth/sign-in?redirectTo=/admin');
  }

  // Server-side admin verification
  const { data: isAdmin } = await supabase.rpc('is_admin');

  const adminModules = [
    {
      title: 'PRODUCTS & CATALOG',
      desc: 'Canonical product silhouettes, SKUs, and specifications',
      icon: <Package className="h-5 w-5 text-acid" />,
      count: '5 CANONICAL',
    },
    {
      title: 'INVENTORY LISTINGS',
      desc: 'Manage sellable items, status, and pricing controls',
      icon: <Tag className="h-5 w-5 text-acid" />,
      count: '7 ACTIVE',
    },
    {
      title: 'CONSIGNMENT INTAKE',
      desc: 'Seller submissions awaiting intake triage and shipping labels',
      icon: <Layers className="h-5 w-5 text-acid" />,
      count: '2 PENDING',
    },
    {
      title: 'AUTHENTICATION QUEUE',
      desc: 'Physical specialist inspection logs and decision records',
      icon: <CheckCircle2 className="h-5 w-5 text-acid" />,
      count: '1 IN REVIEW',
    },
    {
      title: 'ORDERS & FULFILLMENT',
      desc: 'Customer purchases, packaging, and dispatch tracking',
      icon: <ShieldAlert className="h-5 w-5 text-acid" />,
      count: '0 OPEN',
    },
    {
      title: 'CUSTOMERS & SELLERS',
      desc: 'Collector profiles, verification statuses, and seller levels',
      icon: <Users className="h-5 w-5 text-acid" />,
      count: '12 PROFILES',
    },
    {
      title: 'COMMISSION RULES',
      desc: 'Configurable tiered commission schedules and fixed fees',
      icon: <Settings className="h-5 w-5 text-acid" />,
      count: '3 RULES ACTIVE',
    },
    {
      title: 'PAYOUT DISBURSALS',
      desc: 'Consignor settlement batches and banking transfers',
      icon: <DollarSign className="h-5 w-5 text-acid" />,
      count: '$0.00 PENDING',
    },
  ];

  return (
    <Section>
      <Container>
        <div className="mb-8 border-b border-white/10 pb-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-[10px] font-mono tracking-widest text-acid uppercase mb-1">
              <span className="h-1.5 w-1.5 rounded-full bg-acid animate-pulse" />
              <span>CENTRAL VAULT OPERATIONS</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-black uppercase tracking-tight text-white">
              ADMIN CONTROL CENTER
            </h1>
            <p className="mt-1 text-xs font-mono text-neutral-400">
              Authenticated Operator Session: {user.email}
            </p>
          </div>

          <div className="rounded-lg border border-acid/30 bg-acid/10 px-3 py-1.5 text-xs font-mono text-acid">
            ROLE VERIFICATION: {isAdmin ? 'AUTHORIZED ADMIN' : 'STAFF ACCESS'}
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {adminModules.map((mod, idx) => (
            <GlassPanel key={idx} intensity="medium" className="p-6 border-white/10 flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between mb-4">
                  <div className="p-2.5 rounded-lg border border-white/10 bg-white/[0.04]">
                    {mod.icon}
                  </div>
                  <span className="text-[10px] font-mono text-acid font-bold tracking-wider">
                    {mod.count}
                  </span>
                </div>
                <h3 className="text-sm font-bold font-mono uppercase tracking-wider text-white mb-1">
                  {mod.title}
                </h3>
                <p className="text-xs text-neutral-400 font-sans leading-relaxed">
                  {mod.desc}
                </p>
              </div>

              <div className="mt-4 pt-3 border-t border-white/5 text-[10px] font-mono text-neutral-500 uppercase">
                MODULE INITIALIZED
              </div>
            </GlassPanel>
          ))}
        </div>
      </Container>
    </Section>
  );
}
