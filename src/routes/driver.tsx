import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { toast } from "react-hot-toast";
import { playNotificationSound } from "@/lib/sound";
import { LogOut, CalendarDays, Clock, MapPin, User, Phone, Plane, CheckCircle2, XCircle, Hourglass, ListChecks, ShieldCheck, Sparkles, ArrowRight } from "lucide-react";
import { extractDropoffTime, stripTrailingTime, type Ride, type RideStatus } from "@/lib/rides";
import { SYSTEM_LABELS, type WorkspaceSystem } from "@/lib/system";
import driverHero from "@/assets/driver-hero.jpg";
import { FlightTrackLink, FlightSearchButton } from "@/components/FlightTrackLink";
import { DriverNotificationBell } from "@/components/DriverNotificationBell";

export const Route = createFileRoute("/driver")({ component: DriverPortal });

const STORAGE_KEY = "psl.driver.session";

function parsePickup(date: string, time: string): number | null {
  const s = (time ?? "").trim();
  let h = 0, m = 0;
  const ampm = s.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (ampm) {
    h = parseInt(ampm[1], 10);
    m = parseInt(ampm[2], 10);
    const isPm = ampm[3].toUpperCase() === "PM";
    if (h === 12) h = isPm ? 12 : 0;
    else if (isPm) h += 12;
  } else {
    const hm = s.match(/^(\d{1,2}):(\d{2})/);
    if (!hm) return null;
    h = parseInt(hm[1], 10);
    m = parseInt(hm[2], 10);
  }
  const d = new Date(`${date}T00:00:00`);
  if (isNaN(d.getTime())) return null;
  d.setHours(h, m, 0, 0);
  return d.getTime();
}

interface DriverSession {
  driverId: string;
  pin: string;
  name: string;
  system: WorkspaceSystem;
}

// Force light theme on the driver portal regardless of admin's saved theme.
function useForceLightTheme() {
  useEffect(() => {
    if (typeof document === "undefined") return;
    const el = document.documentElement;
    const had = el.classList.contains("dark");
    el.classList.remove("dark");
    return () => { if (had) el.classList.add("dark"); };
  }, []);
}

// Stable per-device client key for rate limiting — never identifies the user.
function getClientKey(): string {
  if (typeof window === "undefined") return "ssr";
  try {
    const k = "psl.driver.clientKey";
    let v = window.localStorage.getItem(k);
    if (!v) {
      v = (crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`);
      window.localStorage.setItem(k, v);
    }
    return v;
  } catch { return "anon"; }
}

function loadSession(): DriverSession | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as DriverSession) : null;
  } catch { return null; }
}

function saveSession(s: DriverSession | null) {
  if (typeof window === "undefined") return;
  if (s) window.localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
  else window.localStorage.removeItem(STORAGE_KEY);
}

function DriverPortal() {
  useForceLightTheme();
  const [session, setSession] = useState<DriverSession | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setSession(loadSession());
    setReady(true);
  }, []);

  if (!ready) return null;
  if (!session) return <DriverLogin onSuccess={(s) => { saveSession(s); setSession(s); }} />;
  return <DriverHome session={session} onLogout={() => { saveSession(null); setSession(null); }} />;
}

function DriverLogin({ onSuccess }: { onSuccess: (s: DriverSession) => void }) {
  const [system, setSystem] = useState<WorkspaceSystem>("api");
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = pin.trim();
    if (!trimmed) return;
    if (trimmed.length < 4) return toast.error("PIN must be at least 4 digits");
    setBusy(true);
    const { data, error } = await supabase.rpc("driver_login", {
      _pin: trimmed, _system: system, _client_key: getClientKey(),
    });
    setBusy(false);
    if (error) return toast.error(error.message);
    const row = Array.isArray(data) ? data[0] : data;
    if (!row) return toast.error("Invalid PIN for this workspace");
    onSuccess({ driverId: row.id, pin: trimmed, name: row.name, system });
    toast.success(`Welcome, ${row.name}`);
  };

  return (
    <div className="min-h-screen grid lg:grid-cols-2 bg-white text-slate-900">
      {/* Left visual panel */}
      <div className="relative hidden lg:block overflow-hidden">
        <img
          src={driverHero}
          alt="Professional chauffeur next to luxury SUV at night"
          className="absolute inset-0 h-full w-full object-cover"
          width={1920}
          height={1080}
        />
        <div className="absolute inset-0 bg-gradient-to-br from-slate-950/85 via-slate-950/55 to-slate-950/30" />
        {/* glow accents */}
        <div className="absolute -top-24 -left-24 w-96 h-96 rounded-full bg-amber-400/15 blur-3xl animate-pulse" />
        <div className="absolute -bottom-24 -right-24 w-96 h-96 rounded-full bg-sky-400/15 blur-3xl animate-pulse" style={{ animationDelay: "1.5s" }} />

        <div className="relative z-10 flex flex-col justify-between h-full p-12 text-white animate-fade-in">
          <div>
            <div className="text-lg font-bold tracking-tight">Puget Sound Limo</div>
            <div className="text-[11px] uppercase tracking-[0.18em] text-white/60">Driver portal</div>
          </div>
          <div>
            <span className="inline-flex items-center gap-2 text-xs font-medium px-3 py-1.5 rounded-full bg-white/10 ring-1 ring-white/15 mb-4">
              <Sparkles className="h-3.5 w-3.5 text-amber-300" /> Your schedule, simplified
            </span>
            <h1 className="text-5xl font-bold leading-[1.05]">
              Drive with
              <br />
              <span className="bg-gradient-to-r from-amber-300 to-orange-400 bg-clip-text text-transparent">confidence.</span>
            </h1>
            <p className="mt-4 text-white/85 max-w-md">
              See today's pickups, get SMS alerts an hour before each ride, and update status with one tap.
            </p>
          </div>
          <div className="text-xs text-white/50">© {new Date().getFullYear()} Puget Sound Limo</div>
        </div>
      </div>

      {/* Right form panel */}
      <div className="flex items-center justify-center p-6 bg-gradient-to-br from-white via-slate-50 to-amber-50/40 relative">
        {/* Mobile mini hero */}
        <div className="lg:hidden absolute top-0 left-0 right-0 h-44 overflow-hidden">
          <img src={driverHero} alt="" className="w-full h-full object-cover" width={1600} height={600} />
          <div className="absolute inset-0 bg-gradient-to-b from-slate-950/70 to-slate-950/90" />
          <div className="absolute inset-0 flex flex-col items-center justify-center text-white">
            <span className="text-lg font-bold tracking-tight">Puget Sound Limo</span>
            <span className="text-[10px] uppercase tracking-[0.18em] text-white/60 mt-0.5">Driver portal</span>
          </div>
        </div>

        <Card className="w-full max-w-md p-7 sm:p-8 shadow-2xl border-slate-200 mt-48 lg:mt-0 animate-fade-in">
          <div className="mb-6 flex items-center gap-3">
            <span className="h-11 w-11 rounded-xl bg-gradient-to-br from-amber-400 to-orange-500 grid place-items-center text-white shadow-lg shadow-orange-500/20">
              <ShieldCheck className="h-5 w-5" />
            </span>
            <div>
              <h1 className="text-2xl font-bold tracking-tight">Driver sign in</h1>
              <p className="text-sm text-slate-500">Enter your PIN to view your rides</p>
            </div>
          </div>
          <form onSubmit={submit} className="space-y-4">
            <div className="space-y-2">
              <Label className="text-slate-700 font-medium">Workspace</Label>
              <Select value={system} onValueChange={(v) => setSystem(v as WorkspaceSystem)}>
                <SelectTrigger className="h-11"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="api">{SYSTEM_LABELS.api}</SelectItem>
                  <SelectItem value="llc">{SYSTEM_LABELS.llc}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="pin" className="text-slate-700 font-medium">PIN</Label>
              <Input
                id="pin"
                inputMode="numeric"
                autoFocus
                value={pin}
                onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 8))}
                placeholder="••••"
                className="h-14 text-2xl tracking-[0.5em] text-center font-semibold"
              />
            </div>
            <Button type="submit" className="w-full h-12 text-base font-semibold bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white shadow-lg shadow-orange-500/20" disabled={busy || !pin}>
              {busy ? "Signing in…" : (<>Sign in <ArrowRight className="h-4 w-4 ml-1.5" /></>)}
            </Button>
            <p className="text-xs text-slate-500 text-center pt-1">
              Don't have a PIN? Ask the dispatcher to set one for you.
            </p>
            <div className="flex items-center justify-between text-xs pt-2 border-t border-slate-100">
              <a href="/" className="text-amber-600 hover:underline font-medium">← Back to home</a>
              <a href="/login" className="text-slate-500 hover:text-slate-700">Admin sign in →</a>
            </div>
          </form>
        </Card>
      </div>
    </div>
  );
}

const statusTone: Record<RideStatus, string> = {
  pending: "bg-slate-200 text-slate-900 dark:bg-slate-700 dark:text-slate-100",
  arrived: "bg-sky-100 text-sky-900 dark:bg-sky-900/40 dark:text-sky-100",
  completed: "bg-emerald-100 text-emerald-900 dark:bg-emerald-900/40 dark:text-emerald-100",
  cancelled: "bg-rose-100 text-rose-900 dark:bg-rose-900/40 dark:text-rose-100",
  no_show: "bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-100",
};

function DriverHome({ session, onLogout }: { session: DriverSession; onLogout: () => void }) {
  const [rides, setRides] = useState<Ride[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<"list" | "calendar">("list");
  const [filter, setFilter] = useState<"upcoming" | "today" | "past" | "all">("upcoming");

  const load = async (silent = false) => {
    if (!silent) setLoading(true);
    const { data, error } = await supabase.rpc("driver_rides", {
      _driver_id: session.driverId,
      _pin: session.pin,
    });
    if (error) {
      toast.error(error.message);
      onLogout();
      return;
    }
    setRides((data as Ride[]) ?? []);
    setLoading(false);
  };

  useEffect(() => {
    load();
    // Realtime: refresh whenever a ride changes (admin reassign, status, etc.)
    const ch = supabase
      .channel(`driver-rides-${session.driverId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "rides" }, () => load(true))
      .subscribe();
    // Lightweight poll as a safety net
    const t = setInterval(() => load(true), 60_000);
    return () => { supabase.removeChannel(ch); clearInterval(t); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.driverId]);

  // 1-hour-before pickup reminder (in-app toast + sound).
  // Persists fired-ride keys in localStorage so we don't repeat after a refresh.
  useEffect(() => {
    const KEY = "psl.driver.firedHourReminders";
    const fired: Set<string> = new Set(
      (() => { try { return JSON.parse(localStorage.getItem(KEY) ?? "[]") as string[]; } catch { return []; } })()
    );
    const tick = () => {
      const now = Date.now();
      for (const r of rides) {
        if (!r.pickup_time || !r.ride_date) continue;
        if (r.status === "cancelled" || r.status === "completed") continue;
        const pickup = parsePickup(r.ride_date, r.pickup_time);
        if (!pickup) continue;
        const minsUntil = (pickup - now) / 60000;
        if (minsUntil <= 60 && minsUntil > 55 && !fired.has(r.id)) {
          fired.add(r.id);
          try { localStorage.setItem(KEY, JSON.stringify(Array.from(fired))); } catch { /* noop */ }
          playNotificationSound();
          toast(`Pickup in ~1 hour: ${r.passenger_name ?? "Passenger"} • ${r.pickup_time}`, { duration: 8000, icon: "⏰" });
        }
      }
    };
    tick();
    const t = setInterval(tick, 60_000);
    return () => clearInterval(t);
  }, [rides]);

  // In-system notifications are now handled by <DriverNotificationBell />.

  const setStatus = async (rideId: string, status: RideStatus) => {
    const { error } = await supabase.rpc("driver_update_ride_status", {
      _driver_id: session.driverId,
      _pin: session.pin,
      _ride_id: rideId,
      _status: status,
    });
    if (error) return toast.error(error.message);
    toast.success(`Marked as ${status.replace("_", " ")}`);
    setRides((rs) => rs.map((r) => (r.id === rideId ? { ...r, status } : r)));
  };

  const today = new Date().toISOString().slice(0, 10);
  const filtered = useMemo(() => {
    if (filter === "today") return rides.filter((r) => r.ride_date === today);
    if (filter === "upcoming") return rides.filter((r) => r.ride_date >= today);
    if (filter === "past") return rides.filter((r) => r.ride_date < today);
    return rides;
  }, [rides, filter, today]);

  const counts = useMemo(() => ({
    today: rides.filter((r) => r.ride_date === today).length,
    upcoming: rides.filter((r) => r.ride_date >= today).length,
    completedToday: rides.filter((r) => r.ride_date === today && r.status === "completed").length,
  }), [rides, today]);

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card">
        <div className="max-w-5xl mx-auto px-4 h-16 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="font-semibold truncate">{session.name}</div>
            <div className="text-xs text-muted-foreground truncate">{SYSTEM_LABELS[session.system]}</div>
          </div>
          <div className="flex items-center gap-1">
            <DriverNotificationBell driverId={session.driverId} pin={session.pin} />
            <Button variant="ghost" size="sm" onClick={onLogout}>
              <LogOut className="h-4 w-4 mr-1" /> Sign out
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-6">
        {/* Summary tiles — no money/totals */}
        <div className="grid grid-cols-3 gap-3 mb-5">
          <Tile icon={<CalendarDays className="h-4 w-4" />} label="Today" value={counts.today} />
          <Tile icon={<Hourglass className="h-4 w-4" />} label="Upcoming" value={counts.upcoming} />
          <Tile icon={<CheckCircle2 className="h-4 w-4" />} label="Completed today" value={counts.completedToday} />
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
          <div className="flex items-center gap-1 bg-muted rounded-md p-1">
            {(["upcoming", "today", "past", "all"] as const).map((k) => (
              <button
                key={k}
                onClick={() => setFilter(k)}
                className={`px-3 py-1.5 rounded text-sm font-medium capitalize ${filter === k ? "bg-background shadow-sm" : "text-muted-foreground"}`}
              >
                {k}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-1 bg-muted rounded-md p-1">
            <button
              onClick={() => setView("list")}
              className={`px-3 py-1.5 rounded text-sm font-medium flex items-center gap-1 ${view === "list" ? "bg-background shadow-sm" : "text-muted-foreground"}`}
            >
              <ListChecks className="h-4 w-4" /> List
            </button>
            <button
              onClick={() => setView("calendar")}
              className={`px-3 py-1.5 rounded text-sm font-medium flex items-center gap-1 ${view === "calendar" ? "bg-background shadow-sm" : "text-muted-foreground"}`}
            >
              <CalendarDays className="h-4 w-4" /> Calendar
            </button>
          </div>
        </div>

        {loading ? (
          <Card className="p-8 text-center text-muted-foreground">Loading rides…</Card>
        ) : filtered.length === 0 ? (
          <Card className="p-8 text-center text-muted-foreground">No rides in this view.</Card>
        ) : view === "list" ? (
          <div className="space-y-3">
            {filtered.map((r) => (
              <RideCard key={r.id} ride={r} onSetStatus={(s) => setStatus(r.id, s)} />
            ))}
          </div>
        ) : (
          <CalendarView rides={filtered} />
        )}
      </main>
    </div>
  );
}

function Tile({ icon, label, value }: { icon: React.ReactNode; label: string; value: number }) {
  return (
    <Card className="p-3">
      <div className="text-xs text-muted-foreground flex items-center gap-1">{icon} {label}</div>
      <div className="text-2xl font-bold mt-1">{value}</div>
    </Card>
  );
}

function RideCard({ ride, onSetStatus }: { ride: Ride; onSetStatus: (s: RideStatus) => void }) {
  const dropoffTime = extractDropoffTime(ride);
  const cleanDropoff = stripTrailingTime(ride.dropoff_to) || ride.dropoff_to;
  const cleanFlight = stripTrailingTime(ride.flight_number ?? "") || ride.flight_number;
  return (
    <Card className="overflow-hidden p-0 shadow-sm hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between gap-2 px-4 sm:px-5 pt-4 pb-2 border-b bg-muted/30">
        <div className="flex items-center gap-2 text-sm min-w-0">
          <CalendarDays className="h-4 w-4 text-muted-foreground shrink-0" />
          <span className="font-bold text-foreground truncate">{ride.ride_date}</span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className={`text-[10px] sm:text-xs font-semibold px-2 py-1 rounded-full ${statusTone[ride.status]}`}>
            {ride.status.replace("_", " ")}
          </span>
          <FlightSearchButton ride={ride} />
        </div>
      </div>

      <div className="px-4 sm:px-5 py-3 grid gap-2 text-sm">
        <div className="flex flex-wrap gap-2">
          <div className="flex-1 min-w-[120px] rounded-md border border-primary/30 bg-primary/5 px-2.5 py-1.5">
            <div className="text-[9px] uppercase tracking-wider font-bold text-primary/80">Pickup</div>
            <div className="text-sm font-bold tabular-nums leading-tight">{ride.pickup_time ?? "—"}</div>
          </div>
          <div className="flex-1 min-w-[120px] rounded-md border border-border bg-muted/40 px-2.5 py-1.5">
            <div className="text-[9px] uppercase tracking-wider font-bold text-muted-foreground">Dropoff</div>
            <div className="text-sm font-bold tabular-nums leading-tight">{dropoffTime ?? "—"}</div>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <User className="h-4 w-4 text-muted-foreground shrink-0" />
          <span className="font-medium truncate">{ride.passenger_name ?? "Passenger"}</span>
          <span className="text-xs px-2 py-0.5 rounded-full bg-secondary text-secondary-foreground font-bold">
            {ride.riders ?? 1} {(ride.riders ?? 1) === 1 ? "passenger" : "passengers"}
          </span>
        </div>
        {ride.phone && (
          <div className="flex items-center gap-2"><Phone className="h-4 w-4 text-muted-foreground shrink-0" /> <a href={`tel:${ride.phone}`} className="text-primary hover:underline truncate">{ride.phone}</a></div>
        )}
        {cleanFlight && (
          <div className="flex items-center gap-2"><Plane className="h-4 w-4 text-muted-foreground shrink-0" /> <span className="font-bold truncate"><FlightTrackLink flightNumber={cleanFlight} /></span></div>
        )}
        <div className="flex items-start gap-2">
          <MapPin className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
          <div className="min-w-0 break-words">
            <div className="font-medium">{ride.pickup_location ?? "—"}{ride.pickup_from ? ` (${ride.pickup_from})` : ""}</div>
            <div>→ <span className="font-medium">{cleanDropoff ?? "—"}</span></div>
          </div>
        </div>
        {ride.notes && (
          <div className="text-xs text-muted-foreground italic break-words">Note: {ride.notes}</div>
        )}
      </div>

      <div className="px-4 sm:px-5 pb-4 pt-1 flex flex-wrap gap-2">
        <Button size="sm" variant={ride.status === "arrived" ? "default" : "outline"} onClick={() => onSetStatus("arrived")} className="flex-1 sm:flex-none min-w-[90px]">
          Arrived
        </Button>
        <Button size="sm" variant={ride.status === "completed" ? "default" : "outline"} onClick={() => onSetStatus("completed")} className="flex-1 sm:flex-none min-w-[110px]">
          <CheckCircle2 className="h-4 w-4 mr-1" /> Complete
        </Button>
        <Button size="sm" variant="outline" onClick={() => onSetStatus("no_show")} className="flex-1 sm:flex-none min-w-[90px]">
          No-show
        </Button>
        <Button size="sm" variant="outline" onClick={() => onSetStatus("cancelled")} className="flex-1 sm:flex-none min-w-[100px]">
          <XCircle className="h-4 w-4 mr-1" /> Cancel
        </Button>
      </div>
    </Card>
  );
}

function CalendarView({ rides }: { rides: Ride[] }) {
  const byDate = useMemo(() => {
    const m = new Map<string, Ride[]>();
    for (const r of rides) {
      const arr = m.get(r.ride_date) ?? [];
      arr.push(r);
      m.set(r.ride_date, arr);
    }
    return Array.from(m.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [rides]);

  return (
    <div className="space-y-4">
      {byDate.map(([date, items]) => (
        <Card key={date} className="p-4">
          <div className="font-semibold mb-2">{new Date(date).toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" })}</div>
          <div className="space-y-1.5">
            {items.map((r) => (
              <div key={r.id} className="flex items-center gap-3 text-sm border rounded px-2 py-1.5">
                <span className="font-mono text-xs w-14">{r.pickup_time ?? "—"}</span>
                <span className="truncate flex-1">
                  {r.passenger_name ?? "Passenger"} • {r.pickup_location ?? "—"} → {r.dropoff_location ?? "—"}
                </span>
                <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${statusTone[r.status]}`}>
                  {r.status.replace("_", " ")}
                </span>
              </div>
            ))}
          </div>
        </Card>
      ))}
    </div>
  );
}
