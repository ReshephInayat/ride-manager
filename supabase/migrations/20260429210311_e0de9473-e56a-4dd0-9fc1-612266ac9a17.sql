
-- Auto-create driver notifications when admin assigns/reassigns or changes ride status
CREATE OR REPLACE FUNCTION public.rides_notify_driver_changes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  passenger_label text;
  route_label text;
BEGIN
  passenger_label := COALESCE(NEW.passenger_name, 'Passenger');
  route_label := COALESCE(NEW.pickup_location, '—') || ' → ' || COALESCE(NEW.dropoff_location, '—');

  -- New assignment (or reassignment to a different driver)
  IF NEW.driver_id IS NOT NULL AND (TG_OP = 'INSERT' OR OLD.driver_id IS DISTINCT FROM NEW.driver_id) THEN
    INSERT INTO public.notifications (user_id, system, driver_id, ride_id, kind, title, body)
    VALUES (
      NEW.user_id, NEW.system, NEW.driver_id, NEW.id,
      'assignment',
      'New ride assigned',
      passenger_label || ' • ' || COALESCE(NEW.ride_date::text, '') || ' ' || COALESCE(NEW.pickup_time, '') || ' • ' || route_label
    );
  END IF;

  -- Status change on an assigned ride (only when driver_id stays the same to avoid double-firing)
  IF TG_OP = 'UPDATE'
     AND NEW.driver_id IS NOT NULL
     AND OLD.driver_id IS NOT DISTINCT FROM NEW.driver_id
     AND OLD.status IS DISTINCT FROM NEW.status THEN
    INSERT INTO public.notifications (user_id, system, driver_id, ride_id, kind, title, body)
    VALUES (
      NEW.user_id, NEW.system, NEW.driver_id, NEW.id,
      'status',
      'Ride status updated to ' || replace(NEW.status::text, '_', ' '),
      passenger_label || ' • ' || COALESCE(NEW.ride_date::text, '') || ' ' || COALESCE(NEW.pickup_time, '') || ' • ' || route_label
    );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS rides_notify_driver_changes_trg ON public.rides;
CREATE TRIGGER rides_notify_driver_changes_trg
AFTER INSERT OR UPDATE ON public.rides
FOR EACH ROW EXECUTE FUNCTION public.rides_notify_driver_changes();

-- RPC: list notifications for a driver (PIN-authenticated)
CREATE OR REPLACE FUNCTION public.driver_notifications(_driver_id uuid, _pin text)
RETURNS SETOF public.notifications
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.drivers d
    WHERE d.id = _driver_id AND d.active = true
      AND ( d.pin_hash = encode(extensions.digest(_pin, 'sha256'), 'hex')
            OR (d.pin_hash IS NULL AND d.login_pin = _pin) )
  ) THEN
    RAISE EXCEPTION 'invalid driver credentials';
  END IF;

  RETURN QUERY
  SELECT * FROM public.notifications
  WHERE driver_id = _driver_id
  ORDER BY created_at DESC
  LIMIT 50;
END;
$$;

-- RPC: mark all driver notifications as read
CREATE OR REPLACE FUNCTION public.driver_mark_notifications_read(_driver_id uuid, _pin text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.drivers d
    WHERE d.id = _driver_id AND d.active = true
      AND ( d.pin_hash = encode(extensions.digest(_pin, 'sha256'), 'hex')
            OR (d.pin_hash IS NULL AND d.login_pin = _pin) )
  ) THEN
    RAISE EXCEPTION 'invalid driver credentials';
  END IF;

  UPDATE public.notifications SET read = true
  WHERE driver_id = _driver_id AND read = false;
END;
$$;
