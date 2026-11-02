-- Extend server-owned quote types; retain all existing prices, fingerprints,
-- ownership policies, grants and immutable payment/order snapshots.
SET lock_timeout = '5s';
ALTER TABLE public.checkout_shipping_quotes
  DROP CONSTRAINT checkout_shipping_quotes_provider_check,
  ADD CONSTRAINT checkout_shipping_quotes_provider_check
    CHECK (provider IN ('internet_express','configured','portador_diario'));
ALTER TABLE public.checkout_shipping_quotes
  DROP CONSTRAINT checkout_shipping_quotes_check3,
  ADD CONSTRAINT checkout_shipping_quotes_check3 CHECK (
    (provider='configured' AND shipping_method_id IS NOT NULL AND provider_currency='MZN'
      AND amount_mzn=provider_amount AND exchange_rate=1)
    OR (provider='internet_express' AND shipping_method_id IS NULL AND provider_currency='ZAR'
      AND amount_mzn=round(provider_amount/exchange_rate,2))
    OR (provider='portador_diario' AND shipping_method_id IS NULL AND provider_currency='MZN'
      AND amount_mzn=provider_amount AND exchange_rate=1)
  );
RESET lock_timeout;
