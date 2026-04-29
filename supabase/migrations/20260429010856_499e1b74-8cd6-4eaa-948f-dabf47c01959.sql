-- Drivers table
CREATE TABLE public.drivers (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  name TEXT NOT NULL,
  phone TEXT,
  email TEXT,
  notes TEXT,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.drivers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own drivers"
ON public.drivers FOR ALL
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- Add driver_id FK on rides
ALTER TABLE public.rides
  ADD COLUMN driver_id UUID REFERENCES public.drivers(id) ON DELETE SET NULL;

CREATE INDEX idx_rides_driver_id ON public.rides(driver_id);

-- Seed default driver "Drazon Bhatti" for existing users on signup, and one-time for current owner accounts
CREATE OR REPLACE FUNCTION public.seed_default_driver()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.drivers (user_id, name) VALUES (NEW.id, 'Drazon Bhatti');
  RETURN NEW;
END;
$$;

-- Seed for any user that already exists and has no drivers yet
INSERT INTO public.drivers (user_id, name)
SELECT u.id, 'Drazon Bhatti'
FROM auth.users u
WHERE NOT EXISTS (SELECT 1 FROM public.drivers d WHERE d.user_id = u.id);
