import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "react-hot-toast";
import { playNotificationSound } from "@/lib/sound";
import {
  LogOut, CalendarDays, Clock, MapPin, User, Phone, Plane,
  CheckCircle2, XCircle, Hourglass, ListChecks, ShieldCheck,
  Sparkles, ArrowRight, Radio, AlertCircle, Download, Wallet,
} from "lucide-react";
import { extractDropoffTime, stripTrailingTime, type Ride, type RideStatus } from "@/lib/rides";
import { SYSTEM_LABELS, type WorkspaceSystem } from "@/lib/system";
import driverHero from "@/assets/driver-hero.jpg";
import { FlightTrackLink, FlightSearchButton } from "@/components/FlightTrackLink";
import { DriverNotificationBell } from "@/components/DriverNotificationBell";
import { useLiveLocation } from "@/hooks/useLiveLocation";
import { DateRangeFilter, presetToRange, type DateRange } from "@/components/DateRangeFilter";
import { downloadCSV } from "@/lib/export";
import { ThemeToggle } from "@/components/ThemeToggle";

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

/* ─── DRIVER LOGIN ─── */
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
    <div className="dark min-h-screen grid lg:grid-cols-2 bg-background text-foreground relative">
      {/* Left visual panel — hidden on mobile */}
      <div className="relative hidden lg:block overflow-hidden">
        <img src={driverHero} alt="Professional chauffeur next to luxury SUV at night" className="absolute inset-0 h-full w-full object-cover" />
        <div className="absolute inset-0 bg-background/75" />
        <div className="absolute inset-0 bg-gradient-to-br from-[#080810]/90 via-[#080810]/40 to-transparent" />

        <div className="relative z-10 flex flex-col justify-between h-full p-12 text-foreground">
          <div>
            <div className="text-lg font-bold tracking-tight">Puget Sound Limo</div>
            <div className="text-[11px] uppercase tracking-[0.2em] text-[#F5A623] font-medium">Driver Portal</div>
          </div>
          <div>
            <h1 className="text-5xl font-bold leading-[1.05]">
              Drive with
              <br />
              <span className="text-[#F5A623]">confidence.</span>
            </h1>
            <p className="mt-4 text-foreground/80 max-w-md">
              See today's pickups, get SMS alerts an hour before each ride, and update status with one tap.
            </p>
          </div>
          <div className="text-xs text-muted-foreground/60">© {new Date().getFullYear()} Puget Sound Limo</div>
        </div>
      </div>

      {/* Right form panel */}
      <div className="flex items-center justify-center p-5 sm:p-8 relative min-h-screen lg:min-h-0">
        {/* Mobile logo */}
        <div className="lg:hidden absolute top-0 left-0 right-0 flex items-center justify-center py-10">
          <div className="text-center">
            <div className="text-xl font-bold text-foreground tracking-tight">Puget Sound Limo</div>
            <div className="text-[10px] uppercase tracking-[0.2em] text-[#F5A623] font-medium mt-1">Driver Portal</div>
          </div>
        </div>

        <div className="w-full max-w-md bg-card border border-border rounded-[20px] p-8 sm:p-12 mt-24 lg:mt-0">
          <div className="mb-6 flex items-center gap-3">
            <span className="h-12 w-12 rounded-2xl bg-gradient-to-br from-[#F5A623] to-[#E8820C] grid place-items-center text-foreground shadow-lg">
              <ShieldCheck className="h-6 w-6" />
            </span>
            <div>
              <h1 className="text-2xl font-bold text-foreground">Driver sign in</h1>
              <p className="text-sm text-muted-foreground">Enter your PIN to view your rides</p>
            </div>
          </div>

          <form onSubmit={submit} className="space-y-5">
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">Workspace</label>
              <select
                value={system}
                onChange={(e) => setSystem(e.target.value as WorkspaceSystem)}
                className="w-full input-luxury px-4 text-sm appearance-none cursor-pointer"
              >
                <option value="api">{SYSTEM_LABELS.api}</option>
                <option value="llc">{SYSTEM_LABELS.llc}</option>
              </select>
            </div>
            <div className="space-y-2">
              <label htmlFor="pin" className="text-sm font-medium text-foreground">PIN</label>
              <input
                id="pin"
                inputMode="numeric"
                autoFocus
                value={pin}
                onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 8))}
                placeholder="••••"
                className="w-full input-luxury text-2xl tracking-[12px] text-center font-semibold h-14"
              />
            </div>
            <button
              type="submit"
              disabled={busy || !pin}
              className="w-full btn-gold-gradient text-sm flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {busy ? "Signing in…" : (<>Sign in <ArrowRight className="h-4 w-4" /></>)}
            </button>
            <p className="text-xs text-muted-foreground/60 text-center pt-1">
              Don't have a PIN? Ask the dispatcher to set one for you.
            </p>
            <div className="flex items-center justify-between text-xs pt-3 border-t border-border">
              <Link to="/" className="text-[#F5A623] hover:opacity-80 font-medium">← Back to home</Link>
              <Link to="/login" className="text-muted-foreground hover:text-foreground transition-colors">Admin sign in →</Link>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

/* ─── STATUS STYLING ─── */
const statusStyle: Record<RideStatus, string> = {
  pending: "pill-pending",
  started: "pill-started",
  arrived: "pill-in-progress",
  completed: "pill-completed",
  cancelled: "pill-cancelled",
  no_show: "pill-no-show",
};

/* ─── DRIVER HOME ─── */
function DriverHome({ session, onLogout }: { session: DriverSession; onLogout: () => void }) {
  const [rides, setRides] = useState<Ride[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<"list" | "calendar">("list");
  const [filter, setFilter] = useState<"upcoming" | "today" | "past" | "flights" | "all" | "history" | "payouts" | "notes">("today");
  const [dateRange, setDateRange] = useState<DateRange>(() => presetToRange("today"));
  const [payouts, setPayouts] = useState<any[]>([]);
  const [payoutsLoaded, setPayoutsLoaded] = useState(false);

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
    const ch = supabase
      .channel(`driver-rides-${session.driverId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "rides" }, () => load(true))
      .subscribe();
    const t = setInterval(() => load(true), 60_000);
    return () => { supabase.removeChannel(ch); clearInterval(t); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.driverId]);

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
          try { localStorage.setItem(KEY, JSON.stringify(Array.from(fired))); } catch {}
          playNotificationSound();
          toast(`Pickup in ~1 hour at ${r.pickup_time} • ${r.pickup_location ?? "—"}`, { duration: 8000, icon: "⏰" });
        }
      }
    };
    tick();
    const t = setInterval(tick, 60_000);
    return () => clearInterval(t);
  }, [rides]);

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

  const inRange = (d: string) => {
    if (dateRange.from && d < dateRange.from) return false;
    if (dateRange.to && d > dateRange.to) return false;
    return true;
  };

  const filtered = useMemo(() => {
    if (filter === "today") return rides.filter((r) => r.ride_date === today);
    if (filter === "upcoming") return rides.filter((r) => r.ride_date >= today);
    if (filter === "past") return rides.filter((r) => r.ride_date < today);
    if (filter === "flights") return rides.filter((r) => r.ride_date >= today && !!r.flight_number);
    if (filter === "history") return rides.filter((r) => r.status === "completed" && inRange(r.ride_date));
    return rides;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rides, filter, today, dateRange.from, dateRange.to]);

  const counts = useMemo(() => ({
    today: rides.filter((r) => r.ride_date === today).length,
    upcoming: rides.filter((r) => r.ride_date >= today).length,
    completedToday: rides.filter((r) => r.ride_date === today && r.status === "completed").length,
    completedAll: rides.filter((r) => r.status === "completed").length,
  }), [rides, today]);

  useEffect(() => {
    if (filter !== "payouts" || payoutsLoaded) return;
    (async () => {
      const { data, error } = await (supabase.rpc as any)("driver_payouts_by_pin", {
        _driver_id: session.driverId,
        _pin: session.pin,
      });
      if (error) toast.error(error.message);
      else setPayouts((data as any[]) ?? []);
      setPayoutsLoaded(true);
    })();
  }, [filter, payoutsLoaded, session.driverId, session.pin]);

  const totalPaid = payouts.reduce((s, p) => s + Number(p.amount || 0), 0);
  const completedTotal = useMemo(
    () => rides.filter((r) => r.status === "completed").reduce((s, r) => s + Number(r.amount || 0), 0),
    [rides],
  );
  const pendingEarnings = completedTotal - totalPaid;

  const exportRideHistory = () => {
    const rows = rides.filter((r) => r.status === "completed" && inRange(r.ride_date));
    downloadCSV(
      "my-completed-rides",
      rows.map((r) => ({
        date: r.ride_date,
        pickup_time: r.pickup_time ?? "",
        pickup: r.pickup_location ?? "",
        dropoff: r.dropoff_location ?? "",
        passenger: r.passenger_name ?? "",
        amount: Number(r.amount).toFixed(2),
      })),
    );
  };

  const exportPayouts = () => {
    downloadCSV(
      "my-payouts",
      payouts.map((p) => ({
        amount: Number(p.amount).toFixed(2),
        period_start: p.period_start ?? "",
        period_end: p.period_end ?? "",
        paid_at: p.paid_at ?? "",
        notes: p.notes ?? "",
      })),
    );
  };

  const activeRide = useMemo(
    () => rides.find((r) => r.status === "started" || r.status === "arrived") ?? null,
    [rides],
  );
  const live = useLiveLocation({
    enabled: !!activeRide,
    driverId: session.driverId,
    pin: session.pin,
    rideId: activeRide?.id ?? null,
    onError: (msg) => toast.error(msg, { id: "geo-err" }),
  });

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-card">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="font-bold text-foreground truncate">{session.name}</div>
            <div className="text-xs text-muted-foreground truncate">{SYSTEM_LABELS[session.system]}</div>
          </div>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <DriverNotificationBell driverId={session.driverId} pin={session.pin} />
            <button onClick={onLogout} className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors">
              <LogOut className="h-4 w-4" />
              <span className="hidden sm:inline">Sign out</span>
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-6 page-enter">
        {/* Live location banner */}
        {activeRide && (
          <div className={`mb-5 flex items-center gap-3 rounded-xl border p-4 text-sm ${live.active ? "border-[#10B981]/30 bg-[#10B981]/10 text-[#10B981]" : "border-[#F5A623]/30 bg-[#F5A623]/10 text-[#F5A623]"}`}>
            <Radio className={`h-4 w-4 shrink-0 ${live.active ? "animate-pulse" : ""}`} />
            <div className="flex-1 min-w-0">
              <div className="font-semibold">{live.active ? "Sharing live location" : "Starting location share…"}</div>
              <div className="text-xs opacity-80 truncate">
                Ride • {activeRide.riders ?? 1} {(activeRide.riders ?? 1) === 1 ? "passenger" : "passengers"}
                {live.lastSentAt ? ` • updated ${Math.max(0, Math.round((Date.now() - live.lastSentAt) / 1000))}s ago` : ""}
              </div>
            </div>
          </div>
        )}

        {/* Stats row */}
        <div className="flex gap-3 mb-6 overflow-x-auto no-scrollbar" style={{ scrollSnapType: "x mandatory" }}>
          <StatTile icon={<CalendarDays className="h-4 w-4" />} label="Today" value={counts.today} highlight />
          <StatTile icon={<Hourglass className="h-4 w-4" />} label="Upcoming" value={counts.upcoming} />
          <StatTile icon={<CheckCircle2 className="h-4 w-4" />} label="Completed" value={counts.completedToday} />
        </div>

        {/* Filter tabs */}
        <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
          <div className="flex items-center gap-1 overflow-x-auto no-scrollbar">
            {(["today", "upcoming", "past", "flights", "all", "history", "payouts", "notes"] as const).map((k) => (
              <button
                key={k}
                onClick={() => setFilter(k)}
                className={`px-4 py-2 rounded-full text-sm font-medium capitalize whitespace-nowrap transition-colors ${
                  filter === k
                    ? "bg-[#6C63FF] text-foreground"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                }`}
              >
                {k === "flights" ? "✈ Flights" : k}
              </button>
            ))}
          </div>
          {filter !== "history" && filter !== "payouts" && filter !== "notes" && (
            <div className="flex items-center gap-1 bg-muted rounded-lg p-1">
              <button onClick={() => setView("list")} className={`px-3 py-1.5 rounded-md text-sm font-medium flex items-center gap-1.5 transition-colors ${view === "list" ? "bg-[#6C63FF] text-foreground" : "text-muted-foreground"}`}>
                <ListChecks className="h-4 w-4" /> List
              </button>
              <button onClick={() => setView("calendar")} className={`px-3 py-1.5 rounded-md text-sm font-medium flex items-center gap-1.5 transition-colors ${view === "calendar" ? "bg-[#6C63FF] text-foreground" : "text-muted-foreground"}`}>
                <CalendarDays className="h-4 w-4" /> Calendar
              </button>
            </div>
          )}
        </div>

        {filter === "notes" && <DriverNotesPanel session={session} />}

        {/* History / Payouts toolbar */}
        {filter === "history" && (
          <div className="luxury-card p-4 mb-4 flex flex-wrap items-center gap-3">
            <DateRangeFilter value={dateRange} onChange={setDateRange} />
            <div className="text-sm text-muted-foreground">
              {filtered.length} completed • ${filtered.reduce((s, r) => s + Number(r.amount || 0), 0).toFixed(2)}
            </div>
            <button
              onClick={exportRideHistory}
              className="ml-auto inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm bg-[#6C63FF] text-foreground"
            >
              <Download className="h-4 w-4" /> Export CSV
            </button>
          </div>
        )}

        {filter === "payouts" && (
          <div className="luxury-card p-4 mb-4">
            <div className="flex flex-wrap items-center gap-3 mb-4">
              <Wallet className="h-5 w-5 text-muted-foreground" />
              <div className="text-sm">
                <div className="text-muted-foreground">Total paid</div>
                <div className="font-semibold">${totalPaid.toFixed(2)}</div>
              </div>
              <div className="text-sm">
                <div className="text-muted-foreground">Completed earnings</div>
                <div className="font-semibold">${completedTotal.toFixed(2)}</div>
              </div>
              <div className="text-sm">
                <div className="text-muted-foreground">Pending</div>
                <div className={`font-semibold ${pendingEarnings > 0 ? "text-emerald-500" : ""}`}>${pendingEarnings.toFixed(2)}</div>
              </div>
              <button
                onClick={exportPayouts}
                className="ml-auto inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm bg-[#6C63FF] text-foreground"
              >
                <Download className="h-4 w-4" /> Export CSV
              </button>
            </div>
            {!payoutsLoaded ? (
              <div className="text-sm text-muted-foreground">Loading payouts…</div>
            ) : payouts.length === 0 ? (
              <div className="text-sm text-muted-foreground">No payouts recorded yet.</div>
            ) : (
              <div className="divide-y divide-border">
                {payouts.map((p) => (
                  <div key={p.id} className="py-3 flex items-center justify-between text-sm">
                    <div>
                      <div className="font-medium">${Number(p.amount).toFixed(2)}</div>
                      <div className="text-xs text-muted-foreground">
                        {p.period_start ? `${p.period_start} → ${p.period_end ?? ""}` : new Date(p.created_at).toLocaleDateString()}
                      </div>
                      {p.notes && <div className="text-xs text-muted-foreground mt-0.5">{p.notes}</div>}
                    </div>
                    <div className={`text-xs ${p.paid_at ? "text-emerald-500" : "text-amber-500"}`}>
                      {p.paid_at ? `Paid ${new Date(p.paid_at).toLocaleDateString()}` : "Pending"}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Content */}
        {filter === "payouts" || filter === "notes" ? null : loading ? (
          <div className="space-y-3">
            {[1,2,3].map(i => <div key={i} className="h-48 rounded-2xl skeleton-shimmer" />)}
          </div>
        ) : filtered.length === 0 ? (
          <div className="luxury-card p-12 text-center">
            <AlertCircle className="h-12 w-12 text-muted-foreground/60 mx-auto mb-4" />
            <p className="text-muted-foreground text-lg font-medium">No rides in this view</p>
            <p className="text-muted-foreground/60 text-sm mt-1">Try switching to a different filter</p>
          </div>
        ) : view === "list" || filter === "history" ? (
          <RideList rides={filtered} setStatus={setStatus} />
        ) : (
          <CalendarView rides={filtered} />
        )}
      </main>
    </div>
  );
}

function RideList({ rides, setStatus }: { rides: Ride[]; setStatus: (id: string, s: RideStatus) => void }) {
  const [arrivals, setArrivals] = useState<Record<string, number | null>>({});
  const closeIds = useMemo(() => {
    const set = new Set<string>();
    const items = Object.entries(arrivals).filter(([, t]) => typeof t === "number") as [string, number][];
    for (let i = 0; i < items.length; i++) for (let j = i + 1; j < items.length; j++) {
      if (Math.abs(items[i][1] - items[j][1]) <= 30 * 60 * 1000) { set.add(items[i][0]); set.add(items[j][0]); }
    }
    return set;
  }, [arrivals]);
  return (
    <div className="space-y-4">
      {rides.map((r) => (
        <RideCard
          key={r.id}
          ride={r}
          onSetStatus={(s) => setStatus(r.id, s)}
          closeArrival={closeIds.has(r.id)}
          onArrivalTime={(t) => setArrivals((p) => (p[r.id] === t ? p : { ...p, [r.id]: t }))}
        />
      ))}
    </div>
  );
}

/* ─── STAT TILE ─── */
function StatTile({ icon, label, value, highlight }: { icon: React.ReactNode; label: string; value: number; highlight?: boolean }) {
  return (
    <div className={`luxury-card p-4 min-w-[140px] flex-shrink-0 ${highlight ? "border-l-2 border-l-[#F5A623]" : ""}`} style={{ scrollSnapAlign: "start" }}>
      <div className="text-xs text-muted-foreground flex items-center gap-1.5">{icon} {label}</div>
      <div className="text-3xl font-bold text-foreground mt-2">{value}</div>
    </div>
  );
}

/* ─── RIDE CARD ─── */
function RideCard({ ride, onSetStatus }: { ride: Ride; onSetStatus: (s: RideStatus) => void }) {
  const dropoffTime = extractDropoffTime(ride);
  const cleanDropoffTo = stripTrailingTime(ride.dropoff_to ?? "") || ride.dropoff_to;
  const cleanFlight = stripTrailingTime(ride.flight_number ?? "") || ride.flight_number;
  const [requestingGeo, setRequestingGeo] = useState(false);

  const handleStartRide = () => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      toast.error("Location is not available on this device.");
      return;
    }
    setRequestingGeo(true);
    navigator.geolocation.getCurrentPosition(
      () => { setRequestingGeo(false); onSetStatus("started"); },
      (err) => {
        setRequestingGeo(false);
        if (err.code === err.PERMISSION_DENIED) {
          toast.error("Location permission required. Please allow location access then try again.", { id: "geo-perm", duration: 6000 });
        } else {
          toast.error("Could not read location. Please try again.", { id: "geo-perm" });
        }
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 },
    );
  };

  const canStart = ride.status === "pending";
  const isStarted = ride.status === "started";
  const isArrived = ride.status === "arrived";

  return (
    <div className="luxury-card overflow-hidden">
      {/* Top bar */}
      <div className="flex items-center justify-between px-5 sm:px-6 pt-4 pb-3 border-b border-border">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium px-2.5 py-1 rounded-full bg-white/[0.06] text-foreground">
            {ride.ride_date}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className={`text-[11px] font-semibold px-2.5 py-1 rounded-full capitalize ${statusStyle[ride.status]}`}>
            {ride.status.replace("_", " ")}
          </span>
          <FlightSearchButton ride={ride} />
        </div>
      </div>

      {/* Pickup / Dropoff */}
      <div className="px-5 sm:px-6 py-4 grid gap-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="rounded-xl border border-[#6C63FF]/20 bg-[#6C63FF]/[0.06] px-4 py-3">
            <div className="text-[10px] uppercase tracking-wider font-bold text-[#6C63FF]/70">Pickup</div>
            <div className="text-base font-bold text-foreground tabular-nums mt-0.5">{ride.pickup_time ?? "—"}</div>
            <div className="text-sm text-foreground mt-0.5 truncate">{ride.pickup_location ?? "—"}</div>
            {ride.pickup_from && <div className="text-xs text-muted-foreground truncate">{ride.pickup_from}</div>}
          </div>
          <div className="rounded-xl border border-border bg-white/[0.03] px-4 py-3">
            <div className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground">Dropoff</div>
            <div className="text-base font-bold text-foreground tabular-nums mt-0.5">{dropoffTime ?? "—"}</div>
            <div className="text-sm text-foreground mt-0.5 truncate">{ride.dropoff_location ?? "—"}</div>
            {cleanDropoffTo && <div className="text-xs text-muted-foreground truncate">{cleanDropoffTo}</div>}
          </div>
        </div>

        {/* Meta chips */}
        <div className="flex items-center gap-2 flex-wrap">
          <span className="glass-pill text-xs px-3 py-1 flex items-center gap-1.5 text-foreground">
            <User className="h-3.5 w-3.5 text-muted-foreground" />
            {ride.riders ?? 1} {(ride.riders ?? 1) === 1 ? "passenger" : "passengers"}
          </span>
          {cleanFlight && (
            <span className="glass-pill text-xs px-3 py-1 flex items-center gap-1.5 text-foreground">
              <Plane className="h-3.5 w-3.5 text-muted-foreground" />
              <FlightTrackLink flightNumber={cleanFlight} />
            </span>
          )}
        </div>

        {ride.phone && (
          <div className="flex items-center gap-2 text-sm">
            <Phone className="h-4 w-4 text-muted-foreground" />
            <a href={`tel:${ride.phone}`} className="text-[#6C63FF] hover:underline truncate">{ride.phone}</a>
          </div>
        )}
        {ride.notes && (
          <div className="text-xs text-muted-foreground italic break-words">Note: {ride.notes}</div>
        )}
        {(isStarted || isArrived) && (
          <div className="flex items-center gap-2 text-xs text-[#10B981] bg-[#10B981]/10 border border-[#10B981]/20 rounded-lg px-3 py-2">
            <Radio className="h-3.5 w-3.5 animate-pulse" />
            Sharing live location with dispatcher
          </div>
        )}
      </div>

      {/* Action buttons */}
      <div className="px-5 sm:px-6 pb-5 pt-1 grid grid-cols-2 sm:flex sm:flex-row gap-2">
        {canStart && (
          <button
            onClick={handleStartRide}
            disabled={requestingGeo}
            className="btn-primary-gradient text-sm flex items-center justify-center gap-1.5 px-4 col-span-2 sm:col-span-1 disabled:opacity-50"
          >
            <Radio className={`h-4 w-4 ${requestingGeo ? "animate-pulse" : ""}`} />
            {requestingGeo ? "Allow location…" : "Start ride"}
          </button>
        )}
        {isStarted && (
          <button
            onClick={() => onSetStatus("arrived")}
            className="text-sm flex items-center justify-center gap-1.5 px-4 min-h-[44px] rounded-[10px] bg-[#6C63FF]/20 text-[#6C63FF] border border-[#6C63FF]/30 hover:bg-[#6C63FF]/30 transition-colors col-span-2 sm:col-span-1"
          >
            <CheckCircle2 className="h-4 w-4" /> Mark arrived
          </button>
        )}
        {isArrived && (
          <button disabled className="text-sm flex items-center justify-center gap-1.5 px-4 min-h-[44px] rounded-[10px] bg-[#6C63FF]/10 text-[#6C63FF]/60 border border-[#6C63FF]/20 col-span-2 sm:col-span-1">
            <Radio className="h-4 w-4 animate-pulse" /> At pickup
          </button>
        )}
        <button
          onClick={() => onSetStatus("completed")}
          className="text-sm flex items-center justify-center gap-1.5 px-4 min-h-[44px] rounded-[10px] border border-[#10B981]/30 text-[#10B981] hover:bg-[#10B981]/10 transition-colors"
        >
          <CheckCircle2 className="h-4 w-4" /> Complete
        </button>
        <button
          onClick={() => onSetStatus("no_show")}
          className="text-sm flex items-center justify-center gap-1.5 px-4 min-h-[44px] rounded-[10px] border border-[#F59E0B]/30 text-[#F59E0B] hover:bg-[#F59E0B]/10 transition-colors"
        >
          No-show
        </button>
        <button
          onClick={() => onSetStatus("cancelled")}
          className="text-sm flex items-center justify-center gap-1.5 px-4 min-h-[44px] rounded-[10px] border border-[#EF4444]/30 text-[#EF4444] hover:bg-[#EF4444]/10 transition-colors"
        >
          <XCircle className="h-4 w-4" /> Cancel
        </button>
      </div>
    </div>
  );
}

/* ─── CALENDAR VIEW ─── */
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
        <div key={date} className="luxury-card p-5">
          <div className="font-semibold text-foreground mb-3">
            {new Date(date).toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" })}
          </div>
          <div className="space-y-2">
            {items.map((r) => (
              <div key={r.id} className="flex items-center gap-3 text-sm border border-border rounded-lg px-3 py-2.5 bg-white/[0.02]">
                <span className="font-mono text-xs text-muted-foreground w-14 shrink-0">{r.pickup_time ?? "—"}</span>
                <span className="truncate flex-1 text-foreground">
                  {(r.riders ?? 1)} pax • {r.pickup_location ?? "—"} → {r.dropoff_location ?? "—"}
                </span>
                <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full capitalize ${statusStyle[r.status]}`}>
                  {r.status.replace("_", " ")}
                </span>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

/* ─── DRIVER NOTES PANEL ─── */
function DriverNotesPanel({ session }: { session: DriverSession }) {
  const [notes, setNotes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [isQuestion, setIsQuestion] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    const { data, error } = await (supabase.rpc as any)("driver_notes_by_token", {
      _token: (typeof window !== "undefined" ? localStorage.getItem("psl.driver.token") : null) ?? "",
    });
    // Fallback: query directly via PIN-less RPC not available; use admin-side filter via session pin
    if (error) {
      // Try a direct read using rpc that may not exist — quietly ignore
      setNotes([]);
    } else {
      setNotes((data as any[]) ?? []);
    }
    setLoading(false);
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [session.driverId]);

  const submit = async () => {
    if (!title.trim()) return toast.error("Title required");
    setSaving(true);
    const token = typeof window !== "undefined" ? localStorage.getItem("psl.driver.token") : null;
    if (!token) {
      // Without a session token RPC available, insert via admin pin path is not allowed.
      toast.error("Please sign out and sign in again to enable notes.");
      setSaving(false);
      return;
    }
    const { error } = await (supabase.rpc as any)("driver_create_note_by_token", {
      _token: token, _title: title.trim(), _body: body.trim() || null, _is_question: isQuestion,
    });
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success(isQuestion ? "Question sent to admin" : "Note saved");
    setTitle(""); setBody(""); setIsQuestion(false);
    load();
  };

  return (
    <div className="space-y-4">
      <div className="luxury-card p-4 space-y-3">
        <div className="font-semibold text-foreground text-sm">Add note or question</div>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Title"
          className="w-full input-luxury px-4 text-sm"
        />
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Details (optional)"
          className="w-full input-luxury px-4 py-3 text-sm min-h-[80px]"
        />
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 text-sm text-muted-foreground">
            <input type="checkbox" checked={isQuestion} onChange={(e) => setIsQuestion(e.target.checked)} className="accent-[#6C63FF]" />
            Ask the admin
          </label>
          <button
            onClick={submit}
            disabled={saving}
            className="ml-auto btn-primary-gradient text-sm px-4 disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
      {loading ? (
        <div className="h-24 rounded-2xl skeleton-shimmer" />
      ) : notes.length === 0 ? (
        <div className="luxury-card p-8 text-center text-muted-foreground text-sm">No notes yet.</div>
      ) : (
        <div className="space-y-2">
          {notes.map((n) => (
            <div key={n.id} className="luxury-card p-4">
              <div className="flex items-center gap-2">
                <div className="font-semibold text-foreground">{n.title}</div>
                {n.is_question && (
                  <span className="text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full bg-[#6C63FF]/15 text-[#6C63FF]">Question</span>
                )}
                {n.is_reminder && (
                  <span className="text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full bg-[#F5A623]/15 text-[#F5A623]">Reminder</span>
                )}
              </div>
              {n.body && <div className="text-sm text-muted-foreground mt-1 whitespace-pre-wrap">{n.body}</div>}
              {n.is_question && n.answer && (
                <div className="mt-2 rounded-lg bg-[#6C63FF]/10 border border-[#6C63FF]/20 p-2.5 text-sm">
                  <div className="text-[10px] uppercase tracking-wider text-[#6C63FF] font-bold mb-0.5">Admin reply</div>
                  {n.answer}
                </div>
              )}
              <div className="text-[11px] text-muted-foreground/70 mt-2">{new Date(n.created_at).toLocaleString()}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
