import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { RequireAuth } from "@/components/RequireAuth";
import { AppShell } from "@/components/AppShell";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Plane, Search, RefreshCw, ExternalLink, Clock, MapPin, Users } from "lucide-react";
import { toast } from "react-hot-toast";
import { useSystem } from "@/lib/system";
import { PageLoader } from "@/components/Spinner";
import { FlightSearchButton } from "@/components/FlightTrackLink";
import { stripTrailingTime } from "@/lib/rides";

export const Route = createFileRoute("/flights")({ component: FlightsPage });

function FlightsPage() {
  return (<RequireAuth><AppShell><FlightsInner /></AppShell></RequireAuth>);
}

type DateFilter = "today" | "tomorrow" | "this_week" | "all";

function ymd(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function FlightsInner() {
  const { system } = useSystem();
  const [rides, setRides] = useState<any[]>([]);
  const [drivers, setDrivers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<DateFilter>("today");
  const [searchTerm, setSearchTerm] = useState("");

  const load = async () => {
    setLoading(true);
    const today = new Date();
    let query = supabase.from("rides").select("*").eq("system", system).not("flight_number", "is", null);

    if (filter === "today") {
      query = query.eq("ride_date", ymd(today));
    } else if (filter === "tomorrow") {
      const tmr = new Date(today);
      tmr.setDate(tmr.getDate() + 1);
      query = query.eq("ride_date", ymd(tmr));
    } else if (filter === "this_week") {
      const weekStart = new Date(today);
      weekStart.setDate(weekStart.getDate() - weekStart.getDay());
      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekEnd.getDate() + 6);
      query = query.gte("ride_date", ymd(weekStart)).lte("ride_date", ymd(weekEnd));
    }

    const [{ data: rData }, { data: dData }] = await Promise.all([
      query.order("ride_date").order("pickup_time"),
      supabase.from("drivers").select("id, name").eq("system", system),
    ]);
    setRides(rData ?? []);
    setDrivers(dData ?? []);
    setLoading(false);
  };

  useEffect(() => { load(); }, [system, filter]);

  // Auto-refresh every 60s
  useEffect(() => {
    const interval = setInterval(load, 60000);
    return () => clearInterval(interval);
  }, [system, filter]);

  const driverName = (id: string | null) => {
    if (!id) return null;
    return drivers.find((d) => d.id === id)?.name ?? null;
  };

  // Group by unique flight number
  const flightGroups = useMemo(() => {
    let filtered = rides;
    if (searchTerm) {
      const s = searchTerm.toLowerCase();
      filtered = rides.filter((r) =>
        (r.flight_number ?? "").toLowerCase().includes(s) ||
        (r.pickup_location ?? "").toLowerCase().includes(s) ||
        (r.passenger_name ?? "").toLowerCase().includes(s)
      );
    }

    const map: Record<string, { flight: string; rides: any[] }> = {};
    for (const r of filtered) {
      const fn = stripTrailingTime(r.flight_number).toUpperCase();
      if (!fn) continue;
      if (!map[fn]) map[fn] = { flight: fn, rides: [] };
      map[fn].rides.push(r);
    }
    return Object.values(map).sort((a, b) => {
      const aTime = a.rides[0]?.pickup_time ?? "";
      const bTime = b.rides[0]?.pickup_time ?? "";
      return aTime.localeCompare(bTime);
    });
  }, [rides, searchTerm]);

  if (loading) return <PageLoader />;

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-foreground flex items-center gap-2">
            <Plane className="w-5 h-5 text-[#6C63FF]" /> Flight Tracker
          </h1>
          <p className="text-sm text-muted-foreground">Track all flights from your rides • Auto-refreshes every minute</p>
        </div>
        <Button variant="outline" size="sm" onClick={load} className="gap-1 border-border text-foreground/80 hover:text-foreground">
          <RefreshCw className="w-3.5 h-3.5" /> Refresh
        </Button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-center">
        <Select value={filter} onValueChange={(v) => setFilter(v as DateFilter)}>
          <SelectTrigger className="input-luxury w-40"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="today">Today</SelectItem>
            <SelectItem value="tomorrow">Tomorrow</SelectItem>
            <SelectItem value="this_week">This Week</SelectItem>
            <SelectItem value="all">All</SelectItem>
          </SelectContent>
        </Select>
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/50" />
          <Input value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} placeholder="Search flights..." className="input-luxury pl-9" />
        </div>
        <Badge className="bg-muted/50 text-muted-foreground border-border">{flightGroups.length} flights • {rides.length} rides</Badge>
      </div>

      {flightGroups.length === 0 ? (
        <Card className="luxury-card p-12 text-center">
          <Plane className="w-12 h-12 mx-auto text-muted-foreground/40 mb-3" />
          <p className="text-muted-foreground/70">No flights found for the selected filter</p>
        </Card>
      ) : (
        <div className="space-y-3">
          {flightGroups.map((group) => (
            <Card key={group.flight} className="luxury-card overflow-hidden">
              <div className="px-4 py-3 border-b border-border flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="h-9 w-9 rounded-lg bg-[#6C63FF]/20 grid place-items-center">
                    <Plane className="w-4 h-4 text-[#6C63FF]" />
                  </div>
                  <div>
                    <span className="font-bold text-foreground text-sm">{group.flight}</span>
                    <span className="ml-2 text-xs text-muted-foreground/70">{group.rides[0]?.ride_date}</span>
                  </div>
                  <Badge className="text-[10px] bg-amber-500/20 text-amber-400 border-amber-500/30">
                    API pending
                  </Badge>
                </div>
                <div className="flex items-center gap-2">
                  <Badge className="bg-muted/50 text-muted-foreground border-border text-[10px]">
                    <Users className="w-3 h-3 mr-1" /> {group.rides.length} ride{group.rides.length !== 1 ? "s" : ""}
                  </Badge>
                  <FlightSearchButton ride={{ flight_number: group.flight }} />
                </div>
              </div>
              <div className="px-4 py-2">
                <Table>
                  <TableHeader>
                    <TableRow className="border-border">
                      <TableHead className="text-muted-foreground/70 text-[10px] py-1">Time</TableHead>
                      <TableHead className="text-muted-foreground/70 text-[10px] py-1">Pickup</TableHead>
                      <TableHead className="text-muted-foreground/70 text-[10px] py-1">Dropoff</TableHead>
                      <TableHead className="text-muted-foreground/70 text-[10px] py-1">Driver</TableHead>
                      <TableHead className="text-muted-foreground/70 text-[10px] py-1">Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {group.rides.map((r: any) => (
                      <TableRow key={r.id} className="border-border">
                        <TableCell className="text-xs text-foreground/80 py-1.5">
                          <Clock className="w-3 h-3 inline mr-1 text-muted-foreground/50" />{r.pickup_time || "—"}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground py-1.5">{r.pickup_location || "—"}</TableCell>
                        <TableCell className="text-xs text-muted-foreground py-1.5">{r.dropoff_location || "—"}</TableCell>
                        <TableCell className="text-xs text-muted-foreground py-1.5">{driverName(r.driver_id) || <span className="text-muted-foreground/50">Unassigned</span>}</TableCell>
                        <TableCell className="py-1.5">
                          <Badge className={`text-[10px] ${r.status === "completed" ? "bg-emerald-500/20 text-emerald-400" : r.status === "pending" ? "bg-gray-500/20 text-gray-400" : "bg-blue-500/20 text-blue-400"}`}>
                            {r.status}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
