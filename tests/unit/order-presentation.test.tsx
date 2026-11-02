import { render, screen, cleanup } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { DeliveryAddress } from '@/components/commerce/DeliveryAddress';
import { addressProblems } from '@/lib/shipping/address';
import { orderFulfillmentLabel } from '@/lib/commerce/labels';
import { formatOrderMoney, formatOrderTimestamp } from '@/lib/commerce/order-money';
import { safeCourierTrackingUrl } from '@/lib/shipping/tracking';
afterEach(cleanup);
describe('order presentation and address safety', () => {
  it('shows event time in explicitly labelled South African time', () => {
    expect(formatOrderTimestamp('2026-10-19T13:00:00Z')).toBe('19 Oct 2026, 15:00 SAST');
  });
  it('renders stored South Africa and complete destination fields, not a Mozambique fallback', () => {
    render(
      <DeliveryAddress
        address={{
          name: 'Test Buyer',
          address_line_1: 'Example street',
          local_area: 'Example suburb',
          city: 'Johannesburg',
          province: 'Gauteng',
          postal_code: '2000',
          country: 'ZA',
          phone: '+27110000000',
        }}
      />
    );
    expect(screen.getByText('South Africa')).toBeInTheDocument();
    expect(screen.queryByText('Mozambique')).not.toBeInTheDocument();
    expect(screen.getByText(/Gauteng, 2000/)).toBeInTheDocument();
  });
  it('flags a city incorrectly used as a province before booking', () => {
    expect(
      addressProblems({
        name: 'Buyer',
        phone: '+27110000000',
        address_line_1: 'Example street',
        local_area: 'Example suburb',
        city: 'Johannesburg',
        province: 'Johannesburg',
        postal_code: '2000',
        country: 'ZA',
      }).join(' ')
    ).toContain('province separately');
  });
  it.each(['CANCELLED', 'REFUNDED'])('does not claim %s orders are preparing', (status) => {
    expect(orderFulfillmentLabel(status, 'PAID', 'UNFULFILLED')).toBe('No active dispatch');
  });
  it('does not prepare unpaid orders or equate packed with shipped', () => {
    expect(orderFulfillmentLabel('PENDING', 'UNPAID', 'UNFULFILLED')).toContain(
      'waits for payment'
    );
    expect(orderFulfillmentLabel('PACKED', 'PAID', 'PACKED')).toContain('awaiting dispatch');
  });
  it('uses two decimal places in receipts', () => {
    expect(formatOrderMoney(613.5, 'MZN')).toContain('613.50');
    expect(formatOrderMoney(7.23, 'GBP')).toBe('£7.23');
  });
  it('rejects unapproved or credential-bearing tracking URLs', () => {
    expect(safeCourierTrackingUrl('javascript:alert(1)')).toBeNull();
    expect(safeCourierTrackingUrl('https://internetexpress.co.za.evil.invalid/')).toBeNull();
    expect(safeCourierTrackingUrl('https://user:secret@portal.internetexpress.co.za/')).toBeNull();
    expect(
      safeCourierTrackingUrl('https://portal.internetexpress.co.za/track/test')
    ).not.toBeNull();
  });
});
