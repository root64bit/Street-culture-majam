import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database.types';
import { z } from 'zod';
import { safeCourierTrackingUrl } from './tracking';

const bookingSchema = z.object({
  provider_reference: z.string().min(3).max(128),
  document_reference: z.string().min(3).max(160),
  tracking_url: z.string().refine((v) => !v || Boolean(safeCourierTrackingUrl(v))),
  cost: z.number().finite().nonnegative(),
  currency: z.enum(['MZN', 'ZAR', 'GBP', 'USD', 'EUR']),
  mzn_per_unit: z.number().finite().positive(),
});
export type BookingResult = z.infer<typeof bookingSchema>;
type Job = Database['public']['Tables']['fulfillment_jobs']['Row'];
export interface BookingProvider {
  contractVerified: boolean;
  create: (input: { merchantReference: string; job: Job }) => Promise<BookingResult>;
  lookup: (merchantReference: string) => Promise<BookingResult | null>;
}
export class BookingRejected extends Error {}
export const internetExpressBookingProvider: BookingProvider = {
  contractVerified: false,
  async create() {
    throw new Error(
      'Internet Express shipment contract has not been verified. No booking request was sent.'
    );
  },
  async lookup() {
    throw new Error('Internet Express reference lookup contract has not been verified.');
  },
};
export const bookingReference = (job: Pick<Job, 'id' | 'revision'>) =>
  `SC-${job.id}-r${job.revision}`;
export async function processApprovedBooking(
  db: SupabaseClient<Database>,
  provider: BookingProvider,
  jobId: string
) {
  if (!provider.contractVerified)
    throw new Error('Verify the account-specific courier API contract before enabling booking.');
  const claim = await db.rpc('claim_fulfillment_booking', { target_job_id: jobId });
  if (claim.error) throw new Error('Shipment claim unavailable');
  const job = claim.data?.[0];
  if (!job?.lease_token) return { claimed: false };
  let outcome = 'UNKNOWN',
    booking: BookingResult | null = null;
  try {
    booking = bookingSchema.parse(
      await provider.create({ merchantReference: bookingReference(job), job })
    );
    outcome = 'BOOKED';
  } catch (error) {
    outcome = error instanceof BookingRejected ? 'REJECTED' : 'UNKNOWN';
  }
  const result = await db.rpc('finish_fulfillment_booking', {
    target_job_id: job.id,
    target_lease: job.lease_token,
    outcome,
    booking: booking ?? {},
  });
  if (result.error)
    throw new Error(
      'Booking result could not be persisted. Reconcile the existing reference before any retry.'
    );
  return { claimed: true, outcome };
}
export async function reconcileUnknownBooking(
  db: SupabaseClient<Database>,
  provider: BookingProvider,
  job: Job
) {
  if (!provider.contractVerified || job.state !== 'BOOKING_UNKNOWN' || !job.lease_token)
    throw new Error('Unknown booking and verified lookup contract required');
  const found = await provider.lookup(bookingReference(job));
  if (!found) return { confirmed: false }; // A missing lookup is not permission to POST again.
  const booking = bookingSchema.parse(found);
  const result = await db.rpc('finish_fulfillment_booking', {
    target_job_id: job.id,
    target_lease: job.lease_token,
    outcome: 'BOOKED',
    booking,
  });
  if (result.error) throw new Error('Booking reconciliation requires review');
  return { confirmed: true };
}
