import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { RequireAuth } from "@/components/RequireAuth";
import { AppShell } from "@/components/AppShell";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useSystem } from "@/lib/system";
import { Search, ScrollText, User, Shield, Cog, Download } from "lucide-react";
import { DateRangeFilter, presetToRange, type DateRange } from "@/components/DateRangeFilter";
import { downloadCSV } from "@/lib/export";

export const Route = createFileRoute("/logs")({ component: LogsRoute });

interface LogRow {
  id: string;
  system: string;
  actor: string;
  actor_name: string | null;
  kind: string;
  title: string;
  details: string | null;
  ride_id: string | null;
  driver_id: string | null;
  created_at: string;
}

function LogsRoute() {
  return (
    <RequireAuth>
      <AppShell>
        <LogsInner />
      </AppShell>
    </RequireAuth>
  );
}

const kindLabels: Record<string, string> = {
  ride_created: "Ride created",
  ride_status: "Ride status",
  driver_status: "Driver status",
  driver_assigned: "Driver assigned",
  location_started: "Location share started",
  location_stopped: "Location share stopped",
  notification: "Notification",
  login: "Driver login",
};

const kindTone: Record<string, string> = {
  ride_created: "bg-sky-100 text-sky-800",
  ride_status: "bg-emerald-100 text-emerald-800",
  driver_status: "bg-emerald-100 text-emerald-800",
  driver_assigned: "bg-violet-100 text-violet-800",
  location_started: "bg-amber-100 text-amber-800",
  location_stopped: "bg-rose-100 text-rose-800",
  notification: "bg-slate-100 text-slate-800",
  login: "bg-blue-100 text-blue-800",
};

function ActorIcon({ actor }: { actor: string }) {
  if (actor === "driver") return <User className="h-3.5 w-3.5" />;
  if (actor === "admin") return <Shield className="h-3.5 w-3.5" />;
  return <Cog className="h-3.5 w-3.5" />;
}

function LogsInner() {
  const { system } = useSystem();
  const [rows, setRows] = useState<LogRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [kindFilter, setKindFilter] = useState<string>("all");
  const [actorFilter, setActorFilter] = useState<string>("all");

  const load = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("activity_logs")
      .select("*")
      .eq("system", system)
      .order("created_at", { ascending: false })
      .limit(1000);
    setRows((data as LogRow[]) ?? []);
    setLoading(false);
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [system]);

  useEffect(() => {
    const ch = supabase
      .channel(`logs-${system}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "activity_logs" }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
    // eslint-disable-next-line
  }, [system]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (kindFilter !== "all" && r.kind !== kindFilter) return false;
      if (actorFilter !== "all" && r.actor !== actorFilter) return false;
      if (q) {
        const hay = [r.title, r.details, r.actor_name, r.kind, r.actor].filter(Boolean).join(" ").toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [rows, search, kindFilter, actorFilter]);

  return (
    <div className="max-w-6xl mx-auto p-6">
      <div className="flex items-center gap-2 mb-4">
        <ScrollText className="h-5 w-5" />
        <h1 className="text-2xl font-semibold">Activity logs</h1>
        <span className="text-sm text-muted-foreground ml-2">
          {filtered.length} of {rows.length} entries
        </span>
      </div>

      <Card className="p-4 mb-4">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[240px]">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search logs (title, details, driver, ride…)"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8"
            />
          </div>
          <Select value={kindFilter} onValueChange={setKindFilter}>
            <SelectTrigger className="w-52"><SelectValue placeholder="All events" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All events</SelectItem>
              {Object.entries(kindLabels).map(([k, label]) => (
                <SelectItem key={k} value={k}>{label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={actorFilter} onValueChange={setActorFilter}>
            <SelectTrigger className="w-40"><SelectValue placeholder="All actors" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All actors</SelectItem>
              <SelectItem value="admin">Admin</SelectItem>
              <SelectItem value="driver">Driver</SelectItem>
              <SelectItem value="system">System</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </Card>

      <Card className="divide-y">
        {loading && <div className="p-6 text-sm text-muted-foreground">Loading…</div>}
        {!loading && filtered.length === 0 && (
          <div className="p-8 text-center text-sm text-muted-foreground">No log entries match your filters.</div>
        )}
        {filtered.map((r) => (
          <div key={r.id} className="p-3 flex items-start gap-3 text-sm hover:bg-secondary/30">
            <div className="pt-0.5 text-muted-foreground"><ActorIcon actor={r.actor} /></div>
            <div className="flex-1 min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline" className={`${kindTone[r.kind] ?? "bg-slate-100 text-slate-800"} border-0`}>
                  {kindLabels[r.kind] ?? r.kind}
                </Badge>
                <span className="font-medium truncate">{r.title}</span>
                {r.actor_name && (
                  <span className="text-xs text-muted-foreground">• {r.actor_name}</span>
                )}
              </div>
              {r.details && (
                <div className="text-xs text-muted-foreground mt-0.5 break-words">{r.details}</div>
              )}
            </div>
            <div className="text-xs text-muted-foreground whitespace-nowrap pl-2">
              {new Date(r.created_at).toLocaleString()}
            </div>
          </div>
        ))}
      </Card>
    </div>
  );
}
