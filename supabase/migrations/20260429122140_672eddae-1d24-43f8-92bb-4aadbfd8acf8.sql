-- Add system tag to all per-user data so we can run two workspaces (api / llc)
DO $$ BEGIN
  CREATE TYPE public.workspace_system AS ENUM ('api', 'llc');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE public.rides       ADD COLUMN IF NOT EXISTS system public.workspace_system NOT NULL DEFAULT 'api';
ALTER TABLE public.routes      ADD COLUMN IF NOT EXISTS system public.workspace_system NOT NULL DEFAULT 'api';
ALTER TABLE public.drivers     ADD COLUMN IF NOT EXISTS system public.workspace_system NOT NULL DEFAULT 'api';
ALTER TABLE public.invoices    ADD COLUMN IF NOT EXISTS system public.workspace_system NOT NULL DEFAULT 'api';
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS system public.workspace_system NOT NULL DEFAULT 'api';
ALTER TABLE public.ride_reminders ADD COLUMN IF NOT EXISTS system public.workspace_system NOT NULL DEFAULT 'api';

ALTER TABLE public.rides       ADD COLUMN IF NOT EXISTS passenger_email text;

CREATE INDEX IF NOT EXISTS idx_rides_system    ON public.rides(user_id, system);
CREATE INDEX IF NOT EXISTS idx_routes_system   ON public.routes(user_id, system);
CREATE INDEX IF NOT EXISTS idx_drivers_system  ON public.drivers(user_id, system);
CREATE INDEX IF NOT EXISTS idx_invoices_system ON public.invoices(user_id, system);

-- Update dedupe key to include system so the same PDF row in different systems is not collapsed
CREATE OR REPLACE FUNCTION public.rides_set_dedupe_key()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  NEW.dedupe_key := lower(
    coalesce(NEW.system::text,'api') || '|' ||
    coalesce(NEW.ride_date::text,'') || '|' ||
    coalesce(NEW.pickup_time,'') || '|' ||
    coalesce(NEW.pickup_from,'') || '|' ||
    coalesce(NEW.pickup_location,'') || '|' ||
    coalesce(NEW.dropoff_to,'') || '|' ||
    coalesce(NEW.dropoff_location,'') || '|' ||
    coalesce(NEW.department,'')
  );
  RETURN NEW;
END;
$function$;