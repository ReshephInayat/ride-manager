-- Add unique constraint on ride_key to prevent duplicate rides
DROP INDEX IF EXISTS rides_ride_key_idx;
CREATE UNIQUE INDEX rides_ride_key_unique ON public.rides (ride_key);