import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "react-hot-toast";
import { playNotificationSound } from "@/lib/sound";
import {
  LogOut, CalendarDays, Clock, MapPin, User, Phone, Plane,
  CheckCircle2, XCircle, Hourglass, ListChecks, ShieldCheck,
  Sparkles, ArrowRight, Radio, AlertCircle,
} from "lucide-react";
import { extractDropoffTime, stripTrailingTime, type Ride, type RideStatus } from "@/lib/rides";
import { SYSTEM_LABELS, type WorkspaceSystem } from "@/lib/system";
import driverHero from "@/assets/driver-hero.jpg";
import { FlightTrackLink, FlightSearchButton } from "@/components/FlightTrackLink";
import { DriverNotificationBell } from "@/components/DriverNotificationBell";
import { useLiveLocation } from "@/hooks/useLiveLocation";

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
    <div className="min-h-screen grid lg:grid-cols-2 bg-[#080810]">
      {/* Left visual panel — hidden on mobile */}
      <div className="relative hidden lg:block overflow-hidden">
        <img src={driverHero} alt="Professional chauffeur next to luxury SUV at night" className="absolute inset-0 h-full w-full object-cover" />
        <div className="absolute inset-0 bg-[#080810]/75" />
        <div className="absolute inset-0 bg-gradient-to-br from-[#080810]/90 via-[#080810]/40 to-transparent" />

        <div className="relative z-10 flex flex-col justify-between h-full p-12 text-white">
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
            <p className="mt-4 text-[#E2E2F0]/80 max-w-md">
              See today's pickups, get SMS alerts an hour before each ride, and update status with one tap.
            </p>
          </div>
          <div className="text-xs text-[#4A4A6A]">© {new Date().getFullYear()} Puget Sound Limo</div>
        </div>
      </div>

      {/* Right form panel */}
      <div className="flex items-center justify-center p-5 sm:p-8 relative min-h-screen lg:min-h-0">
        {/* Mobile logo */}
        <div className="lg:hidden absolute top-0 left-0 right-0 flex items-center justify-center py-10">
          <div className="text-center">
            <div className="text-xl font-bold text-white tracking-tight">Puget Sound Limo</div>
            <div className="text-[10px] uppercase tracking-[0.2em] text-[#F5A623] font-medium mt-1">Driver Portal</div>
          </div>
        </div>

        <div className="w-full max-w-md bg-[#10101C] border border-white/[0.07] rounded-[20px] p-8 sm:p-12 mt-24 lg:mt-0">
          <div className="mb-6 flex items-center gap-3">
            <span className="h-12 w-12 rounded-2xl bg-gradient-to-br from-[#F5A623] to-[#E8820C] grid place-items-center text-white shadow-lg">
              <ShieldCheck className="h-6 w-6" />
            </span>
            <div>
              <h1 className="text-2xl font-bold text-white">Driver sign in</h1>
              <p className="text-sm text-[#7A7A9A]">Enter your PIN to view your rides</p>
            </div>
          </div>

          <form onSubmit={submit} className="space-y-5">
            <div className="space-y-2">
              <label className="text-sm font-medium text-[#E2E2F0]">Workspace</label>
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
              <label htmlFor="pin" className="text-sm font-medium text-[#E2E2F0]">PIN</label>
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
            <p className="text-xs text-[#4A4A6A] text-center pt-1">
              Don't have a PIN? Ask the dispatcher to set one for you.
            </p>
            <div className="flex items-center justify-between text-xs pt-3 border-t border-white/[0.07]">
              <Link to="/" className="text-[#F5A623] hover:opacity-80 font-medium">← Back to home</Link>
              <Link to="/login" className="text-[#7A7A9A] hover:text-white transition-colors">Admin sign in →</Link>
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
  const [filter, setFilter] = useState<"upcoming" | "today" | "past" | "flights" | "all">("upcoming");

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
    <div className="min-h-screen bg-[#080810]">
      {/* Header */}
      <header className="border-b border-white/[0.07] bg-[#10101C]">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="font-bold text-white truncate">{session.name}</div>
            <div className="text-xs text-[#7A7A9A] truncate">{SYSTEM_LABELS[session.system]}</div>
          </div>
          <div className="flex items-center gap-2">
            <DriverNotificationBell driverId={session.driverId} pin={session.pin} />
            <button onClick={onLogout} className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm text-[#7A7A9A] hover:text-white hover:bg-white/[0.05] transition-colors">
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
            {(["upcoming", "today", "past", "flights", "all"] as const).map((k) => (
              <button
                key={k}
                onClick={() => setFilter(k)}
                className={`px-4 py-2 rounded-full text-sm font-medium capitalize whitespace-nowrap transition-colors ${
                  filter === k
                    ? "bg-[#6C63FF] text-white"
                    : "text-[#7A7A9A] hover:text-white hover:bg-white/[0.05]"
                }`}
              >
                {k === "flights" ? "✈ Flights" : k}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-1 bg-[#18182A] rounded-lg p-1">
            <button onClick={() => setView("list")} className={`px-3 py-1.5 rounded-md text-sm font-medium flex items-center gap-1.5 transition-colors ${view === "list" ? "bg-[#6C63FF] text-white" : "text-[#7A7A9A]"}`}>
              <ListChecks className="h-4 w-4" /> List
            </button>
            <button onClick={() => setView("calendar")} className={`px-3 py-1.5 rounded-md text-sm font-medium flex items-center gap-1.5 transition-colors ${view === "calendar" ? "bg-[#6C63FF] text-white" : "text-[#7A7A9A]"}`}>
              <CalendarDays className="h-4 w-4" /> Calendar
            </button>
          </div>
        </div>

        {/* Content */}
        {loading ? (
          <div className="space-y-3">
            {[1,2,3].map(i => <div key={i} className="h-48 rounded-2xl skeleton-shimmer" />)}
          </div>
        ) : filtered.length === 0 ? (
          <div className="luxury-card p-12 text-center">
            <AlertCircle className="h-12 w-12 text-[#4A4A6A] mx-auto mb-4" />
            <p className="text-[#7A7A9A] text-lg font-medium">No rides in this view</p>
            <p className="text-[#4A4A6A] text-sm mt-1">Try switching to a different filter</p>
          </div>
        ) : view === "list" ? (
          <div className="space-y-4">
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

/* ─── STAT TILE ─── */
function StatTile({ icon, label, value, highlight }: { icon: React.ReactNode; label: string; value: number; highlight?: boolean }) {
  return (
    <div className={`luxury-card p-4 min-w-[140px] flex-shrink-0 ${highlight ? "border-l-2 border-l-[#F5A623]" : ""}`} style={{ scrollSnapAlign: "start" }}>
      <div className="text-xs text-[#7A7A9A] flex items-center gap-1.5">{icon} {label}</div>
      <div className="text-3xl font-bold text-white mt-2">{value}</div>
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
      <div className="flex items-center justify-between px-5 sm:px-6 pt-4 pb-3 border-b border-white/[0.07]">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium px-2.5 py-1 rounded-full bg-white/[0.06] text-[#E2E2F0]">
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
            <div className="text-base font-bold text-white tabular-nums mt-0.5">{ride.pickup_time ?? "—"}</div>
            <div className="text-sm text-[#E2E2F0] mt-0.5 truncate">{ride.pickup_location ?? "—"}</div>
            {ride.pickup_from && <div className="text-xs text-[#7A7A9A] truncate">{ride.pickup_from}</div>}
          </div>
          <div className="rounded-xl border border-white/[0.07] bg-white/[0.03] px-4 py-3">
            <div className="text-[10px] uppercase tracking-wider font-bold text-[#7A7A9A]">Dropoff</div>
            <div className="text-base font-bold text-white tabular-nums mt-0.5">{dropoffTime ?? "—"}</div>
            <div className="text-sm text-[#E2E2F0] mt-0.5 truncate">{ride.dropoff_location ?? "—"}</div>
            {cleanDropoffTo && <div className="text-xs text-[#7A7A9A] truncate">{cleanDropoffTo}</div>}
          </div>
        </div>

        {/* Meta chips */}
        <div className="flex items-center gap-2 flex-wrap">
          <span className="glass-pill text-xs px-3 py-1 flex items-center gap-1.5 text-[#E2E2F0]">
            <User className="h-3.5 w-3.5 text-[#7A7A9A]" />
            {ride.riders ?? 1} {(ride.riders ?? 1) === 1 ? "passenger" : "passengers"}
          </span>
          {cleanFlight && (
            <span className="glass-pill text-xs px-3 py-1 flex items-center gap-1.5 text-[#E2E2F0]">
              <Plane className="h-3.5 w-3.5 text-[#7A7A9A]" />
              <FlightTrackLink flightNumber={cleanFlight} />
            </span>
          )}
        </div>

        {ride.phone && (
          <div className="flex items-center gap-2 text-sm">
            <Phone className="h-4 w-4 text-[#7A7A9A]" />
            <a href={`tel:${ride.phone}`} className="text-[#6C63FF] hover:underline truncate">{ride.phone}</a>
          </div>
        )}
        {ride.notes && (
          <div className="text-xs text-[#7A7A9A] italic break-words">Note: {ride.notes}</div>
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
          <div className="font-semibold text-white mb-3">
            {new Date(date).toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" })}
          </div>
          <div className="space-y-2">
            {items.map((r) => (
              <div key={r.id} className="flex items-center gap-3 text-sm border border-white/[0.07] rounded-lg px-3 py-2.5 bg-white/[0.02]">
                <span className="font-mono text-xs text-[#7A7A9A] w-14 shrink-0">{r.pickup_time ?? "—"}</span>
                <span className="truncate flex-1 text-[#E2E2F0]">
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
