import { describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database.types';
import {
  BookingRejected,
  processApprovedBooking,
  reconcileUnknownBooking,
  type BookingProvider,
} from '@/lib/shipping/booking';
const job = {
  id: 'job-id',
  revision: 3,
  lease_token: 'lease',
  state: 'BOOKING_UNKNOWN',
} as Database['public']['Tables']['fulfillment_jobs']['Row'];
const result = {
  provider_reference: 'provider-ref',
  document_reference: 'label-evidence',
  tracking_url: 'https://portal.internetexpress.co.za/track/test',
  cost: 100,
  currency: 'ZAR' as const,
  mzn_per_unit: 4,
};
function fixture() {
  const rpc = vi
    .fn()
    .mockResolvedValueOnce({ data: [job], error: null })
    .mockResolvedValue({ error: null });
  const db = { rpc } as unknown as SupabaseClient<Database>;
  const provider: BookingProvider = {
    contractVerified: true,
    create: vi.fn().mockResolvedValue(result),
    lookup: vi.fn().mockResolvedValue(result),
  };
  return { db, rpc, provider };
}
describe('courier booking worker safeguards', () => {
  it('refuses an unverified API contract before claiming any job', async () => {
    const { db, rpc, provider } = fixture();
    provider.contractVerified = false;
    await expect(processApprovedBooking(db, provider, job.id)).rejects.toThrow('contract');
    expect(rpc).not.toHaveBeenCalled();
  });
  it('calls the provider once with a stable revision-bound merchant reference', async () => {
    const { db, rpc, provider } = fixture();
    expect(await processApprovedBooking(db, provider, job.id)).toMatchObject({ outcome: 'BOOKED' });
    expect(provider.create).toHaveBeenCalledOnce();
    expect(provider.create).toHaveBeenCalledWith(
      expect.objectContaining({ merchantReference: 'SC-job-id-r3' })
    );
    expect(rpc.mock.calls[1][1]).toMatchObject({ outcome: 'BOOKED', target_lease: 'lease' });
  });
  it('records a timeout as unknown and never repeats a possibly accepted POST', async () => {
    const { db, rpc, provider } = fixture();
    vi.mocked(provider.create).mockRejectedValue(new Error('Timeout'));
    expect(await processApprovedBooking(db, provider, job.id)).toMatchObject({
      outcome: 'UNKNOWN',
    });
    expect(provider.create).toHaveBeenCalledOnce();
    expect(rpc.mock.calls[1][1].outcome).toBe('UNKNOWN');
  });
  it('distinguishes a documented definite rejection', async () => {
    const { db, provider } = fixture();
    vi.mocked(provider.create).mockRejectedValue(new BookingRejected('Rejected'));
    expect(await processApprovedBooking(db, provider, job.id)).toMatchObject({
      outcome: 'REJECTED',
    });
  });
  it('does not book if another worker already claimed the job', async () => {
    const { db, rpc, provider } = fixture();
    rpc.mockReset().mockResolvedValue({ data: [], error: null });
    expect(await processApprovedBooking(db, provider, job.id)).toEqual({ claimed: false });
    expect(provider.create).not.toHaveBeenCalled();
  });
  it('does not retry when an unknown-reference lookup returns nothing', async () => {
    const { db, provider } = fixture();
    vi.mocked(provider.lookup).mockResolvedValue(null);
    expect(await reconcileUnknownBooking(db, provider, job)).toEqual({ confirmed: false });
    expect(provider.create).not.toHaveBeenCalled();
  });
  it('preserves uncertainty if the accepted booking cannot be persisted', async () => {
    const { db, rpc, provider } = fixture();
    rpc
      .mockReset()
      .mockResolvedValueOnce({ data: [job], error: null })
      .mockResolvedValue({ error: new Error('DB unavailable') });
    await expect(processApprovedBooking(db, provider, job.id)).rejects.toThrow('Reconcile');
    expect(provider.create).toHaveBeenCalledOnce();
  });
});
