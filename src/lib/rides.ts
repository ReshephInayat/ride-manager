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

export function normalizeRideKeyText(value: unknown): string {
  return String(value ?? "")
    .trim()
    .toLowerCase()
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

interface PdfPageText {
  pageNumber: number;
  totalPages: number;
  text: string;
}

function isPdfTextItem(item: unknown): item is { str: string; hasEOL?: boolean } {
  return typeof item === "object" && item !== null && "str" in item;
}

async function extractPdfPagesText(file: File): Promise<PdfPageText[]> {
  const pdfjsLib = await import("pdfjs-dist");
  const pdfWorker = await import("pdfjs-dist/build/pdf.worker.mjs?url");
  pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorker.default;

  const bytes = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: bytes }).promise;
  const pages: PdfPageText[] = [];

  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const content = await page.getTextContent();
    const text = content.items
      .map((item) => (isPdfTextItem(item) ? `${item.str}${item.hasEOL ? "\n" : " "}` : ""))
      .join("")
      .replace(/[ \t]+/g, " ")
      .replace(/\n\s+/g, "\n")
      .trim();
    pages.push({ pageNumber, totalPages: pdf.numPages, text });
  }

  return pages;
}

async function callParserText(page: PdfPageText, fileName: string, documentContext: string) {
  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData.session?.access_token ?? import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  const response = await fetch(
    `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/parse-rides-pdf`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        fileName,
        pageNumber: page.pageNumber,
        totalPages: page.totalPages,
        pageText: page.text,
        documentContext,
      }),
    },
  );
  const text = await response.text();
  const data = text ? JSON.parse(text) : null;
  if (!response.ok) {
    throw new Error(data?.message ?? data?.error ?? `PDF import failed (${response.status}).`);
  }
  if (data?.error) throw new Error(data.error);
  return (data?.rides ?? []) as Array<Partial<Ride>>;
}

export async function callParser(file: File) {
  const pages = await extractPdfPagesText(file);
  const readablePages = pages.filter((page) => page.text.length > 40);
  if (!readablePages.length) {
    throw new Error("Could not read text from this PDF. Please upload a text-based schedule PDF.");
  }

  const rides: Array<Partial<Ride>> = [];
  const documentContext = pages
    .map((page) => page.text)
    .join("\n")
    .slice(0, 4000);
  for (let i = 0; i < readablePages.length; i += 1) {
    const chunkRides = await callParserText(readablePages[i], file.name, documentContext);
    rides.push(...chunkRides);
    if (i < readablePages.length - 1) await new Promise((resolve) => setTimeout(resolve, 250));
  }
  return rides;
}
