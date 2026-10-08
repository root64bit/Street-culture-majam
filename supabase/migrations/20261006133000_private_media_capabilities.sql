DROP POLICY "Private consignment submission reads" ON storage.objects;
CREATE POLICY "Consignment owner or reviewer media read" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'consignment-media' AND
    ((storage.foldername(name))[1] = auth.uid()::text OR public.has_capability('consignments.read')));
DROP POLICY "Authentication evidence reads" ON storage.objects;
CREATE POLICY "Authentication reviewer evidence read" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'authentication-evidence' AND public.has_capability('authentication.review'));
DROP POLICY "Authentication evidence uploads" ON storage.objects;
CREATE POLICY "Authentication reviewer evidence upload" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'authentication-evidence' AND public.has_capability('authentication.review'));
