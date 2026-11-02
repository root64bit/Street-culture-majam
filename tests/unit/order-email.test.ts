import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database.types';
import { sendNextOrderEmail, reconcileNextOrderEmail } from '@/lib/notifications/order-email';
import { classifyEmailOperation } from '@/lib/communications/email';
vi.mock('@/lib/communications/email', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/communications/email')>()),
  emailIsConfigured: () => true,
  sendEmail: vi.fn(),
}));

function fixture(kind = 'ORDER_CONFIRMED') {
  const message = {
    id: 'message',
    order_id: 'order',
    kind,
    lease_token: 'lease',
    operation_id: 'operation',
    created_at: new Date().toISOString(),
    claimed_at: new Date().toISOString(),
  };
  const single = vi.fn().mockResolvedValue({
    data: {
      id: 'order',
      order_number: 'SC00000000',
      guest_email: 'isolated@example.invalid',
      status: 'CONFIRMED',
      payment_status: 'PAID',
      total_amount: 613.5,
      subtotal: 63.65,
      shipping_amount: 549.85,
      currency: 'MZN',
      shipping_address_snapshot: {
        name: 'Test Buyer',
        address_line_1: 'Example 1',
        city: 'Johannesburg',
        province: 'Gauteng',
        postal_code: '2092',
        country: 'ZA',
      },
      shipping_method_snapshot: { name: 'Economy' },
    },
    error: null,
  });
  const from = vi.fn((table: string) =>
    table === 'orders'
      ? { select: () => ({ eq: () => ({ single }) }) }
      : table === 'order_items'
        ? {
            select: () => ({
              eq: () =>
                Promise.resolve({
                  data: [
                    {
                      product_name_snapshot: '<Test sunglasses>',
                      size_snapshot: 'OS',
                      quantity: 1,
                      unit_price: 63.65,
                    },
                  ],
                  error: null,
                }),
            }),
          }
        : {
            select: () => ({
              eq: () => ({
                eq: () =>
                  Promise.resolve({
                    data: [{ amount: 7.23, currency: 'GBP', provider: 'square' }],
                    error: null,
                  }),
              }),
            }),
          }
  );
  const rpc = vi.fn(async (name: string) =>
    name.startsWith('claim_') ? { data: [message], error: null } : { data: true, error: null }
  );
  return { db: { from, rpc } as unknown as SupabaseClient<Database>, single, rpc, message };
}
beforeEach(() => {
  vi.stubEnv('ORDER_EMAILS_ENABLED', 'true');
  vi.stubEnv('SC_EXTERNAL_SERVICES', 'test-mock');
});
afterEach(() => vi.unstubAllEnvs());

describe('order emails', () => {
  it('does not claim or send when disabled', async () => {
    vi.stubEnv('ORDER_EMAILS_ENABLED', 'false');
    const { db, rpc } = fixture(),
      sender = vi.fn();
    expect(await sendNextOrderEmail(db, sender)).toEqual({ skipped: true });
    expect(rpc).not.toHaveBeenCalled();
    expect(sender).not.toHaveBeenCalled();
  });
  it('records accepted, includes exact totals and escapes item names', async () => {
    const { db, rpc } = fixture(),
      sender = vi.fn().mockResolvedValue('operation');
    expect(await sendNextOrderEmail(db, sender)).toEqual({ accepted: true });
    expect(sender).toHaveBeenCalledOnce();
    const sent = sender.mock.calls[0][0];
    expect(sent.to).toBe('isolated@example.invalid');
    expect(sent.text).toContain('£7.23');
    expect(sent.text).toContain('613.50');
    expect(sent.text).toContain('South Africa');
    expect(sent.text).toContain('One size');
    expect(sent.html).toContain('&lt;Test sunglasses&gt;');
    expect(sent.html).not.toContain('<Test sunglasses>');
    expect(rpc).toHaveBeenCalledWith(
      'finish_order_message',
      expect.objectContaining({
        target_lease: 'lease',
        outcome: 'ACCEPTED',
        provider_id: 'operation',
      })
    );
  });
  it('sends a distinct admin purchase alert only to the owner supplied address', async () => {
    const { db } = fixture('ADMIN_NEW_ORDER'),
      sender = vi.fn().mockResolvedValue('operation');
    await sendNextOrderEmail(db, sender, 'ADMIN_EMAIL');
    expect(sender.mock.calls[0][0].to).toBe('support@streetculturevault.com');
    expect(sender.mock.calls[0][0].text).toContain('/admin/orders/order');
    expect(sender.mock.calls[0][0].text).toContain('does not book a courier');
  });
  it('retains unknown after timeout and never retries the provider POST', async () => {
    const { db, rpc } = fixture(),
      sender = vi.fn().mockRejectedValue(new Error('Timeout'));
    expect(await sendNextOrderEmail(db, sender)).toEqual({ uncertain: true });
    expect(sender).toHaveBeenCalledOnce();
    expect(rpc).toHaveBeenCalledWith(
      'finish_order_message',
      expect.objectContaining({ outcome: 'UNKNOWN' })
    );
  });
  it('skips cancelled orders', async () => {
    const { db, single, rpc } = fixture(),
      sender = vi.fn();
    single.mockResolvedValue({
      data: { payment_status: 'PAID', status: 'CANCELLED', guest_email: 'test@example.invalid' },
      error: null,
    });
    expect(await sendNextOrderEmail(db, sender)).toEqual({ skipped: true });
    expect(sender).not.toHaveBeenCalled();
    expect(rpc).toHaveBeenCalledWith(
      'finish_order_message',
      expect.objectContaining({ outcome: 'SKIPPED' })
    );
  });
  it('does not send shipped notification before physical handover', async () => {
    const { db } = fixture('ORDER_SHIPPED'),
      sender = vi.fn();
    await sendNextOrderEmail(db, sender);
    expect(sender).not.toHaveBeenCalled();
  });
  it('does not silently succeed when provider acceptance cannot be recorded', async () => {
    const { db, rpc } = fixture(),
      sender = vi.fn().mockResolvedValue('operation');
    rpc.mockImplementation(async (name) =>
      name.startsWith('claim_')
        ? { data: [fixture().message], error: null }
        : { data: false, error: null }
    );
    await expect(sendNextOrderEmail(db, sender)).rejects.toThrow('do not resend');
    expect(sender).toHaveBeenCalledOnce();
  });
  it('records delivery only after provider receipt lookup', async () => {
    const { db, rpc } = fixture(),
      lookup = vi.fn().mockResolvedValue({ outcome: 'DELIVERED', providerStatus: 'DELIVERED' });
    expect(await reconcileNextOrderEmail(db, 'CUSTOMER_EMAIL', lookup)).toEqual({
      outcome: 'DELIVERED',
    });
    expect(rpc).toHaveBeenCalledWith(
      'record_order_message_receipt',
      expect.objectContaining({ target_lease: 'lease', outcome: 'DELIVERED' })
    );
  });
  it('retries failed receipt GETs, not email sends', async () => {
    const { db, rpc } = fixture();
    expect(
      await reconcileNextOrderEmail(
        db,
        'ADMIN_EMAIL',
        vi.fn().mockRejectedValue(new Error('timeout'))
      )
    ).toEqual({ outcome: 'ACCEPTED' });
    expect(rpc).not.toHaveBeenCalledWith('claim_order_message', expect.anything());
  });
});

describe('Twilio receipt classification', () => {
  const stats = { delivered: 0, opened: 0, undelivered: 0, failed: 0, canceled: 0 };
  it('never equates COMPLETED to DELIVERED', () =>
    expect(classifyEmailOperation({ status: 'COMPLETED', stats })).toEqual({
      outcome: 'ACCEPTED',
      providerStatus: 'COMPLETED',
    }));
  it.each(['delivered', 'opened'])('recognizes %s evidence', (key) =>
    expect(
      classifyEmailOperation({ status: 'COMPLETED', stats: { ...stats, [key]: 1 } }).outcome
    ).toBe('DELIVERED')
  );
  it('records undelivered separately', () =>
    expect(
      classifyEmailOperation({ status: 'COMPLETED', stats: { ...stats, undelivered: 1 } }).outcome
    ).toBe('UNDELIVERED'));
  it('rejects malformed counters', () =>
    expect(() =>
      classifyEmailOperation({ status: 'COMPLETED', stats: { ...stats, delivered: '1' } })
    ).toThrow());
});
