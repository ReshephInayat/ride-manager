# Implementation Plan

## 1. Theme (Light/Dark) — default Light
- Audit `src/lib/theme.tsx`: keep but change default to `light` (ignore system preference unless user explicitly toggled).
- Audit `src/styles.css` to ensure `:root` has full light tokens and `.dark` overrides every token used in components.
- Replace hard-coded `text-white`, `bg-black`, `bg-white/5`, `text-white/40` etc. used across pages (dashboard, flights, driver, logs, payouts, cars, invoices) with semantic tokens (`text-foreground`, `bg-card`, `text-muted-foreground`, `border-border`).
- Add a visible toggle in `AppShell` header that flips `theme` and persists to localStorage (already wired — verify it works in both admin & driver shells).

## 2. Date filter component (shared)
Create `src/components/DateRangeFilter.tsx` with options:
`Today` (default) · `Yesterday` · `Tomorrow` · `This Week` · `Pick Week` · `This Month` · `Pick a Month` · `Between Dates` · `All`.
Returns `{from: string|null, to: string|null}` (YYYY-MM-DD). Used by Dashboard, Driver portal, Logs, Flights.

## 3. Dashboard load reduction
- `src/routes/dashboard.tsx`: default query filters `ride_date` to today. Re-query when filter changes.
- Keep granular realtime updates (already in place).

## 4. Exports (admin)
Create `src/lib/export.ts` with CSV helpers. Add an "Export" dropdown in Dashboard / relevant pages:
- Total rides, Completed rides, Completed totals + 10% commission + net (computed CSV)
- All imported rides
- Drivers, Routes, Cars, Payouts, Payout history
Each export pulls from Supabase (no row limit logic — paginate if >1000).

## 5. Driver portal (`src/routes/driver.tsx`)
- Default rides view = today; add same DateRangeFilter.
- New tabs/sections: **Completed rides** count + history list, **Payouts** (current pending + history).
- Export buttons: Ride history CSV, Payout history CSV.
- Use existing token RPCs; add new RPC `driver_payouts_by_token` if needed.

## 6. System logs (`src/routes/logs.tsx`)
- Default to today; add DateRangeFilter; export CSV button.

## 7. Flights — AviationStack integration
- Store API key as Supabase secret `AVIATIONSTACK_API_KEY` (request via add_secret since user pasted it in chat — security).
- Create edge function `flight-lookup` that proxies AviationStack `flights?flight_iata=XX123` (caches response 5 min in-memory).
- Update `src/components/FlightTrackLink.tsx` and `src/routes/flights.tsx` to call the function and render status, departure/arrival airports, scheduled/actual times, terminal/gate, delay — no external link required.
- Add a "Flight Details" dialog reusable by admin & driver portal.

## Technical notes
- Migrations needed: optional `driver_payouts_by_token` RPC.
- Secrets: `AVIATIONSTACK_API_KEY` (will prompt via add_secret).
- No schema changes to rides/drivers/etc.
- All new SQL via migration tool; data via insert tool.

Approve to proceed and I will run the migration + secret request, then implement in one pass.