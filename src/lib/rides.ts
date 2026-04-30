import { supabase } from "@/integrations/supabase/client";

export type RideStatus = "pending" | "arrived" | "completed" | "cancelled" | "no_show";
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
  login_pin?: string | null;
  pin_hash?: string | null;
  system?: WorkspaceSystem;
}

// Find best matching route by checking if pickup/dropoff text contains the
// route's pickup/dropoff strings (case-insensitive). Returns the first match.
export function autoMatchRoute(
  ride: Pick<Ride, "pickup_from" | "dropoff_to" | "pickup_location" | "dropoff_location">,
  routes: RouteRow[]
): RouteRow | null {
  const pickHay = `${ride.pickup_from ?? ""} ${ride.pickup_location ?? ""}`.toLowerCase();
  const dropHay = `${ride.dropoff_to ?? ""} ${ride.dropoff_location ?? ""}`.toLowerCase();
  // Try strict: both ends match
  for (const r of routes) {
    const p = r.pickup_location.toLowerCase().trim();
    const d = r.dropoff_location.toLowerCase().trim();
    if (!p || !d) continue;
    if ((pickHay.includes(p) && dropHay.includes(d)) ||
        (pickHay.includes(d) && dropHay.includes(p))) {
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

export function normalizeRideKeyText(value: unknown): string {
  return String(value ?? "").trim().toLowerCase().replace(/\s+/g, " ");
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
    normalizeRideKeyText(ride.pickup_from),
    normalizeRideKeyText(ride.dropoff_location),
    normalizeRideKeyText(ride.dropoff_to),
    normalizeRideKeyText(ride.passenger_name),
    normalizeRideKeyText(ride.passenger_email),
    normalizeRideKeyText(ride.phone),
    normalizeRideKeyText(ride.flight_number),
  ].join("|");
}

export function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => {
      const result = r.result as string;
      const base64 = result.split(",")[1] ?? "";
      resolve(base64);
    };
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}

export async function callParser(file: File) {
  const fileBase64 = await fileToBase64(file);
  const { data, error } = await supabase.functions.invoke("parse-rides-pdf", {
    body: { fileBase64, fileName: file.name },
  });
  if (error) throw error;
  if (data?.error) throw new Error(data.error);
  return data.rides as Array<Partial<Ride>>;
}
