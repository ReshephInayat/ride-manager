import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { RequireAuth } from "@/components/RequireAuth";
import { AppShell } from "@/components/AppShell";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Plane, Search, RefreshCw, Clock, Users, ExternalLink, MapPin, AlertTriangle, Loader2 } from "lucide-react";
import { useSystem } from "@/lib/system";
import { PageLoader } from "@/components/Spinner";
import { extractFlightCode, flightAwareUrl } from "@/components/FlightTrackLink";
import { stripTrailingTime } from "@/lib/rides";

export const Route = createFileRoute("/flights")({ component: FlightsPage });

function FlightsPage() {
  return (<RequireAuth><AppShell><FlightsInner /></AppShell></RequireAuth>);
}

type DateFilter = "yesterday" | "today" | "tomorrow" | "this_week" | "this_month" | "all" | "custom";

function ymd(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
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
    case "incident":
    case "diverted": return "bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30";
    default: return "bg-muted text-muted-foreground border-border";
  }
}

type FlightInfo = {
  flight_status?: string;
  departure?: { airport?: string; iata?: string; terminal?: string; gate?: string; scheduled?: string; estimated?: string; actual?: string; delay?: number };
  arrival?: { airport?: string; iata?: string; terminal?: string; gate?: string; scheduled?: string; estimated?: string; actual?: string; delay?: number };
  airline?: { name?: string; iata?: string };
  flight?: { iata?: string; icao?: string; number?: string };
  aircraft?: { registration?: string; iata?: string; icao?: string; model?: string } | null;
  live?: { updated?: string; latitude?: number; longitude?: number; altitude?: number; speed_horizontal?: number; is_ground?: boolean };
};

const flightCache = new Map<string, { ts: number; info: FlightInfo | null; error?: string }>();
const LIVE_TTL = 90 * 1000;

async function lookupFlight(code: string, date?: string | null): Promise<{ info: FlightInfo | null; error?: string }> {
  const key = `${code}|${date ?? ""}`;
  const hit = flightCache.get(key);
  if (hit && Date.now() - hit.ts < LIVE_TTL) return { info: hit.info, error: hit.error };
  try {
    const params = new URLSearchParams({ flight: code });
    if (date) params.set("date", date);
    const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/flight-lookup?${params.toString()}`;
    const r = await fetch(url, { headers: { Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}` } });
    const json = await r.json();
    if (!r.ok) {
      const out = { info: null, error: json.error ?? `HTTP ${r.status}` };
      flightCache.set(key, { ts: Date.now(), info: null, error: out.error });
      return out;
    }
    const info: FlightInfo | null = (json.data && json.data[0]) || null;
    flightCache.set(key, { ts: Date.now(), info });
    return { info };
  } catch (e: any) {
    return { info: null, error: e?.message ?? String(e) };
  }
}

function FlightsInner() {
  const { system } = useSystem();
  const [rides, setRides] = useState<any[]>([]);
  const [drivers, setDrivers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<DateFilter>("today");
  const [customDate, setCustomDate] = useState<string>(ymd(new Date()));
  const [searchTerm, setSearchTerm] = useState("");
  const [liveData, setLiveData] = useState<Record<string, { info: FlightInfo | null; error?: string; loading?: boolean }>>({});
  const refreshTick = useRef(0);

  const load = async () => {
    setLoading(true);
    const today = new Date();
    let query = supabase.from("rides").select("*").eq("system", system).not("flight_number", "is", null);

    if (filter === "yesterday") {
      const y = new Date(today); y.setDate(y.getDate() - 1);
      query = query.eq("ride_date", ymd(y));
    } else if (filter === "today") {
      query = query.eq("ride_date", ymd(today));
    } else if (filter === "tomorrow") {
      const tmr = new Date(today); tmr.setDate(tmr.getDate() + 1);
      query = query.eq("ride_date", ymd(tmr));
    } else if (filter === "this_week") {
      const ws = new Date(today); ws.setDate(ws.getDate() - ws.getDay());
      const we = new Date(ws); we.setDate(we.getDate() + 6);
      query = query.gte("ride_date", ymd(ws)).lte("ride_date", ymd(we));
    } else if (filter === "this_month") {
      const ms = new Date(today.getFullYear(), today.getMonth(), 1);
      const me = new Date(today.getFullYear(), today.getMonth() + 1, 0);
      query = query.gte("ride_date", ymd(ms)).lte("ride_date", ymd(me));
    } else if (filter === "custom") {
      query = query.eq("ride_date", customDate);
    }

    const [{ data: rData }, { data: dData }] = await Promise.all([
      query.order("ride_date").order("pickup_time"),
      supabase.from("drivers").select("id, name").eq("system", system),
    ]);
    setRides(rData ?? []);
    setDrivers(dData ?? []);
    setLoading(false);
  };

  useEffect(() => { load(); }, [system, filter, customDate]);

  useEffect(() => {
    const interval = setInterval(() => { refreshTick.current++; load(); }, 60000);
    return () => clearInterval(interval);
  }, [system, filter, customDate]);

  const flightRows = useMemo(() => {
    let filtered = rides;
    if (searchTerm) {
      const s = searchTerm.toLowerCase();
      filtered = rides.filter((r) =>
        (r.flight_number ?? "").toLowerCase().includes(s) ||
        (r.pickup_location ?? "").toLowerCase().includes(s) ||
        (r.passenger_name ?? "").toLowerCase().includes(s)
      );
    }
    return filtered
      .map((r) => ({ ride: r, code: extractFlightCode(r.flight_number) }))
      .filter((x) => !!x.code);
  }, [rides, searchTerm]);

  // Auto-fetch live data for every visible flight
  useEffect(() => {
    let cancelled = false;
    (async () => {
      for (const { ride, code } of flightRows) {
        if (cancelled || !code) continue;
        const k = ride.id;
        setLiveData((p) => ({ ...p, [k]: { ...(p[k] ?? { info: null }), loading: true } }));
        const res = await lookupFlight(code, ride.ride_date);
        if (cancelled) return;
        setLiveData((p) => ({ ...p, [k]: { info: res.info, error: res.error, loading: false } }));
      }
    })();
    return () => { cancelled = true; };
  }, [flightRows.map((f) => `${f.ride.id}:${f.code}:${f.ride.ride_date}`).join("|"), refreshTick.current]);

  void drivers;

  // Detect flights with arrival times within 30 min of each other
  const closeArrivals = useMemo(() => {
    const set = new Set<string>();
    const items: { id: string; t: number }[] = [];
    for (const { ride } of flightRows) {
      const live = liveData[ride.id]?.info;
      const a = live?.arrival?.estimated ?? live?.arrival?.actual ?? live?.arrival?.scheduled;
      if (!a) continue;
      const t = new Date(a).getTime();
      if (!isFinite(t)) continue;
      items.push({ id: ride.id, t });
    }
    for (let i = 0; i < items.length; i++) {
      for (let j = i + 1; j < items.length; j++) {
        if (Math.abs(items[i].t - items[j].t) <= 30 * 60 * 1000) {
          set.add(items[i].id); set.add(items[j].id);
        }
      }
    }
    return set;
  }, [flightRows, liveData]);

  const refreshAll = () => {
    flightCache.clear();
    refreshTick.current++;
    load();
  };

  if (loading) return <PageLoader />;

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-xl font-bold text-foreground flex items-center gap-2">
            <Plane className="w-5 h-5 text-[#6C63FF]" /> Flight Tracker
          </h1>
          <p className="text-sm text-muted-foreground">Live status auto-loaded for every tracked flight • Refreshes every 60s</p>
        </div>
        <Button variant="outline" size="sm" onClick={refreshAll} className="gap-1 border-border text-foreground/80 hover:text-foreground">
          <RefreshCw className="w-3.5 h-3.5" /> Refresh
        </Button>
      </div>

      <div className="flex flex-wrap gap-3 items-center">
        <Select value={filter} onValueChange={(v) => setFilter(v as DateFilter)}>
          <SelectTrigger className="input-luxury w-44"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="today">Today</SelectItem>
            <SelectItem value="tomorrow">Tomorrow</SelectItem>
            <SelectItem value="yesterday">Yesterday</SelectItem>
            <SelectItem value="this_week">This Week</SelectItem>
            <SelectItem value="this_month">This Month</SelectItem>
            <SelectItem value="all">All Flights</SelectItem>
            <SelectItem value="custom">Specific Date</SelectItem>
          </SelectContent>
        </Select>
        {filter === "custom" && (
          <Input type="date" value={customDate} onChange={(e) => setCustomDate(e.target.value)} className="input-luxury w-44" />
        )}
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/50" />
          <Input value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} placeholder="Search flights..." className="input-luxury pl-9" />
        </div>
        <Badge className="bg-muted/50 text-muted-foreground border-border">{flightRows.length} flights</Badge>
      </div>

      {flightRows.length === 0 ? (
        <Card className="luxury-card p-12 text-center">
          <Plane className="w-12 h-12 mx-auto text-muted-foreground/40 mb-3" />
          <p className="text-muted-foreground/70">No tracked flights for the selected filter</p>
        </Card>
      ) : (
        <div className="space-y-3">
          {flightRows.map(({ ride: r, code }) => {
            const fn = stripTrailingTime(r.flight_number).toUpperCase();
            const live = liveData[r.id];
            const info = live?.info;
            const dep = info?.departure; const arr = info?.arrival;
            const delay = (dep?.delay ?? 0) || (arr?.delay ?? 0);
            return (
              <Card key={r.id} className="luxury-card overflow-hidden">
                <div className="px-4 py-3 border-b border-border flex items-center justify-between flex-wrap gap-2">
                  <div className="flex items-center gap-3">
                    <div className="h-9 w-9 rounded-lg bg-[#6C63FF]/20 grid place-items-center">
                      <Plane className="w-4 h-4 text-[#6C63FF]" />
                    </div>
                    <div>
                      <span className="font-bold text-foreground text-sm">{fn}</span>
                      <span className="ml-2 text-xs text-muted-foreground/70">{r.ride_date}</span>
                      {info?.airline?.name && <span className="ml-2 text-xs text-muted-foreground">· {info.airline.name}</span>}
                      {r.passenger_name && <span className="ml-2 text-xs text-muted-foreground">· {r.passenger_name}</span>}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {live?.loading ? (
                      <Badge className="bg-muted/40 text-muted-foreground border-border text-[10px] gap-1">
                        <Loader2 className="w-3 h-3 animate-spin" /> Loading
                      </Badge>
                    ) : info?.flight_status ? (
                      <Badge className={`${statusColor(info.flight_status)} text-[10px] border uppercase`}>
                        {info.flight_status}
                      </Badge>
                    ) : live?.error ? (
                      <Badge className="bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30 text-[10px] gap-1">
                        <AlertTriangle className="w-3 h-3" /> No live data
                      </Badge>
                    ) : null}
                    {delay > 0 && (
                      <Badge className="bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30 text-[10px]">
                        Delay {delay}m
                      </Badge>
                    )}
                    {closeArrivals.has(r.id) && (
                      <Badge className="bg-orange-500/20 text-orange-700 dark:text-orange-300 border-orange-500/40 text-[10px] gap-1">
                        <AlertTriangle className="w-3 h-3" /> Close arrival
                      </Badge>
                    )}
                    <Badge className="bg-muted/50 text-muted-foreground border-border text-[10px]">
                      <Users className="w-3 h-3 mr-1" /> {r.riders ?? 1}
                    </Badge>
                  </div>
                </div>

                {/* Live route panel */}
                {info ? (
                  <div className="px-4 py-3 grid grid-cols-1 md:grid-cols-2 gap-4 border-b border-border bg-muted/10">
                    <div className="space-y-1">
                      <div className="text-[10px] uppercase tracking-wider text-muted-foreground/70">Departure</div>
                      <div className="font-semibold text-foreground text-sm flex items-center gap-2">
                        <MapPin className="w-3.5 h-3.5 text-emerald-500" />
                        {dep?.iata ?? "—"} <span className="text-muted-foreground font-normal text-xs">{dep?.airport ?? ""}</span>
                      </div>
                      <div className="text-xs text-muted-foreground">Terminal {dep?.terminal ?? "—"} · Gate {dep?.gate ?? "—"}</div>
                      <div className="flex gap-3 text-xs">
                        <span><span className="text-muted-foreground">Sched</span> <b className="text-foreground/90">{fmtTime(dep?.scheduled)}</b></span>
                        <span><span className="text-muted-foreground">Est</span> <b className="text-foreground/90">{fmtTime(dep?.estimated)}</b></span>
                        {dep?.actual && <span><span className="text-muted-foreground">Actual</span> <b className="text-emerald-500">{fmtTime(dep.actual)}</b></span>}
                      </div>
                    </div>
                    <div className="space-y-1">
                      <div className="text-[10px] uppercase tracking-wider text-muted-foreground/70">Arrival</div>
                      <div className="font-semibold text-foreground text-sm flex items-center gap-2">
                        <MapPin className="w-3.5 h-3.5 text-blue-500" />
                        {arr?.iata ?? "—"} <span className="text-muted-foreground font-normal text-xs">{arr?.airport ?? ""}</span>
                      </div>
                      <div className="text-xs text-muted-foreground">Terminal {arr?.terminal ?? "—"} · Gate {arr?.gate ?? "—"}</div>
                      <div className="flex gap-3 text-xs">
                        <span><span className="text-muted-foreground">Sched</span> <b className="text-foreground/90">{fmtTime(arr?.scheduled)}</b></span>
                        <span><span className="text-muted-foreground">Est</span> <b className="text-foreground/90">{fmtTime(arr?.estimated)}</b></span>
                        {arr?.actual && <span><span className="text-muted-foreground">Actual</span> <b className="text-emerald-500">{fmtTime(arr.actual)}</b></span>}
                      </div>
                    </div>
                    {(info.aircraft || info.live) && (
                      <div className="md:col-span-2 text-[11px] text-muted-foreground border-t border-border/60 pt-2 flex flex-wrap gap-x-4 gap-y-1">
                        {info.aircraft?.model && <span>Aircraft: <b className="text-foreground/80">{info.aircraft.model}</b></span>}
                        {info.aircraft?.registration && <span>Reg: <b className="text-foreground/80">{info.aircraft.registration}</b></span>}
                        {info.live && <span>{info.live.is_ground ? "On ground" : "Airborne"}{typeof info.live.altitude === "number" ? ` · ${Math.round(info.live.altitude)}m` : ""}{typeof info.live.speed_horizontal === "number" ? ` · ${Math.round(info.live.speed_horizontal)}km/h` : ""}</span>}
                        {info.live?.updated && <span>Updated {fmtTime(info.live.updated)}</span>}
                      </div>
                    )}
                  </div>
                ) : live?.error ? (
                  <div className="px-4 py-2 text-xs text-amber-600 dark:text-amber-400 border-b border-border bg-amber-500/5">
                    Live data unavailable: {live.error}
                  </div>
                ) : null}

                {/* Ride details */}
                <div className="px-4 py-3 grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                  <div>
                    <div className="text-muted-foreground/70 uppercase tracking-wider text-[10px] mb-0.5">Pickup time</div>
                    <div className="text-foreground/90 inline-flex items-center gap-1">
                      <Clock className="w-3 h-3 text-muted-foreground/50" /> {r.pickup_time || "—"}
                    </div>
                  </div>
                  <div>
                    <div className="text-muted-foreground/70 uppercase tracking-wider text-[10px] mb-0.5">Pickup</div>
                    <div className="text-foreground/90">{r.pickup_location || "—"}</div>
                  </div>
                  <div>
                    <div className="text-muted-foreground/70 uppercase tracking-wider text-[10px] mb-0.5">Dropoff</div>
                    <div className="text-foreground/90">{r.dropoff_location || "—"}</div>
                  </div>
                  <div>
                    <div className="text-muted-foreground/70 uppercase tracking-wider text-[10px] mb-0.5">Driver</div>
                    <div className="text-foreground/90">{driverName(r.driver_id) || <span className="text-muted-foreground/50">Unassigned</span>}</div>
                  </div>
                </div>

                <div className="px-4 pb-3 flex items-center justify-between gap-2 flex-wrap">
                  <Badge className={`text-[10px] ${r.status === "completed" ? "bg-emerald-500/20 text-emerald-400" : r.status === "pending" ? "bg-gray-500/20 text-gray-400" : "bg-blue-500/20 text-blue-400"}`}>
                    {r.status}
                  </Badge>
                  {code && (
                    <a
                      href={flightAwareUrl(code)}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 rounded-md border border-border bg-muted px-2.5 py-1 text-xs font-medium text-foreground hover:bg-secondary transition-colors"
                    >
                      <Plane className="w-3 h-3" /> Flight Aware <ExternalLink className="w-3 h-3 opacity-70" />
                    </a>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
