
## Problem

1. **Inconsistent ride counts** — each upload produces different numbers because the deterministic parser is fragile (Y_TOLERANCE grouping, header detection) and when it fails, the AI fallback is non-deterministic.
2. **No unique ride identifier** from parsing — rides can't be tracked or deduplicated reliably.
3. **Pickup/dropoff may still be flipped** in the data from earlier imports, showing wrong info to drivers.

## Plan

### 1. Stabilize the deterministic parser (`src/lib/rides.ts`)

- **Increase Y_TOLERANCE** from 4 to 6 to prevent borderline row splitting.
- **Improve header detection** — match partial/fuzzy text ("pick up", "drop off", "date") instead of requiring exact single words ("location", "from", "to"). Also try the parent header row that has "PICK UP" and "DROP OFF" spans.
- **Add hardcoded fallback column ratios** — if header detection fails entirely, use the known Horizon Air column proportions (based on page width) so parsing never silently returns 0 rows.
- **Remove the 50% validity threshold** that causes random switching between deterministic and AI paths. Instead, always prefer deterministic results if any rows were found.

### 2. Add unique ride ID generation during parsing

- Generate a `dedupe_key` for each parsed ride as a hash of: `ride_date + pickup_time + pickup_from + dropoff_to + riders`.
- After parsing all pages, deduplicate rides by this key (removes duplicates from page boundary overlaps).
- Show the dedupe key in the import preview so the admin can verify uniqueness.

### 3. Make AI fallback deterministic (`supabase/functions/parse-rides-pdf/index.ts`)

- Add `temperature: 0` to the AI gateway request body so the same input always produces the same output.

### 4. Fix pickup/dropoff display for drivers (`src/routes/driver.tsx`)

- The driver card already correctly maps `pickup_location`/`pickup_from` to the Pickup box and `dropoff_location`/`dropoff_to` to the Dropoff box (lines 490-501). The flip issue comes from **bad data in the database** from earlier flawed imports.
- Add a data repair step: after the parser is fixed, provide a one-click "Re-parse and fix" option in the admin dashboard for rides imported from a specific PDF file, which will re-parse and update the pickup/dropoff fields on existing rides (matching by date + time).

### 5. Add parse result logging in the UI

- Show a toast after parsing indicating: method used (deterministic vs AI), number of rides found, and number of duplicates removed. This makes inconsistencies immediately visible.

## Files to modify

| File | Change |
|------|--------|
| `src/lib/rides.ts` | Stabilize Y_TOLERANCE, header detection, add deduplication, unique IDs |
| `supabase/functions/parse-rides-pdf/index.ts` | Add `temperature: 0` to AI call |
| `src/routes/dashboard.tsx` | Show parse method + dedup count in toast, add dedupe_key to preview |
