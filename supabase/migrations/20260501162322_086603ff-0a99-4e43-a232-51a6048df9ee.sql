
CREATE OR REPLACE FUNCTION public.driver_login(_pin text, _system workspace_system, _client_key text DEFAULT 'unknown'::text)
 RETURNS TABLE(id uuid, name text, system workspace_system, user_id uuid)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  recent_fail_count int;
  matched public.drivers;
  hashed text;
BEGIN
  SELECT count(*) INTO recent_fail_count
  FROM public.driver_login_attempts a
  WHERE a.client_key = _client_key AND a.success = false
    AND a.attempted_at > now() - interval '5 minutes';

  IF recent_fail_count >= 8 THEN
    RAISE EXCEPTION 'Too many failed attempts. Please wait 5 minutes and try again.';
  END IF;

  hashed := encode(extensions.digest(_pin, 'sha256'), 'hex');

  SELECT d.* INTO matched FROM public.drivers d
  WHERE d.system = _system AND d.active = true
    AND (d.pin_hash = hashed OR (d.pin_hash IS NULL AND d.login_pin = _pin))
  LIMIT 1;

  IF matched.id IS NULL THEN
    INSERT INTO public.driver_login_attempts (client_key, success) VALUES (_client_key, false);
    RAISE EXCEPTION 'Invalid PIN for this workspace';
  END IF;

  IF matched.pin_hash IS NULL THEN
    UPDATE public.drivers SET pin_hash = hashed, login_pin = NULL WHERE drivers.id = matched.id;
  END IF;

  INSERT INTO public.driver_login_attempts (client_key, success) VALUES (_client_key, true);

  PERFORM public.log_activity(matched.user_id, matched.system, 'driver', matched.name,
    'login', matched.name || ' signed in', NULL, NULL, matched.id);

  RETURN QUERY SELECT matched.id, matched.name, matched.system, matched.user_id;
END;
$function$;
