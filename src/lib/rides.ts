import { supabase } from "@/integrations/supabase/client";

export type RideStatus = "pending" | "started" | "arrived" | "completed" | "cancelled" | "no_show";
export type WorkspaceSystem = "api" | "llc";

export interface Ride {
  id: string;
  user_id: string;
  ride_key?: string;
  dedupe_key?: string | null;
  ride_date: string;
  department: string | null;
  riders: number;
  pickup_location: string | null;
  pickup_from: string | null;
  pickup_time: string | null;
  dropoff_location: string | null;
  dropoff_to: string | null;
  status: RideStatus;
  route_id: string | null;
  driver_id: string | null;
  amount: number;
  source_file: string | null;
  passenger_name?: string | null;
  passenger_email?: string | null;
  flight_number?: string | null;
  phone?: string | null;
  notes?: string | null;
  system?: WorkspaceSystem;
}

export interface RideReminder {
  id: string;
  user_id: string;
  ride_id: string;
  remind_at: string;
  message: string | null;
  notified: boolean;
  created_at: string;
}

export interface AppNotification {
  id: string;
  user_id: string;
  driver_id: string | null;
  ride_id: string | null;
  kind: string;
  title: string;
  body: string | null;
  read: boolean;
  created_at: string;
}

export interface RouteRow {
  id: string;
  name: string;
  pickup_location: string;
  dropoff_location: string;
  price: number;
}

export interface Driver {
  id: string;
  user_id: string;
  name: string;
  phone: string | null;
  email: string | null;
  notes: string | null;
  active: boolean;
  
  pin_hash?: string | null;
  system?: WorkspaceSystem;
}

// Find best matching route by checking if pickup/dropoff text contains the
// route's pickup/dropoff strings (case-insensitive). Returns the first match.
export function autoMatchRoute(
  ride: Pick<Ride, "pickup_from" | "dropoff_to" | "pickup_location" | "dropoff_location">,
  routes: RouteRow[],
): RouteRow | null {
  const pickHay = `${ride.pickup_from ?? ""} ${ride.pickup_location ?? ""}`.toLowerCase();
  const dropHay = `${ride.dropoff_to ?? ""} ${ride.dropoff_location ?? ""}`.toLowerCase();
  // Try strict: both ends match
  for (const r of routes) {
    const p = r.pickup_location.toLowerCase().trim();
    const d = r.dropoff_location.toLowerCase().trim();
    if (!p || !d) continue;
    if (
      (pickHay.includes(p) && dropHay.includes(d)) ||
      (pickHay.includes(d) && dropHay.includes(p))
    ) {
      return r;
    }
  }
  // Loose: either end matches
  for (const r of routes) {
    const p = r.pickup_location.toLowerCase().trim();
    const d = r.dropoff_location.toLowerCase().trim();
    if (pickHay.includes(p) || dropHay.includes(d) || pickHay.includes(d) || dropHay.includes(p)) {
      return r;
    }
  }
  return null;
}

// PDFs embed the dropoff time inside fields like "AS 2368-30 Apr 07:55" or
// "AS 2279-01 Apr 21:50". Extract the trailing time portion (and optional date)
// and return them split out for display.
const TRAILING_TIME_RE = /-\s*((?:\d{1,2}\s+[A-Za-z]{3,9}\s+)?\d{1,2}:\d{2})\s*$/;

export function extractDropoffTime(ride: Pick<Ride, "dropoff_to" | "flight_number">): string | null {
  const sources = [ride.dropoff_to, ride.flight_number];
  for (const src of sources) {
    if (!src) continue;
    const m = src.match(TRAILING_TIME_RE);
    if (m) return m[1].trim();
  }
  return null;
}

export function stripTrailingTime(value: string | null | undefined): string {
  if (!value) return "";
  return value.replace(TRAILING_TIME_RE, "").trim();
}

export function normalizeRideKeyText(value: unknown): string {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s*-\s*/g, "-")
    .replace(/\s+/g, " ");
}

export function normalizeRideKeyTime(value: unknown): string {
  const cleaned = normalizeRideKeyText(value);
  const match = cleaned.match(/(\d{1,2}):(\d{2})\s*(am|pm)?/);
  if (!match) return cleaned;

  let hour = Number(match[1]);
  const minute = match[2];
  const meridiem = match[3];
  if (meridiem === "pm" && hour < 12) hour += 12;
  if (meridiem === "am" && hour === 12) hour = 0;

  return `${String(hour % 24).padStart(2, "0")}:${minute}`;
}

export function buildRideKey(
  ride: Pick<
    Partial<Ride>,
    | "ride_date"
    | "pickup_time"
    | "pickup_location"
    | "pickup_from"
    | "dropoff_location"
    | "dropoff_to"
    | "passenger_name"
    | "passenger_email"
    | "phone"
    | "flight_number"
  >,
): string {
  return [
    normalizeRideKeyText(ride.ride_date),
    normalizeRideKeyTime(ride.pickup_time),
    normalizeRideKeyText(ride.pickup_location),
    normalizeRideKeyText(stripTrailingTime(ride.pickup_from)),
    normalizeRideKeyText(ride.dropoff_location),
    normalizeRideKeyText(stripTrailingTime(ride.dropoff_to)),
    normalizeRideKeyText(ride.passenger_name),
    normalizeRideKeyText(ride.passenger_email),
    normalizeRideKeyText(ride.phone),
    normalizeRideKeyText(stripTrailingTime(ride.flight_number)),
  ].join("|");
}

// ---- XLSX parser (no AI, deterministic) ----

const FLIGHT_RE = /^([A-Z]{2}\s*\d{3,4})/;

function extractFlight(val: string | null | undefined): string | null {
  if (!val) return null;
  const m = String(val).trim().match(FLIGHT_RE);
  return m ? m[1].replace(/\s+/g, " ") : null;
}

function parsePickupTime(val: string | null | undefined): string | null {
  if (!val) return null;
  const s = String(val).trim();
  // "01 May 07:35" → "07:35"
  const m = s.match(/(\d{1,2}:\d{2})\s*$/);
  return m ? m[1] : null;
}

function parseDateCell(val: string | null | undefined): string | null {
  if (!val) return null;
  const s = String(val).trim();
  // "01-May-2026" → "2026-05-01"
  const m = s.match(/^(\d{1,2})-([A-Za-z]+)-(\d{4})$/);
  if (!m) return null;
  const day = m[1].padStart(2, "0");
  const months: Record<string, string> = {
    jan: "01", feb: "02", mar: "03", apr: "04", may: "05", jun: "06",
    jul: "07", aug: "08", sep: "09", oct: "10", nov: "11", dec: "12",
  };
  const mon = months[m[2].toLowerCase().slice(0, 3)];
  if (!mon) return null;
  return `${m[3]}-${mon}-${day}`;
}

export async function callParser(file: File): Promise<Array<Partial<Ride>>> {
  const XLSX = await import("xlsx");
  const bytes = await file.arrayBuffer();
  const wb = XLSX.read(bytes, { type: "array" });

  const rides: Array<Partial<Ride>> = [];

  for (const sheetName of wb.SheetNames) {
    const ws = wb.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json<(string | number | null)[]>(ws, { header: 1 });

    let currentDate: string | null = null;
    let dataStarted = false;

    for (const row of rows) {
      if (!row || row.length < 15) continue;

      // Detect header row to know data section started
      const col2 = row[2] != null ? String(row[2]).trim() : "";
      if (col2 === "DATE") {
        dataStarted = true;
        continue;
      }
      if (!dataStarted) continue;

      // Stop at end marker
      if (col2.startsWith("***")) break;

      // Date carry-down
      const parsedDate = parseDateCell(col2);
      if (parsedDate) currentDate = parsedDate;
      if (!currentDate) continue;

      // Must have riders column
      const ridersRaw = row[10];
      if (ridersRaw == null || ridersRaw === "") continue;
      const riders = parseInt(String(ridersRaw), 10) || 1;

      const pickupLocation = row[12] != null ? String(row[12]).trim() : null;
      const pickupFrom = row[14] != null ? String(row[14]).trim() : null;
      const pickupDateTime = row[24] != null ? String(row[24]).trim() : null;
      const dropoffLocation = row[28] != null ? String(row[28]).trim() : null;
      const dropoffTo = row[32] != null ? String(row[32]).trim() : null;
      const department = row[7] != null ? String(row[7]).trim() : null;

      const pickupTime = parsePickupTime(pickupDateTime);

      // Extract flight number from whichever field has it
      const flightNumber = extractFlight(pickupFrom) || extractFlight(dropoffTo);

      // Determine which field is the hotel/location name vs flight info
      // If pickupFrom starts with a flight code, it's an arrival (hotel is dropoffTo)
      // Otherwise pickupFrom is the hotel name
      const pickupFromIsFlight = pickupFrom ? FLIGHT_RE.test(pickupFrom) : false;
      const dropoffToIsFlight = dropoffTo ? FLIGHT_RE.test(dropoffTo) : false;

      const fromLocation = pickupFromIsFlight ? stripTrailingTime(pickupFrom) : (pickupFrom || null);
      const toLocation = dropoffToIsFlight ? stripTrailingTime(dropoffTo) : (dropoffTo || null);

      rides.push({
        ride_date: currentDate,
        department,
        riders,
        pickup_location: pickupLocation || null,
        pickup_from: fromLocation,
        pickup_time: pickupTime,
        dropoff_location: dropoffLocation || null,
        dropoff_to: toLocation,
        flight_number: flightNumber,
      });
    }
  }

  return rides;
}
