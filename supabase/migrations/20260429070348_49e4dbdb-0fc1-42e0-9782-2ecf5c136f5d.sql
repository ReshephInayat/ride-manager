-- Allow anonymous reads of invoices via public_token (the token IS the secret)
DROP POLICY IF EXISTS "public read by token" ON public.invoices;
CREATE POLICY "public read by token" ON public.invoices
  FOR SELECT
  TO anon, authenticated
  USING (public_token IS NOT NULL);

DROP POLICY IF EXISTS "public read items by invoice token" ON public.invoice_items;
CREATE POLICY "public read items by invoice token" ON public.invoice_items
  FOR SELECT
  TO anon, authenticated
  USING (
    EXISTS (SELECT 1 FROM public.invoices i WHERE i.id = invoice_items.invoice_id AND i.public_token IS NOT NULL)
  );