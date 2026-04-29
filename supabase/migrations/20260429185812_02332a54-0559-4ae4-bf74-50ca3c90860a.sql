-- 1. Invoice status (draft/finalized)
DO $$ BEGIN
  CREATE TYPE public.invoice_status AS ENUM ('draft','finalized');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS status public.invoice_status NOT NULL DEFAULT 'finalized';

-- 2. Hashed driver PINs
ALTER TABLE public.drivers
  ADD COLUMN IF NOT EXISTS pin_hash text;

-- 3. Rate-limit table
CREATE TABLE IF NOT EXISTS public.driver_login_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_key text NOT NULL,
  attempted_at timestamptz NOT NULL DEFAULT now(),
  success boolean NOT NULL DEFAULT false
);
CREATE INDEX IF NOT EXISTS idx_dla_client_time ON public.driver_login_attempts (client_key, attempted_at DESC);
ALTER TABLE public.driver_login_attempts ENABLE ROW LEVEL SECURITY;

-- 4. driver_login with rate limit and hashed verification
CREATE OR REPLACE FUNCTION public.driver_login(_pin text, _system workspace_system, _client_key text DEFAULT 'unknown')
RETURNS TABLE(id uuid, name text, system workspace_system, user_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  recent_fail_count int;
  matched public.drivers;
  hashed text;
BEGIN
  SELECT count(*) INTO recent_fail_count
  FROM public.driver_login_attempts
  WHERE client_key = _client_key
    AND success = false
    AND attempted_at > now() - interval '5 minutes';

  IF recent_fail_count >= 8 THEN
    RAISE EXCEPTION 'Too many failed attempts. Please wait 5 minutes and try again.';
  END IF;

  hashed := encode(extensions.digest(_pin, 'sha256'), 'hex');

  SELECT * INTO matched
  FROM public.drivers d
  WHERE d.system = _system
    AND d.active = true
    AND ( d.pin_hash = hashed OR (d.pin_hash IS NULL AND d.login_pin = _pin) )
  LIMIT 1;

  IF matched.id IS NULL THEN
    INSERT INTO public.driver_login_attempts (client_key, success) VALUES (_client_key, false);
    RAISE EXCEPTION 'Invalid PIN for this workspace';
  END IF;

  IF matched.pin_hash IS NULL THEN
    UPDATE public.drivers SET pin_hash = hashed, login_pin = NULL WHERE id = matched.id;
  END IF;

  INSERT INTO public.driver_login_attempts (client_key, success) VALUES (_client_key, true);

  RETURN QUERY SELECT matched.id, matched.name, matched.system, matched.user_id;
END;
$$;

-- 5. driver_rides
CREATE OR REPLACE FUNCTION public.driver_rides(_driver_id uuid, _pin text)
RETURNS SETOF public.rides
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public, extensions
AS $$
  SELECT r.*
  FROM public.rides r
  JOIN public.drivers d ON d.id = r.driver_id
  WHERE d.id = _driver_id
    AND d.active = true
    AND (
      d.pin_hash = encode(extensions.digest(_pin, 'sha256'), 'hex')
      OR (d.pin_hash IS NULL AND d.login_pin = _pin)
    )
  ORDER BY r.ride_date ASC, r.pickup_time ASC;
$$;

-- 6. driver_update_ride_status
CREATE OR REPLACE FUNCTION public.driver_update_ride_status(_driver_id uuid, _pin text, _ride_id uuid, _status ride_status)
RETURNS public.rides
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  drv public.drivers;
  result public.rides;
  passenger_label text;
BEGIN
  SELECT * INTO drv FROM public.drivers
  WHERE id = _driver_id
    AND active = true
    AND (
      pin_hash = encode(extensions.digest(_pin, 'sha256'), 'hex')
      OR (pin_hash IS NULL AND login_pin = _pin)
    );
  IF drv IS NULL THEN RAISE EXCEPTION 'invalid driver credentials'; END IF;

  IF _status NOT IN ('arrived','completed','cancelled','no_show') THEN
    RAISE EXCEPTION 'invalid status for driver update';
  END IF;

  UPDATE public.rides
  SET status = _status, updated_at = now()
  WHERE id = _ride_id AND driver_id = _driver_id
  RETURNING * INTO result;

  IF result IS NULL THEN RAISE EXCEPTION 'ride not found or not assigned to this driver'; END IF;

  passenger_label := COALESCE(result.passenger_name, 'Passenger');

  INSERT INTO public.notifications (user_id, system, driver_id, ride_id, kind, title, body)
  VALUES (
    result.user_id, result.system, _driver_id, _ride_id,
    'driver_status',
    drv.name || ' marked ride as ' || replace(_status::text, '_', ' '),
    passenger_label || ' • ' || COALESCE(result.ride_date::text, '') || ' ' || COALESCE(result.pickup_time, '') ||
    ' • ' || COALESCE(result.pickup_location, '—') || ' → ' || COALESCE(result.dropoff_location, '—')
  );

  RETURN result;
END;
$$;

-- 7. Helper RPC: admin sets/changes a driver's PIN (hashed)
CREATE OR REPLACE FUNCTION public.set_driver_pin(_driver_id uuid, _pin text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  owner uuid;
BEGIN
  SELECT user_id INTO owner FROM public.drivers WHERE id = _driver_id;
  IF owner IS NULL THEN RAISE EXCEPTION 'driver not found'; END IF;
  IF owner <> auth.uid() THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF _pin IS NULL OR length(_pin) = 0 THEN
    UPDATE public.drivers SET pin_hash = NULL, login_pin = NULL WHERE id = _driver_id;
  ELSE
    IF length(_pin) < 4 THEN RAISE EXCEPTION 'PIN must be at least 4 digits'; END IF;
    UPDATE public.drivers
      SET pin_hash = encode(extensions.digest(_pin, 'sha256'), 'hex'),
          login_pin = NULL
      WHERE id = _driver_id;
  END IF;
END;
$$;