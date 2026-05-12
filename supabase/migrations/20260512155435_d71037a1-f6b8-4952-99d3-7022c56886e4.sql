
-- Notes table for admin & driver portals
CREATE TABLE public.notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  system workspace_system NOT NULL DEFAULT 'api',
  category text NOT NULL CHECK (category IN ('admin','driver')),
  -- 'admin' = admin's personal note; 'driver' = note for/by a driver
  title text NOT NULL,
  body text,
  driver_id uuid, -- target driver (when category='driver') or author (when from driver portal)
  is_reminder boolean NOT NULL DEFAULT false,
  remind_at timestamptz,
  sms_sent boolean NOT NULL DEFAULT false,
  sms_sent_at timestamptz,
  is_question boolean NOT NULL DEFAULT false,
  answered boolean NOT NULL DEFAULT false,
  answer text,
  answered_at timestamptz,
  created_by text NOT NULL DEFAULT 'admin' CHECK (created_by IN ('admin','driver')),
  done boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_notes_user ON public.notes(user_id, system);
CREATE INDEX idx_notes_driver ON public.notes(driver_id);
CREATE INDEX idx_notes_remind ON public.notes(remind_at) WHERE is_reminder = true AND sms_sent = false;

ALTER TABLE public.notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own notes" ON public.notes FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER notes_updated_at BEFORE UPDATE ON public.notes
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Driver-side RPCs (token based)
CREATE OR REPLACE FUNCTION public.driver_notes_by_token(_token text)
RETURNS SETOF public.notes
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE drv public.drivers;
BEGIN
  drv := public.driver_validate_session(_token);
  RETURN QUERY SELECT * FROM public.notes
    WHERE driver_id = drv.id OR (category='driver' AND created_by='driver' AND driver_id=drv.id)
    ORDER BY created_at DESC;
END;
$$;

CREATE OR REPLACE FUNCTION public.driver_create_note_by_token(
  _token text, _title text, _body text, _is_question boolean DEFAULT false
) RETURNS public.notes
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  drv public.drivers;
  result public.notes;
BEGIN
  drv := public.driver_validate_session(_token);
  INSERT INTO public.notes (user_id, system, category, title, body, driver_id, is_question, created_by)
  VALUES (drv.user_id, drv.system, 'driver', _title, _body, drv.id, COALESCE(_is_question,false), 'driver')
  RETURNING * INTO result;
  RETURN result;
END;
$$;
