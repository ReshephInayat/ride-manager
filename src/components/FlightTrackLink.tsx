import { useState } from "react";
import { ExternalLink, Plane, Loader2, RefreshCw } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";

const IATA_TO_ICAO: Record<string, string> = {
  AS: "ASA", AA: "AAL", DL: "DAL", UA: "UAL", WN: "SWA", B6: "JBU", AC: "ACA",
  AF: "AFR", BA: "BAW", LH: "DLH", KL: "KLM", QF: "QFA", NH: "ANA", JL: "JAL",
  EK: "UAE", QR: "QTR", CX: "CPA", SQ: "SIA", AM: "AMX", WS: "WJA", F9: "FFT",
  NK: "NKS", HA: "HAL", AY: "FIN", IB: "IBE", TK: "THY", EY: "ETD", VS: "VIR",
};

function toIcao(airline: string): string {
  const up = airline.toUpperCase();
  if (up.length === 3) return up;
  return IATA_TO_ICAO[up] ?? up;
}

export function extractFlightCode(text: string | null | undefined): string | null {
  if (!text) return null;
  const re = /\b([A-Z]{3}|[A-Z]{2}|[A-Z]\d|\d[A-Z])[\s-]?(\d{1,4})\b/i;
  const m = text.match(re);
  if (!m) return null;
  return `${toIcao(m[1])}${m[2]}`.toUpperCase();
}

/** Get IATA code (2-letter+digits) for AviationStack (which uses IATA flight_iata). */
function toIata(code: string): string {
  const cleaned = code.replace(/\s+/g, "").toUpperCase();
  const m = cleaned.match(/^([A-Z]{3})(\d{1,4})$/);
  if (m) {
    const iata = Object.entries(IATA_TO_ICAO).find(([, icao]) => icao === m[1])?.[0];
    if (iata) return `${iata}${m[2]}`;
  }
  return cleaned;
}

export function flightAwareUrl(code: string): string {
  let cleaned = code.replace(/\s+/g, "").toUpperCase();
  const m = cleaned.match(/^([A-Z0-9]{2})(\d{1,4})$/);
  if (m) cleaned = `${toIcao(m[1])}${m[2]}`;
  return `https://flightaware.com/live/flight/${encodeURIComponent(cleaned)}`;
}

type FlightInfo = {
  flight_status?: string;
  departure?: { airport?: string; iata?: string; terminal?: string; gate?: string; scheduled?: string; estimated?: string; actual?: string; delay?: number };
  arrival?: { airport?: string; iata?: string; terminal?: string; gate?: string; scheduled?: string; estimated?: string; actual?: string; delay?: number };
  airline?: { name?: string; iata?: string };
  flight?: { iata?: string; icao?: string; number?: string };
  live?: { updated?: string; latitude?: number; longitude?: number; altitude?: number; speed_horizontal?: number; is_ground?: boolean };
};

function fmtTime(iso?: string) {
  if (!iso) return "—";
  try { return new Date(iso).toLocaleString(undefined, { dateStyle: "short", timeStyle: "short" }); } catch { return iso; }
}

function statusColor(s?: string) {
  switch ((s ?? "").toLowerCase()) {
    case "scheduled": return "bg-blue-500/15 text-blue-600 dark:text-blue-300";
    case "active": return "bg-emerald-500/15 text-emerald-600 dark:text-emerald-300";
    case "landed": return "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300";
    case "cancelled": return "bg-red-500/15 text-red-600 dark:text-red-300";
    case "incident":
    case "diverted": return "bg-amber-500/15 text-amber-700 dark:text-amber-300";
    default: return "bg-muted text-muted-foreground";
  }
}

export function FlightDetailsDialog({
  flightNumber,
  date,
  trigger,
}: {
  flightNumber: string;
  date?: string | null;
  trigger: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<FlightInfo[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchFlight = async () => {
    setLoading(true); setError(null);
    try {
      const iata = toIata(flightNumber);
      const params = new URLSearchParams({ flight: iata });
      if (date) params.set("date", date);
      const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/flight-lookup?${params.toString()}`;
      const r = await fetch(url, { headers: { Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}` } });
      const json = await r.json();
      if (!r.ok) throw new Error(json.error ?? "Failed to fetch");
      setData(json.data ?? []);
    } catch (e: any) {
      setError(e.message ?? String(e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (v && !data) fetchFlight(); }}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Plane className="h-5 w-5 text-primary" />
            Flight {flightNumber.replace(/\s+/g, "").toUpperCase()}
            {date && <span className="text-xs text-muted-foreground ml-2">{date}</span>}
            <Button size="sm" variant="ghost" onClick={fetchFlight} disabled={loading} className="ml-auto h-7 px-2">
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
            </Button>
          </DialogTitle>
        </DialogHeader>

        {loading && (
          <div className="py-12 text-center text-muted-foreground">
            <Loader2 className="h-6 w-6 animate-spin inline" />
            <div className="mt-2 text-sm">Loading flight data…</div>
          </div>
        )}

        {error && <div className="text-sm text-destructive">{error}</div>}

        {!loading && data && data.length === 0 && (
          <div className="py-8 text-center text-sm text-muted-foreground">
            No live data available for this flight{date ? ` on ${date}` : ""}.
            <div className="mt-3">
              <a href={flightAwareUrl(flightNumber)} target="_blank" rel="noreferrer" className="text-primary underline inline-flex items-center gap-1">
                Open FlightAware <ExternalLink className="h-3 w-3" />
              </a>
            </div>
          </div>
        )}

        {!loading && data && data.map((f, i) => (
          <div key={i} className="space-y-3 border border-border rounded-lg p-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="font-semibold">{f.airline?.name ?? "—"}</div>
                <div className="text-xs text-muted-foreground">{f.flight?.iata ?? f.flight?.icao ?? "—"}</div>
              </div>
              <Badge className={statusColor(f.flight_status)}>{f.flight_status ?? "—"}</Badge>
            </div>

            <div className="grid grid-cols-2 gap-3 text-sm">
              <div className="space-y-1">
                <div className="text-xs uppercase tracking-wider text-muted-foreground">Departure</div>
                <div className="font-medium">{f.departure?.airport ?? "—"} <span className="text-muted-foreground">({f.departure?.iata ?? "—"})</span></div>
                <div className="text-xs">Terminal {f.departure?.terminal ?? "—"} · Gate {f.departure?.gate ?? "—"}</div>
                <div className="text-xs"><b>Sched:</b> {fmtTime(f.departure?.scheduled)}</div>
                <div className="text-xs"><b>Est:</b> {fmtTime(f.departure?.estimated)}</div>
                <div className="text-xs"><b>Actual:</b> {fmtTime(f.departure?.actual)}</div>
                {f.departure?.delay ? <div className="text-xs text-amber-600 dark:text-amber-400">Delay: {f.departure.delay} min</div> : null}
              </div>
              <div className="space-y-1">
                <div className="text-xs uppercase tracking-wider text-muted-foreground">Arrival</div>
                <div className="font-medium">{f.arrival?.airport ?? "—"} <span className="text-muted-foreground">({f.arrival?.iata ?? "—"})</span></div>
                <div className="text-xs">Terminal {f.arrival?.terminal ?? "—"} · Gate {f.arrival?.gate ?? "—"}</div>
                <div className="text-xs"><b>Sched:</b> {fmtTime(f.arrival?.scheduled)}</div>
                <div className="text-xs"><b>Est:</b> {fmtTime(f.arrival?.estimated)}</div>
                <div className="text-xs"><b>Actual:</b> {fmtTime(f.arrival?.actual)}</div>
                {f.arrival?.delay ? <div className="text-xs text-amber-600 dark:text-amber-400">Delay: {f.arrival.delay} min</div> : null}
              </div>
            </div>

            {f.live && (
              <div className="text-xs text-muted-foreground border-t border-border pt-2">
                Live: {f.live.is_ground ? "On ground" : "Airborne"} · alt {f.live.altitude ?? "—"} m · speed {f.live.speed_horizontal ?? "—"} km/h · updated {fmtTime(f.live.updated)}
              </div>
            )}
          </div>
        ))}
      </DialogContent>
    </Dialog>
  );
}

/**
 * Inline link rendering the flight number; opens the live details dialog.
 */
export function FlightTrackLink({
  flightNumber,
  date,
  className,
}: {
  flightNumber: string | null | undefined;
  date?: string | null;
  className?: string;
}) {
  if (!flightNumber) return <>—</>;
  const cleaned = flightNumber.replace(/\s+/g, "").toUpperCase();
  return (
    <FlightDetailsDialog
      flightNumber={cleaned}
      date={date ?? undefined}
      trigger={
        <button
          type="button"
          onClick={(e) => e.stopPropagation()}
          className={"inline-flex items-center gap-1 font-medium text-primary underline-offset-2 hover:underline " + (className ?? "")}
        >
          {flightNumber}
          <Plane className="h-3 w-3" />
        </button>
      }
    />
  );
}

/**
 * Compact "Track flight" button — opens the live details dialog.
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
    ride_date?: string | null;
  };
  className?: string;
  size?: "xs" | "sm";
}) {
  const candidates = [ride.flight_number, ride.pickup_from, ride.dropoff_to, ride.pickup_location, ride.dropoff_location];
  let code: string | null = null;
  for (const c of candidates) { code = extractFlightCode(c); if (code) break; }
  const padding = size === "xs" ? "px-2 py-0.5 text-[11px]" : "px-2.5 py-1 text-xs";

  const flightAwareBtn = (forCode: string) => (
    <a
      href={flightAwareUrl(forCode)}
      target="_blank"
      rel="noreferrer"
      onClick={(e) => e.stopPropagation()}
      className={`inline-flex items-center gap-1 rounded-md border border-border bg-muted ${padding} font-medium text-foreground hover:bg-secondary transition-colors`}
      title="Open in FlightAware"
    >
      <Plane className="h-3 w-3" /> Flight Aware <ExternalLink className="h-3 w-3 opacity-70" />
    </a>
  );

  if (!code) {
    return (
      <div className={`inline-flex items-center gap-1.5 ${className ?? ""}`}>
        <a href={`https://flightaware.com/live/findflight?ident=${encodeURIComponent((ride.flight_number ?? "").trim())}`}
           target="_blank" rel="noreferrer"
           onClick={(e) => e.stopPropagation()}
           className={`inline-flex items-center gap-1 rounded-md border border-border bg-muted ${padding} font-medium text-foreground hover:bg-secondary transition-colors`}>
          <Plane className="h-3 w-3" /> Flight Aware <ExternalLink className="h-3 w-3 opacity-70" />
        </a>
      </div>
    );
  }

  return (
    <div className={`inline-flex items-center gap-1.5 ${className ?? ""}`}>
      <FlightDetailsDialog
        flightNumber={code}
        date={ride.ride_date ?? undefined}
        trigger={
          <button type="button" onClick={(e) => e.stopPropagation()}
            className={`inline-flex items-center gap-1 rounded-md border border-primary/30 bg-primary/10 ${padding} font-medium text-primary hover:bg-primary/15 transition-colors`}>
            <Plane className="h-3 w-3" /> Track {code}
          </button>
        }
      />
      {flightAwareBtn(code)}
    </div>
  );
}
