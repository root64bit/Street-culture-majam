-- Run against local Supabase with psql; the enclosing transaction always rolls back.
BEGIN;
SELECT user_id AS actor_id FROM public.user_roles WHERE role='SUPER_ADMIN' LIMIT 1 \gset
SELECT set_config('request.jwt.claim.sub', :'actor_id', true);
SET LOCAL request.jwt.claim.role = 'authenticated';
SET LOCAL ROLE authenticated;
INSERT INTO public.product_import_batches(id,created_by,source_type,source_filename,file_sha256,mode,status,total_rows,valid_rows)
VALUES('30000000-0000-4000-8000-000000000001',auth.uid(),'EXCEL','integration.xlsx',repeat('a',64),'CREATE_ONLY','READY',1,1);
INSERT INTO public.product_import_rows(id,batch_id,row_number,status,normalized_data)
VALUES('30000000-0000-4000-8000-000000000002','30000000-0000-4000-8000-000000000001',2,'VALID',
  '{"reference":"INTEGRATION-BAG-001","name":"Integration test bag","slug":"integration-test-bag","brandId":"b0000000-0000-0000-0000-000000000001","categoryId":"c0000000-0000-0000-0000-000000000004","sellingPrice":12000,"currency":"MZN","condition":"NEW","ownershipType":"STREET_CULTURE","featured":false,"mostWanted":false,"variants":[{"size":"ONE_SIZE","sizeSystem":"STANDARD","quantity":1,"sku":"INTEGRATION-BAG-001-OS"}],"mediaPaths":[]}'::jsonb);
SELECT public.commit_product_import_row('30000000-0000-4000-8000-000000000002');
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.products p JOIN public.listings l ON l.product_id=p.id
    WHERE p.import_reference='INTEGRATION-BAG-001' AND p.active=FALSE
      AND l.status='DRAFT' AND l.quantity=1 AND l.authentication_status='PENDING'
  ) THEN RAISE EXCEPTION 'Imported group was not created as an unpublished one-of-one draft'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.product_import_rows WHERE id='30000000-0000-4000-8000-000000000002' AND status='IMPORTED')
    THEN RAISE EXCEPTION 'Row was not marked imported'; END IF;
END $$;
INSERT INTO public.product_import_rows(id,batch_id,row_number,status,normalized_data)
VALUES('30000000-0000-4000-8000-000000000003','30000000-0000-4000-8000-000000000001',3,'VALID',
  '{"reference":"INTEGRATION-BAG-BAD","name":"Integration invalid quantity","slug":"integration-invalid-quantity","brandId":"b0000000-0000-0000-0000-000000000001","categoryId":"c0000000-0000-0000-0000-000000000004","sellingPrice":12000,"currency":"MZN","condition":"NEW","ownershipType":"STREET_CULTURE","variants":[{"size":"ONE_SIZE","sizeSystem":"STANDARD","quantity":2}],"mediaPaths":[]}'::jsonb);
DO $$
BEGIN
  BEGIN
    PERFORM public.commit_product_import_row('30000000-0000-4000-8000-000000000003');
    RAISE EXCEPTION 'Quantity 2 should have been rejected';
  EXCEPTION WHEN SQLSTATE 'P0001' THEN
    IF SQLERRM = 'Quantity 2 should have been rejected' THEN RAISE; END IF;
  END;
  IF EXISTS (SELECT 1 FROM public.products WHERE import_reference='INTEGRATION-BAG-BAD') THEN
    RAISE EXCEPTION 'Failed group left a partial product';
  END IF;
END $$;
ROLLBACK;
