## Changes

### 1. Replace AI prompt in `supabase/functions/parse-rides-pdf/index.ts`
Replace the entire `const prompt = ...` block with the new detailed 6-section prompt that includes strict pickup vs dropoff decision tree, date carry-down rules, flight number extraction rules, and a self-check section.

### 2. Fix `normalizeRideKeyText` in `src/lib/rides.ts` (line 126-131)
Add `.replace(/\s*-\s*/g, "-")` before the whitespace normalize to collapse spaces around dashes for consistent dedup keys.

### 3. Fix `buildRideKey` in `src/lib/rides.ts` (lines 162-173)
Wrap `ride.pickup_from`, `ride.dropoff_to`, and `ride.flight_number` in `stripTrailingTime()` before normalizing, so embedded times don't cause false dedup mismatches.

### 4. Remove column swap hack in `src/routes/dashboard.tsx` (lines 1073-1090)
Swap the two table cells back to their correct order: pickup column shows `pickup_location` + `pickup_from`, dropoff column shows `dropoff_location` + `dropoff_to` + flight number + flight search button.
