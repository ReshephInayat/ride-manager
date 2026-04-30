-- Add a strict normalized ride key for duplicate-proof imports.
ALTER TABLE public.rides
  ADD COLUMN IF NOT EXISTS ride_key text;

-- Temporarily remove older duplicate protection so existing rows can be re-keyed and cleaned safely.
ALTER TABLE public.rides
  DROP CONSTRAINT IF EXISTS rides_user_dedupe_unique;
DROP INDEX IF EXISTS public.rides_user_dedupe_uniq;
DROP INDEX IF EXISTS public.rides_user_system_ride_key_uniq;

-- Normalize text by trimming, lowercasing, and collapsing repeated whitespace.
CREATE OR REPLACE FUNCTION public.normalize_ride_key_text(_value text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT regexp_replace(lower(trim(coalesce(_value, ''))), '\s+', ' ', 'g');
$$;

-- Normalize free-form pickup time text to HH:MI when possible.
CREATE OR REPLACE FUNCTION public.normalize_ride_key_time(_value text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  cleaned text;
  match text[];
  hour_int int;
  minute_text text;
  meridiem text;
BEGIN
  cleaned := public.normalize_ride_key_text(_value);
  IF cleaned = '' THEN
    RETURN '';
  END IF;

  match := regexp_match(cleaned, '([0-9]{1,2}):([0-9]{2})\s*(am|pm)?');
  IF match IS NULL THEN
    RETURN cleaned;
  END IF;

  hour_int := match[1]::int;
  minute_text := match[2];
  meridiem := match[3];

  IF meridiem = 'pm' AND hour_int < 12 THEN
    hour_int := hour_int + 12;
  ELSIF meridiem = 'am' AND hour_int = 12 THEN
    hour_int := 0;
  END IF;

  RETURN lpad((hour_int % 24)::text, 2, '0') || ':' || minute_text;
END;
$$;

-- Build a strict ride key from normalized date, time, pickup/dropoff, and passenger info.
CREATE OR REPLACE FUNCTION public.build_ride_key(
  _ride_date date,
  _pickup_time text,
  _pickup_location text,
  _pickup_from text,
  _dropoff_location text,
  _dropoff_to text,
  _passenger_name text,
  _passenger_email text,
  _phone text,
  _flight_number text
)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT concat_ws('|',
    coalesce(_ride_date::text, ''),
    public.normalize_ride_key_time(_pickup_time),
    public.normalize_ride_key_text(_pickup_location),
    public.normalize_ride_key_text(_pickup_from),
    public.normalize_ride_key_text(_dropoff_location),
    public.normalize_ride_key_text(_dropoff_to),
    public.normalize_ride_key_text(_passenger_name),
    public.normalize_ride_key_text(_passenger_email),
    public.normalize_ride_key_text(_phone),
    public.normalize_ride_key_text(_flight_number)
  );
$$;

-- Keep ride_key and the older dedupe_key in sync on every insert/update.
CREATE OR REPLACE FUNCTION public.rides_set_dedupe_key()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.ride_key := public.build_ride_key(
    NEW.ride_date,
    NEW.pickup_time,
    NEW.pickup_location,
    NEW.pickup_from,
    NEW.dropoff_location,
    NEW.dropoff_to,
    NEW.passenger_name,
    NEW.passenger_email,
    NEW.phone,
    NEW.flight_number
  );

  NEW.dedupe_key := NEW.ride_key;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS rides_dedupe_key_trg ON public.rides;
CREATE TRIGGER rides_dedupe_key_trg
BEFORE INSERT OR UPDATE ON public.rides
FOR EACH ROW EXECUTE FUNCTION public.rides_set_dedupe_key();

-- Backfill keys on all existing rides without firing duplicate constraints.
UPDATE public.rides
SET ride_key = public.build_ride_key(
    ride_date,
    pickup_time,
    pickup_location,
    pickup_from,
    dropoff_location,
    dropoff_to,
    passenger_name,
    passenger_email,
    phone,
    flight_number
  ),
  dedupe_key = public.build_ride_key(
    ride_date,
    pickup_time,
    pickup_location,
    pickup_from,
    dropoff_location,
    dropoff_to,
    passenger_name,
    passenger_email,
    phone,
    flight_number
  );

-- Remove existing duplicates so the strict uniqueness rule can be added safely.
-- Keeps assigned/billable/progressed rides first, then the oldest ride.
WITH ranked AS (
  SELECT
    id,
    row_number() OVER (
      PARTITION BY user_id, system, ride_key
      ORDER BY
        CASE status
          WHEN 'completed' THEN 5
          WHEN 'no_show' THEN 4
          WHEN 'arrived' THEN 3
          WHEN 'pending' THEN 2
          ELSE 1
        END DESC,
        CASE WHEN driver_id IS NOT NULL THEN 1 ELSE 0 END DESC,
        created_at ASC,
        id ASC
    ) AS duplicate_rank
  FROM public.rides
  WHERE ride_key IS NOT NULL AND ride_key <> ''
)
DELETE FROM public.rides r
USING ranked d
WHERE r.id = d.id
  AND d.duplicate_rank > 1;

ALTER TABLE public.rides
  ALTER COLUMN ride_key SET NOT NULL;

ALTER TABLE public.rides
  ADD CONSTRAINT rides_user_system_ride_key_unique UNIQUE (user_id, system, ride_key);

CREATE INDEX IF NOT EXISTS rides_ride_key_idx ON public.rides(ride_key);