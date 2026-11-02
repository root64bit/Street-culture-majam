-- Management reporting only. No transfer, refund, tax calculation or stock mutation.
INSERT INTO public.role_capabilities(role,capability)
SELECT role,capability FROM unnest(ARRAY['SUPER_ADMIN','ADMIN','FINANCE']::public.app_role[]) role
CROSS JOIN unnest(ARRAY['finance.read','finance.manage']) capability ON CONFLICT DO NOTHING;

CREATE TABLE public.finance_cost_entries (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(), request_id UUID NOT NULL UNIQUE,
 order_id UUID REFERENCES public.orders(id) ON DELETE RESTRICT,
 kind TEXT NOT NULL CHECK(kind IN ('COGS','COURIER','PAYMENT_FEE','PACKAGING','OTHER_DIRECT','OVERHEAD','TRANSFER_FEE','INCOME_TAX')),
 amount NUMERIC(12,2) NOT NULL CHECK(amount>=0), currency TEXT NOT NULL CHECK(currency IN ('MZN','GBP','ZAR','USD','EUR')),
 mzn_per_unit NUMERIC(24,12) NOT NULL CHECK(mzn_per_unit>0),
 amount_mzn NUMERIC(12,2) GENERATED ALWAYS AS (round(amount*mzn_per_unit,2)) STORED,
 basis TEXT NOT NULL CHECK(basis IN ('ACTUAL','ESTIMATE')), reference TEXT NOT NULL CHECK(length(btrim(reference)) BETWEEN 3 AND 160),
 incurred_on DATE NOT NULL, created_by UUID REFERENCES public.profiles(id), created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 reverses_id UUID UNIQUE REFERENCES public.finance_cost_entries(id),
 CHECK(currency<>'MZN' OR mzn_per_unit=1),
 CHECK((order_id IS NULL AND kind IN ('OVERHEAD','TRANSFER_FEE','INCOME_TAX')) OR (order_id IS NOT NULL AND kind NOT IN ('OVERHEAD','INCOME_TAX')))
);
CREATE TABLE public.finance_order_reviews (
 order_id UUID PRIMARY KEY REFERENCES public.orders(id) ON DELETE RESTRICT,
 costs_complete BOOLEAN NOT NULL, sales_tax_mzn NUMERIC(12,2) NOT NULL CHECK(sales_tax_mzn>=0),
 items_snapshot JSONB NOT NULL, note TEXT NOT NULL CHECK(length(btrim(note)) BETWEEN 10 AND 1000),
 reviewed_by UUID REFERENCES public.profiles(id), reviewed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE public.finance_cost_settlements (
 cost_id UUID PRIMARY KEY REFERENCES public.finance_cost_entries(id) ON DELETE RESTRICT,
 method TEXT NOT NULL CHECK(method IN ('PAID','DEDUCTED')),paid_on DATE NOT NULL,
 reference TEXT NOT NULL CHECK(length(btrim(reference)) BETWEEN 3 AND 160),
 recorded_by UUID REFERENCES public.profiles(id),recorded_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE public.finance_balance_observations (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(), request_id UUID NOT NULL UNIQUE,
 provider TEXT NOT NULL CHECK(provider IN ('square','bank')), amount NUMERIC(12,2) NOT NULL,
 currency TEXT NOT NULL CHECK(currency IN ('MZN','GBP','ZAR','USD','EUR')), observed_at TIMESTAMPTZ NOT NULL,
 reference TEXT NOT NULL CHECK(length(btrim(reference)) BETWEEN 3 AND 160),
 created_by UUID REFERENCES public.profiles(id), created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.finance_cost_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.finance_order_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.finance_balance_observations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.finance_cost_settlements ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Finance costs private" ON public.finance_cost_entries FOR SELECT TO authenticated USING(public.has_capability('finance.read'));
CREATE POLICY "Finance reviews private" ON public.finance_order_reviews FOR SELECT TO authenticated USING(public.has_capability('finance.read'));
CREATE POLICY "Finance balances private" ON public.finance_balance_observations FOR SELECT TO authenticated USING(public.has_capability('finance.read'));
CREATE POLICY "Finance invoice settlements private" ON public.finance_cost_settlements FOR SELECT TO authenticated USING(public.has_capability('finance.read'));
REVOKE ALL ON public.finance_cost_entries,public.finance_order_reviews,public.finance_balance_observations FROM anon,authenticated;
GRANT SELECT ON public.finance_cost_entries,public.finance_order_reviews,public.finance_balance_observations TO authenticated;
GRANT ALL ON public.finance_cost_entries,public.finance_order_reviews,public.finance_balance_observations TO service_role;
REVOKE ALL ON public.finance_cost_settlements FROM anon,authenticated;
GRANT SELECT ON public.finance_cost_settlements TO authenticated;
GRANT ALL ON public.finance_cost_settlements TO service_role;
CREATE INDEX finance_cost_order ON public.finance_cost_entries(order_id,incurred_on);
CREATE UNIQUE INDEX finance_invoice_duplicate_guard ON public.finance_cost_entries(order_id,kind,currency,reference,incurred_on) NULLS NOT DISTINCT WHERE reverses_id IS NULL;

ALTER TABLE public.order_items ADD COLUMN ownership_type_snapshot public.listing_ownership_type;
CREATE FUNCTION public.snapshot_order_item_ownership() RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 SELECT ownership_type INTO NEW.ownership_type_snapshot FROM public.listings WHERE id=NEW.listing_id;
 RETURN NEW;
END; $$;
CREATE TRIGGER order_item_ownership_snapshot BEFORE INSERT ON public.order_items FOR EACH ROW EXECUTE FUNCTION public.snapshot_order_item_ownership();
REVOKE ALL ON FUNCTION public.snapshot_order_item_ownership() FROM PUBLIC,anon,authenticated;

CREATE FUNCTION public.finance_record(action TEXT,payload JSONB) RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE result UUID; target UUID; original public.finance_cost_entries%ROWTYPE; o public.orders%ROWTYPE;
BEGIN
 IF NOT public.has_capability('finance.manage') THEN RAISE EXCEPTION 'Finance permission required' USING ERRCODE='42501'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('finance-ledger',0));
 IF action='COST' THEN
  IF (payload->>'amount')::numeric<>round((payload->>'amount')::numeric,2) THEN RAISE EXCEPTION 'Use exact minor units'; END IF;
  INSERT INTO public.finance_cost_entries(request_id,order_id,kind,amount,currency,mzn_per_unit,basis,reference,incurred_on,created_by)
  VALUES((payload->>'request_id')::uuid,(payload->>'order_id')::uuid,payload->>'kind',(payload->>'amount')::numeric,
   payload->>'currency',(payload->>'mzn_per_unit')::numeric,payload->>'basis',payload->>'reference',(payload->>'incurred_on')::date,auth.uid())
  ON CONFLICT(request_id) DO NOTHING RETURNING id INTO result;
  IF result IS NULL THEN
   SELECT id INTO result FROM public.finance_cost_entries WHERE request_id=(payload->>'request_id')::uuid
    AND order_id IS NOT DISTINCT FROM (payload->>'order_id')::uuid AND kind=payload->>'kind'
    AND amount=(payload->>'amount')::numeric AND currency=payload->>'currency'
    AND mzn_per_unit=(payload->>'mzn_per_unit')::numeric AND basis=payload->>'basis'
    AND reference=payload->>'reference' AND incurred_on=(payload->>'incurred_on')::date;
   IF result IS NULL THEN RAISE EXCEPTION 'Idempotency request does not match'; END IF;
   RETURN result;
  END IF;
  DELETE FROM public.finance_order_reviews WHERE order_id=(payload->>'order_id')::uuid;
 ELSIF action='REVERSE' THEN
  SELECT * INTO original FROM public.finance_cost_entries WHERE id=(payload->>'entry_id')::uuid FOR UPDATE;
  IF NOT FOUND OR original.reverses_id IS NOT NULL OR EXISTS(SELECT 1 FROM public.finance_cost_entries WHERE reverses_id=original.id) THEN RAISE EXCEPTION 'Cost cannot be reversed'; END IF;
  INSERT INTO public.finance_cost_entries(request_id,order_id,kind,amount,currency,mzn_per_unit,basis,reference,incurred_on,created_by,reverses_id)
  VALUES((payload->>'request_id')::uuid,original.order_id,original.kind,original.amount,original.currency,original.mzn_per_unit,original.basis,
   payload->>'reference',original.incurred_on,auth.uid(),original.id) RETURNING id INTO result;
  DELETE FROM public.finance_order_reviews WHERE order_id=original.order_id;
 ELSIF action='SETTLE' THEN
  target:=(payload->>'entry_id')::uuid;
  SELECT * INTO original FROM public.finance_cost_entries WHERE id=target FOR UPDATE;
  IF NOT FOUND OR original.basis<>'ACTUAL' OR original.reverses_id IS NOT NULL OR EXISTS(SELECT 1 FROM public.finance_cost_entries WHERE reverses_id=target) THEN RAISE EXCEPTION 'Active actual invoice required'; END IF;
  INSERT INTO public.finance_cost_settlements(cost_id,method,paid_on,reference,recorded_by)
  VALUES(target,payload->>'method',(payload->>'paid_on')::date,payload->>'reference',auth.uid()) ON CONFLICT(cost_id) DO NOTHING;
  IF NOT EXISTS(SELECT 1 FROM public.finance_cost_settlements WHERE cost_id=target AND method=payload->>'method' AND paid_on=(payload->>'paid_on')::date AND reference=payload->>'reference') THEN RAISE EXCEPTION 'Invoice payment evidence already recorded'; END IF;
  result:=target;
 ELSIF action='REVIEW' THEN
  target:=(payload->>'order_id')::uuid;
  SELECT * INTO o FROM public.orders WHERE id=target FOR UPDATE;
  IF NOT FOUND OR o.currency<>'MZN' OR o.payment_status NOT IN ('PAID','REFUNDED') THEN RAISE EXCEPTION 'Only settled MZN orders may be reviewed'; END IF;
  IF (payload->>'sales_tax_mzn')::numeric>o.total_amount THEN RAISE EXCEPTION 'Sales tax exceeds order total'; END IF;
  INSERT INTO public.finance_order_reviews(order_id,costs_complete,sales_tax_mzn,items_snapshot,note,reviewed_by)
  SELECT target,(payload->>'costs_complete')::boolean,(payload->>'sales_tax_mzn')::numeric,
   coalesce(jsonb_agg(jsonb_build_object('id',i.id,'unit_price',i.unit_price,'quantity',i.quantity,
    'commission_amount',i.commission_amount,'seller_net_amount',i.seller_net_amount,
    'ownership_type',coalesce(i.ownership_type_snapshot,l.ownership_type))), '[]'),payload->>'note',auth.uid()
   FROM public.order_items i LEFT JOIN public.listings l ON l.id=i.listing_id WHERE i.order_id=target
  ON CONFLICT(order_id) DO UPDATE SET costs_complete=excluded.costs_complete,sales_tax_mzn=excluded.sales_tax_mzn,
   items_snapshot=excluded.items_snapshot,note=excluded.note,reviewed_by=auth.uid(),reviewed_at=now();
  result:=target;
 ELSIF action='BALANCE' THEN
  IF (payload->>'observed_at')::timestamptz>now()+interval '5 minutes' THEN RAISE EXCEPTION 'Balance observation is in the future'; END IF;
  INSERT INTO public.finance_balance_observations(request_id,provider,amount,currency,observed_at,reference,created_by)
  VALUES((payload->>'request_id')::uuid,payload->>'provider',(payload->>'amount')::numeric,payload->>'currency',
   (payload->>'observed_at')::timestamptz,payload->>'reference',auth.uid())
  ON CONFLICT(request_id) DO NOTHING RETURNING id INTO result;
  IF result IS NULL THEN SELECT id INTO result FROM public.finance_balance_observations WHERE request_id=(payload->>'request_id')::uuid
   AND provider=payload->>'provider' AND amount=(payload->>'amount')::numeric AND currency=payload->>'currency'
   AND observed_at=(payload->>'observed_at')::timestamptz AND reference=payload->>'reference';
   IF result IS NULL THEN RAISE EXCEPTION 'Idempotency request does not match'; END IF; RETURN result; END IF;
 ELSE RAISE EXCEPTION 'Unknown finance operation'; END IF;
 INSERT INTO public.admin_audit_logs(actor_id,action,entity_type,entity_id,metadata)
 VALUES(auth.uid(),'FINANCE_'||action,'finance',result,jsonb_build_object('order_id',payload->>'order_id','reference',payload->>'reference','note',payload->>'note','sales_tax_mzn',payload->>'sales_tax_mzn'));
 RETURN result;
END; $$;
REVOKE ALL ON FUNCTION public.finance_record(TEXT,JSONB) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.finance_record(TEXT,JSONB) TO authenticated;

CREATE FUNCTION public.finance_workspace(date_from DATE,date_to DATE) RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE result JSONB;
BEGIN
 IF NOT public.has_capability('finance.read') THEN RAISE EXCEPTION 'Finance permission required' USING ERRCODE='42501'; END IF;
 IF date_from IS NULL OR date_to IS NULL OR date_to<date_from OR date_to-date_from>366 THEN RAISE EXCEPTION 'Choose at most 367 days'; END IF;
 IF (SELECT count(*) FROM public.orders WHERE created_at >= (date_from::timestamp AT TIME ZONE 'Africa/Johannesburg') AND created_at < ((date_to+1)::timestamp AT TIME ZONE 'Africa/Johannesburg'))>2000 THEN RAISE EXCEPTION 'Too many orders; narrow the date range'; END IF;
 SELECT jsonb_build_object(
  'orders',coalesce((SELECT jsonb_agg(jsonb_build_object('id',o.id,'order_number',o.order_number,'currency',o.currency,
   'subtotal',o.subtotal,'shipping_amount',o.shipping_amount,'discount_amount',o.discount_amount,'total_amount',o.total_amount,
   'status',o.status,'payment_status',o.payment_status,'created_at',o.created_at,'shipping_method',o.shipping_method_snapshot,
   'review',(SELECT to_jsonb(r) FROM public.finance_order_reviews r WHERE r.order_id=o.id),
   'items',coalesce((SELECT jsonb_agg(jsonb_build_object('id',i.id,'unit_price',i.unit_price,'quantity',i.quantity,
    'commission_amount',i.commission_amount,'seller_net_amount',i.seller_net_amount,'ownership_type',i.ownership_type_snapshot)) FROM public.order_items i WHERE i.order_id=o.id),'[]'),
   'payments',coalesce((SELECT jsonb_agg(jsonb_build_object('id',p.id,'provider',p.provider,'status',p.status,'amount',p.amount,
    'currency',p.currency,'paid_at',p.paid_at,'snapshot',jsonb_build_object('gbpPerMzn',p.provider_payload->'gbpPerMzn','square',p.provider_payload->'square'))) FROM public.payments p WHERE p.order_id=o.id AND p.status='SUCCEEDED'),'[]'),
   'payouts',coalesce((SELECT jsonb_agg(jsonb_build_object('status',s.status,'net_amount',s.net_amount,'currency',s.currency)) FROM public.seller_payouts s JOIN public.order_items i ON i.id=s.order_item_id WHERE i.order_id=o.id),'[]')) ORDER BY o.created_at DESC)
   FROM public.orders o WHERE o.created_at >= (date_from::timestamp AT TIME ZONE 'Africa/Johannesburg')
    AND o.created_at < ((date_to+1)::timestamp AT TIME ZONE 'Africa/Johannesburg') AND o.payment_status IN ('PAID','REFUNDED')),'[]'),
  'costs',coalesce((SELECT jsonb_agg(to_jsonb(c)||jsonb_build_object('settlement',(SELECT to_jsonb(s) FROM public.finance_cost_settlements s WHERE s.cost_id=c.id))) FROM public.finance_cost_entries c WHERE
    c.order_id IN (SELECT id FROM public.orders WHERE created_at >= (date_from::timestamp AT TIME ZONE 'Africa/Johannesburg') AND created_at < ((date_to+1)::timestamp AT TIME ZONE 'Africa/Johannesburg'))
    OR (c.order_id IS NULL AND c.incurred_on BETWEEN date_from AND date_to)),'[]'),
  'balances',coalesce((SELECT jsonb_agg(to_jsonb(b)) FROM (SELECT DISTINCT ON(provider,currency) * FROM public.finance_balance_observations ORDER BY provider,currency,observed_at DESC) b),'[]')
 ) INTO result;
 RETURN result;
END; $$;
REVOKE ALL ON FUNCTION public.finance_workspace(DATE,DATE) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.finance_workspace(DATE,DATE) TO authenticated;

CREATE FUNCTION public.finance_import_square_snapshot(target_payment_id UUID,target_actor UUID,target_snapshot JSONB)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE p public.payments%ROWTYPE;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.user_roles u JOIN public.role_capabilities c ON c.role=u.role JOIN public.profiles a ON a.id=u.user_id WHERE u.user_id=target_actor AND a.account_status='ACTIVE' AND c.capability='finance.manage') THEN RAISE EXCEPTION 'Finance actor required'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('finance-ledger',0));
 SELECT * INTO p FROM public.payments WHERE id=target_payment_id FOR UPDATE;
 IF NOT FOUND OR NOT coalesce(p.provider='square' AND p.status='SUCCEEDED' AND p.provider_reference IS NOT NULL
  AND target_snapshot->>'squareStatus'='COMPLETED' AND target_snapshot->>'currency'=p.currency
  AND (target_snapshot->>'amountMinor')::numeric=p.amount*100,FALSE) THEN RAISE EXCEPTION 'Payment snapshot mismatch'; END IF;
 UPDATE public.payments SET provider_payload=jsonb_set(coalesce(provider_payload,'{}'),'{square}',target_snapshot) WHERE id=p.id;
 DELETE FROM public.finance_order_reviews WHERE order_id=p.order_id;
 INSERT INTO public.admin_audit_logs(actor_id,action,entity_type,entity_id,metadata)
 VALUES(target_actor,'FINANCE_SQUARE_FEE_READ','payment',p.id,jsonb_build_object('source','GetPayment','fees_available',jsonb_typeof(target_snapshot->'processingFees')='array'));
END; $$;
REVOKE ALL ON FUNCTION public.finance_import_square_snapshot(UUID,UUID,JSONB) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.finance_import_square_snapshot(UUID,UUID,JSONB) TO service_role;
