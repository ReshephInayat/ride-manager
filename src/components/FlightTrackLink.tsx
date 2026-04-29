import { ExternalLink } from "lucide-react";

/**
 * Renders a flight number as a clickable link that opens FlightAware
 * in a new tab so admins and drivers can track the flight live.
 *
 * FlightAware's public flight page accepts the IATA/ICAO flight number
 * directly: https://flightaware.com/live/flight/<NUMBER>
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
  const href = `https://flightaware.com/live/flight/${encodeURIComponent(cleaned)}`;
  return (
    <a
      href={href}
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
