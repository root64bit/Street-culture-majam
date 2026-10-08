ALTER TABLE public.authentication_records ADD COLUMN assigned_to UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN priority TEXT NOT NULL DEFAULT 'NORMAL' CHECK(priority IN ('LOW','NORMAL','HIGH','URGENT')),
  ADD COLUMN inspection_checklist JSONB NOT NULL DEFAULT '{}'::JSONB,
  ADD COLUMN style_review TEXT,ADD COLUMN comparison_notes TEXT;
CREATE INDEX authentication_queue_assignment_idx ON public.authentication_records(status,assigned_to,created_at);
CREATE TABLE public.authentication_evidence (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),record_id UUID NOT NULL REFERENCES public.authentication_records(id) ON DELETE CASCADE,
  storage_path TEXT NOT NULL UNIQUE,storage_object_id UUID NOT NULL REFERENCES storage.objects(id) ON DELETE RESTRICT,
  caption TEXT NOT NULL CHECK(length(caption) BETWEEN 1 AND 300),uploaded_by UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX authentication_evidence_record_idx ON public.authentication_evidence(record_id,created_at);
ALTER TABLE public.authentication_evidence ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.authentication_evidence TO authenticated;
CREATE POLICY "Reviewer evidence metadata read" ON public.authentication_evidence FOR SELECT TO authenticated USING(public.has_capability('authentication.review'));

CREATE FUNCTION public.save_authentication_inspection(target_record_id UUID,checklist JSONB,style_note TEXT,comparison_note TEXT,target_priority TEXT,claim_assignment BOOLEAN)
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE record_row public.authentication_records%ROWTYPE;entry RECORD;
BEGIN
  IF NOT public.has_capability('authentication.review') THEN RAISE EXCEPTION 'Reviewer permission required' USING ERRCODE='42501'; END IF;
  IF checklist IS NULL OR jsonb_typeof(checklist)<>'object' OR octet_length(checklist::TEXT)>10000 OR length(coalesce(style_note,''))>2000 OR length(coalesce(comparison_note,''))>3000 OR target_priority NOT IN ('LOW','NORMAL','HIGH','URGENT') THEN RAISE EXCEPTION 'Invalid inspection fields'; END IF;
  FOR entry IN SELECT * FROM jsonb_each(checklist) LOOP
    IF length(entry.key) NOT BETWEEN 1 AND 160 OR jsonb_typeof(entry.value)<>'boolean' THEN RAISE EXCEPTION 'Checklist must contain named boolean checks'; END IF;
  END LOOP;
  SELECT * INTO record_row FROM public.authentication_records WHERE id=target_record_id FOR UPDATE;
  IF NOT FOUND OR record_row.status NOT IN ('PENDING','IN_REVIEW','MORE_INFORMATION_REQUIRED') THEN RAISE EXCEPTION 'Inspection is closed'; END IF;
  IF claim_assignment AND record_row.assigned_to IS NOT NULL AND record_row.assigned_to<>auth.uid() AND NOT public.has_capability('consignments.review') THEN RAISE EXCEPTION 'Item is assigned to another reviewer'; END IF;
  UPDATE public.authentication_records SET inspection_checklist=checklist,style_review=nullif(btrim(style_note),''),comparison_notes=nullif(btrim(comparison_note),''),priority=target_priority,
    assigned_to=CASE WHEN claim_assignment THEN auth.uid() ELSE assigned_to END WHERE id=target_record_id;
  INSERT INTO public.admin_audit_logs(actor_id,action,entity_type,entity_id,metadata) VALUES(auth.uid(),'AUTHENTICATION_INSPECTION_SAVED','consignment',record_row.consignment_submission_id,jsonb_build_object('record_id',target_record_id,'priority',target_priority,'claimed',claim_assignment));
  RETURN TRUE;
END; $$;
REVOKE ALL ON FUNCTION public.save_authentication_inspection(UUID,JSONB,TEXT,TEXT,TEXT,BOOLEAN) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.save_authentication_inspection(UUID,JSONB,TEXT,TEXT,TEXT,BOOLEAN) TO authenticated;

CREATE FUNCTION public.attach_authentication_evidence(target_record_id UUID,object_path TEXT,evidence_caption TEXT)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE record_row public.authentication_records%ROWTYPE;object_id UUID;created_id UUID;
BEGIN
  IF NOT public.has_capability('authentication.review') THEN RAISE EXCEPTION 'Reviewer permission required' USING ERRCODE='42501'; END IF;
  SELECT * INTO record_row FROM public.authentication_records WHERE id=target_record_id FOR UPDATE;
  IF NOT FOUND OR record_row.status NOT IN ('PENDING','IN_REVIEW','MORE_INFORMATION_REQUIRED') OR length(btrim(coalesce(evidence_caption,''))) NOT BETWEEN 1 AND 300
    OR object_path NOT LIKE target_record_id::TEXT||'/'||auth.uid()::TEXT||'/%' THEN RAISE EXCEPTION 'Invalid evidence attachment'; END IF;
  SELECT id INTO object_id FROM storage.objects WHERE bucket_id='authentication-evidence' AND name=object_path;
  IF object_id IS NULL THEN RAISE EXCEPTION 'Upload the private evidence object first'; END IF;
  INSERT INTO public.authentication_evidence(record_id,storage_path,storage_object_id,caption,uploaded_by) VALUES(target_record_id,object_path,object_id,btrim(evidence_caption),auth.uid()) RETURNING id INTO created_id;
  INSERT INTO public.admin_audit_logs(actor_id,action,entity_type,entity_id,metadata) VALUES(auth.uid(),'AUTHENTICATION_EVIDENCE_ATTACHED','consignment',record_row.consignment_submission_id,jsonb_build_object('record_id',target_record_id,'evidence_id',created_id));
  RETURN created_id;
END; $$;
REVOKE ALL ON FUNCTION public.attach_authentication_evidence(UUID,TEXT,TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.attach_authentication_evidence(UUID,TEXT,TEXT) TO authenticated;

CREATE FUNCTION public.guard_authentication_checklist() RETURNS TRIGGER LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
  IF NEW.status='PASSED' AND OLD.status<>'PASSED' AND EXISTS(SELECT 1 FROM jsonb_each(NEW.inspection_checklist) WHERE value<>'true'::JSONB) THEN RAISE EXCEPTION 'Resolve every recorded inspection check before passing'; END IF;
  IF NEW.status='IN_REVIEW' AND OLD.status='PENDING' AND NEW.assigned_to IS NULL THEN NEW.assigned_to:=auth.uid(); END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER authentication_checklist_guard BEFORE UPDATE ON public.authentication_records FOR EACH ROW EXECUTE FUNCTION public.guard_authentication_checklist();
