# Real-time driver tracking

Yes — we can add live driver location tracking. The driver's phone shares its GPS while a ride is active, and admins see a live moving pin on a map (and updated coordinates/last-seen time) in the dashboard.

## How it works

1. **Driver portal**: when a ride is in progress (status `arrived`), the driver's browser uses the browser Geolocation API to send their GPS coordinates every ~10 seconds. They see a clear "Sharing live location" indicator and can stop it at any time. Stops automatically when the ride is marked `completed`, `cancelled`, or `no_show`, or when they sign out / close the tab.
2. **Database**: a new `driver_locations` table stores the latest known position per driver (lat, lng, accuracy, heading, speed, updated_at). Realtime is enabled on it.
3. **Admin dashboard**:
   - Each ride row gets a small "Live" badge + pickup-time-ago when the assigned driver is currently sharing.
   - A new "Track" button on rides with a driver opens a modal with a live map (OpenStreetMap via Leaflet — free, no API key needed) showing the driver's pin moving in real time, plus last-updated time and accuracy.
   - A new "Live drivers" panel at the top of the dashboard shows all currently-active drivers with their last update time.

## What admin sees

- Ride list: green pulsing dot next to driver name when location is live.
- Track button -> map modal with live moving pin, pickup + dropoff markers, and last-seen timestamp.
- "Live drivers" overview panel — counts and quick links.

## Privacy & control

- Location is only shared while a ride is `arrived` (in progress). Never shared when off-duty.
- Drivers see a clear banner and a "Stop sharing" button; they must grant browser permission first.
- Coordinates are tied to the driver row and only readable by the workspace owner (RLS).
- Old location rows are kept only as the latest position per driver (upsert), so no historical trail is stored unless you want one.

## Technical details

**Database (migration)**
- New table `public.driver_locations`:
  - `driver_id uuid PRIMARY KEY references drivers(id) on delete cascade`
  - `user_id uuid not null` (workspace owner, for RLS)
  - `ride_id uuid` (the active ride being tracked)
  - `lat double precision`, `lng double precision`
  - `accuracy double precision`, `heading double precision`, `speed double precision`
  - `updated_at timestamptz default now()`
- RLS: workspace owner can `SELECT` their drivers' rows (`auth.uid() = user_id`).
- Add to `supabase_realtime` publication; `REPLICA IDENTITY FULL`.
- New SECURITY DEFINER function `driver_update_location(_driver_id, _pin, _ride_id, _lat, _lng, _accuracy, _heading, _speed)` — verifies PIN, then upserts the row with the driver's `user_id` and `system` looked up server-side.
- New SECURITY DEFINER function `driver_clear_location(_driver_id, _pin)` to delete the row when sharing stops.

**Driver app (`src/routes/driver.tsx`)**
- New `useLiveLocation(rideId)` hook: starts `navigator.geolocation.watchPosition`, throttles RPC calls to one per 10 s (or on >25 m movement), calls `driver_update_location`. Cleans up + calls `driver_clear_location` on unmount / status change.
- Activated automatically when a ride's status becomes `arrived`. Banner shows "Sharing live location for ride X — Stop".
- Handles permission denied / errors with a friendly toast.

**Admin app (`src/routes/dashboard.tsx`)**
- Subscribe to `driver_locations` realtime channel; keep a `Map<driverId, location>` in state.
- Show pulsing green dot in the driver column when `driverId` has a fresh (<60 s) location.
- New `<TrackRideDialog ride={...} />` component using `react-leaflet` + OpenStreetMap tiles (no API key). Renders driver pin + pickup/dropoff markers, auto-pans to driver, shows accuracy circle and last-updated.
- "Live drivers" summary card showing count and list with last-updated.

**Dependencies**
- Add `leaflet` and `react-leaflet` (small, MIT, free OSM tiles).

## Out of scope (can add later)

- Historical breadcrumb trail / playback of past rides.
- ETA computation against pickup/dropoff.
- Native mobile app (this uses the browser, which works on iOS/Android Chrome/Safari while the driver tab is open).
