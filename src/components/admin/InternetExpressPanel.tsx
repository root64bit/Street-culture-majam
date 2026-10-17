import { CheckCircle2, Package, Truck } from 'lucide-react';
import { requireCapabilitiesPage } from '@/lib/admin/access';
import {
  CourierError,
  getInternetExpressAccount,
  internetExpressConfigured,
} from '@/lib/shipping/internet-express';
import { CourierRateForm } from './CourierRateForm';

export async function InternetExpressPanel() {
  const { supabase } = await requireCapabilitiesPage('/admin/shipping', ['shipping.read']);
  const { data: canManage } = await supabase.rpc('has_capability', {
    check_capability: 'shipping.manage',
  });
  const configured = internetExpressConfigured();
  let account = null;
  let error = '';
  if (configured) {
    try {
      account = await getInternetExpressAccount();
    } catch (cause) {
      error =
        cause instanceof CourierError ? cause.message : 'Could not connect to Internet Express.';
    }
  }
  const address = account?.collectionAddress;
  return (
    <section className="mx-4 mt-7 rounded-2xl border border-[#cfded2] bg-white p-5 sm:mx-7 lg:mx-10">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex gap-3">
          <Truck className="mt-1 h-6 w-6 text-[#087456]" />
          <div>
            <h2 className="text-xl font-black">Internet Express</h2>
            <p className="mt-1 text-sm text-[#61766b]">Courier account and delivery quotes</p>
          </div>
        </div>
        <span
          className={`inline-flex items-center gap-2 rounded-full px-3 py-2 text-xs font-bold ${account ? 'bg-emerald-50 text-emerald-800' : 'bg-amber-50 text-amber-900'}`}
        >
          {account && <CheckCircle2 className="h-4 w-4" />}
          {account ? 'Connected' : configured ? 'Connection needs attention' : 'API key required'}
        </span>
      </div>
      {error && <p className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-800">{error}</p>}
      {!configured && (
        <p className="mt-4 text-sm text-[#61766b]">
          Add INTERNET_EXPRESS_API_KEY to the server environment to connect the courier account.
        </p>
      )}
      {account && (
        <div className="mt-5 grid gap-4 md:grid-cols-2">
          <div className="rounded-xl bg-[#f3f7f2] p-4">
            <p className="text-xs font-bold uppercase tracking-wide text-[#61766b]">
              Collection address · {account.name}
            </p>
            {address ? (
              <p className="mt-2 text-sm leading-6">
                {address.street_address}, {address.local_area}
                <br />
                {address.city}, {address.zone}, {address.code}
                <br />
                {address.country === 'ZA' ? 'South Africa' : 'Mozambique'}
              </p>
            ) : (
              <p className="mt-2 text-sm">
                Set your default collection address in the courier portal.
              </p>
            )}
            <a
              href="https://portal.internetexpress.co.za"
              target="_blank"
              rel="noopener noreferrer"
              className="mt-3 inline-block text-xs font-bold text-[#065f46] underline underline-offset-4"
            >
              Manage courier account
            </a>
          </div>
          <div className="rounded-xl bg-[#fff8e8] p-4">
            <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide">
              <Package className="h-4 w-4" />
              Live checkout pricing
            </p>
            <p className="mt-2 text-sm leading-6 text-[#61766b]">
              Local and international rates now come directly from Internet Express. Checkout
              converts the courier&apos;s ZAR price to MZN using the current daily exchange rate.
            </p>
            <p className="mt-2 text-xs text-[#61766b]">
              Current parcel basis per item: 35 × 25 × 15 cm, 2 kg. Liability cover is excluded.
              PayFast is still awaiting merchant verification.
            </p>
          </div>
        </div>
      )}
      {account && address && canManage && <CourierRateForm />}
    </section>
  );
}
