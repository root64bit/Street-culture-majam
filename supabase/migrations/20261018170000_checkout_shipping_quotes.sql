-- SC-001/002: additive server-owned quotations; no existing prices/data changed.
CREATE FUNCTION public.checkout_destination_fingerprint(destination JSONB)
RETURNS TEXT LANGUAGE sql IMMUTABLE SET search_path = '' AS $$
 SELECT encode(sha256(convert_to(jsonb_build_object(
  'address_line_1',lower(btrim(coalesce(destination->>'address_line_1',''))),
  'address_line_2',lower(btrim(coalesce(destination->>'address_line_2',''))),
  'local_area',lower(btrim(coalesce(destination->>'local_area',''))),
  'city',lower(btrim(coalesce(destination->>'city',''))),
  'province',lower(btrim(coalesce(destination->>'province',''))),
  'postal_code',lower(btrim(coalesce(destination->>'postal_code',''))),
  'country',upper(btrim(coalesce(destination->>'country',''))),
  'address_type',coalesce(destination->>'address_type','residential')
 )::TEXT,'UTF8')),'hex');
$$;

CREATE FUNCTION public.canonical_checkout_items(items JSONB)
RETURNS JSONB LANGUAGE sql IMMUTABLE SET search_path = '' AS $$
 SELECT jsonb_agg(jsonb_build_object('listing_id',listing_id,'size',size,
   'quantity',quantity,'expected_price',expected_price) ORDER BY listing_id)
 FROM jsonb_to_recordset(items) AS x(listing_id UUID,size TEXT,quantity INTEGER,expected_price NUMERIC);
$$;

CREATE TABLE public.checkout_shipping_quotes (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 session_hash TEXT NOT NULL CHECK(session_hash ~ '^[a-f0-9]{64}$'),
 user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
 destination_fingerprint TEXT NOT NULL CHECK(destination_fingerprint ~ '^[a-f0-9]{64}$'),
 items_snapshot JSONB NOT NULL CHECK(jsonb_typeof(items_snapshot)='array' AND jsonb_array_length(items_snapshot) BETWEEN 1 AND 10),
 provider TEXT NOT NULL CHECK(provider IN ('internet_express','configured')),
 service_code TEXT NOT NULL, service_name TEXT NOT NULL,
 shipping_method_id UUID REFERENCES public.shipping_methods(id) ON DELETE RESTRICT,
 parcel_basis JSONB NOT NULL, provider_references JSONB NOT NULL DEFAULT '{}',
 provider_amount NUMERIC(12,2) NOT NULL CHECK(provider_amount>=0),
 provider_currency TEXT NOT NULL CHECK(provider_currency IN ('ZAR','MZN')),
 amount_mzn NUMERIC(12,2) NOT NULL CHECK(amount_mzn>=0),
 exchange_rate NUMERIC(30,18) NOT NULL CHECK(exchange_rate>0),
 exchange_updated_at TIMESTAMPTZ NOT NULL,
 estimated_min_days INTEGER NOT NULL CHECK(estimated_min_days>=0),
 estimated_max_days INTEGER NOT NULL CHECK(estimated_max_days>=estimated_min_days),
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(), expires_at TIMESTAMPTZ NOT NULL,
 consumed_order_id UUID UNIQUE REFERENCES public.orders(id) ON DELETE CASCADE,
 consumed_at TIMESTAMPTZ,
 status TEXT GENERATED ALWAYS AS (CASE WHEN consumed_order_id IS NULL THEN 'AVAILABLE' ELSE 'CONSUMED' END) STORED,
 CHECK(expires_at>created_at AND expires_at<=created_at+interval '15 minutes'),
 CHECK(exchange_updated_at<=created_at+interval '5 minutes' AND exchange_updated_at>created_at-interval '3 days'),
 CHECK((provider='configured' AND shipping_method_id IS NOT NULL AND provider_currency='MZN' AND amount_mzn=provider_amount AND exchange_rate=1)
    OR (provider='internet_express' AND shipping_method_id IS NULL AND provider_currency='ZAR'
        AND amount_mzn=round(provider_amount/exchange_rate,2))),
 CHECK((consumed_order_id IS NULL)=(consumed_at IS NULL))
);
ALTER TABLE public.checkout_shipping_quotes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.checkout_shipping_quotes FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE ON public.checkout_shipping_quotes TO service_role;
CREATE INDEX checkout_shipping_quotes_expiry_idx ON public.checkout_shipping_quotes(expires_at) WHERE consumed_order_id IS NULL;
ALTER TABLE public.orders ADD COLUMN checkout_quote_id UUID UNIQUE REFERENCES public.checkout_shipping_quotes(id) DEFERRABLE INITIALLY DEFERRED,
 ADD COLUMN checkout_request_hash TEXT;

CREATE FUNCTION public.protect_checkout_quote() RETURNS TRIGGER LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
 -- The auth FK may anonymize ownership only after that user is deleted.
 IF OLD.user_id IS NOT NULL AND NEW.user_id IS NULL AND
   NOT EXISTS(SELECT 1 FROM auth.users WHERE id=OLD.user_id) AND
   (to_jsonb(NEW)-'user_id'-'status')=(to_jsonb(OLD)-'user_id'-'status') THEN RETURN NEW; END IF;
 IF (to_jsonb(NEW)-'consumed_order_id'-'consumed_at'-'status') IS DISTINCT FROM
    (to_jsonb(OLD)-'consumed_order_id'-'consumed_at'-'status')
    OR OLD.consumed_order_id IS NOT NULL THEN RAISE EXCEPTION 'Shipping quotations are immutable'; END IF;
 RETURN NEW;
END; $$;
CREATE TRIGGER checkout_quote_immutable BEFORE UPDATE ON public.checkout_shipping_quotes
 FOR EACH ROW EXECUTE FUNCTION public.protect_checkout_quote();

-- Quotes are inserted only by the server after provider/configured-method
-- pricing. Their destination digest is calculated in PostgreSQL, not the client.
CREATE FUNCTION public.issue_checkout_shipping_quote(
 target_session_hash TEXT,target_user_id UUID,target_destination JSONB,target_items JSONB,
 target_provider TEXT,target_service_code TEXT,target_service_name TEXT,target_shipping_method_id UUID,
 target_parcels JSONB,target_provider_references JSONB,target_provider_amount NUMERIC,
 target_provider_currency TEXT,target_amount_mzn NUMERIC,target_exchange_rate NUMERIC,
 target_exchange_updated_at TIMESTAMPTZ,target_min_days INTEGER,target_max_days INTEGER
) RETURNS TABLE(quote_id UUID,quote_expires_at TIMESTAMPTZ)
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE result public.checkout_shipping_quotes%ROWTYPE; method public.shipping_methods%ROWTYPE;
BEGIN
 IF target_amount_mzn<>round(target_amount_mzn,2) OR target_provider_amount<>round(target_provider_amount,2)
  OR jsonb_array_length(target_items)<>(SELECT count(DISTINCT value->>'listing_id') FROM jsonb_array_elements(target_items))
  THEN RAISE EXCEPTION 'Invalid quote precision or items'; END IF;
 IF target_provider='configured' THEN
  SELECT * INTO method FROM public.shipping_methods WHERE id=target_shipping_method_id AND active
   AND currency='MZN' AND country_code=target_destination->>'country'
   AND (region IS NULL OR lower(region)=lower(target_destination->>'province')) FOR SHARE;
  IF NOT FOUND OR method.code<>target_service_code OR method.price<>target_amount_mzn THEN
   RAISE EXCEPTION 'Configured delivery method is unavailable'; END IF;
 END IF;
 INSERT INTO public.checkout_shipping_quotes(session_hash,user_id,destination_fingerprint,items_snapshot,
  provider,service_code,service_name,shipping_method_id,parcel_basis,provider_references,provider_amount,
  provider_currency,amount_mzn,exchange_rate,exchange_updated_at,estimated_min_days,estimated_max_days,expires_at)
 VALUES(target_session_hash,target_user_id,public.checkout_destination_fingerprint(target_destination),
  public.canonical_checkout_items(target_items),target_provider,target_service_code,target_service_name,
  target_shipping_method_id,target_parcels,target_provider_references,target_provider_amount,target_provider_currency,
  target_amount_mzn,target_exchange_rate,target_exchange_updated_at,target_min_days,target_max_days,
  least(now()+interval '10 minutes',target_exchange_updated_at+interval '3 days')) RETURNING * INTO result;
 RETURN QUERY SELECT result.id,result.expires_at;
END; $$;
REVOKE ALL ON FUNCTION public.issue_checkout_shipping_quote(TEXT,UUID,JSONB,JSONB,TEXT,TEXT,TEXT,UUID,JSONB,JSONB,NUMERIC,TEXT,NUMERIC,NUMERIC,TIMESTAMPTZ,INTEGER,INTEGER) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.issue_checkout_shipping_quote(TEXT,UUID,JSONB,JSONB,TEXT,TEXT,TEXT,UUID,JSONB,JSONB,NUMERIC,TEXT,NUMERIC,NUMERIC,TIMESTAMPTZ,INTEGER,INTEGER) TO service_role;

CREATE OR REPLACE FUNCTION public.create_quoted_checkout_order(
    target_order_id UUID,
    target_order_number TEXT,
    target_access_token_hash TEXT,
    target_guest_name TEXT,
    target_guest_email TEXT,
    target_guest_phone TEXT,
    target_shipping_snapshot JSONB,
    target_shipping_method_code TEXT,
    target_items JSONB,
    target_shipping_quote_id UUID,
    target_session_hash TEXT,
    target_user_id UUID DEFAULT NULL
)
RETURNS TABLE (
    created_order_id UUID,
    created_order_number TEXT,
    created_subtotal NUMERIC(12, 2),
    created_shipping NUMERIC(12, 2),
    created_total NUMERIC(12, 2),
    created_expires_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    quote_record public.checkout_shipping_quotes%ROWTYPE;
    prior_order public.orders%ROWTYPE;
    request_hash TEXT;
    item RECORD;
    listing_record RECORD;
    shipping_record public.shipping_methods%ROWTYPE;
    commission_record public.commission_rules%ROWTYPE;
    item_commission NUMERIC(12, 2);
    item_seller_net NUMERIC(12, 2);
    rule_id UUID;
    rule_snapshot JSONB;
    order_subtotal NUMERIC(12, 2) := 0;
    order_expires_at TIMESTAMPTZ := NOW() + INTERVAL '15 minutes';
BEGIN
    PERFORM pg_advisory_xact_lock(hashtextextended(target_order_id::TEXT,0));
    request_hash := encode(sha256(convert_to(jsonb_build_object('session',target_session_hash,'name',target_guest_name,'email',lower(target_guest_email),'phone',target_guest_phone,'user',target_user_id,'destination',target_shipping_snapshot,'items',public.canonical_checkout_items(target_items),'quote',target_shipping_quote_id)::TEXT,'UTF8')),'hex');
    SELECT * INTO prior_order FROM public.orders WHERE id=target_order_id;
    IF FOUND THEN
      IF prior_order.guest_access_token_hash IS DISTINCT FROM target_access_token_hash OR prior_order.checkout_request_hash IS DISTINCT FROM request_hash
        OR prior_order.status<>'PENDING' OR prior_order.payment_expires_at<=now() THEN RAISE EXCEPTION 'Checkout retry does not match the reserved order'; END IF;
      RETURN QUERY SELECT prior_order.id,prior_order.order_number,prior_order.subtotal,prior_order.shipping_amount,prior_order.total_amount,prior_order.payment_expires_at;
      RETURN;
    END IF;
    IF target_access_token_hash IS NULL
        OR target_access_token_hash !~ '^[a-f0-9]{64}$'
        OR target_items IS NULL
        OR jsonb_typeof(target_items) <> 'array'
        OR COALESCE(target_shipping_snapshot->>'country', '') !~ '^[A-Z]{2}$'
        OR COALESCE(target_shipping_snapshot->>'address_line_1', '') = ''
        OR COALESCE(target_shipping_snapshot->>'city', '') = ''
        OR COALESCE(target_shipping_snapshot->>'province', '') = '' THEN
        RAISE EXCEPTION 'Invalid guest checkout request';
    END IF;

    IF jsonb_array_length(target_items) NOT BETWEEN 1 AND 10 THEN
        RAISE EXCEPTION 'Guest checkout needs one to ten items';
    END IF;

    SELECT * INTO quote_record FROM public.checkout_shipping_quotes WHERE id=target_shipping_quote_id FOR UPDATE;
    IF NOT FOUND OR quote_record.session_hash IS DISTINCT FROM target_session_hash
      OR (quote_record.user_id IS NOT NULL AND quote_record.user_id IS DISTINCT FROM target_user_id)
      OR quote_record.destination_fingerprint IS DISTINCT FROM public.checkout_destination_fingerprint(target_shipping_snapshot)
      OR quote_record.items_snapshot IS DISTINCT FROM public.canonical_checkout_items(target_items)
      OR quote_record.service_code IS DISTINCT FROM target_shipping_method_code
      OR quote_record.consumed_order_id IS NOT NULL OR quote_record.expires_at<=now()
      OR quote_record.exchange_updated_at<=now()-interval '3 days' THEN
      RAISE EXCEPTION 'Shipping quote expired or does not match this checkout';
    END IF;
    shipping_record.id := quote_record.shipping_method_id;
    shipping_record.code := quote_record.service_code;
    shipping_record.name := quote_record.service_name;
    shipping_record.price := quote_record.amount_mzn;
    shipping_record.currency := 'MZN';
    shipping_record.estimated_min_days := quote_record.estimated_min_days;
    shipping_record.estimated_max_days := quote_record.estimated_max_days;

    INSERT INTO public.orders (
        id, user_id, order_number, status, currency,
        subtotal, shipping_amount, discount_amount, total_amount,
        payment_status, fulfillment_status,
        shipping_address_snapshot, billing_address_snapshot,
        shipping_method_id, shipping_method_snapshot,
        guest_name, guest_email, guest_phone, guest_access_token_hash,
        payment_expires_at
    ) VALUES (
        target_order_id, target_user_id, target_order_number, 'PENDING', 'MZN',
        0, shipping_record.price, 0, shipping_record.price,
        'UNPAID', 'UNFULFILLED',
        target_shipping_snapshot, '{}'::jsonb,
        shipping_record.id,
        jsonb_build_object(
            'quote_id',quote_record.id,'provider',quote_record.provider,'provider_amount',quote_record.provider_amount,'provider_currency',quote_record.provider_currency,'exchange_rate',quote_record.exchange_rate,
            'exchange_updated_at',quote_record.exchange_updated_at,'quote_expires_at',quote_record.expires_at,
            -- Internal account/collection references remain in the service-only
            -- quote, not in order JSON that customers are permitted to read.
            'parcel_basis',quote_record.parcel_basis,
            'code', shipping_record.code, 'name', shipping_record.name,
            'price', shipping_record.price, 'currency', shipping_record.currency,
            'estimated_min_days', shipping_record.estimated_min_days,
            'estimated_max_days', shipping_record.estimated_max_days
        ),
        target_guest_name, lower(target_guest_email), target_guest_phone,
        target_access_token_hash, order_expires_at
    );

    INSERT INTO public.order_events (order_id, event_type)
    VALUES (target_order_id, 'ORDER_CREATED');

    FOR item IN
        SELECT listing_id, size, quantity, expected_price
        FROM jsonb_to_recordset(target_items) AS requested(
            listing_id UUID, size TEXT, quantity INTEGER,
            expected_price NUMERIC(12, 2)
        )
        ORDER BY listing_id
    LOOP
        IF item.listing_id IS NULL OR item.quantity <> 1 THEN
            RAISE EXCEPTION 'Each live listing can only be purchased once';
        END IF;

        SELECT
            l.id, l.product_id, l.variant_id, l.seller_id,
            l.ownership_type, l.condition, l.asking_price,
            p.name AS product_name, p.brand_id, p.category_id,
            b.name AS brand_name, v.size AS variant_size
        INTO listing_record
        FROM public.listings AS l
        JOIN public.products AS p ON p.id = l.product_id AND p.active
        JOIN public.brands AS b ON b.id = p.brand_id AND b.active
        JOIN public.categories AS c ON c.id = p.category_id AND c.active
        JOIN public.product_variants AS v
          ON v.id = l.variant_id AND v.product_id = l.product_id
        WHERE l.id = item.listing_id
          AND l.status = 'LIVE'
          AND l.quantity = 1
          AND l.currency = 'MZN'
          AND l.authentication_status = 'PASSED'
          AND l.asking_price > 0
          AND l.asking_price = round(l.asking_price,2)
        FOR UPDATE OF l;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'A selected item is no longer available';
        END IF;

        IF listing_record.variant_size <> item.size THEN
            RAISE EXCEPTION 'A selected size is no longer available';
        END IF;

        IF item.expected_price IS NULL
            OR listing_record.asking_price <> item.expected_price THEN
            RAISE EXCEPTION 'Selected item price changed';
        END IF;

        item_commission := 0;
        item_seller_net := 0;
        rule_id := NULL;
        rule_snapshot := '{}'::jsonb;

        IF listing_record.ownership_type <> 'STREET_CULTURE' THEN
            SELECT rule.* INTO commission_record
            FROM public.commission_rules AS rule
            WHERE rule.active
              AND rule.currency = 'MZN'
              AND rule.seller_type IN (
                  'STANDARD',
                  COALESCE(
                      (SELECT profile.seller_type
                       FROM public.seller_profiles AS profile
                       WHERE profile.user_id = listing_record.seller_id),
                      'STANDARD'
                  )
              )
              AND (rule.brand_id IS NULL OR rule.brand_id = listing_record.brand_id)
              AND (rule.category_id IS NULL OR rule.category_id = listing_record.category_id)
              AND rule.starts_at <= NOW()
              AND (rule.ends_at IS NULL OR rule.ends_at > NOW())
            ORDER BY
                ((rule.brand_id IS NOT NULL)::INTEGER +
                (rule.category_id IS NOT NULL)::INTEGER) DESC,
                (rule.seller_type <> 'STANDARD') DESC,
                rule.priority DESC, rule.id
            LIMIT 1;

            IF NOT FOUND THEN
                RAISE EXCEPTION 'No active MZN commission rule for this listing';
            END IF;

            item_commission := LEAST(
                listing_record.asking_price,
                GREATEST(
                    commission_record.minimum_fee,
                    ROUND(
                        listing_record.asking_price * commission_record.percentage / 100
                        + commission_record.fixed_fee, 2
                    )
                )
            );
            item_seller_net := listing_record.asking_price - item_commission;
            rule_id := commission_record.id;
            rule_snapshot := jsonb_build_object(
                'percentage', commission_record.percentage,
                'fixed_fee', commission_record.fixed_fee,
                'minimum_fee', commission_record.minimum_fee,
                'currency', commission_record.currency,
                'seller_type', commission_record.seller_type
            );
        END IF;

        UPDATE public.listings
        SET status = 'RESERVED', reserved_at = NOW(),
            reservation_expires_at = order_expires_at,
            reserved_by_order_id = target_order_id, updated_at = NOW()
        WHERE id = listing_record.id AND status = 'LIVE';

        IF NOT FOUND THEN
            RAISE EXCEPTION 'A selected item was just reserved by another customer';
        END IF;

        INSERT INTO public.order_items (
            order_id, listing_id, seller_id, product_id, variant_id,
            product_name_snapshot, brand_name_snapshot, size_snapshot,
            condition_snapshot, unit_price, quantity,
            commission_amount, seller_net_amount, commission_rule_id,
            commission_snapshot
        ) VALUES (
            target_order_id, listing_record.id, listing_record.seller_id,
            listing_record.product_id, listing_record.variant_id,
            listing_record.product_name, listing_record.brand_name,
            listing_record.variant_size, listing_record.condition,
            listing_record.asking_price, 1,
            item_commission, item_seller_net, rule_id, rule_snapshot
        );

        INSERT INTO public.order_events (order_id, event_type, metadata)
        VALUES (
            target_order_id, 'LISTING_RESERVED',
            jsonb_build_object('listing_id', listing_record.id)
        );

        order_subtotal := order_subtotal + listing_record.asking_price;
    END LOOP;

    UPDATE public.orders
    SET subtotal = order_subtotal,
        total_amount = order_subtotal + shipping_record.price,
        updated_at = NOW()
    WHERE id = target_order_id;

    UPDATE public.orders SET checkout_quote_id=quote_record.id,checkout_request_hash=request_hash WHERE id=target_order_id;
    UPDATE public.checkout_shipping_quotes SET consumed_order_id=target_order_id,consumed_at=now() WHERE id=quote_record.id;
    RETURN QUERY
    SELECT target_order_id, target_order_number, order_subtotal,
        shipping_record.price, order_subtotal + shipping_record.price,
        order_expires_at;
END;
$$;

REVOKE ALL ON FUNCTION public.create_quoted_checkout_order(
    UUID, TEXT, TEXT, TEXT, TEXT, TEXT, JSONB, TEXT, JSONB, UUID, TEXT, UUID
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_quoted_checkout_order(
    UUID, TEXT, TEXT, TEXT, TEXT, TEXT, JSONB, TEXT, JSONB, UUID, TEXT, UUID
) TO service_role;


