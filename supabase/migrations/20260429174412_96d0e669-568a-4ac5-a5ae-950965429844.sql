-- Add login_pin to drivers (4-6 digit code per driver) and helpful index
ALTER TABLE public.drivers ADD COLUMN IF NOT EXISTS login_pin TEXT;
CREATE INDEX IF NOT EXISTS drivers_pin_idx ON public.drivers (system, login_pin) WHERE login_pin IS NOT NULL;

-- Allow a driver who knows pin to read their assigned rides via a security-definer RPC (no direct table policy needed; we'll just keep using owner RLS on the admin's side, and the portal uses an RPC that checks pin).

-- RPC: validate pin and return driver record
CREATE OR REPLACE FUNCTION public.driver_login(_pin text, _system workspace_system)
RETURNS TABLE(id uuid, name text, system workspace_system, user_id uuid)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT d.id, d.name, d.system, d.user_id
  FROM public.drivers d
  WHERE d.login_pin = _pin
    AND d.system = _system
    AND d.active = true
  LIMIT 1;
$$;

-- RPC: list rides for a driver authenticated by pin (no need for auth.uid)
CREATE OR REPLACE FUNCTION public.driver_rides(_driver_id uuid, _pin text)
RETURNS SETOF public.rides
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT r.*
  FROM public.rides r
  JOIN public.drivers d ON d.id = r.driver_id
  WHERE d.id = _driver_id
    AND d.login_pin = _pin
    AND d.active = true
  ORDER BY r.ride_date ASC, r.pickup_time ASC;
$$;

-- RPC: driver updates ride status (allowed statuses only)
CREATE OR REPLACE FUNCTION public.driver_update_ride_status(_driver_id uuid, _pin text, _ride_id uuid, _status ride_status)
RETURNS public.rides
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  drv public.drivers;
  result public.rides;
BEGIN
  SELECT * INTO drv FROM public.drivers WHERE id = _driver_id AND login_pin = _pin AND active = true;
  IF drv IS NULL THEN RAISE EXCEPTION 'invalid driver credentials'; END IF;

  IF _status NOT IN ('arrived','completed','cancelled','no_show') THEN
    RAISE EXCEPTION 'invalid status for driver update';
  END IF;

  UPDATE public.rides
  SET status = _status, updated_at = now()
  WHERE id = _ride_id AND driver_id = _driver_id
  RETURNING * INTO result;

  IF result IS NULL THEN RAISE EXCEPTION 'ride not found or not assigned to this driver'; END IF;
  RETURN result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.driver_login(text, workspace_system) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.driver_rides(uuid, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.driver_update_ride_status(uuid, text, uuid, ride_status) TO anon, authenticated;