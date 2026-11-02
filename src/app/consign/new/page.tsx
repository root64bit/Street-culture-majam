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
import { ProductSizeFields } from '@/components/ui/ProductSizeFields';

export default function NewConsignmentPage() {
  const router = useRouter();

  const [brandName, setBrandName] = useState('');
  const [productName, setProductName] = useState('');
  const [size, setSize] = useState('');
  const [sizeSystem, setSizeSystem] = useState('UK');
  const [condition, setCondition] = useState('NEW / UNWORN');
  const [expectedPrice, setExpectedPrice] = useState('');
  const currency = 'MZN';
  const [purchaseYear, setPurchaseYear] = useState(new Date().getFullYear().toString());
  const [deliveryMethod, setDeliveryMethod] = useState<'SHIP_TO_VAULT' | 'DROP_OFF'>(
    'SHIP_TO_VAULT'
  );
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [sellerNotes, setSellerNotes] = useState('');
  const [draftMessage, setDraftMessage] = useState('');
  const draft = async (restore: boolean) => {
    const {
      data: { user },
    } = await createClient().auth.getUser();
    if (!user) {
      setDraftMessage('Sign in before saving a private draft on this device.');
      return;
    }
    const key = `sc_consignment_draft_v2:${user.id}`;
    try {
      if (!restore) {
        localStorage.setItem(
          key,
          JSON.stringify({
            brandName,
            productName,
            size,
            sizeSystem,
            condition,
            expectedPrice,
            purchaseYear,
            deliveryMethod,
            sellerNotes,
          })
        );
        setDraftMessage('Draft saved on this device for your account.');
        return;
      }
      const saved = JSON.parse(localStorage.getItem(key) ?? 'null') as Record<
        string,
        unknown
      > | null;
      if (!saved) {
        setDraftMessage('No saved draft for this account on this device.');
        return;
      }
      const pairs: [string, (value: string) => void][] = [
        ['brandName', setBrandName],
        ['productName', setProductName],
        ['size', setSize],
        ['sizeSystem', setSizeSystem],
        ['condition', setCondition],
        ['expectedPrice', setExpectedPrice],
        ['purchaseYear', setPurchaseYear],
        ['sellerNotes', setSellerNotes],
      ];
      for (const [name, set] of pairs)
        if (typeof saved[name] === 'string' && saved[name].length <= 2000) set(saved[name]);
      if (saved.deliveryMethod === 'SHIP_TO_VAULT' || saved.deliveryMethod === 'DROP_OFF')
        setDeliveryMethod(saved.deliveryMethod);
      setDraftMessage('Draft restored. Review all fields before submitting.');
    } catch {
      setDraftMessage('This device could not save or restore the draft.');
    }
  };

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
        seller_notes: sellerNotes.trim() || null,
      });

      if (insertError) {
        setError(insertError.message);
        return;
      }

      setSubmitted(true);
      try {
        localStorage.removeItem(`sc_consignment_draft_v2:${user.id}`);
      } catch {
        /* Submission already succeeded; storage cleanup must not suggest retrying it. */
      }
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
            className="inline-flex items-center gap-2 font-mono text-xs text-neutral-700 transition-colors hover:text-black"
          >
            <ArrowLeft className="h-4 w-4" />
            <span>BACK TO CONSIGNMENT PROTOCOL</span>
          </Link>
        </div>

        <GlassPanel
          intensity="heavy"
          className="border-neutral-200 bg-white p-6 text-neutral-950 shadow-lg sm:p-8"
        >
          <div className="mb-6">
            <span className="mb-1 block font-mono text-[10px] uppercase tracking-widest text-emerald-800">
              SPECIMEN INTAKE PORTAL
            </span>
            <h1 className="text-2xl font-black uppercase tracking-tight text-neutral-950">
              SUBMIT CONSIGNMENT
            </h1>
            <p className="mt-1 font-mono text-xs text-neutral-600">
              Enter initial item specifications for vault specialist review
            </p>
          </div>

          {error && (
            <div
              role="alert"
              className="mb-6 rounded-lg border border-red-300 bg-red-50 p-3 font-mono text-xs text-red-800"
            >
              {error}
            </div>
          )}

          {submitted && (
            <div
              role="status"
              className="mb-6 flex items-center gap-2 rounded-lg border border-emerald-300 bg-emerald-50 p-3 font-mono text-xs text-emerald-800"
            >
              <CheckCircle2 className="h-4 w-4" />
              <span>Consignment intake registered! Redirecting to your dashboard...</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="flex flex-wrap gap-4 text-sm">
              <button
                type="button"
                onClick={() => void draft(false)}
                className="font-semibold underline"
              >
                Save draft on this device
              </button>
              <button
                type="button"
                onClick={() => void draft(true)}
                className="font-semibold underline"
              >
                Restore my draft
              </button>
            </div>
            {draftMessage && (
              <p role="status" className="text-sm text-neutral-700">
                {draftMessage}
              </p>
            )}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Input
                tone="light"
                label="Brand Name"
                placeholder="e.g. Nike, Supreme, Jordan"
                value={brandName}
                onChange={(e) => setBrandName(e.target.value)}
                required
              />

              <Input
                tone="light"
                label="Product Model / Silhouette"
                placeholder="e.g. Air Jordan 4 Retro Military Blue"
                value={productName}
                onChange={(e) => setProductName(e.target.value)}
                required
              />
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <ProductSizeFields
                size={size}
                system={sizeSystem}
                onSizeChange={setSize}
                onSystemChange={setSizeSystem}
                tone="light"
              />

              <Select
                tone="light"
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

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <Input
                  tone="light"
                  label="Expected Asking Price"
                  type="number"
                  step="0.01"
                  placeholder="450.00"
                  value={expectedPrice}
                  onChange={(e) => setExpectedPrice(e.target.value)}
                  aria-describedby="consignment-price-help"
                  required
                />
                <p id="consignment-price-help" className="mt-2 text-sm text-neutral-700">
                  Expected sale price is in Mozambican meticais (MZN). Other currencies on the
                  storefront are display estimates only.
                </p>
              </div>

              <Input
                tone="light"
                label="Purchase Year"
                type="number"
                placeholder="2023"
                value={purchaseYear}
                onChange={(e) => setPurchaseYear(e.target.value)}
              />
            </div>

            <Select
              tone="light"
              label="Delivery Method to Central Vault"
              value={deliveryMethod}
              onChange={(e) => setDeliveryMethod(e.target.value as 'SHIP_TO_VAULT' | 'DROP_OFF')}
              options={[
                { value: 'SHIP_TO_VAULT', label: 'Courier to vault after staff approval' },
                { value: 'DROP_OFF', label: 'In-Person Vault Drop-Off Appointment' },
              ]}
            />
            <p className="text-sm leading-6 text-neutral-700">
              Submit for review first. Our team will confirm the intake address, delivery cost and
              any available cover before you send your item. A prepaid label is not issued by this
              form.
            </p>
            <label className="block text-xs font-semibold text-neutral-800">
              Condition and provenance notes
              <textarea
                value={sellerNotes}
                onChange={(event) => setSellerNotes(event.target.value)}
                maxLength={2000}
                rows={4}
                className="mt-2 block w-full rounded-lg border border-neutral-300 bg-white p-3 text-sm text-neutral-950"
                placeholder="Describe wear, defects, packaging and where the item was purchased. Do not include card details or identity documents."
              />
            </label>
            <p className="text-sm leading-6 text-neutral-700">
              Have clear photos of the item, labels, condition and packaging ready. Staff will
              confirm the evidence required during review. This form does not authenticate the item
              or publish stock.
            </p>

            <Button
              type="submit"
              variant="acid"
              size="lg"
              className="mt-4 w-full"
              isLoading={loading}
            >
              SUBMIT ITEM FOR VERIFICATION
            </Button>
          </form>
        </GlassPanel>
      </Container>
    </div>
  );
}
