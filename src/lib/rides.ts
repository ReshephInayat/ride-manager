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
  login_pin?: string | null;
  pin_hash?: string | null;
  system?: WorkspaceSystem;
}

// Find best matching route by checking if pickup/dropoff text contains the
// route's pickup/dropoff strings (case-insensitive). Returns the first match.
// IMPORTANT: strict match only checks pickup→pickup and dropoff→dropoff;
// never accepts reversed matches so swapped data can't accidentally look correct.
export function autoMatchRoute(
  ride: Pick<Ride, "pickup_from" | "dropoff_to" | "pickup_location" | "dropoff_location">,
  routes: RouteRow[],
): RouteRow | null {
  const pickHay = `${ride.pickup_from ?? ""} ${ride.pickup_location ?? ""}`.toLowerCase();
  const dropHay = `${ride.dropoff_to ?? ""} ${ride.dropoff_location ?? ""}`.toLowerCase();
  // Strict: pickup route matches pickup fields, dropoff route matches dropoff fields
  for (const r of routes) {
    const p = r.pickup_location.toLowerCase().trim();
    const d = r.dropoff_location.toLowerCase().trim();
    if (!p || !d) continue;
    if (pickHay.includes(p) && dropHay.includes(d)) {
      return r;
    }
  }
  // Reverse direction: maybe ride goes the other way on the same route
  for (const r of routes) {
    const p = r.pickup_location.toLowerCase().trim();
    const d = r.dropoff_location.toLowerCase().trim();
    if (!p || !d) continue;
    if (pickHay.includes(d) && dropHay.includes(p)) {
      return r;
    }
  }
  // Loose: either end matches (for pricing only)
  for (const r of routes) {
    const p = r.pickup_location.toLowerCase().trim();
    const d = r.dropoff_location.toLowerCase().trim();
    if (pickHay.includes(p) || dropHay.includes(d)) {
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

// =====================================================================
// PDF PARSING — Deterministic coordinate-based + AI fallback
// =====================================================================

// ---- Coordinate-based table item ----
interface CoordTextItem {
  str: string;
  x: number;
  y: number;
  width: number;
}

interface PdfPageItems {
  pageNumber: number;
  totalPages: number;
  items: CoordTextItem[];
  text: string; // plain text fallback for AI
}

function isPdfTextItem(
  item: unknown,
): item is { str: string; hasEOL?: boolean; transform?: number[]; width?: number } {
  return typeof item === "object" && item !== null && "str" in item;
}

async function extractPdfPages(file: File): Promise<PdfPageItems[]> {
  const pdfjsLib = await import("pdfjs-dist");
  const pdfWorker = await import("pdfjs-dist/build/pdf.worker.mjs?url");
  pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorker.default;

  const bytes = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: bytes }).promise;
  const pages: PdfPageItems[] = [];

  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const content = await page.getTextContent();
    const items: CoordTextItem[] = [];
    const textParts: string[] = [];

    for (const raw of content.items) {
      if (!isPdfTextItem(raw)) continue;
      const str = raw.str;
      textParts.push(`${str}${raw.hasEOL ? "\n" : " "}`);
      if (!str.trim()) continue;
      const t = raw.transform;
      const x = t ? t[4] : 0;
      const y = t ? t[5] : 0;
      items.push({ str: str.trim(), x, y, width: raw.width ?? 0 });
    }

    const text = textParts
      .join("")
      .replace(/[ \t]+/g, " ")
      .replace(/\n\s+/g, "\n")
      .trim();

    pages.push({ pageNumber, totalPages: pdf.numPages, items, text });
  }

  return pages;
}

// ---- Deterministic Horizon Air table parser ----
// Table columns L→R:
//   DATE | DEPARTMENT | #RIDERS | PICKUP Location | PICKUP From | Pickup Date/Time | DROPOFF Location | DROPOFF To

const Y_TOLERANCE = 4;
const MONTH_NAMES = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

function inferYear(items: CoordTextItem[]): number {
  const allText = items.map((i) => i.str).join(" ");
  const m = allText.match(/(\d{4})/);
  return m ? parseInt(m[1], 10) : new Date().getFullYear();
}

function parseHorizonDate(raw: string, year: number): string | null {
  const m = raw.match(/(\d{1,2})[\s-]([A-Za-z]{3,9})(?:[\s-](\d{4}))?/);
  if (!m) return null;
  const day = parseInt(m[1], 10);
  const monIdx = MONTH_NAMES.indexOf(m[2].toLowerCase().slice(0, 3));
  if (monIdx < 0) return null;
  const y = m[3] ? parseInt(m[3], 10) : year;
  return `${y}-${String(monIdx + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function parseTimeFromText(raw: string): string | null {
  const m = raw.match(/(\d{1,2}\s+[A-Za-z]{3,9}\s+\d{1,2}:\d{2})/);
  return m ? m[1].trim() : null;
}

function extractFlightFromText(raw: string): string | null {
  const m = raw.match(/([A-Z]{2,3}\s*\d{3,5})/i);
  return m ? m[1].trim() : null;
}

function groupItemsIntoRows(items: CoordTextItem[]): CoordTextItem[][] {
  if (!items.length) return [];
  const rowMap = new Map<number, CoordTextItem[]>();
  for (const item of items) {
    const yKey = Math.round(item.y / Y_TOLERANCE) * Y_TOLERANCE;
    if (!rowMap.has(yKey)) rowMap.set(yKey, []);
    rowMap.get(yKey)!.push(item);
  }
  return Array.from(rowMap.entries())
    .sort((a, b) => b[0] - a[0])
    .map(([, its]) => its.sort((a, b) => a.x - b.x));
}

function detectTableColumns(rows: CoordTextItem[][]): number[] | null {
  for (const row of rows) {
    const texts = row.map((i) => i.str.toLowerCase());
    const hasLocation = texts.some((t) => t === "location");
    const hasFrom = texts.some((t) => t === "from");
    if (hasLocation && hasFrom) {
      const locationItems = row
        .filter((i) => i.str.toLowerCase() === "location")
        .sort((a, b) => a.x - b.x);
      const fromItem = row.find((i) => i.str.toLowerCase() === "from");
      const toItem = row.find((i) => i.str.toLowerCase() === "to");
      if (locationItems.length >= 2 && fromItem && toItem) {
        return [locationItems[0].x, fromItem.x, locationItems[1].x, toItem.x];
      }
    }
  }
  return null;
}

interface ParsedRow {
  date?: string;
  department?: string;
  riders?: number;
  pickupLocation?: string;
  pickupFrom?: string;
  pickupTime?: string;
  dropoffLocation?: string;
  dropoffTo?: string;
}

function parseTablePage(items: CoordTextItem[], year: number): ParsedRow[] {
  const rows = groupItemsIntoRows(items);
  if (rows.length < 3) return [];
  const colBounds = detectTableColumns(rows);
  if (!colBounds) return [];

  const [pickLocX, fromX, dropLocX, toX] = colBounds;

  // Find header row index to skip
  let headerIdx = -1;
  for (let i = 0; i < rows.length; i++) {
    const texts = rows[i].map((it) => it.str.toLowerCase());
    if (texts.some((t) => t === "from") && texts.some((t) => t === "location")) {
      headerIdx = i;
      break;
    }
  }
  const startIdx = headerIdx >= 0 ? headerIdx + 1 : 2;
  const result: ParsedRow[] = [];
  const midFromTime = (fromX + dropLocX) / 2;

  for (let i = startIdx; i < rows.length; i++) {
    const row = rows[i];
    if (!row.length) continue;
    const rowText = row.map((it) => it.str).join(" ");
    if (/^(Created:|Page\s+\d|TOTAL|\*{3}|Copyright)/i.test(rowText.trim())) continue;

    const leftItems: CoordTextItem[] = [];
    const pickLocItems: CoordTextItem[] = [];
    const fromItems: CoordTextItem[] = [];
    const timeItems: CoordTextItem[] = [];
    const dropLocItems: CoordTextItem[] = [];
    const toItems: CoordTextItem[] = [];

    for (const item of row) {
      const x = item.x;
      if (x < pickLocX - 20) {
        leftItems.push(item);
      } else if (Math.abs(x - pickLocX) < 30) {
        pickLocItems.push(item);
      } else if (x >= fromX - 10 && x < midFromTime) {
        fromItems.push(item);
      } else if (x >= midFromTime && x < dropLocX - 20) {
        timeItems.push(item);
      } else if (Math.abs(x - dropLocX) < 30) {
        dropLocItems.push(item);
      } else if (x >= toX - 10) {
        toItems.push(item);
      } else {
        const dists = [
          { col: "pickLoc" as const, d: Math.abs(x - pickLocX) },
          { col: "from" as const, d: Math.abs(x - fromX) },
          { col: "dropLoc" as const, d: Math.abs(x - dropLocX) },
          { col: "to" as const, d: Math.abs(x - toX) },
        ].sort((a, b) => a.d - b.d);
        const closest = dists[0].col;
        if (closest === "pickLoc") pickLocItems.push(item);
        else if (closest === "from") fromItems.push(item);
        else if (closest === "dropLoc") dropLocItems.push(item);
        else toItems.push(item);
      }
    }

    let dateStr: string | undefined;
    let department: string | undefined;
    let riders: number | undefined;

    for (const item of leftItems) {
      const s = item.str.trim();
      if (/^\d{1,2}[\s-][A-Za-z]{3}/.test(s)) {
        dateStr = parseHorizonDate(s, year) ?? undefined;
      } else if (/^\d{1,2}$/.test(s)) {
        riders = parseInt(s, 10);
      } else if (/flight|inflight/i.test(s)) {
        department = s;
      }
    }

    const pickupLocation = pickLocItems.map((i) => i.str).join(" ").trim() || undefined;
    const pickupFrom = fromItems.map((i) => i.str).join(" ").trim() || undefined;
    const pickupTime = timeItems.map((i) => i.str).join(" ").trim() || undefined;
    const dropoffLocation = dropLocItems.map((i) => i.str).join(" ").trim() || undefined;
    const dropoffTo = toItems.map((i) => i.str).join(" ").trim() || undefined;

    if (pickupLocation || pickupFrom || pickupTime || dropoffLocation || dropoffTo) {
      result.push({
        date: dateStr,
        department,
        riders,
        pickupLocation,
        pickupFrom,
        pickupTime,
        dropoffLocation,
        dropoffTo,
      });
    }
  }

  return result;
}

function convertParsedToRides(parsed: ParsedRow[]): Array<Partial<Ride>> {
  const rides: Array<Partial<Ride>> = [];
  let carryDate: string | null = null;

  for (const row of parsed) {
    if (row.date) carryDate = row.date;
    const rideDate = row.date ?? carryDate;
    if (!rideDate) continue;

    const pickupTime = row.pickupTime ? parseTimeFromText(row.pickupTime) ?? row.pickupTime : null;

    let flightNumber: string | null = null;
    if (row.pickupFrom) flightNumber = extractFlightFromText(row.pickupFrom);
    if (!flightNumber && row.dropoffTo) flightNumber = extractFlightFromText(row.dropoffTo);

    rides.push({
      ride_date: rideDate,
      department: row.department ?? null,
      riders: row.riders ?? 4,
      pickup_location: row.pickupLocation ?? null,
      pickup_from: row.pickupFrom ?? null,
      pickup_time: pickupTime,
      dropoff_location: row.dropoffLocation ?? null,
      dropoff_to: row.dropoffTo ?? null,
      flight_number: flightNumber,
      passenger_name: null,
      passenger_email: null,
      phone: null,
    });
  }

  return rides;
}

function tryDeterministicParse(pages: PdfPageItems[]): Array<Partial<Ride>> | null {
  const allItems = pages.flatMap((p) => p.items);
  const year = inferYear(allItems);

  const allParsed: ParsedRow[] = [];
  let successPages = 0;

  for (const page of pages) {
    const rows = parseTablePage(page.items, year);
    if (rows.length > 0) {
      allParsed.push(...rows);
      successPages++;
    }
  }

  if (successPages === 0 || allParsed.length === 0) return null;

  const rides = convertParsedToRides(allParsed);
  const valid = rides.filter((r) => r.ride_date && (r.pickup_location || r.pickup_from));
  if (valid.length < allParsed.length * 0.5) return null;

  return rides;
}

// ---- AI fallback ----
async function callParserText(page: PdfPageItems, fileName: string, documentContext: string) {
  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData.session?.access_token ?? import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/parse-rides-pdf`, {
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
  });
  const text = await response.text();
  const data = text ? JSON.parse(text) : null;
  if (!response.ok) {
    throw new Error(data?.message ?? data?.error ?? `PDF import failed (${response.status}).`);
  }
  if (data?.error) throw new Error(data.error);
  return (data?.rides ?? []) as Array<Partial<Ride>>;
}

export async function callParser(file: File) {
  const pages = await extractPdfPages(file);
  const readablePages = pages.filter((page) => page.text.length > 40);
  if (!readablePages.length) {
    throw new Error("Could not read text from this PDF. Please upload a text-based schedule PDF.");
  }

  // Step 1: Try deterministic coordinate-based parsing (fast, reliable)
  const deterministicResult = tryDeterministicParse(readablePages);
  if (deterministicResult && deterministicResult.length > 0) {
    console.log(`[parser] Deterministic parse succeeded: ${deterministicResult.length} rides`);
    return deterministicResult;
  }

  // Step 2: Fall back to AI parsing
  console.log("[parser] Deterministic parse failed, falling back to AI…");
  const documentContext = pages
    .map((page) => page.text)
    .join("\n")
    .slice(0, 4000);

  const CONCURRENCY = 4;
  const rides: Array<Partial<Ride>> = [];
  for (let i = 0; i < readablePages.length; i += CONCURRENCY) {
    const batch = readablePages.slice(i, i + CONCURRENCY);
    const results = await Promise.all(
      batch.map((page) => callParserText(page, file.name, documentContext)),
    );
    for (const chunkRides of results) {
      rides.push(...chunkRides);
    }
  }
  return rides;
}
