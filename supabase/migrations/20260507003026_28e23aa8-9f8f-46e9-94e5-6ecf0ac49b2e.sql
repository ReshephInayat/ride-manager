
-- Add archived column to rides
ALTER TABLE public.rides ADD COLUMN IF NOT EXISTS archived boolean NOT NULL DEFAULT false;

-- Composite indexes for common dashboard query patterns
CREATE INDEX IF NOT EXISTS idx_rides_system_date_time ON public.rides(user_id, system, ride_date DESC, pickup_time);
CREATE INDEX IF NOT EXISTS idx_rides_system_status ON public.rides(user_id, system, status);
CREATE INDEX IF NOT EXISTS idx_rides_system_driver_date ON public.rides(user_id, system, driver_id, ride_date);
CREATE INDEX IF NOT EXISTS idx_rides_archived ON public.rides(user_id, system, archived, ride_date DESC);

-- Text search index for passenger_name and flight_number
CREATE INDEX IF NOT EXISTS idx_rides_passenger_name ON public.rides USING gin (to_tsvector('simple', coalesce(passenger_name, '') || ' ' || coalesce(flight_number, '')));

-- pg_cron job to auto-archive old completed rides (daily at 2 AM)
CREATE EXTENSION IF NOT EXISTS pg_cron;

SELECT cron.schedule(
  'archive-old-rides',
  '0 2 * * *',
  $$
  UPDATE public.rides
  SET archived = true
  WHERE archived = false
    AND status IN ('completed', 'cancelled', 'no_show')
    AND ride_date < (CURRENT_DATE - INTERVAL '90 days');
  $$
);
