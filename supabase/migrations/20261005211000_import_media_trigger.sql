-- Media attachment executes inside commit_product_import_row's transaction.
-- Existing bucket objects must already exist; no remote URL is fetched here.
CREATE OR REPLACE FUNCTION public.attach_import_row_media()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE image_path TEXT; image_index INTEGER := 0;
BEGIN
  IF NEW.status = 'IMPORTED' AND OLD.status <> 'IMPORTED' AND NEW.product_id IS NOT NULL
     AND jsonb_typeof(NEW.normalized_data->'mediaPaths') = 'array' THEN
    FOR image_path IN SELECT value #>> '{}' FROM jsonb_array_elements(NEW.normalized_data->'mediaPaths') LOOP
      IF length(image_path) > 300 OR image_path LIKE '%..%' OR image_path LIKE '/%'
         OR image_path !~* '^[a-zA-Z0-9/_-]+\.(png|jpg|jpeg|webp)$' THEN
        RAISE EXCEPTION 'Invalid staged image path';
      END IF;
      INSERT INTO public.product_media(product_id,storage_path,media_type,sort_order,alt_text)
        VALUES(NEW.product_id,image_path,'IMAGE',image_index,NEW.normalized_data->>'name');
      image_index := image_index + 1;
    END LOOP;
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER product_import_rows_attach_media AFTER UPDATE OF status ON public.product_import_rows
  FOR EACH ROW EXECUTE FUNCTION public.attach_import_row_media();
