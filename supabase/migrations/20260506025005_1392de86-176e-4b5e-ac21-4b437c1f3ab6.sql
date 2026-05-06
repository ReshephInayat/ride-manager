
-- 1. Create driver_sessions table for opaque session tokens
CREATE TABLE IF NOT EXISTS public.driver_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id uuid NOT NULL,
  token text NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(32), 'hex'),
  system workspace_system NOT NULL DEFAULT 'api',
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '8 hours')
);

ALTER TABLE public.driver_sessions ENABLE ROW LEVEL SECURITY;

-- Only the owning admin can see sessions (via driver's user_id)
CREATE POLICY "admin_sessions_read" ON public.driver_sessions
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.drivers d WHERE d.id = driver_sessions.driver_id AND d.user_id = auth.uid())
  );

-- 2. Drop deprecated login_pin column
ALTER TABLE public.drivers DROP COLUMN IF EXISTS login_pin;

-- 3. Login function that returns a session token
CREATE OR REPLACE FUNCTION public.driver_login_with_token(
  _pin text,
  _system workspace_system,
  _client_key text DEFAULT 'unknown'
)
RETURNS TABLE(session_token text, driver_id uuid, driver_name text, driver_system workspace_system)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = 'public', 'extensions'
AS $$
DECLARE
  per_client_fails int;
  global_fails int;
  matched public.drivers;
  hashed text;
  new_token text;
BEGIN
  -- Per-client rate limit
  SELECT count(*) INTO per_client_fails
  FROM public.driver_login_attempts a
  WHERE a.client_key = _client_key AND a.success = false
    AND a.attempted_at > now() - interval '5 minutes';
  IF per_client_fails >= 8 THEN
    RAISE EXCEPTION 'Too many failed attempts. Please wait 5 minutes.';
  END IF;

  -- Global rate limit
  SELECT count(*) INTO global_fails
  FROM public.driver_login_attempts a
  WHERE a.success = false AND a.attempted_at > now() - interval '15 minutes';
  IF global_fails >= 50 THEN
    RAISE EXCEPTION 'System temporarily locked. Please try again later.';
  END IF;

  hashed := encode(extensions.digest(_pin, 'sha256'), 'hex');

  SELECT d.* INTO matched FROM public.drivers d
  WHERE d.system = _system AND d.active = true AND d.pin_hash = hashed
  LIMIT 1;

  IF matched.id IS NULL THEN
    INSERT INTO public.driver_login_attempts (client_key, success) VALUES (_client_key, false);
    RAISE EXCEPTION 'Invalid PIN for this workspace';
  END IF;

  INSERT INTO public.driver_login_attempts (client_key, success) VALUES (_client_key, true);

  -- Clean expired sessions
  DELETE FROM public.driver_sessions WHERE expires_at < now();

  -- Create new session
  INSERT INTO public.driver_sessions (driver_id, system, expires_at)
  VALUES (matched.id, _system, now() + interval '8 hours')
  RETURNING driver_sessions.token INTO new_token;

  PERFORM public.log_activity(matched.user_id, matched.system, 'driver', matched.name,
    'login', matched.name || ' signed in', NULL, NULL, matched.id);

  RETURN QUERY SELECT new_token, matched.id, matched.name, matched.system;
END;
$$;

-- 4. Validate session helper
CREATE OR REPLACE FUNCTION public.driver_validate_session(_token text)
RETURNS public.drivers
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  sess public.driver_sessions;
  drv public.drivers;
BEGIN
  SELECT * INTO sess FROM public.driver_sessions
  WHERE driver_sessions.token = _token AND expires_at > now();
  IF sess.id IS NULL THEN
    RAISE EXCEPTION 'Invalid or expired session';
  END IF;
  SELECT * INTO drv FROM public.drivers WHERE id = sess.driver_id AND active = true;
  IF drv.id IS NULL THEN
    RAISE EXCEPTION 'Driver not found or inactive';
  END IF;
  RETURN drv;
END;
$$;

-- 5. Token-based driver_rides
CREATE OR REPLACE FUNCTION public.driver_rides_by_token(_token text)
RETURNS SETOF rides
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE drv public.drivers;
BEGIN
  drv := public.driver_validate_session(_token);
  RETURN QUERY SELECT r.* FROM public.rides r
  WHERE r.driver_id = drv.id
  ORDER BY r.ride_date ASC, r.pickup_time ASC;
END;
$$;

-- 6. Token-based status update
CREATE OR REPLACE FUNCTION public.driver_update_status_by_token(
  _token text, _ride_id uuid, _status ride_status
)
RETURNS rides
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  drv public.drivers;
  result public.rides;
  had_loc boolean;
BEGIN
  drv := public.driver_validate_session(_token);

  IF _status NOT IN ('started','arrived','completed','cancelled','no_show') THEN
    RAISE EXCEPTION 'invalid status for driver update';
  END IF;

  UPDATE public.rides
  SET status = _status, updated_at = now()
  WHERE id = _ride_id AND driver_id = drv.id
  RETURNING * INTO result;

  IF result IS NULL THEN RAISE EXCEPTION 'ride not found or not assigned'; END IF;

  IF _status IN ('completed','cancelled','no_show') THEN
    SELECT EXISTS (SELECT 1 FROM public.driver_locations WHERE driver_id = drv.id) INTO had_loc;
    DELETE FROM public.driver_locations WHERE driver_id = drv.id;
    IF had_loc THEN
      PERFORM public.log_activity(result.user_id, result.system, 'system', drv.name,
        'location_stopped', drv.name || ' location access ended',
        'Ride ' || replace(_status::text, '_', ' '), _ride_id, drv.id);
    END IF;
  END IF;

  PERFORM public.log_activity(result.user_id, result.system, 'driver', drv.name,
    'driver_status', drv.name || ' marked ride as ' || replace(_status::text, '_', ' '),
    COALESCE(result.pickup_location, '—') || ' → ' || COALESCE(result.dropoff_location, '—'),
    _ride_id, drv.id);

  INSERT INTO public.notifications (user_id, system, driver_id, ride_id, kind, title, body)
  VALUES (
    result.user_id, result.system, drv.id, _ride_id,
    'driver_status',
    drv.name || ' marked ride as ' || replace(_status::text, '_', ' '),
    'Passenger • ' || COALESCE(result.ride_date::text, '') || ' ' || COALESCE(result.pickup_time, '') ||
    ' • ' || COALESCE(result.pickup_location, '—') || ' → ' || COALESCE(result.dropoff_location, '—')
  );

  RETURN result;
END;
$$;

-- 7. Token-based location update with frequency limiting
CREATE OR REPLACE FUNCTION public.driver_update_location_by_token(
  _token text, _ride_id uuid,
  _lat double precision, _lng double precision,
  _accuracy double precision DEFAULT NULL,
  _heading double precision DEFAULT NULL,
  _speed double precision DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  drv public.drivers;
  was_sharing boolean;
  last_update timestamptz;
BEGIN
  drv := public.driver_validate_session(_token);

  -- GPS sanity checks
  IF _lat < -90 OR _lat > 90 OR _lng < -180 OR _lng > 180 THEN
    RAISE EXCEPTION 'invalid coordinates';
  END IF;
  IF _speed IS NOT NULL AND _speed > 150 THEN
    RAISE EXCEPTION 'unrealistic speed value';
  END IF;

  -- Frequency limit: reject updates within 3 seconds
  SELECT dl.updated_at INTO last_update FROM public.driver_locations dl WHERE dl.driver_id = drv.id;
  IF last_update IS NOT NULL AND (now() - last_update) < interval '3 seconds' THEN
    RETURN; -- silently skip, not an error
  END IF;

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

-- 8. Token-based notifications
CREATE OR REPLACE FUNCTION public.driver_notifications_by_token(_token text)
RETURNS SETOF notifications
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE drv public.drivers;
BEGIN
  drv := public.driver_validate_session(_token);
  RETURN QUERY SELECT * FROM public.notifications
  WHERE driver_id = drv.id ORDER BY created_at DESC LIMIT 50;
END;
$$;

-- 9. Token-based mark read
CREATE OR REPLACE FUNCTION public.driver_mark_read_by_token(_token text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE drv public.drivers;
BEGIN
  drv := public.driver_validate_session(_token);
  UPDATE public.notifications SET read = true WHERE driver_id = drv.id AND read = false;
END;
$$;

-- 10. Token-based delete notifications
CREATE OR REPLACE FUNCTION public.driver_delete_notifications_by_token(_token text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE drv public.drivers;
BEGIN
  drv := public.driver_validate_session(_token);
  DELETE FROM public.notifications WHERE driver_id = drv.id;
END;
$$;

-- 11. Token-based clear location
CREATE OR REPLACE FUNCTION public.driver_clear_location_by_token(_token text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  drv public.drivers;
  existed boolean;
BEGIN
  drv := public.driver_validate_session(_token);
  SELECT EXISTS (SELECT 1 FROM public.driver_locations WHERE driver_id = drv.id) INTO existed;
  DELETE FROM public.driver_locations WHERE driver_id = drv.id;
  IF existed THEN
    PERFORM public.log_activity(drv.user_id, drv.system, 'driver', drv.name,
      'location_stopped', drv.name || ' stopped sharing location', NULL, NULL, drv.id);
  END IF;
END;
$$;

-- 12. Revoke anon EXECUTE on new functions
REVOKE EXECUTE ON FUNCTION public.driver_validate_session(text) FROM anon;

-- 13. Invoice access logging
CREATE OR REPLACE FUNCTION public.log_invoice_access(_token text, _ip text DEFAULT 'unknown')
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE inv public.invoices;
BEGIN
  SELECT * INTO inv FROM public.invoices WHERE public_token = _token LIMIT 1;
  IF inv.id IS NOT NULL THEN
    INSERT INTO public.activity_logs (user_id, system, actor, actor_name, kind, title, details)
    VALUES (inv.user_id, inv.system, 'system', NULL, 'invoice_viewed',
      'Invoice ' || inv.invoice_number || ' viewed', 'IP: ' || _ip);
  END IF;
END;
$$;

-- Allow anon to call log_invoice_access (public page)
GRANT EXECUTE ON FUNCTION public.log_invoice_access(text, text) TO anon;

-- 14. Clean up old sessions periodically (index for cleanup queries)
CREATE INDEX IF NOT EXISTS idx_driver_sessions_expires ON public.driver_sessions (expires_at);
CREATE INDEX IF NOT EXISTS idx_driver_sessions_token ON public.driver_sessions (token);
