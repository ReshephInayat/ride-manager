ALTER TABLE public.rides
  DROP CONSTRAINT IF EXISTS rides_ride_key_unique,
  DROP CONSTRAINT IF EXISTS rides_user_system_ride_key_unique,
  DROP CONSTRAINT IF EXISTS rides_user_system_ridekey_unique;

CREATE INDEX IF NOT EXISTS rides_user_system_ride_key_lookup_idx
  ON public.rides (user_id, system, ride_key);