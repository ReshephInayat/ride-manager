
-- =========================================
-- 1. activity_logs table
-- =========================================
CREATE TABLE IF NOT EXISTS public.activity_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  system workspace_system NOT NULL DEFAULT 'api',
  actor text NOT NULL,            -- 'admin' | 'driver' | 'system'
  actor_name text,                -- driver name / admin email / 'system'
  kind text NOT NULL,             -- e.g. ride_created, ride_status, driver_assigned, location_started, location_stopped, notification, login
  title text NOT NULL,
  details text,
  ride_id uuid,
  driver_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS activity_logs_user_idx ON public.activity_logs(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS activity_logs_ride_idx ON public.activity_logs(ride_id);
CREATE INDEX IF NOT EXISTS activity_logs_driver_idx ON public.activity_logs(driver_id);
CREATE INDEX IF NOT EXISTS activity_logs_kind_idx ON public.activity_logs(kind);

ALTER TABLE public.activity_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "own activity logs read" ON public.activity_logs;
CREATE POLICY "own activity logs read"
  ON public.activity_logs FOR SELECT
  USING (auth.uid() = user_id);

-- Helper to write log entries from SECURITY DEFINER functions/triggers.
CREATE OR REPLACE FUNCTION public.log_activity(
  _user_id uuid,
  _system workspace_system,
  _actor text,
  _actor_name text,
  _kind text,
  _title text,
  _details text DEFAULT NULL,
  _ride_id uuid DEFAULT NULL,
  _driver_id uuid DEFAULT NULL
) RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  INSERT INTO public.activity_logs (user_id, system, actor, actor_name, kind, title, details, ride_id, driver_id)
  VALUES (_user_id, _system, _actor, _actor_name, _kind, _title, _details, _ride_id, _driver_id);
$$;

-- =========================================
-- 2. Trigger: rides changes -> activity log
-- =========================================
CREATE OR REPLACE FUNCTION public.rides_log_changes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  drv_name text;
  route_label text;
BEGIN
  route_label := COALESCE(NEW.pickup_location, '—') || ' → ' || COALESCE(NEW.dropoff_location, '—');

  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.activity_logs (user_id, system, actor, actor_name, kind, title, details, ride_id, driver_id)
    VALUES (NEW.user_id, NEW.system, 'admin', NULL, 'ride_created', 'Ride created',
            COALESCE(NEW.ride_date::text, '') || ' ' || COALESCE(NEW.pickup_time, '') || ' • ' || route_label,
            NEW.id, NEW.driver_id);
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF OLD.driver_id IS DISTINCT FROM NEW.driver_id AND NEW.driver_id IS NOT NULL THEN
      SELECT name INTO drv_name FROM public.drivers WHERE id = NEW.driver_id;
      INSERT INTO public.activity_logs (user_id, system, actor, actor_name, kind, title, details, ride_id, driver_id)
      VALUES (NEW.user_id, NEW.system, 'admin', NULL, 'driver_assigned',
              'Driver assigned: ' || COALESCE(drv_name, 'driver'),
              route_label, NEW.id, NEW.driver_id);
    END IF;

    IF OLD.status IS DISTINCT FROM NEW.status THEN
      INSERT INTO public.activity_logs (user_id, system, actor, actor_name, kind, title, details, ride_id, driver_id)
      VALUES (NEW.user_id, NEW.system, 'system', NULL, 'ride_status',
              'Status: ' || replace(NEW.status::text, '_', ' '),
              route_label, NEW.id, NEW.driver_id);
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS rides_log_changes_trg ON public.rides;
CREATE TRIGGER rides_log_changes_trg
AFTER INSERT OR UPDATE ON public.rides
FOR EACH ROW EXECUTE FUNCTION public.rides_log_changes();

-- =========================================
-- 3. Trigger: notifications -> activity log on insert
-- =========================================
CREATE OR REPLACE FUNCTION public.notifications_log_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.activity_logs (user_id, system, actor, actor_name, kind, title, details, ride_id, driver_id)
  VALUES (NEW.user_id, NEW.system, 'system', NULL, 'notification', NEW.title, NEW.body, NEW.ride_id, NEW.driver_id);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS notifications_log_trg ON public.notifications;
CREATE TRIGGER notifications_log_trg
AFTER INSERT ON public.notifications
FOR EACH ROW EXECUTE FUNCTION public.notifications_log_insert();

-- =========================================
-- 4. Update driver_update_location to log start
-- =========================================
CREATE OR REPLACE FUNCTION public.driver_update_location(
  _driver_id uuid, _pin text, _ride_id uuid,
  _lat double precision, _lng double precision,
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
  was_sharing boolean;
BEGIN
  SELECT * INTO drv FROM public.drivers
  WHERE id = _driver_id AND active = true
    AND (pin_hash = encode(extensions.digest(_pin, 'sha256'), 'hex')
         OR (pin_hash IS NULL AND login_pin = _pin));
  IF drv IS NULL THEN RAISE EXCEPTION 'invalid driver credentials'; END IF;

  SELECT EXISTS (SELECT 1 FROM public.driver_locations WHERE driver_id = drv.id) INTO was_sharing;

  INSERT INTO public.driver_locations (driver_id, user_id, system, ride_id, lat, lng, accuracy, heading, speed, updated_at)
  VALUES (drv.id, drv.user_id, drv.system, _ride_id, _lat, _lng, _accuracy, _heading, _speed, now())
  ON CONFLICT (driver_id) DO UPDATE
    SET ride_id = EXCLUDED.ride_id, lat = EXCLUDED.lat, lng = EXCLUDED.lng,
        accuracy = EXCLUDED.accuracy, heading = EXCLUDED.heading, speed = EXCLUDED.speed,
        updated_at = now();

  IF NOT was_sharing THEN
    PERFORM public.log_activity(drv.user_id, drv.system, 'driver', drv.name,
      'location_started', drv.name || ' started sharing live location',
      'Ride in progress', _ride_id, drv.id);
  END IF;
END;
$$;

-- =========================================
-- 5. Update driver_clear_location to log stop
-- =========================================
CREATE OR REPLACE FUNCTION public.driver_clear_location(_driver_id uuid, _pin text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  drv public.drivers;
  existed boolean;
BEGIN
  SELECT * INTO drv FROM public.drivers
  WHERE id = _driver_id AND active = true
    AND (pin_hash = encode(extensions.digest(_pin, 'sha256'), 'hex')
         OR (pin_hash IS NULL AND login_pin = _pin));
  IF drv IS NULL THEN RAISE EXCEPTION 'invalid driver credentials'; END IF;

  SELECT EXISTS (SELECT 1 FROM public.driver_locations WHERE driver_id = drv.id) INTO existed;

  DELETE FROM public.driver_locations WHERE driver_id = drv.id;

  IF existed THEN
    PERFORM public.log_activity(drv.user_id, drv.system, 'driver', drv.name,
      'location_stopped', drv.name || ' stopped sharing location',
      NULL, NULL, drv.id);
  END IF;
END;
$$;

-- =========================================
-- 6. Update driver_update_ride_status to log + clear location
-- =========================================
CREATE OR REPLACE FUNCTION public.driver_update_ride_status(
  _driver_id uuid, _pin text, _ride_id uuid, _status ride_status
) RETURNS rides
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  drv public.drivers;
  result public.rides;
  had_loc boolean;
BEGIN
  SELECT * INTO drv FROM public.drivers
  WHERE id = _driver_id AND active = true
    AND (pin_hash = encode(extensions.digest(_pin, 'sha256'), 'hex')
         OR (pin_hash IS NULL AND login_pin = _pin));
  IF drv IS NULL THEN RAISE EXCEPTION 'invalid driver credentials'; END IF;

  IF _status NOT IN ('started','arrived','completed','cancelled','no_show') THEN
    RAISE EXCEPTION 'invalid status for driver update';
  END IF;

  UPDATE public.rides
  SET status = _status, updated_at = now()
  WHERE id = _ride_id AND driver_id = _driver_id
  RETURNING * INTO result;

  IF result IS NULL THEN RAISE EXCEPTION 'ride not found or not assigned to this driver'; END IF;

  IF _status IN ('completed','cancelled','no_show') THEN
    SELECT EXISTS (SELECT 1 FROM public.driver_locations WHERE driver_id = _driver_id) INTO had_loc;
    DELETE FROM public.driver_locations WHERE driver_id = _driver_id;
    IF had_loc THEN
      PERFORM public.log_activity(result.user_id, result.system, 'system', drv.name,
        'location_stopped', drv.name || ' location access ended',
        'Ride ' || replace(_status::text, '_', ' '), _ride_id, _driver_id);
    END IF;
  END IF;

  PERFORM public.log_activity(result.user_id, result.system, 'driver', drv.name,
    'driver_status', drv.name || ' marked ride as ' || replace(_status::text, '_', ' '),
    COALESCE(result.pickup_location, '—') || ' → ' || COALESCE(result.dropoff_location, '—'),
    _ride_id, _driver_id);

  INSERT INTO public.notifications (user_id, system, driver_id, ride_id, kind, title, body)
  VALUES (
    result.user_id, result.system, _driver_id, _ride_id,
    'driver_status',
    drv.name || ' marked ride as ' || replace(_status::text, '_', ' '),
    'Passenger • ' || COALESCE(result.ride_date::text, '') || ' ' || COALESCE(result.pickup_time, '') ||
    ' • ' || COALESCE(result.pickup_location, '—') || ' → ' || COALESCE(result.dropoff_location, '—')
  );

  RETURN result;
END;
$$;

-- =========================================
-- 7. Update driver_login (the one with rate-limit) to log
-- =========================================
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
  WHERE client_key = _client_key AND success = false
    AND attempted_at > now() - interval '5 minutes';

  IF recent_fail_count >= 8 THEN
    RAISE EXCEPTION 'Too many failed attempts. Please wait 5 minutes and try again.';
  END IF;

  hashed := encode(extensions.digest(_pin, 'sha256'), 'hex');

  SELECT * INTO matched FROM public.drivers d
  WHERE d.system = _system AND d.active = true
    AND (d.pin_hash = hashed OR (d.pin_hash IS NULL AND d.login_pin = _pin))
  LIMIT 1;

  IF matched.id IS NULL THEN
    INSERT INTO public.driver_login_attempts (client_key, success) VALUES (_client_key, false);
    RAISE EXCEPTION 'Invalid PIN for this workspace';
  END IF;

  IF matched.pin_hash IS NULL THEN
    UPDATE public.drivers SET pin_hash = hashed, login_pin = NULL WHERE id = matched.id;
  END IF;

  INSERT INTO public.driver_login_attempts (client_key, success) VALUES (_client_key, true);

  PERFORM public.log_activity(matched.user_id, matched.system, 'driver', matched.name,
    'login', matched.name || ' signed in', NULL, NULL, matched.id);

  RETURN QUERY SELECT matched.id, matched.name, matched.system, matched.user_id;
END;
$$;

-- =========================================
-- 8. Notification delete RPC for drivers (replaces "mark read")
-- =========================================
CREATE OR REPLACE FUNCTION public.driver_delete_notifications(_driver_id uuid, _pin text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  drv public.drivers;
BEGIN
  SELECT * INTO drv FROM public.drivers
  WHERE id = _driver_id AND active = true
    AND (pin_hash = encode(extensions.digest(_pin, 'sha256'), 'hex')
         OR (pin_hash IS NULL AND login_pin = _pin));
  IF drv IS NULL THEN RAISE EXCEPTION 'invalid driver credentials'; END IF;

  DELETE FROM public.notifications WHERE driver_id = _driver_id;
END;
$$;
