'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Container } from '@/components/ui/Container';
import { GlassPanel } from '@/components/ui/GlassPanel';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Button } from '@/components/ui/Button';
import { createClient } from '@/lib/supabase/client';
import { consignmentSubmissionSchema } from '@/lib/schemas/consignment.schema';
import { ArrowLeft, CheckCircle2 } from 'lucide-react';

export default function NewConsignmentPage() {
  const router = useRouter();

  const [brandName, setBrandName] = useState('');
  const [productName, setProductName] = useState('');
  const [size, setSize] = useState('');
  const [sizeSystem, setSizeSystem] = useState('US');
  const [condition, setCondition] = useState('NEW / UNWORN');
  const [expectedPrice, setExpectedPrice] = useState('');
  const [currency, setCurrency] = useState('USD');
  const [purchaseYear, setPurchaseYear] = useState(new Date().getFullYear().toString());
  const [deliveryMethod, setDeliveryMethod] = useState<'SHIP_TO_VAULT' | 'DROP_OFF'>('SHIP_TO_VAULT');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const priceNum = parseFloat(expectedPrice);
    const yearNum = parseInt(purchaseYear, 10);

    const validation = consignmentSubmissionSchema.safeParse({
      brandName,
      productName,
      size,
      sizeSystem,
      condition,
      expectedPrice: priceNum,
      currency,
      purchaseYear: isNaN(yearNum) ? undefined : yearNum,
      deliveryMethod,
    });

    if (!validation.success) {
      setError(validation.error.errors[0]?.message || 'Please check your submission inputs.');
      return;
    }

    setLoading(true);
    try {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        router.push('/auth/sign-in?redirectTo=/consign/new');
        return;
      }

      const { error: insertError } = await supabase.from('consignment_submissions').insert({
        seller_id: user.id,
        brand_name: brandName,
        product_name: productName,
        size,
        size_system: sizeSystem,
        condition,
        expected_price: priceNum,
        currency,
        purchase_year: isNaN(yearNum) ? null : yearNum,
        delivery_method: deliveryMethod,
        status: 'SUBMITTED',
        submitted_at: new Date().toISOString(),
      });

      if (insertError) {
        setError(insertError.message);
        return;
      }

      setSubmitted(true);
      setTimeout(() => {
        router.push('/account/consignments');
      }, 1500);
    } catch {
      setError('An unexpected error occurred while saving your consignment.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="py-12 sm:py-16">
      <Container className="max-w-2xl">
        <div className="mb-6 flex items-center justify-between">
          <Link
            href="/consign"
            className="inline-flex items-center gap-2 text-xs font-mono text-neutral-400 hover:text-white transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            <span>BACK TO CONSIGNMENT PROTOCOL</span>
          </Link>
        </div>

        <GlassPanel intensity="heavy" className="border-white/10 p-6 sm:p-8 shadow-glass">
          <div className="mb-6">
            <span className="text-[10px] font-mono tracking-widest text-acid uppercase block mb-1">
              SPECIMEN INTAKE PORTAL
            </span>
            <h1 className="text-2xl font-black uppercase tracking-tight text-white">
              SUBMIT CONSIGNMENT
            </h1>
            <p className="mt-1 text-xs font-mono text-neutral-400">
              Enter initial item specifications for vault specialist review
            </p>
          </div>

          {error && (
            <div className="mb-6 rounded-lg border border-red-500/40 bg-red-500/10 p-3 text-xs font-mono text-red-300">
              {error}
            </div>
          )}

          {submitted && (
            <div className="mb-6 flex items-center gap-2 rounded-lg border border-acid/40 bg-acid/10 p-3 text-xs font-mono text-acid">
              <CheckCircle2 className="h-4 w-4" />
              <span>Consignment intake registered! Redirecting to your dashboard...</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Input
                label="Brand Name"
                placeholder="e.g. Nike, Supreme, Jordan"
                value={brandName}
                onChange={(e) => setBrandName(e.target.value)}
                required
              />

              <Input
                label="Product Model / Silhouette"
                placeholder="e.g. Air Jordan 4 Retro Military Blue"
                value={productName}
                onChange={(e) => setProductName(e.target.value)}
                required
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <Input
                label="Size"
                placeholder="e.g. 10.5 or L"
                value={size}
                onChange={(e) => setSize(e.target.value)}
                required
              />

              <Select
                label="Size System"
                value={sizeSystem}
                onChange={(e) => setSizeSystem(e.target.value)}
                options={[
                  { value: 'US', label: 'US Sizing' },
                  { value: 'UK', label: 'UK Sizing' },
                  { value: 'EU', label: 'EU Sizing' },
                  { value: 'CM', label: 'CM Sizing' },
                  { value: 'STANDARD', label: 'Standard / Apparel' },
                ]}
              />

              <Select
                label="Condition"
                value={condition}
                onChange={(e) => setCondition(e.target.value)}
                options={[
                  { value: 'NEW / UNWORN', label: 'New / Deadstock' },
                  { value: 'EXCELLENT', label: 'Excellent (Like New)' },
                  { value: 'GENTLY USED', label: 'Gently Used (9/10)' },
                  { value: 'VINTAGE', label: 'Vintage / Archival' },
                ]}
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <Input
                label="Expected Asking Price"
                type="number"
                step="0.01"
                placeholder="450.00"
                value={expectedPrice}
                onChange={(e) => setExpectedPrice(e.target.value)}
                required
              />

              <Select
                label="Currency"
                value={currency}
                onChange={(e) => setCurrency(e.target.value)}
                options={[
                  { value: 'USD', label: 'USD ($)' },
                  { value: 'EUR', label: 'EUR (€)' },
                  { value: 'GBP', label: 'GBP (£)' },
                  { value: 'ZAR', label: 'ZAR (R)' },
                  { value: 'MZN', label: 'MZN (MT)' },
                ]}
              />

              <Input
                label="Purchase Year"
                type="number"
                placeholder="2023"
                value={purchaseYear}
                onChange={(e) => setPurchaseYear(e.target.value)}
              />
            </div>

            <Select
              label="Delivery Method to Central Vault"
              value={deliveryMethod}
              onChange={(e) => setDeliveryMethod(e.target.value as 'SHIP_TO_VAULT' | 'DROP_OFF')}
              options={[
                { value: 'SHIP_TO_VAULT', label: 'Insured Courier Delivery (Prepaid Label)' },
                { value: 'DROP_OFF', label: 'In-Person Vault Drop-Off Appointment' },
              ]}
            />

            <Button type="submit" variant="acid" size="lg" className="w-full mt-4" isLoading={loading}>
              SUBMIT ITEM FOR VERIFICATION
            </Button>
          </form>
        </GlassPanel>
      </Container>
    </div>
  );
}
