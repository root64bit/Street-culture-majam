-- Purchase prices belong to private finance records, never public catalog rows.
CREATE TABLE public.inventory_cost_prices (
 listing_id UUID PRIMARY KEY REFERENCES public.listings(id) ON DELETE RESTRICT,
 amount NUMERIC(12,2) NOT NULL CHECK(amount>=0),
 currency TEXT NOT NULL CHECK(currency IN ('MZN','GBP','ZAR','USD','EUR')),
 mzn_per_unit NUMERIC(24,12) NOT NULL CHECK(mzn_per_unit>0),
 amount_mzn NUMERIC(12,2) GENERATED ALWAYS AS(round(amount*mzn_per_unit,2)) STORED,
 reference TEXT NOT NULL CHECK(length(btrim(reference)) BETWEEN 3 AND 160),
 revision INTEGER NOT NULL DEFAULT 1 CHECK(revision>0),
 updated_by UUID REFERENCES public.profiles(id), updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 CHECK(currency<>'MZN' OR mzn_per_unit=1)
);
CREATE TABLE public.inventory_cost_history (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(), listing_id UUID NOT NULL REFERENCES public.listings(id) ON DELETE RESTRICT,
 revision INTEGER NOT NULL, cost_snapshot JSONB NOT NULL, recorded_by UUID REFERENCES public.profiles(id),
 recorded_at TIMESTAMPTZ NOT NULL DEFAULT now(), UNIQUE(listing_id,revision)
);
CREATE TABLE public.order_item_cost_snapshots (
 order_item_id UUID PRIMARY KEY REFERENCES public.order_items(id) ON DELETE RESTRICT,
 unit_cost_mzn NUMERIC(12,2), cost_snapshot JSONB, captured_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.inventory_cost_prices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_cost_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_item_cost_snapshots ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Purchase costs private" ON public.inventory_cost_prices FOR SELECT TO authenticated USING(public.has_capability('finance.read'));
CREATE POLICY "Purchase cost history private" ON public.inventory_cost_history FOR SELECT TO authenticated USING(public.has_capability('finance.read'));
CREATE POLICY "Sale costs private" ON public.order_item_cost_snapshots FOR SELECT TO authenticated USING(public.has_capability('finance.read'));
REVOKE ALL ON public.inventory_cost_prices,public.inventory_cost_history,public.order_item_cost_snapshots FROM anon,authenticated;
GRANT SELECT ON public.inventory_cost_prices,public.inventory_cost_history,public.order_item_cost_snapshots TO authenticated;
GRANT ALL ON public.inventory_cost_prices,public.inventory_cost_history,public.order_item_cost_snapshots TO service_role;

CREATE FUNCTION public.set_inventory_cost_price(target_listing_id UUID,expected_revision INTEGER,target_cost JSONB)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE l public.listings%ROWTYPE; c public.inventory_cost_prices%ROWTYPE; old_revision INTEGER;
BEGIN
 IF NOT public.has_capability('finance.manage') THEN RAISE EXCEPTION 'Finance permission required' USING ERRCODE='42501'; END IF;
 SELECT * INTO l FROM public.listings WHERE id=target_listing_id FOR UPDATE;
 IF NOT FOUND OR l.ownership_type<>'STREET_CULTURE' OR l.status NOT IN ('DRAFT','LIVE') THEN
  RAISE EXCEPTION 'Only available store-owned units can change purchase cost; use order finance corrections for sold or reserved units'; END IF;
 IF EXISTS(SELECT 1 FROM public.order_items i JOIN public.orders o ON o.id=i.order_id WHERE i.listing_id=l.id AND o.status NOT IN ('CANCELLED','REFUNDED')) THEN
  RAISE EXCEPTION 'An active order already references this unit; use order finance corrections'; END IF;
 SELECT revision INTO old_revision FROM public.inventory_cost_prices WHERE listing_id=l.id FOR UPDATE;
 IF coalesce(old_revision,0) IS DISTINCT FROM expected_revision THEN RAISE EXCEPTION 'Cost changed; refresh before editing'; END IF;
 IF NOT coalesce(jsonb_typeof(target_cost)='object'
  AND (target_cost->>'amount')::numeric>=0
  AND (target_cost->>'amount')::numeric=round((target_cost->>'amount')::numeric,2)
  AND (target_cost->>'mzn_per_unit')::numeric>0,FALSE) THEN RAISE EXCEPTION 'Exact purchase amount and historical conversion required'; END IF;
 INSERT INTO public.inventory_cost_prices(listing_id,amount,currency,mzn_per_unit,reference,updated_by)
 VALUES(l.id,(target_cost->>'amount')::numeric,target_cost->>'currency',(target_cost->>'mzn_per_unit')::numeric,btrim(target_cost->>'reference'),auth.uid())
 ON CONFLICT(listing_id) DO UPDATE SET amount=excluded.amount,currency=excluded.currency,mzn_per_unit=excluded.mzn_per_unit,
  reference=excluded.reference,revision=inventory_cost_prices.revision+1,updated_by=auth.uid(),updated_at=now() RETURNING * INTO c;
 INSERT INTO public.inventory_cost_history(listing_id,revision,cost_snapshot,recorded_by) VALUES(l.id,c.revision,to_jsonb(c),auth.uid());
 -- Cost values stay out of the general staff audit feed.
 INSERT INTO public.admin_audit_logs(actor_id,action,entity_type,entity_id,metadata)
 VALUES(auth.uid(),'PRIVATE_COST_UPDATED','listing',l.id,jsonb_build_object('revision',c.revision));
 RETURN to_jsonb(c);
END; $$;
REVOKE ALL ON FUNCTION public.set_inventory_cost_price(UUID,INTEGER,JSONB) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.set_inventory_cost_price(UUID,INTEGER,JSONB) TO authenticated;

CREATE FUNCTION public.create_costed_staff_inventory_draft(target_product_id UUID,target_size TEXT,target_size_system TEXT,target_condition TEXT,target_asking_price NUMERIC,target_cost JSONB DEFAULT NULL)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE result UUID;
BEGIN
 result:=public.create_staff_inventory_draft(target_product_id,target_size,target_size_system,target_condition,target_asking_price);
 IF target_cost IS NOT NULL AND target_cost<>'null'::jsonb THEN PERFORM public.set_inventory_cost_price(result,0,target_cost); END IF;
 RETURN result;
END; $$;
REVOKE ALL ON FUNCTION public.create_costed_staff_inventory_draft(UUID,TEXT,TEXT,TEXT,NUMERIC,JSONB) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.create_costed_staff_inventory_draft(UUID,TEXT,TEXT,TEXT,NUMERIC,JSONB) TO authenticated;

CREATE FUNCTION public.capture_order_item_cost() RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE c public.inventory_cost_prices%ROWTYPE;
BEGIN
 -- Serialize with the private cost editor. Never fetch today's price for an old sale.
 PERFORM 1 FROM public.listings WHERE id=NEW.listing_id FOR SHARE;
 SELECT * INTO c FROM public.inventory_cost_prices WHERE listing_id=NEW.listing_id;
 INSERT INTO public.order_item_cost_snapshots(order_item_id,unit_cost_mzn,cost_snapshot)
 VALUES(NEW.id,c.amount_mzn,CASE WHEN c.listing_id IS NULL THEN NULL ELSE to_jsonb(c) END);
 RETURN NEW;
END; $$;
CREATE TRIGGER private_order_item_cost AFTER INSERT ON public.order_items FOR EACH ROW EXECUTE FUNCTION public.capture_order_item_cost();
REVOKE ALL ON FUNCTION public.capture_order_item_cost() FROM PUBLIC,anon,authenticated;

-- Enrich only the explicitly finance-authorized report, not order/customer APIs.
ALTER FUNCTION public.finance_workspace(DATE,DATE) RENAME TO finance_workspace_base;
REVOKE ALL ON FUNCTION public.finance_workspace_base(DATE,DATE) FROM PUBLIC,anon,authenticated;
CREATE FUNCTION public.finance_workspace(date_from DATE,date_to DATE) RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE result JSONB; enriched JSONB;
BEGIN
 IF NOT public.has_capability('finance.read') THEN RAISE EXCEPTION 'Finance permission required' USING ERRCODE='42501'; END IF;
 result:=public.finance_workspace_base(date_from,date_to);
 SELECT coalesce(jsonb_agg(o||jsonb_build_object('items',(
  SELECT coalesce(jsonb_agg(i||jsonb_build_object('unit_cost_mzn',(SELECT s.unit_cost_mzn FROM public.order_item_cost_snapshots s WHERE s.order_item_id=(i->>'id')::uuid))),'[]')
  FROM jsonb_array_elements(o->'items') i
 ),'review',CASE WHEN o->'review'='null'::jsonb THEN 'null'::jsonb ELSE (o->'review')||jsonb_build_object('items_snapshot',(
  SELECT coalesce(jsonb_agg(i||jsonb_build_object('unit_cost_mzn',(SELECT s.unit_cost_mzn FROM public.order_item_cost_snapshots s WHERE s.order_item_id=(i->>'id')::uuid))),'[]')
  FROM jsonb_array_elements(o->'review'->'items_snapshot') i
 )) END)),'[]') INTO enriched FROM jsonb_array_elements(result->'orders') o;
 RETURN jsonb_set(result,'{orders}',enriched);
END; $$;
REVOKE ALL ON FUNCTION public.finance_workspace(DATE,DATE) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.finance_workspace(DATE,DATE) TO authenticated;
