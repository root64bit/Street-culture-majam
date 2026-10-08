CREATE OR REPLACE FUNCTION public.attach_import_row_media()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE image_path TEXT; image_index INTEGER:=0;description TEXT;
BEGIN
  IF NEW.status='IMPORTED' AND OLD.status<>'IMPORTED' AND NEW.product_id IS NOT NULL AND jsonb_typeof(NEW.normalized_data->'mediaPaths')='array' THEN
    FOR image_path IN SELECT value #>> '{}' FROM jsonb_array_elements(NEW.normalized_data->'mediaPaths') LOOP
      IF length(image_path)>300 OR image_path LIKE '%..%' OR image_path LIKE '/%' OR image_path !~* '^[a-zA-Z0-9/_.-]+\.(png|jpg|jpeg|webp)$' THEN RAISE EXCEPTION 'Invalid staged image path'; END IF;
      description:=coalesce((SELECT item->>'altText' FROM jsonb_array_elements(coalesce(NEW.normalized_data->'mediaDetails','[]'::JSONB)) item WHERE item->>'path'=image_path LIMIT 1),NEW.normalized_data->>'name');
      INSERT INTO public.product_media(product_id,storage_path,media_type,sort_order,alt_text) VALUES(NEW.product_id,image_path,'IMAGE',image_index,left(description,300));image_index:=image_index+1;
    END LOOP;
  END IF;
  RETURN NEW;
END; $$;
