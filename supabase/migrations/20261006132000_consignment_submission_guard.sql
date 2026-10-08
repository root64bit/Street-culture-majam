DROP POLICY "Sellers can create consignments" ON public.consignment_submissions;
CREATE POLICY "Seller creates reviewable MZN consignment" ON public.consignment_submissions
  FOR INSERT TO authenticated WITH CHECK (
    seller_id = auth.uid() AND status IN ('DRAFT','SUBMITTED') AND currency = 'MZN'
    AND product_id IS NULL AND internal_notes IS NULL
    AND approved_at IS NULL AND received_at IS NULL
  );
