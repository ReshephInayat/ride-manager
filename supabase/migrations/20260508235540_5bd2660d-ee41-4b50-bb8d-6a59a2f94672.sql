CREATE OR REPLACE FUNCTION public.driver_payouts_by_pin(_driver_id uuid, _pin text)
RETURNS SETOF public.driver_payouts
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.drivers d
    WHERE d.id = _driver_id AND d.active = true
      AND d.pin_hash = encode(extensions.digest(_pin, 'sha256'), 'hex')
  ) THEN
    RAISE EXCEPTION 'invalid driver credentials';
  END IF;

  RETURN QUERY SELECT * FROM public.driver_payouts
  WHERE driver_id = _driver_id
  ORDER BY created_at DESC;
END;
$$;