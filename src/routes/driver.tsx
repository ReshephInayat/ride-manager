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
import { LogOut, CalendarDays, Clock, MapPin, User, Phone, Plane, CheckCircle2, XCircle, Hourglass, ListChecks } from "lucide-react";
import type { Ride, RideStatus } from "@/lib/rides";
import { SYSTEM_LABELS, type WorkspaceSystem } from "@/lib/system";

export const Route = createFileRoute("/driver")({ component: DriverPortal });

const STORAGE_KEY = "psl.driver.session";

interface DriverSession {
  driverId: string;
  pin: string;
  name: string;
  system: WorkspaceSystem;
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

function DriverLogin({ onSuccess }: { onSuccess: (s: DriverSession) => void }) {
  const [system, setSystem] = useState<WorkspaceSystem>("api");
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pin.trim()) return;
    setBusy(true);
    const { data, error } = await supabase.rpc("driver_login", { _pin: pin.trim(), _system: system });
    setBusy(false);
    if (error) return toast.error(error.message);
    const row = Array.isArray(data) ? data[0] : data;
    if (!row) return toast.error("Invalid PIN for this workspace");
    onSuccess({ driverId: row.id, pin: pin.trim(), name: row.name, system });
    toast.success(`Welcome, ${row.name}`);
  };

  return (
    <div className="min-h-screen grid place-items-center bg-gradient-to-br from-background via-background to-muted/40 px-4">
      <Card className="w-full max-w-md p-8 shadow-xl border-border/60">
        <div className="mb-6">
          <h1 className="text-2xl font-bold">Driver Portal</h1>
          <p className="text-sm text-muted-foreground">Sign in with your PIN</p>
        </div>
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-2">
            <Label>Workspace</Label>
            <Select value={system} onValueChange={(v) => setSystem(v as WorkspaceSystem)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="api">{SYSTEM_LABELS.api}</SelectItem>
                <SelectItem value="llc">{SYSTEM_LABELS.llc}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="pin">PIN</Label>
            <Input
              id="pin"
              inputMode="numeric"
              autoFocus
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 8))}
              placeholder="Enter your PIN"
              className="h-12 text-lg tracking-widest text-center"
            />
          </div>
          <Button type="submit" className="w-full h-11" disabled={busy || !pin}>
            {busy ? "Signing in…" : "Sign In"}
          </Button>
          <p className="text-xs text-muted-foreground text-center">
            Don't have a PIN? Ask the dispatcher to set one for you.
          </p>
        </form>
      </Card>
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
          <Button variant="ghost" size="sm" onClick={onLogout}>
            <LogOut className="h-4 w-4 mr-1" /> Sign out
          </Button>
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
  return (
    <Card className="p-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <CalendarDays className="h-4 w-4" />
            <span className="font-medium text-foreground">{ride.ride_date}</span>
            <Clock className="h-4 w-4 ml-1" />
            <span className="font-medium text-foreground">{ride.pickup_time ?? "—"}</span>
          </div>
          <div className="mt-2 grid gap-1 text-sm">
            {ride.passenger_name && (
              <div className="flex items-center gap-2"><User className="h-4 w-4 text-muted-foreground" /> {ride.passenger_name}{ride.riders > 1 ? ` (+${ride.riders - 1})` : ""}</div>
            )}
            {ride.phone && (
              <div className="flex items-center gap-2"><Phone className="h-4 w-4 text-muted-foreground" /> <a href={`tel:${ride.phone}`} className="text-primary hover:underline">{ride.phone}</a></div>
            )}
            {ride.flight_number && (
              <div className="flex items-center gap-2"><Plane className="h-4 w-4 text-muted-foreground" /> {ride.flight_number}</div>
            )}
            <div className="flex items-start gap-2">
              <MapPin className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
              <div className="min-w-0">
                <div className="font-medium">{ride.pickup_location ?? "—"}{ride.pickup_from ? ` (${ride.pickup_from})` : ""}</div>
                <div className="text-muted-foreground">→ {ride.dropoff_location ?? "—"}{ride.dropoff_to ? ` (${ride.dropoff_to})` : ""}</div>
              </div>
            </div>
            {ride.notes && (
              <div className="text-xs text-muted-foreground mt-1 italic">Note: {ride.notes}</div>
            )}
          </div>
        </div>
        <span className={`text-xs font-semibold px-2 py-1 rounded-full ${statusTone[ride.status]}`}>
          {ride.status.replace("_", " ")}
        </span>
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        <Button size="sm" variant={ride.status === "arrived" ? "default" : "outline"} onClick={() => onSetStatus("arrived")}>
          Arrived
        </Button>
        <Button size="sm" variant={ride.status === "completed" ? "default" : "outline"} onClick={() => onSetStatus("completed")}>
          <CheckCircle2 className="h-4 w-4 mr-1" /> Complete
        </Button>
        <Button size="sm" variant="outline" onClick={() => onSetStatus("no_show")}>
          No-show
        </Button>
        <Button size="sm" variant="outline" onClick={() => onSetStatus("cancelled")}>
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
