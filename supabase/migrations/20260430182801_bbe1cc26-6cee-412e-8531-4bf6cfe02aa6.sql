-- Allow duplicate rides within a PDF import while still letting the app
-- de-duplicate against rides already in the database.
ALTER TABLE public.rides
  DROP CONSTRAINT IF EXISTS rides_user_system_ride_key_unique;

-- ride_key column and its lookup index stay so the app can check
-- "does this ride_key already exist for this user+system?" before insert.
-- (rides_ride_key_idx already exists from a prior migration.)

-- Switch driver PIN storage back to plaintext so admins can view saved PINs.
-- The set_driver_pin function now stores the PIN in login_pin and clears the hash.
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
      SET login_pin = _pin,
          pin_hash = NULL
      WHERE id = _driver_id;
  END IF;
END;
$$;