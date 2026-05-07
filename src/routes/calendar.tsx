import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { RequireAuth } from "@/components/RequireAuth";
import { AppShell } from "@/components/AppShell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { RideStatus } from "@/lib/rides";
import { toast } from "react-hot-toast";
import { useSystem } from "@/lib/system";
import { getCalendarRides } from "@/server/rides.functions";

export const Route = createFileRoute("/calendar")({ component: CalendarPage });

function CalendarPage() {
  return (
    <RequireAuth>
      <AppShell>
        <CalendarInner />
      </AppShell>
    </RequireAuth>
  );
}

const statusColor: Record<RideStatus, string> = {
  pending: "pill-pending border-[#F59E0B]/20",
  started: "pill-started border-[#6C63FF]/20",
  arrived: "pill-in-progress border-[#6C63FF]/20",
  completed: "pill-completed border-[#10B981]/20",
  cancelled: "pill-cancelled border-[#EF4444]/20",
  no_show: "pill-no-show border-[#EF4444]/20",
};

function ymd(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function startOfWeek(d: Date) {
  const x = new Date(d);
  const day = x.getDay();
  const diff = (day + 6) % 7;
  x.setDate(x.getDate() - diff);
  x.setHours(0, 0, 0, 0);
  return x;
}

function CalendarInner() {
  const { system, label: systemLabel } = useSystem();
  const [rides, setRides] = useState<any[]>([]);
  const [driverMap, setDriverMap] = useState<Record<string, string>>({});
  const [view, setView] = useState<"week" | "day">("week");
  const [anchor, setAnchor] = useState<Date>(new Date());

  const days = useMemo(() => {
    if (view === "day") return [new Date(anchor)];
    const start = startOfWeek(anchor);
    return Array.from({ length: 7 }).map((_, i) => {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      return d;
    });
  }, [view, anchor]);

  const dateStart = ymd(days[0]);
  const dateEnd = ymd(days[days.length - 1]);

  const load = useCallback(async () => {
    try {
      const result = await getCalendarRides({
        data: { system: system as "api" | "llc", dateStart, dateEnd },
      });
      setRides(result.rides);
      setDriverMap(Object.fromEntries(result.drivers.map((d: any) => [d.id, d.name])));
    } catch (e: any) {
      toast.error(e.message ?? "Failed to load calendar");
    }
  }, [system, dateStart, dateEnd]);

  useEffect(() => { load(); }, [load]);

  const ridesByDate = useMemo(() => {
    const m = new Map<string, any[]>();
    for (const r of rides) {
      const arr = m.get(r.ride_date) ?? [];
      arr.push(r);
      m.set(r.ride_date, arr);
    }
    return m;
  }, [rides]);

  const move = (delta: number) => {
    const d = new Date(anchor);
    d.setDate(d.getDate() + (view === "week" ? delta * 7 : delta));
    setAnchor(d);
  };

  const label =
    view === "day"
      ? anchor.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric", year: "numeric" })
      : `${days[0].toLocaleDateString(undefined, { month: "short", day: "numeric" })} – ${days[6].toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}`;

  return (
    <div>
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div>
          <h1 className="text-3xl font-bold">Calendar</h1>
          <p className="text-muted-foreground mt-1"><span className="font-medium text-foreground">{systemLabel}</span> — color-coded by status.</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex rounded-md border overflow-hidden">
            <button
              onClick={() => setView("day")}
              className={`px-3 py-1.5 text-sm ${view === "day" ? "bg-secondary" : "bg-card hover:bg-secondary/40"}`}
            >Day</button>
            <button
              onClick={() => setView("week")}
              className={`px-3 py-1.5 text-sm border-l ${view === "week" ? "bg-secondary" : "bg-card hover:bg-secondary/40"}`}
            >Week</button>
          </div>
          <Button variant="outline" size="icon" onClick={() => move(-1)}><ChevronLeft className="h-4 w-4" /></Button>
          <Button variant="outline" size="sm" onClick={() => setAnchor(new Date())}>Today</Button>
          <Button variant="outline" size="icon" onClick={() => move(1)}><ChevronRight className="h-4 w-4" /></Button>
        </div>
      </div>

      <div className="text-sm text-muted-foreground mb-3">{label}</div>

      <div className={`grid gap-3 ${view === "day" ? "grid-cols-1" : "grid-cols-2 md:grid-cols-7"}`}>
        {days.map((d) => {
          const key = ymd(d);
          const isToday = key === ymd(new Date());
          const list = (ridesByDate.get(key) ?? []).slice().sort((a: any, b: any) =>
            (a.pickup_time ?? "").localeCompare(b.pickup_time ?? "")
          );
          return (
            <Card key={key} className={`p-3 min-h-[180px] ${isToday ? "ring-2 ring-accent" : ""}`}>
              <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {d.toLocaleDateString(undefined, { weekday: "short" })}
              </div>
              <div className={`text-2xl font-bold ${isToday ? "text-accent-foreground" : ""}`}>
                {d.getDate()}
              </div>
              <div className="mt-2 space-y-1.5">
                {list.length === 0 ? (
                  <div className="text-xs text-muted-foreground italic">No rides</div>
                ) : (
                  list.map((r: any) => (
                    <Link
                      key={r.id}
                      to="/rides/$id"
                      params={{ id: r.id }}
                      className={`block text-xs rounded border px-2 py-1.5 hover:ring-2 hover:ring-primary/40 transition ${statusColor[r.status as RideStatus]}`}
                      title={`${r.pickup_from ?? r.pickup_location ?? ""} → ${r.dropoff_to ?? r.dropoff_location ?? ""}`}
                    >
                      <div className="font-semibold">{r.pickup_time || "—"}</div>
                      <div className="truncate">
                        {(r.pickup_location ?? "?")}→{(r.dropoff_location ?? "?")}
                      </div>
                      {r.driver_id && (
                        <div className="opacity-75 truncate">👤 {driverMap[r.driver_id] ?? "—"}</div>
                      )}
                    </Link>
                  ))
                )}
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
