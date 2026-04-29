-- Add a uniqueness signature column to rides to prevent duplicate imports
-- across multiple PDF uploads. Uses a normalized hash of the key ride fields.
ALTER TABLE public.rides
  ADD COLUMN IF NOT EXISTS dedupe_key text;

CREATE OR REPLACE FUNCTION public.rides_set_dedupe_key()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.dedupe_key := lower(
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
$$;

DROP TRIGGER IF EXISTS rides_dedupe_key_trg ON public.rides;
CREATE TRIGGER rides_dedupe_key_trg
BEFORE INSERT OR UPDATE ON public.rides
FOR EACH ROW EXECUTE FUNCTION public.rides_set_dedupe_key();

-- Backfill existing rows
UPDATE public.rides SET dedupe_key = dedupe_key WHERE true;
-- Force trigger to compute by touching them
UPDATE public.rides SET ride_date = ride_date;

-- Unique per user
CREATE UNIQUE INDEX IF NOT EXISTS rides_user_dedupe_uniq
  ON public.rides(user_id, dedupe_key);