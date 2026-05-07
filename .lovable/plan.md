
# Full System Optimization Plan

This is a large scope covering security, scalability, features, and code quality. I'll implement in priority order across multiple phases.

---

## Phase 1 — Security Hardening (Immediate)

### 1A. Revoke anon EXECUTE on internal DB functions
- Database migration to `REVOKE EXECUTE ON FUNCTION ... FROM anon` for all internal functions except the 4 that need public access: `driver_login`, `driver_login_with_token`, `get_invoice_by_token`, `get_invoice_items_by_token`
- Functions to lock down: `set_driver_pin`, `log_activity`, `rides_log_changes`, `build_ride_key`, `normalize_ride_key_text`, `normalize_ride_key_time`, `rides_set_dedupe_key`, `seed_default_routes`, `seed_default_driver`, `driver_update_location`, `driver_clear_location`, `driver_rides`, `driver_update_ride_status`, `driver_mark_notifications_read`, `driver_delete_notifications`, `driver_notifications`, `notifications_log_insert`, `set_updated_at`, `log_invoice_access`

### 1B. Enable leaked password protection (HIBP)
- Use `configure_auth` tool to enable password HIBP check

### 1C. Add RLS policy on driver_login_attempts
- Add a deny-all policy so direct table access is blocked (only SECURITY DEFINER functions use it)

---

## Phase 2 — Scalability: Paginate Remaining Pages

### 2A. Payouts page — server-side pagination
- Create `getPaginatedPayouts` server function in `rides.functions.ts`
- Add pagination controls, date range filter

### 2B. Flights page — server-side pagination
- Create `getPaginatedFlights` server function (rides with flight_number)
- Add pagination controls

### 2C. Calendar page — server-side filtering
- Load only the currently displayed month's rides from server
- No full data load

### 2D. Activity logs — increase cap + pagination
- Server-side paginated query for logs (currently capped at 1,000)

---

## Phase 3 — Code Quality: Dashboard Refactor

- Split the 1,791-line `dashboard.tsx` into sub-components:
  - `DashboardFilters` — search, date, status, driver filters
  - `RidesTable` — table rendering + inline actions
  - `ImportDialog` — XLSX upload + preview
  - `InvoiceDialog` — invoice creation modal
  - `BulkActions` — select all, bulk delete/complete
  - `DashboardStats` — stat cards
- Main `dashboard.tsx` becomes a thin orchestrator (~300 lines)

---

## Phase 4 — CSV Export

- Add "Export CSV" button on dashboard, payouts, and invoices pages
- Server function to generate CSV from filtered rides/data
- Download as `.csv` file in browser

---

## Phase 5 — Google OAuth for Admin Login

- Enable Google OAuth via `configure_social_auth`
- Add "Sign in with Google" button on login page
- Works alongside existing email/password auth

---

## Phase 6 — Reporting Dashboard

- New route `/reports`
- Revenue over time chart (Recharts — already installed)
- Rides by status breakdown
- Driver performance (rides completed, avg per day)
- Monthly comparison
- Data fetched via server functions with date range filters

---

## Phase 7 — Additional Improvements

- **Migrate cars/payouts/flights to server functions** (currently using direct Supabase client)
- **Car maintenance alerts** — highlight cars near service mileage
- **Driver ride count on payouts** — show completed ride count per period
- **Dark/light mode polish** — replace any hardcoded colors with design tokens

---

## Technical Details

**Files modified:**
- `src/routes/dashboard.tsx` — refactored into sub-components
- `src/routes/payouts.tsx` — server-side pagination
- `src/routes/flights.tsx` — server-side pagination
- `src/routes/calendar.tsx` — month-only loading
- `src/routes/login.tsx` — Google OAuth button
- `src/server/rides.functions.ts` — new server functions for pagination + CSV

**Files created:**
- `src/components/dashboard/DashboardFilters.tsx`
- `src/components/dashboard/RidesTable.tsx`
- `src/components/dashboard/ImportDialog.tsx`
- `src/components/dashboard/InvoiceDialog.tsx`
- `src/components/dashboard/BulkActions.tsx`
- `src/components/dashboard/DashboardStats.tsx`
- `src/routes/reports.tsx`

**Database migrations:**
- Revoke anon EXECUTE on internal functions
- RLS policy for driver_login_attempts

**No breaking changes** — all existing workflows continue to work.

---

## Implementation Order

I'll implement phases sequentially, verifying each before moving on. This is substantial work across 7 phases. Shall I proceed?
