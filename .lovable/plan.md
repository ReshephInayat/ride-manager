
# Feature Expansion Plan

## Overview
Add fleet management (cars, maintenance, fuel, insurance, installments), driver financials (ride counts, payouts, payout history), and a flight tracking page (placeholder for future API integration).

---

## Phase 1: Database Tables

### New tables:

1. **cars** — id, user_id, system, name, make, model, year, license_plate, vin, color, current_mileage, status (active/inactive/in_service), created_at, updated_at
2. **car_maintenance** — id, user_id, system, car_id, type (oil_change/tire/brake/general/scheduled_service), description, mileage_at_service, cost, service_date, next_service_mileage, created_at
3. **fuel_expenses** — id, user_id, system, car_id, driver_id (nullable), gallons, cost, mileage_at_fill, fuel_date, notes, created_at
4. **car_installments** — id, user_id, system, car_id, amount, due_date, paid, paid_date, notes, created_at
5. **car_insurance** — id, user_id, system, car_id, provider, policy_number, premium, start_date, end_date, notes, created_at
6. **driver_payouts** — id, user_id, system, driver_id, amount, period_start, period_end, notes, paid_at, created_at

All tables will have RLS policies restricting access to the owner (auth.uid() = user_id).

---

## Phase 2: New Pages

### Admin Pages:

1. **`/cars`** — Manage cars: add/edit/delete vehicles, view current mileage, status
2. **`/cars/$id`** — Car detail page with tabs: Maintenance, Fuel, Installments, Insurance histories
3. **`/payouts`** — Driver payout management: ride counts per driver, create payouts, view payout history
4. **`/flights`** — Flight tracking dashboard: list all flights from today's rides, placeholder for future API integration (show flight numbers, status placeholder, links to FlightAware)

### Driver Page Enhancement:
- Add a "Flights" tab/section to the driver portal showing today's flight numbers with tracking links

---

## Phase 3: Navigation Updates

Add to AppShell sidebar:
- **Fleet** group: Cars, Payouts
- **Tracking** group: Flights
- Update bottom tabs for mobile

---

## Phase 4: Flight Tracking (Placeholder)

Since you'll provide the flight API key later, I'll build:
- A page listing all unique flight numbers from rides (filterable by today/tomorrow/date range)
- Each flight shows: flight number, associated ride info, pickup time, and a "Track" link
- Placeholder for real-time status that will be wired to an API later
- Available on both admin and driver portals

---

## Technical Details

- 6 new database tables with RLS
- 5 new route files: `cars.tsx`, `cars.$id.tsx`, `payouts.tsx`, `flights.tsx`
- Updated `AppShell.tsx` navigation
- Updated `driver.tsx` with flights section
- All pages follow existing dark theme design patterns
