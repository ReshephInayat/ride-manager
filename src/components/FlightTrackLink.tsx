import { ExternalLink, Plane } from "lucide-react";

/**
 * Extract a flight code (e.g. "AS 2368", "DL1234", "UA-22") from a free-form
 * string. Flight numbers are typically a 2-letter (or 2-char alphanumeric)
 * airline code followed by 1–4 digits, optionally with a space or hyphen.
 *
 * Returns the cleaned, uppercased code (no spaces) or null if none found.
 */
export function extractFlightCode(text: string | null | undefined): string | null {
  if (!text) return null;
  // Match airline code (2 letters or letter+digit) + optional space/hyphen + 1-4 digits.
  // Use word boundaries to avoid grabbing parts of words.
  const re = /\b([A-Z]{2}|[A-Z]\d|\d[A-Z])[\s-]?(\d{1,4})\b/i;
  const m = text.match(re);
  if (!m) return null;
  return `${m[1]}${m[2]}`.toUpperCase();
}

/** Build the FlightAware live tracking URL for a flight code. */
export function flightAwareUrl(code: string): string {
  const cleaned = code.replace(/\s+/g, "").toUpperCase();
  return `https://flightaware.com/live/flight/${encodeURIComponent(cleaned)}`;
}

/**
 * Renders a flight number as a clickable link that opens FlightAware
 * in a new tab so admins and drivers can track the flight live.
 */
export function FlightTrackLink({
  flightNumber,
  className,
}: {
  flightNumber: string | null | undefined;
  className?: string;
}) {
  if (!flightNumber) return <>—</>;
  const cleaned = flightNumber.replace(/\s+/g, "").toUpperCase();
  return (
    <a
      href={flightAwareUrl(cleaned)}
      target="_blank"
      rel="noopener noreferrer"
      title={`Track ${cleaned} on FlightAware`}
      className={
        "inline-flex items-center gap-1 font-medium text-primary underline-offset-2 hover:underline " +
        (className ?? "")
      }
      onClick={(e) => e.stopPropagation()}
    >
      {flightNumber}
      <ExternalLink className="h-3 w-3" />
    </a>
  );
}

/**
 * A compact "Track flight" button that scans multiple ride fields for a
 * flight code (flight_number itself, plus pickup/dropoff text where codes
 * like "AS 2368" sometimes appear). If a code is found, it opens
 * FlightAware's live tracker; otherwise it opens FlightAware's search page
 * pre-filled with the best available text.
 */
export function FlightSearchButton({
  ride,
  className,
  size = "sm",
}: {
  ride: {
    flight_number?: string | null;
    pickup_location?: string | null;
    pickup_from?: string | null;
    dropoff_location?: string | null;
    dropoff_to?: string | null;
  };
  className?: string;
  size?: "xs" | "sm";
}) {
  // Search the most likely fields in priority order.
  const candidates = [
    ride.flight_number,
    ride.pickup_from,
    ride.dropoff_to,
    ride.pickup_location,
    ride.dropoff_location,
  ];
  let code: string | null = null;
  for (const c of candidates) {
    code = extractFlightCode(c);
    if (code) break;
  }

  const href = code
    ? flightAwareUrl(code)
    : `https://flightaware.com/live/findflight?ident=${encodeURIComponent(
        (ride.flight_number ?? "").trim(),
      )}`;

  const label = code ? `Track ${code}` : "Search flight";
  const padding = size === "xs" ? "px-2 py-0.5 text-[11px]" : "px-2.5 py-1 text-xs";

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      title={code ? `Track ${code} on FlightAware` : "Search this flight on FlightAware"}
      onClick={(e) => e.stopPropagation()}
      className={
        `inline-flex items-center gap-1 rounded-md border border-sky-200 bg-sky-50 ${padding} font-medium text-sky-700 hover:bg-sky-100 hover:border-sky-300 transition-colors dark:bg-sky-950/40 dark:border-sky-900 dark:text-sky-200 dark:hover:bg-sky-900/60 ` +
        (className ?? "")
      }
    >
      <Plane className="h-3 w-3" />
      {label}
      <ExternalLink className="h-3 w-3 opacity-70" />
    </a>
  );
}
