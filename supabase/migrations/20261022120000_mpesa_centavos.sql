-- Exact centavo amounts, preserving the 75,000 MZN per-request ceiling and
-- the existing serialized payment, reservation, payout and notification flow.
CREATE OR REPLACE FUNCTION public.enforce_mpesa_transaction_limit()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
BEGIN
 IF NEW.provider='mpesa' AND (NEW.amount<=0 OR NEW.amount>75000 OR NEW.amount<>round(NEW.amount,2)) THEN
   RAISE EXCEPTION 'M-Pesa payments must be positive MZN amounts up to 75000 with at most two decimal places';
 END IF;
 RETURN NEW;
END; $$;

DO $$
DECLARE definition TEXT;
BEGIN
 -- Modify only the legacy implementation's precision check. The outer
 -- service-only advisory-lock wrapper and all existing grants remain intact.
 definition:=pg_get_functiondef('public.complete_guest_checkout_payment_v1(uuid)'::regprocedure);
 IF strpos(definition,'payment_record.amount <> trunc(payment_record.amount)')=0 THEN
   RAISE EXCEPTION 'Unexpected M-Pesa completion implementation; review before migration';
 END IF;
 definition:=replace(definition,'payment_record.amount <> trunc(payment_record.amount)',
   'payment_record.amount <> round(payment_record.amount, 2)');
 EXECUTE definition;

 definition:=pg_get_functiondef('public.checkout_payment_insert_gate()'::regprocedure);
 IF strpos(definition,'current_order.total_amount<>trunc(current_order.total_amount)')=0 THEN
   RAISE EXCEPTION 'Unexpected payment insert gate; review before migration';
 END IF;
 definition:=replace(definition,'current_order.total_amount<>trunc(current_order.total_amount)',
   'current_order.total_amount<>round(current_order.total_amount,2)');
 definition:=replace(definition,'M-Pesa requires the exact whole-MZN remaining installment',
   'M-Pesa requires the exact remaining MZN installment');
 EXECUTE definition;
END; $$;
