
-- Car status enum
CREATE TYPE public.car_status AS ENUM ('active', 'inactive', 'in_service');

-- Maintenance type enum
CREATE TYPE public.maintenance_type AS ENUM ('oil_change', 'tire', 'brake', 'general', 'scheduled_service');

-- ============ CARS ============
CREATE TABLE public.cars (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  system workspace_system NOT NULL DEFAULT 'api',
  name text NOT NULL,
  make text,
  model text,
  year integer,
  license_plate text,
  vin text,
  color text,
  current_mileage integer NOT NULL DEFAULT 0,
  status car_status NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.cars ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own cars" ON public.cars FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER update_cars_updated_at BEFORE UPDATE ON public.cars FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============ CAR MAINTENANCE ============
CREATE TABLE public.car_maintenance (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  system workspace_system NOT NULL DEFAULT 'api',
  car_id uuid NOT NULL REFERENCES public.cars(id) ON DELETE CASCADE,
  type maintenance_type NOT NULL DEFAULT 'general',
  description text,
  mileage_at_service integer,
  cost numeric NOT NULL DEFAULT 0,
  service_date date NOT NULL DEFAULT CURRENT_DATE,
  next_service_mileage integer,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.car_maintenance ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own car_maintenance" ON public.car_maintenance FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ============ FUEL EXPENSES ============
CREATE TABLE public.fuel_expenses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  system workspace_system NOT NULL DEFAULT 'api',
  car_id uuid NOT NULL REFERENCES public.cars(id) ON DELETE CASCADE,
  driver_id uuid REFERENCES public.drivers(id) ON DELETE SET NULL,
  gallons numeric,
  cost numeric NOT NULL DEFAULT 0,
  mileage_at_fill integer,
  fuel_date date NOT NULL DEFAULT CURRENT_DATE,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.fuel_expenses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own fuel_expenses" ON public.fuel_expenses FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ============ CAR INSTALLMENTS ============
CREATE TABLE public.car_installments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  system workspace_system NOT NULL DEFAULT 'api',
  car_id uuid NOT NULL REFERENCES public.cars(id) ON DELETE CASCADE,
  amount numeric NOT NULL DEFAULT 0,
  due_date date NOT NULL,
  paid boolean NOT NULL DEFAULT false,
  paid_date date,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.car_installments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own car_installments" ON public.car_installments FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ============ CAR INSURANCE ============
CREATE TABLE public.car_insurance (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  system workspace_system NOT NULL DEFAULT 'api',
  car_id uuid NOT NULL REFERENCES public.cars(id) ON DELETE CASCADE,
  provider text NOT NULL,
  policy_number text,
  premium numeric NOT NULL DEFAULT 0,
  start_date date NOT NULL,
  end_date date,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.car_insurance ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own car_insurance" ON public.car_insurance FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ============ DRIVER PAYOUTS ============
CREATE TABLE public.driver_payouts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  system workspace_system NOT NULL DEFAULT 'api',
  driver_id uuid NOT NULL REFERENCES public.drivers(id) ON DELETE CASCADE,
  amount numeric NOT NULL DEFAULT 0,
  period_start date,
  period_end date,
  notes text,
  paid_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.driver_payouts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own driver_payouts" ON public.driver_payouts FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
