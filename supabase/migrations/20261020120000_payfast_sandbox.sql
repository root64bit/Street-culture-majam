-- Test-only ledger. No orders, listings, stock, finance, notifications or couriers.
CREATE TABLE public.payfast_sandbox_sessions (
 id UUID PRIMARY KEY,
 created_by UUID NOT NULL,
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 amount_minor BIGINT NOT NULL DEFAULT 1000 CHECK (amount_minor=1000),
 currency TEXT NOT NULL DEFAULT 'ZAR' CHECK (currency='ZAR'),
 callback_token_hash TEXT NOT NULL CHECK (callback_token_hash ~ '^[0-9a-f]{64}$'),
 state TEXT NOT NULL DEFAULT 'PENDING' CHECK (state IN ('PENDING','COMPLETE')),
 provider_payment_id TEXT UNIQUE,
 fee_minor BIGINT CHECK (fee_minor>=0),
 net_minor BIGINT CHECK (net_minor>=0),
 verified_at TIMESTAMPTZ,
 CHECK ((state='PENDING' AND provider_payment_id IS NULL AND fee_minor IS NULL AND net_minor IS NULL AND verified_at IS NULL)
     OR (state='COMPLETE' AND provider_payment_id IS NOT NULL AND fee_minor IS NOT NULL AND net_minor IS NOT NULL
       AND fee_minor+net_minor=amount_minor AND verified_at IS NOT NULL))
);
COMMENT ON TABLE public.payfast_sandbox_sessions IS 'Synthetic virtual-wallet tests, not sales, revenue, receipts or fulfillment.';
CREATE INDEX payfast_sandbox_creator ON public.payfast_sandbox_sessions(created_by,created_at DESC);
ALTER TABLE public.payfast_sandbox_sessions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.payfast_sandbox_sessions FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT ON public.payfast_sandbox_sessions TO service_role;

CREATE FUNCTION public.complete_payfast_sandbox_payment(
 target_session UUID, target_provider TEXT, target_gross BIGINT,
 target_fee BIGINT, target_net BIGINT, target_token_hash TEXT
) RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE test public.payfast_sandbox_sessions;
BEGIN
 SELECT * INTO STRICT test FROM public.payfast_sandbox_sessions WHERE id=target_session FOR UPDATE;
 IF test.callback_token_hash<>target_token_hash OR target_gross<>test.amount_minor OR target_fee<0
    OR target_net<0 OR target_fee+target_net<>target_gross OR target_provider !~ '^[0-9]{1,30}$' THEN
   RAISE EXCEPTION 'Sandbox notification mismatch';
 END IF;
 IF test.state='COMPLETE' THEN
   IF test.provider_payment_id IS DISTINCT FROM target_provider OR test.fee_minor IS DISTINCT FROM target_fee
      OR test.net_minor IS DISTINCT FROM target_net THEN RAISE EXCEPTION 'Conflicting Sandbox notification'; END IF;
   RETURN;
 END IF;
 UPDATE public.payfast_sandbox_sessions SET state='COMPLETE', provider_payment_id=target_provider,
   fee_minor=target_fee, net_minor=target_net, verified_at=now() WHERE id=target_session;
END; $$;
REVOKE ALL ON FUNCTION public.complete_payfast_sandbox_payment(UUID,TEXT,BIGINT,BIGINT,BIGINT,TEXT) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.complete_payfast_sandbox_payment(UUID,TEXT,BIGINT,BIGINT,BIGINT,TEXT) TO service_role;
