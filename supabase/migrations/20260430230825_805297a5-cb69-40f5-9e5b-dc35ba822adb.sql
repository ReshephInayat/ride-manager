CREATE OR REPLACE FUNCTION public.driver_update_ride_status(_driver_id uuid, _pin text, _ride_id uuid, _status ride_status)
 RETURNS rides
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
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

  IF _status NOT IN ('started','arrived','completed','cancelled','no_show') THEN
    RAISE EXCEPTION 'invalid status for driver update';
  END IF;

  UPDATE public.rides
  SET status = _status, updated_at = now()
  WHERE id = _ride_id AND driver_id = _driver_id
  RETURNING * INTO result;

  IF result IS NULL THEN RAISE EXCEPTION 'ride not found or not assigned to this driver'; END IF;

  -- Auto-clear live location when the ride is no longer in progress.
  IF _status IN ('completed','cancelled','no_show') THEN
    DELETE FROM public.driver_locations WHERE driver_id = _driver_id;
  END IF;

  passenger_label := 'Passenger';

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
$function$;