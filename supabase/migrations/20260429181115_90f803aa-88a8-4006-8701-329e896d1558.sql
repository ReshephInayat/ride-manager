-- Update driver_update_ride_status to also create an admin notification
CREATE OR REPLACE FUNCTION public.driver_update_ride_status(_driver_id uuid, _pin text, _ride_id uuid, _status ride_status)
 RETURNS rides
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  drv public.drivers;
  result public.rides;
  passenger_label text;
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

  passenger_label := COALESCE(result.passenger_name, 'Passenger');

  INSERT INTO public.notifications (user_id, system, driver_id, ride_id, kind, title, body)
  VALUES (
    result.user_id,
    result.system,
    _driver_id,
    _ride_id,
    'driver_status',
    drv.name || ' marked ride as ' || replace(_status::text, '_', ' '),
    passenger_label || ' • ' || COALESCE(result.ride_date::text, '') || ' ' || COALESCE(result.pickup_time, '') ||
    ' • ' || COALESCE(result.pickup_location, '—') || ' → ' || COALESCE(result.dropoff_location, '—')
  );

  RETURN result;
END;
$function$;