
## Issues and Solutions

### 1. Fix Swapped Pickup/Dropoff Headers in Preview Table

In `src/routes/dashboard.tsx` lines 1262-1263, the preview table headers say "Dropoff" then "Pickup" but render `pickup_location` then `dropoff_location` data. The headers are swapped — they need to be corrected to "Pickup" then "Dropoff".

**Files:** `src/routes/dashboard.tsx`

### 2. Strict Pickup/Dropoff Validation During PDF Parsing

Update the AI prompt in `supabase/functions/parse-rides-pdf/index.ts` to add explicit rules:
- Reinforce that `pickup_location` must be where the rider is picked up (origin)
- `dropoff_location` must be where the rider is dropped off (destination)
- Add a post-parse validation step in the client (`src/lib/rides.ts`) that cross-checks known patterns (e.g. if pickup_from contains a hotel name, pickup_location should not be an airport code unless context indicates otherwise)

### 3. Optimize Ride Import Speed

Currently, pages are parsed sequentially with a 250ms delay between each. To speed this up:
- Parse pages in parallel (batch of 3-4 concurrent requests instead of sequential)
- Remove or reduce the artificial 250ms delay between page parses
- This alone should cut import time significantly for multi-page PDFs

**Files:** `src/lib/rides.ts` — refactor `callParser` to use `Promise.all` with batched concurrency

### 4. Upgrade AI Bot to Perform Admin Actions

Currently the chat assistant is read-only. Upgrade it to execute admin actions using tool calling:

**Edge function changes (`supabase/functions/chat-assistant/index.ts`):**
- Add tool definitions for: update ride status, assign driver, create ride, create route, create driver, delete ride
- Use the AI model's tool-calling capability to let it decide when to execute actions
- Execute the tool calls using the service role client on behalf of the authenticated user
- Return confirmation messages after each action

**Tools to define:**
- `update_ride_status` — change a ride's status (params: ride_id, new_status)
- `assign_driver` — assign a driver to a ride (params: ride_id, driver_id or driver_name)
- `create_ride` — create a new ride (params: date, pickup, dropoff, etc.)
- `create_route` — add a new route (params: name, pickup_location, dropoff_location, price)
- `create_driver` — add a new driver (params: name, phone, email)
- `delete_ride` — remove a ride (params: ride_id)
- `update_ride` — edit ride details (params: ride_id + fields to update)

The AI will receive the user's data context (as it does now) plus these tools. When the user says "change ride X status to completed", the AI will call `update_ride_status` and confirm the action.

**Security:** All mutations are scoped to the authenticated user's ID and workspace system. The service role client performs the write but always filters by `user_id = authenticated_user.id`.

### Technical Details

- Preview header fix: swap lines 1262-1263 text
- PDF parsing: add "CRITICAL: pickup_location = origin/start, dropoff_location = destination/end" to the AI prompt
- Import optimization: use `Promise.allSettled` with concurrency limit of 3
- Chat assistant: add ~7 tool definitions and a tool-call execution loop in the edge function
