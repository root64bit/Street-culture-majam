-- Run inside a transaction after the M-Pesa installment migration, then roll
-- back. This verifies that partial installments preserve inventory and that
-- only the exact confirmed total completes the order.
INSERT INTO public.shipping_methods (
  id, code, name, country_code, region, price, currency,
  estimated_min_days, estimated_max_days, active
) VALUES (
  'b2000000-0000-4000-8000-000000000001',
  'MPESA_SPLIT_TEST', 'M-Pesa split test', 'MZ', NULL, 125, 'MZN', 1, 2, TRUE
);

SELECT * FROM public.create_guest_checkout_order(
  'b2000000-0000-4000-8000-000000000002',
  'SCSPLITDB',
  repeat('a', 64),
  'Split Test Buyer',
  'split-test@example.invalid',
  '258841234567',
  '{"country":"MZ","province":"Maputo","city":"Maputo","address_line_1":"Test street 1"}'::jsonb,
  'MPESA_SPLIT_TEST',
  '[{"listing_id":"10000000-0000-0000-0000-000000000001","size":"10.5","quantity":1,"expected_price":2840}]'::jsonb,
  NULL
);

-- Use a representative high-value total while retaining the seeded one-of-one
-- listing created by the checkout RPC.
UPDATE public.orders
SET subtotal = 159875, shipping_amount = 125, total_amount = 160000
WHERE id = 'b2000000-0000-4000-8000-000000000002';

INSERT INTO public.payments (
  id, order_id, provider, provider_reference, status, amount, currency
) VALUES
  ('b2000000-0000-4000-8000-000000000011', 'b2000000-0000-4000-8000-000000000002', 'mpesa', 'STTEST0001', 'PENDING', 75000, 'MZN'),
  ('b2000000-0000-4000-8000-000000000012', 'b2000000-0000-4000-8000-000000000002', 'mpesa', 'STTEST0002', 'FAILED', 75000, 'MZN'),
  ('b2000000-0000-4000-8000-000000000013', 'b2000000-0000-4000-8000-000000000002', 'mpesa', 'STTEST0003', 'FAILED', 75000, 'MZN'),
  ('b2000000-0000-4000-8000-000000000014', 'b2000000-0000-4000-8000-000000000002', 'mpesa', 'STTEST0004', 'FAILED', 10000, 'MZN');

DO $$
DECLARE
  completed BOOLEAN;
  failure_recorded BOOLEAN;
  order_row public.orders%ROWTYPE;
  listing_row public.listings%ROWTYPE;
BEGIN
  completed := public.complete_guest_checkout_payment('b2000000-0000-4000-8000-000000000011');
  IF completed THEN RAISE EXCEPTION 'First installment completed the order early'; END IF;

  SELECT * INTO order_row FROM public.orders
  WHERE id = 'b2000000-0000-4000-8000-000000000002';
  SELECT * INTO listing_row FROM public.listings
  WHERE id = '10000000-0000-0000-0000-000000000001';
  IF order_row.payment_status <> 'AUTHORIZED' OR order_row.status <> 'PENDING'
    OR listing_row.status <> 'RESERVED' THEN
    RAISE EXCEPTION 'First installment did not preserve the order reservation';
  END IF;

  UPDATE public.payments SET status = 'PENDING'
  WHERE id = 'b2000000-0000-4000-8000-000000000012';
  failure_recorded := public.fail_guest_checkout_payment('b2000000-0000-4000-8000-000000000012');
  SELECT * INTO order_row FROM public.orders
  WHERE id = 'b2000000-0000-4000-8000-000000000002';
  SELECT * INTO listing_row FROM public.listings
  WHERE id = '10000000-0000-0000-0000-000000000001';
  IF NOT failure_recorded OR order_row.payment_status <> 'AUTHORIZED'
    OR order_row.status <> 'PENDING' OR listing_row.status <> 'RESERVED' THEN
    RAISE EXCEPTION 'A failed later installment released partially paid inventory';
  END IF;

  UPDATE public.payments SET status = 'PENDING'
  WHERE id = 'b2000000-0000-4000-8000-000000000013';
  completed := public.complete_guest_checkout_payment('b2000000-0000-4000-8000-000000000013');
  IF completed THEN RAISE EXCEPTION 'Second installment completed the order early'; END IF;

  UPDATE public.payments SET status = 'PENDING'
  WHERE id = 'b2000000-0000-4000-8000-000000000014';
  completed := public.complete_guest_checkout_payment('b2000000-0000-4000-8000-000000000014');
  IF NOT completed THEN RAISE EXCEPTION 'Final installment did not complete the order'; END IF;

  SELECT * INTO order_row FROM public.orders
  WHERE id = 'b2000000-0000-4000-8000-000000000002';
  SELECT * INTO listing_row FROM public.listings
  WHERE id = '10000000-0000-0000-0000-000000000001';
  IF order_row.payment_status <> 'PAID' OR order_row.status <> 'CONFIRMED'
    OR listing_row.status <> 'SOLD' THEN
    RAISE EXCEPTION 'Exact installment total did not settle the order atomically';
  END IF;
END;
$$;
