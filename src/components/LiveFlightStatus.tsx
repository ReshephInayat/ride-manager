import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, Loader2, MapPin, Plane } from "lucide-react";
import { extractFlightCode } from "@/components/FlightTrackLink";

export type LiveFlightInfo = {
  flight_status?: string;
  departure?: { airport?: string; iata?: string; terminal?: string; gate?: string; scheduled?: string; estimated?: string; actual?: string; delay?: number };
  arrival?: { airport?: string; iata?: string; terminal?: string; gate?: string; scheduled?: string; estimated?: string; actual?: string; delay?: number };
  airline?: { name?: string };
  aircraft?: { model?: string; registration?: string } | null;
};

const cache = new Map<string, { ts: number; info: LiveFlightInfo | null; error?: string }>();
const TTL = 90 * 1000;

export async function fetchLiveFlight(flightNumber: string, date?: string | null): Promise<{ info: LiveFlightInfo | null; error?: string }> {
  const code = extractFlightCode(flightNumber);
  if (!code) return { info: null, error: "no code" };
  const key = `${code}|${date ?? ""}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.ts < TTL) return { info: hit.info, error: hit.error };
  try {
    const params = new URLSearchParams({ flight: code });
    if (date) params.set("date", date);
    const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/flight-lookup?${params.toString()}`;
    const r = await fetch(url, { headers: { Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}` } });
    const json = await r.json();
    if (!r.ok) {
      const out = { info: null, error: json.error ?? `HTTP ${r.status}` };
      cache.set(key, { ts: Date.now(), info: null, error: out.error });
      return out;
    }
    const info: LiveFlightInfo | null = (json.data && json.data[0]) || null;
    cache.set(key, { ts: Date.now(), info });
    return { info };
  } catch (e: any) {
    return { info: null, error: e?.message ?? String(e) };
  }
}

function fmtTime(iso?: string) {
  if (!iso) return "—";
  try { return new Date(iso).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" }); } catch { return iso; }
}

function statusColor(s?: string) {
  switch ((s ?? "").toLowerCase()) {
    case "scheduled": return "bg-blue-500/15 text-blue-600 dark:text-blue-300 border-blue-500/30";
    case "active": return "bg-emerald-500/15 text-emerald-600 dark:text-emerald-300 border-emerald-500/30";
    case "landed": return "bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 border-emerald-500/30";
    case "cancelled": return "bg-red-500/15 text-red-600 dark:text-red-300 border-red-500/30";
    default: return "bg-muted text-muted-foreground border-border";
  }
}

export function LiveFlightStatus({
  flightNumber,
  date,
  closeArrival,
  onArrival,
}: {
  flightNumber: string | null | undefined;
  date?: string | null;
  closeArrival?: boolean;
  onArrival?: (timeMs: number | null) => void;
}) {
  const [info, setInfo] = useState<LiveFlightInfo | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    if (!flightNumber) { setLoading(false); return; }
    setLoading(true);
    fetchLiveFlight(flightNumber, date).then((res) => {
      if (cancelled) return;
      setInfo(res.info); setErr(res.error ?? null); setLoading(false);
      if (onArrival) {
        const a = res.info?.arrival?.estimated ?? res.info?.arrival?.actual ?? res.info?.arrival?.scheduled;
        onArrival(a ? new Date(a).getTime() : null);
      }
    });
    const t = setInterval(() => {
      fetchLiveFlight(flightNumber, date).then((res) => {
        if (cancelled) return;
        setInfo(res.info); setErr(res.error ?? null);
      });
    }, 60000);
    return () => { cancelled = true; clearInterval(t); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flightNumber, date]);

  if (!flightNumber) return null;
  const dep = info?.departure; const arr = info?.arrival;
  const delay = (dep?.delay ?? 0) || (arr?.delay ?? 0);

  return (
    <div className="rounded-lg border border-border bg-muted/20 px-3 py-2 text-xs space-y-1">
      <div className="flex items-center gap-2 flex-wrap">
        <Plane className="w-3.5 h-3.5 text-primary" />
        <span className="font-semibold text-foreground">Live</span>
        {loading ? (
          <Badge className="bg-muted text-muted-foreground border-border text-[10px] gap-1"><Loader2 className="w-3 h-3 animate-spin" /> Loading</Badge>
        ) : info?.flight_status ? (
          <Badge className={`${statusColor(info.flight_status)} text-[10px] border uppercase`}>{info.flight_status}</Badge>
        ) : err ? (
          <Badge className="bg-amber-500/10 text-amber-600 border-amber-500/30 text-[10px] gap-1"><AlertTriangle className="w-3 h-3" /> No live data</Badge>
        ) : null}
        {delay > 0 && (
          <Badge className="bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30 text-[10px]">Delay {delay}m</Badge>
        )}
        {closeArrival && (
          <Badge className="bg-orange-500/20 text-orange-700 dark:text-orange-300 border-orange-500/40 text-[10px] gap-1">
            <AlertTriangle className="w-3 h-3" /> Close arrival
          </Badge>
        )}
      </div>
      {info && (
        <div className="grid grid-cols-2 gap-2 pt-1">
          <div>
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Dep</div>
            <div className="text-foreground/90 flex items-center gap-1">
              <MapPin className="w-3 h-3 text-emerald-500" />{dep?.iata ?? "—"} · T{dep?.terminal ?? "—"}/G{dep?.gate ?? "—"}
            </div>
            <div className="text-muted-foreground">Sched {fmtTime(dep?.scheduled)}{dep?.actual ? ` · Act ${fmtTime(dep.actual)}` : dep?.estimated ? ` · Est ${fmtTime(dep.estimated)}` : ""}</div>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Arr</div>
            <div className="text-foreground/90 flex items-center gap-1">
              <MapPin className="w-3 h-3 text-blue-500" />{arr?.iata ?? "—"} · T{arr?.terminal ?? "—"}/G{arr?.gate ?? "—"}
            </div>
            <div className="text-muted-foreground">Sched {fmtTime(arr?.scheduled)}{arr?.actual ? ` · Act ${fmtTime(arr.actual)}` : arr?.estimated ? ` · Est ${fmtTime(arr.estimated)}` : ""}</div>
          </div>
        </div>
      )}
    </div>
  );
}
