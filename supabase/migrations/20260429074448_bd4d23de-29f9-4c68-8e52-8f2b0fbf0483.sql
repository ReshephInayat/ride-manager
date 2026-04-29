ALTER TABLE public.invoices ALTER COLUMN bill_to SET DEFAULT 'Puget Sound Limo Horizon Air API';
UPDATE public.invoices SET bill_to = 'Puget Sound Limo Horizon Air API' WHERE bill_to = 'Horizon Air';