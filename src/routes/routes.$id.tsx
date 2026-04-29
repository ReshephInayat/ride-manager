import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { RequireAuth } from "@/components/RequireAuth";
import { AppShell } from "@/components/AppShell";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { PageLoader } from "@/components/Spinner";
import {
  ArrowLeft, Save, Trash2, MapPin, DollarSign, Car as CarIcon, FileText, CheckCircle2,
} from "lucide-react";
import { toast } from "sonner";
import type { Ride, RouteRow, RideStatus } from "@/lib/rides";

export const Route = createFileRoute("/routes/$id")({ component: RouteDetailPage });

function RouteDetailPage() {
  return (
    <RequireAuth>
      <AppShell>
        <Inner />
      </AppShell>
    </RequireAuth>
  );
}

function Inner() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const [route, setRoute] = useState<RouteRow | null>(null);
  const [rides, setRides] = useState<Ride[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [name, setName] = useState("");
  const [pickup, setPickup] = useState("");
  const [dropoff, setDropoff] = useState("");
  const [price, setPrice] = useState(0);

  const load = async () => {
    setLoading(true);
    const [rRes, ridesRes] = await Promise.all([
      supabase.from("routes").select("*").eq("id", id).maybeSingle(),
      supabase.from("rides").select("*").eq("route_id", id).order("ride_date", { ascending: false }),
    ]);
    if (rRes.error) toast.error(rRes.error.message);
    const r = (rRes.data as RouteRow) ?? null;
    setRoute(r);
    if (r) {
      setName(r.name);
      setPickup(r.pickup_location);
      setDropoff(r.dropoff_location);
      setPrice(Number(r.price));
    }
    setRides((ridesRes.data as Ride[]) ?? []);
    setLoading(false);
  };

  useEffect(() => { load(); }, [id]);

  const stats = useMemo(() => {
    const counts: Record<RideStatus | "all", number> = {
      all: rides.length,
      pending: 0, completed: 0, cancelled: 0, no_show: 0,
    };
    let earned = 0;
    for (const r of rides) {
      counts[r.status] += 1;
      if (r.status === "completed") earned += Number(r.amount);
    }
    return { counts, earned };
  }, [rides]);

  const save = async () => {
    if (!route) return;
    setSaving(true);
    const { error } = await supabase
      .from("routes")
      .update({ name, pickup_location: pickup, dropoff_location: dropoff, price })
      .eq("id", route.id);
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Route saved");
    load();
  };

  const del = async () => {
    if (!route) return;
    if (!confirm("Delete this route? Rides keeping it will lose their pricing link.")) return;
    const { error } = await supabase.from("routes").delete().eq("id", route.id);
    if (error) return toast.error(error.message);
    toast.success("Route deleted");
    navigate({ to: "/routes" });
  };

  if (loading) return <PageLoader label="Loading route…" />;
  if (!route) return <p>Route not found.</p>;

  return (
    <div>
      <div className="flex items-center justify-between flex-wrap gap-2 mb-6">
        <Button asChild variant="ghost">
          <Link to="/routes"><ArrowLeft className="h-4 w-4 mr-1" /> Back to routes</Link>
        </Button>
        <div className="flex gap-2">
          <Button variant="outline" onClick={del}>
            <Trash2 className="h-4 w-4 mr-1" /> Delete
          </Button>
          <Button onClick={save} disabled={saving}>
            <Save className="h-4 w-4 mr-1" /> {saving ? "Saving…" : "Save changes"}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
        <Card className="p-5 bg-gradient-to-br from-blue-50 to-blue-100 border-blue-200 dark:from-blue-950/40 dark:to-blue-900/30 dark:border-blue-800">
          <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-blue-800 dark:text-blue-200">
            <CarIcon className="h-4 w-4" /> Total rides
          </div>
          <div className="text-3xl font-bold mt-1 text-blue-900 dark:text-blue-100">{stats.counts.all}</div>
        </Card>
        <Card className="p-5 bg-gradient-to-br from-emerald-50 to-emerald-100 border-emerald-200 dark:from-emerald-950/40 dark:to-emerald-900/30 dark:border-emerald-800">
          <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-emerald-800 dark:text-emerald-200">
            <CheckCircle2 className="h-4 w-4" /> Completed
          </div>
          <div className="text-3xl font-bold mt-1 text-emerald-900 dark:text-emerald-100">{stats.counts.completed}</div>
        </Card>
        <Card className="p-5 bg-gradient-to-br from-amber-50 to-amber-100 border-amber-200 dark:from-amber-950/40 dark:to-amber-900/30 dark:border-amber-800">
          <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-amber-800 dark:text-amber-200">
            <DollarSign className="h-4 w-4" /> Earned (completed)
          </div>
          <div className="text-3xl font-bold mt-1 text-amber-900 dark:text-amber-100">${stats.earned.toFixed(2)}</div>
        </Card>
      </div>

      <Card className="p-5 mb-6">
        <h2 className="font-semibold text-lg mb-4 flex items-center gap-2">
          <MapPin className="h-4 w-4 text-primary" /> Route details
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <Label>Route name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} className="mt-1" />
          </div>
          <div>
            <Label>Price ($)</Label>
            <Input
              type="number" step="0.01"
              value={price}
              onChange={(e) => setPrice(parseFloat(e.target.value) || 0)}
              className="mt-1"
            />
          </div>
          <div>
            <Label>Pickup location</Label>
            <Input value={pickup} onChange={(e) => setPickup(e.target.value)} className="mt-1" />
          </div>
          <div>
            <Label>Dropoff location</Label>
            <Input value={dropoff} onChange={(e) => setDropoff(e.target.value)} className="mt-1" />
          </div>
        </div>
      </Card>

      <Card className="p-5">
        <h2 className="font-semibold text-lg mb-4 flex items-center gap-2">
          <FileText className="h-4 w-4 text-primary" /> Rides on this route ({rides.length})
        </h2>
        {rides.length === 0 ? (
          <div className="text-sm text-muted-foreground py-6 text-center">No rides assigned to this route yet.</div>
        ) : (
          <div className="divide-y">
            {rides.map((r) => (
              <Link
                key={r.id}
                to="/rides/$id"
                params={{ id: r.id }}
                className="flex items-center justify-between gap-3 py-3 hover:bg-secondary/40 -mx-2 px-2 rounded-md"
              >
                <div className="text-sm">
                  <div className="font-medium">{r.ride_date} • {r.pickup_time ?? "—"}</div>
                  <div className="text-muted-foreground text-xs">
                    {r.pickup_from ?? r.pickup_location} → {r.dropoff_to ?? r.dropoff_location}
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <Badge variant="outline" className="capitalize">{r.status.replace("_", " ")}</Badge>
                  <span className="font-semibold">${Number(r.amount).toFixed(2)}</span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
