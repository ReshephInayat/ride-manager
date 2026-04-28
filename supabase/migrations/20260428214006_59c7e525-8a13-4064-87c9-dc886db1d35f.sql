
-- Status enum for rides
CREATE TYPE public.ride_status AS ENUM ('pending', 'completed', 'cancelled', 'no_show');

-- Routes (fixed pricing)
CREATE TABLE public.routes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  pickup_location TEXT NOT NULL,
  dropoff_location TEXT NOT NULL,
  price NUMERIC(10,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Rides imported from PDF
CREATE TABLE public.rides (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  ride_date DATE NOT NULL,
  department TEXT,
  riders INTEGER NOT NULL DEFAULT 1,
  pickup_location TEXT,
  pickup_from TEXT,
  pickup_time TEXT,
  dropoff_location TEXT,
  dropoff_to TEXT,
  status public.ride_status NOT NULL DEFAULT 'pending',
  route_id UUID REFERENCES public.routes(id) ON DELETE SET NULL,
  amount NUMERIC(10,2) NOT NULL DEFAULT 0,
  source_file TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_rides_user_date ON public.rides(user_id, ride_date);

-- Invoices
CREATE TABLE public.invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  invoice_number TEXT NOT NULL,
  bill_to TEXT NOT NULL DEFAULT 'Horizon Air',
  period_start DATE,
  period_end DATE,
  total NUMERIC(10,2) NOT NULL DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.invoice_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id UUID NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
  ride_id UUID REFERENCES public.rides(id) ON DELETE SET NULL,
  description TEXT NOT NULL,
  amount NUMERIC(10,2) NOT NULL DEFAULT 0
);

-- Trigger to keep updated_at fresh
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;$$;

CREATE TRIGGER trg_rides_updated
BEFORE UPDATE ON public.rides
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- RLS
ALTER TABLE public.routes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rides ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoice_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own routes" ON public.routes FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "own rides" ON public.rides FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "own invoices" ON public.invoices FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "own invoice items" ON public.invoice_items FOR ALL
  USING (EXISTS (SELECT 1 FROM public.invoices i WHERE i.id = invoice_id AND i.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.invoices i WHERE i.id = invoice_id AND i.user_id = auth.uid()));

-- Seed default routes for new users via trigger on auth.users
CREATE OR REPLACE FUNCTION public.seed_default_routes()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.routes (user_id, name, pickup_location, dropoff_location, price) VALUES
    (NEW.id, 'Hotel \u2194 PAE', 'Delta Hotels Seattle Everett', 'PAE', 50),
    (NEW.id, 'GT BASE \u2194 SEA', 'GT BASE', 'SEA', 100),
    (NEW.id, 'Hotel \u2194 SEA', 'Delta Hotels Seattle Everett', 'SEA', 150);
  RETURN NEW;
END;$$;

CREATE TRIGGER on_auth_user_created_seed_routes
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.seed_default_routes();
