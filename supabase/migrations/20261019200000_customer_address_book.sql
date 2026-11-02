-- Explicitly saved, owner-private delivery contacts. No historical address import.
CREATE TABLE public.customer_addresses (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
 label TEXT NOT NULL CHECK(length(btrim(label)) BETWEEN 1 AND 50),details JSONB NOT NULL,
 is_default BOOLEAN NOT NULL DEFAULT FALSE,revision INTEGER NOT NULL DEFAULT 1 CHECK(revision>0),
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(),updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 CHECK(jsonb_typeof(details)='object')
);
CREATE UNIQUE INDEX customer_one_default_address ON public.customer_addresses(user_id) WHERE is_default;
CREATE INDEX customer_address_owner ON public.customer_addresses(user_id,created_at);
ALTER TABLE public.customer_addresses ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.customer_addresses FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.customer_addresses TO authenticated;
GRANT ALL ON public.customer_addresses TO service_role;
CREATE POLICY "Customers read only their own saved addresses" ON public.customer_addresses
 FOR SELECT TO authenticated USING(user_id=(SELECT auth.uid()));

CREATE FUNCTION public.customer_address_operate(operation TEXT,payload JSONB) RETURNS JSONB
 LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE actor UUID:=auth.uid();target UUID;existing public.customer_addresses%ROWTYPE;data JSONB;nickname TEXT;make_default BOOLEAN;expected INTEGER;
BEGIN
 IF actor IS NULL OR NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=actor AND account_status='ACTIVE') THEN
  RAISE EXCEPTION 'Active account required' USING ERRCODE='42501';
 END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('address-book:'||actor,0));
 target:=(payload->>'id')::uuid;
 IF target IS NULL THEN RAISE EXCEPTION 'Address identifier required'; END IF;
 SELECT * INTO existing FROM public.customer_addresses WHERE id=target AND user_id=actor FOR UPDATE;
 expected:=(payload->>'revision')::integer;
 IF operation='SAVE' THEN
  data:=payload->'details';nickname:=btrim(payload->>'label');make_default:=coalesce((payload->>'is_default')::boolean,FALSE);
  IF jsonb_typeof(data) IS DISTINCT FROM 'object' OR length(coalesce(nickname,'')) NOT BETWEEN 1 AND 50
   OR EXISTS(SELECT 1 FROM unnest(ARRAY['name','email','phone','address_line_1','local_area','city','province','postal_code','country']) k WHERE jsonb_typeof(data->k) IS DISTINCT FROM 'string' OR length(btrim(coalesce(data->>k,''))) NOT BETWEEN 1 AND 254)
   OR coalesce(data->>'country','') !~ '^[A-Z]{2}$' OR coalesce(data->>'email','') !~ '^[^ @]+@[^ @]+\.[^ @]+$'
   OR coalesce(data->>'phone','') !~ '^\+?[0-9 ()-]{7,25}$' OR coalesce(data->>'address_type','') NOT IN ('residential','business')
   OR length(coalesce(data->>'address_line_2',''))>80 OR length(coalesce(data->>'delivery_notes',''))>500
   OR (data->>'country'='ZA' AND (data->>'province' NOT IN ('Eastern Cape','Free State','Gauteng','KwaZulu-Natal','Limpopo','Mpumalanga','North West','Northern Cape','Western Cape') OR data->>'postal_code' !~ '^[0-9]{4}$'))
   THEN RAISE EXCEPTION 'Complete valid delivery and contact details required'; END IF;
  -- Keep only supported fields. Never persist client-supplied owner/authority data.
  data:=jsonb_build_object('name',btrim(data->>'name'),'email',lower(btrim(data->>'email')),'phone',btrim(data->>'phone'),
   'address_line_1',btrim(data->>'address_line_1'),'address_line_2',coalesce(btrim(data->>'address_line_2'),''),
   'local_area',btrim(data->>'local_area'),'city',btrim(data->>'city'),'province',btrim(data->>'province'),
   'postal_code',btrim(data->>'postal_code'),'country',data->>'country','address_type',data->>'address_type','delivery_notes',coalesce(data->>'delivery_notes',''));
  IF existing.id IS NOT NULL THEN
   IF expected=0 AND existing.details=data AND existing.label=nickname AND existing.is_default=make_default THEN RETURN to_jsonb(existing); END IF;
   IF expected IS DISTINCT FROM existing.revision THEN RAISE EXCEPTION 'Address changed; refresh before saving' USING ERRCODE='40001'; END IF;
  ELSIF expected IS DISTINCT FROM 0 OR EXISTS(SELECT 1 FROM public.customer_addresses WHERE id=target) THEN
   RAISE EXCEPTION 'Address unavailable';
  ELSIF (SELECT count(*) FROM public.customer_addresses WHERE user_id=actor)>=10 THEN RAISE EXCEPTION 'Address book is full'; END IF;
  IF make_default THEN UPDATE public.customer_addresses SET is_default=FALSE,revision=revision+1,updated_at=now() WHERE user_id=actor AND is_default AND id<>target; END IF;
  INSERT INTO public.customer_addresses(id,user_id,label,details,is_default) VALUES(target,actor,nickname,data,make_default)
  ON CONFLICT(id) DO UPDATE SET label=excluded.label,details=excluded.details,is_default=excluded.is_default,revision=public.customer_addresses.revision+1,updated_at=now();
 ELSIF operation IN ('DEFAULT','DELETE') THEN
  IF existing.id IS NULL OR expected IS DISTINCT FROM existing.revision THEN RAISE EXCEPTION 'Address unavailable or changed'; END IF;
  IF operation='DELETE' THEN DELETE FROM public.customer_addresses WHERE id=target AND user_id=actor; RETURN jsonb_build_object('deleted',TRUE); END IF;
  UPDATE public.customer_addresses SET is_default=FALSE,revision=revision+1,updated_at=now() WHERE user_id=actor AND is_default AND id<>target;
  UPDATE public.customer_addresses SET is_default=TRUE,revision=revision+1,updated_at=now() WHERE id=target AND user_id=actor;
 ELSE RAISE EXCEPTION 'Unknown address operation'; END IF;
 RETURN (SELECT to_jsonb(a) FROM public.customer_addresses a WHERE id=target AND user_id=actor);
END; $$;
REVOKE ALL ON FUNCTION public.customer_address_operate(TEXT,JSONB) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.customer_address_operate(TEXT,JSONB) TO authenticated;
