-- Live driver location tracking
CREATE TABLE public.driver_locations (
  driver_id uuid PRIMARY KEY REFERENCES public.drivers(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  system workspace_system NOT NULL DEFAULT 'api',
  ride_id uuid,
  lat double precision NOT NULL,
  lng double precision NOT NULL,
  accuracy double precision,
  heading double precision,
  speed double precision,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.driver_locations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own driver locations"
ON public.driver_locations
FOR ALL
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

ALTER TABLE public.driver_locations REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.driver_locations;

-- Driver-callable upsert (verified by PIN)
CREATE OR REPLACE FUNCTION public.driver_update_location(
  _driver_id uuid,
  _pin text,
  _ride_id uuid,
  _lat double precision,
  _lng double precision,
  _accuracy double precision DEFAULT NULL,
  _heading double precision DEFAULT NULL,
  _speed double precision DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  drv public.drivers;
BEGIN
  SELECT * INTO drv FROM public.drivers
  WHERE id = _driver_id
    AND active = true
    AND (
      pin_hash = encode(extensions.digest(_pin, 'sha256'), 'hex')
      OR (pin_hash IS NULL AND login_pin = _pin)
    );
  IF drv IS NULL THEN RAISE EXCEPTION 'invalid driver credentials'; END IF;

  INSERT INTO public.driver_locations (driver_id, user_id, system, ride_id, lat, lng, accuracy, heading, speed, updated_at)
  VALUES (drv.id, drv.user_id, drv.system, _ride_id, _lat, _lng, _accuracy, _heading, _speed, now())
  ON CONFLICT (driver_id) DO UPDATE
    SET ride_id = EXCLUDED.ride_id,
        lat = EXCLUDED.lat,
        lng = EXCLUDED.lng,
        accuracy = EXCLUDED.accuracy,
        heading = EXCLUDED.heading,
        speed = EXCLUDED.speed,
        updated_at = now();
END;
$$;

-- Driver-callable clear (verified by PIN)
CREATE OR REPLACE FUNCTION public.driver_clear_location(
  _driver_id uuid,
  _pin text
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  drv public.drivers;
BEGIN
  SELECT * INTO drv FROM public.drivers
  WHERE id = _driver_id
    AND active = true
    AND (
      pin_hash = encode(extensions.digest(_pin, 'sha256'), 'hex')
      OR (pin_hash IS NULL AND login_pin = _pin)
    );
  IF drv IS NULL THEN RAISE EXCEPTION 'invalid driver credentials'; END IF;

  DELETE FROM public.driver_locations WHERE driver_id = drv.id;
END;
$$;