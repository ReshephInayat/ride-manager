-- 1. Extend rides with detail fields
ALTER TABLE public.rides
  ADD COLUMN IF NOT EXISTS passenger_name text,
  ADD COLUMN IF NOT EXISTS flight_number text,
  ADD COLUMN IF NOT EXISTS phone text,
  ADD COLUMN IF NOT EXISTS notes text;

-- 2. Extend invoices with tax + public token
ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS subtotal numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS sales_tax_rate numeric NOT NULL DEFAULT 9.9,
  ADD COLUMN IF NOT EXISTS sales_tax_amount numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS public_token text;

-- backfill: subtotal = total / 1.099 for old invoices that didn't track tax separately
UPDATE public.invoices
SET subtotal = ROUND((total / 1.099)::numeric, 2),
    sales_tax_amount = ROUND((total - (total / 1.099))::numeric, 2)
WHERE subtotal = 0 AND total > 0;

-- backfill public tokens
UPDATE public.invoices
SET public_token = encode(gen_random_bytes(16), 'hex')
WHERE public_token IS NULL;

ALTER TABLE public.invoices
  ALTER COLUMN public_token SET DEFAULT encode(gen_random_bytes(16), 'hex');

CREATE UNIQUE INDEX IF NOT EXISTS invoices_public_token_idx ON public.invoices(public_token);

-- 3. Manual reminders per ride
CREATE TABLE IF NOT EXISTS public.ride_reminders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  ride_id uuid NOT NULL REFERENCES public.rides(id) ON DELETE CASCADE,
  remind_at timestamptz NOT NULL,
  message text,
  notified boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.ride_reminders ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "own reminders" ON public.ride_reminders;
CREATE POLICY "own reminders" ON public.ride_reminders
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX IF NOT EXISTS ride_reminders_due_idx ON public.ride_reminders(remind_at) WHERE notified = false;

-- 4. In-app notification inbox
CREATE TABLE IF NOT EXISTS public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  driver_id uuid REFERENCES public.drivers(id) ON DELETE SET NULL,
  ride_id uuid REFERENCES public.rides(id) ON DELETE CASCADE,
  kind text NOT NULL,
  title text NOT NULL,
  body text,
  read boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "own notifications" ON public.notifications;
CREATE POLICY "own notifications" ON public.notifications
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX IF NOT EXISTS notifications_unread_idx ON public.notifications(user_id, read, created_at DESC);

-- 5. Driver auto-notification log (so cron doesn't double-send)
CREATE TABLE IF NOT EXISTS public.driver_notification_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ride_id uuid NOT NULL REFERENCES public.rides(id) ON DELETE CASCADE,
  kind text NOT NULL,  -- 'day','hour','five_min'
  sent_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (ride_id, kind)
);
ALTER TABLE public.driver_notification_log ENABLE ROW LEVEL SECURITY;
-- Read-only via service role; users don't need direct access. Add a permissive read for owners:
DROP POLICY IF EXISTS "own log read" ON public.driver_notification_log;
CREATE POLICY "own log read" ON public.driver_notification_log
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.rides r WHERE r.id = ride_id AND r.user_id = auth.uid())
  );