
-- ============================================
-- 1. HASH ALL REMAINING PLAINTEXT PINS
-- ============================================
UPDATE public.drivers
SET pin_hash = encode(extensions.digest(login_pin, 'sha256'), 'hex'),
    login_pin = NULL
WHERE login_pin IS NOT NULL AND pin_hash IS NULL;

UPDATE public.drivers SET login_pin = NULL WHERE login_pin IS NOT NULL;

-- ============================================
-- 2. FIX INVOICE RLS — DROP BROKEN POLICIES
-- ============================================
DROP POLICY IF EXISTS "public read by token" ON public.invoices;
DROP POLICY IF EXISTS "public read items by invoice token" ON public.invoice_items;

-- Create secure token-based access via RPC
CREATE OR REPLACE FUNCTION public.get_invoice_by_token(_token text)
RETURNS SETOF invoices
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT * FROM invoices WHERE public_token = _token LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.get_invoice_items_by_token(_token text)
RETURNS SETOF invoice_items
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT ii.* FROM invoice_items ii
  JOIN invoices i ON i.id = ii.invoice_id
  WHERE i.public_token = _token;
$$;

GRANT EXECUTE ON FUNCTION public.get_invoice_by_token(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_invoice_items_by_token(text) TO anon, authenticated;

-- ============================================
-- 3. DROP OLD driver_login OVERLOAD
-- ============================================
DROP FUNCTION IF EXISTS public.driver_login(text, workspace_system);

-- ============================================
-- 4. UPDATE driver_login — HASH ONLY + GLOBAL RATE LIMIT
-- ============================================
CREATE OR REPLACE FUNCTION public.driver_login(_pin text, _system workspace_system, _client_key text DEFAULT 'unknown'::text)
RETURNS TABLE(id uuid, name text, system workspace_system, user_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  per_client_fails int;
  global_fails int;
  matched public.drivers;
  hashed text;
BEGIN
  -- Per-client rate limit (8 fails in 5 min)
  SELECT count(*) INTO per_client_fails
  FROM public.driver_login_attempts a
  WHERE a.client_key = _client_key AND a.success = false
    AND a.attempted_at > now() - interval '5 minutes';
  IF per_client_fails >= 8 THEN
    RAISE EXCEPTION 'Too many failed attempts. Please wait 5 minutes and try again.';
  END IF;

  -- Global rate limit (50 fails in 15 min) — prevents client_key rotation bypass
  SELECT count(*) INTO global_fails
  FROM public.driver_login_attempts a
  WHERE a.success = false
    AND a.attempted_at > now() - interval '15 minutes';
  IF global_fails >= 50 THEN
    RAISE EXCEPTION 'System temporarily locked due to excessive failed attempts. Please try again later.';
  END IF;

  hashed := encode(extensions.digest(_pin, 'sha256'), 'hex');

  SELECT d.* INTO matched FROM public.drivers d
  WHERE d.system = _system AND d.active = true
    AND d.pin_hash = hashed
  LIMIT 1;

  IF matched.id IS NULL THEN
    INSERT INTO public.driver_login_attempts (client_key, success) VALUES (_client_key, false);
    RAISE EXCEPTION 'Invalid PIN for this workspace';
  END IF;

  INSERT INTO public.driver_login_attempts (client_key, success) VALUES (_client_key, true);

  PERFORM public.log_activity(matched.user_id, matched.system, 'driver', matched.name,
    'login', matched.name || ' signed in', NULL, NULL, matched.id);

  RETURN QUERY SELECT matched.id, matched.name, matched.system, matched.user_id;
END;
$function$;

-- ============================================
-- 5. UPDATE ALL DRIVER FUNCTIONS — HASH ONLY
-- ============================================

CREATE OR REPLACE FUNCTION public.driver_rides(_driver_id uuid, _pin text)
RETURNS SETOF rides
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
  SELECT r.*
  FROM public.rides r
  JOIN public.drivers d ON d.id = r.driver_id
  WHERE d.id = _driver_id
    AND d.active = true
    AND d.pin_hash = encode(extensions.digest(_pin, 'sha256'), 'hex')
  ORDER BY r.ride_date ASC, r.pickup_time ASC;
$function$;

CREATE OR REPLACE FUNCTION public.driver_update_ride_status(_driver_id uuid, _pin text, _ride_id uuid, _status ride_status)
RETURNS rides
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  drv public.drivers;
  result public.rides;
  had_loc boolean;
BEGIN
  SELECT * INTO drv FROM public.drivers
  WHERE id = _driver_id AND active = true
    AND pin_hash = encode(extensions.digest(_pin, 'sha256'), 'hex');
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
$function$;

CREATE OR REPLACE FUNCTION public.driver_update_location(_driver_id uuid, _pin text, _ride_id uuid, _lat double precision, _lng double precision, _accuracy double precision DEFAULT NULL::double precision, _heading double precision DEFAULT NULL::double precision, _speed double precision DEFAULT NULL::double precision)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  drv public.drivers;
  was_sharing boolean;
BEGIN
  SELECT * INTO drv FROM public.drivers
  WHERE id = _driver_id AND active = true
    AND pin_hash = encode(extensions.digest(_pin, 'sha256'), 'hex');
  IF drv IS NULL THEN RAISE EXCEPTION 'invalid driver credentials'; END IF;

  -- GPS sanity checks
  IF _lat < -90 OR _lat > 90 OR _lng < -180 OR _lng > 180 THEN
    RAISE EXCEPTION 'invalid coordinates';
  END IF;
  IF _speed IS NOT NULL AND _speed > 150 THEN
    RAISE EXCEPTION 'unrealistic speed value';
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
$function$;

CREATE OR REPLACE FUNCTION public.driver_clear_location(_driver_id uuid, _pin text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  drv public.drivers;
  existed boolean;
BEGIN
  SELECT * INTO drv FROM public.drivers
  WHERE id = _driver_id AND active = true
    AND pin_hash = encode(extensions.digest(_pin, 'sha256'), 'hex');
  IF drv IS NULL THEN RAISE EXCEPTION 'invalid driver credentials'; END IF;

  SELECT EXISTS (SELECT 1 FROM public.driver_locations WHERE driver_id = drv.id) INTO existed;
  DELETE FROM public.driver_locations WHERE driver_id = drv.id;

  IF existed THEN
    PERFORM public.log_activity(drv.user_id, drv.system, 'driver', drv.name,
      'location_stopped', drv.name || ' stopped sharing location',
      NULL, NULL, drv.id);
  END IF;
END;
$function$;

CREATE OR REPLACE FUNCTION public.driver_notifications(_driver_id uuid, _pin text)
RETURNS SETOF notifications
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.drivers d
    WHERE d.id = _driver_id AND d.active = true
      AND d.pin_hash = encode(extensions.digest(_pin, 'sha256'), 'hex')
  ) THEN
    RAISE EXCEPTION 'invalid driver credentials';
  END IF;

  RETURN QUERY
  SELECT * FROM public.notifications
  WHERE driver_id = _driver_id
  ORDER BY created_at DESC
  LIMIT 50;
END;
$function$;

CREATE OR REPLACE FUNCTION public.driver_mark_notifications_read(_driver_id uuid, _pin text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.drivers d
    WHERE d.id = _driver_id AND d.active = true
      AND d.pin_hash = encode(extensions.digest(_pin, 'sha256'), 'hex')
  ) THEN
    RAISE EXCEPTION 'invalid driver credentials';
  END IF;

  UPDATE public.notifications SET read = true
  WHERE driver_id = _driver_id AND read = false;
END;
$function$;

CREATE OR REPLACE FUNCTION public.driver_delete_notifications(_driver_id uuid, _pin text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  drv public.drivers;
BEGIN
  SELECT * INTO drv FROM public.drivers
  WHERE id = _driver_id AND active = true
    AND pin_hash = encode(extensions.digest(_pin, 'sha256'), 'hex');
  IF drv IS NULL THEN RAISE EXCEPTION 'invalid driver credentials'; END IF;

  DELETE FROM public.notifications WHERE driver_id = _driver_id;
END;
$function$;

-- ============================================
-- 6. UPDATE set_driver_pin — HASH IMMEDIATELY
-- ============================================
CREATE OR REPLACE FUNCTION public.set_driver_pin(_driver_id uuid, _pin text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
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
$function$;

-- ============================================
-- 7. REVOKE ANON EXECUTE ON INTERNAL FUNCTIONS
-- ============================================
REVOKE EXECUTE ON FUNCTION public.set_driver_pin(uuid, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.log_activity(uuid, workspace_system, text, text, text, text, text, uuid, uuid) FROM anon;
