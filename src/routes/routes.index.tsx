import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { RequireAuth } from "@/components/RequireAuth";
import { AppShell } from "@/components/AppShell";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AutocompleteInput } from "@/components/AutocompleteInput";
import { PageLoader } from "@/components/Spinner";
import { Plus, Trash2, Save, ExternalLink } from "lucide-react";
import { toast } from "react-hot-toast";
import { useSystem } from "@/lib/system";

export const Route = createFileRoute("/routes/")({ component: RoutesPage });

interface RouteRow {
  id: string;
  name: string;
  pickup_location: string;
  dropoff_location: string;
  price: number;
}

function RoutesPage() {
  return (
    <RequireAuth>
      <AppShell>
        <RoutesInner />
      </AppShell>
    </RequireAuth>
  );
}

function RoutesInner() {
  const { system, label } = useSystem();
  const [rows, setRows] = useState<RouteRow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("routes")
      .select("*")
      .eq("system", system)
      .order("created_at", { ascending: true });
    if (error) toast.error(error.message);
    setRows((data as RouteRow[]) ?? []);
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, [system]);

  const update = (id: string, patch: Partial<RouteRow>) =>
    setRows((rs) => rs.map((r) => (r.id === id ? { ...r, ...patch } : r)));

  const save = async (r: RouteRow) => {
    const { error } = await supabase
      .from("routes")
      .update({
        name: r.name,
        pickup_location: r.pickup_location,
        dropoff_location: r.dropoff_location,
        price: r.price,
      })
      .eq("id", r.id);
    if (error) toast.error(error.message);
    else toast.success("Saved");
  };

  const add = async () => {
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) return;
    const { data, error } = await supabase
      .from("routes")
      .insert({
        user_id: u.user.id,
        system,
        name: "New route",
        pickup_location: "",
        dropoff_location: "",
        price: 0,
      })
      .select()
      .single();
    if (error) return toast.error(error.message);
    setRows((rs) => [...rs, data as RouteRow]);
  };

  const del = async (id: string) => {
    if (!confirm("Delete this route?")) return;
    const { error } = await supabase.from("routes").delete().eq("id", id);
    if (error) return toast.error(error.message);
    setRows((rs) => rs.filter((r) => r.id !== id));
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold">Routes & Pricing</h1>
          <p className="text-muted-foreground mt-1">
            <span className="font-medium text-foreground">{label}</span> — set the fixed price for each pickup → dropoff route.
          </p>
        </div>
        <Button onClick={add}>
          <Plus className="h-4 w-4 mr-1" /> Add route
        </Button>
      </div>

      {loading ? (
        <PageLoader label="Loading routes…" />
      ) : (
        <div className="space-y-3">
          {rows.map((r) => (
            <Card key={r.id} className="p-4">
              <div className="flex items-center justify-between mb-3">
                <Link
                  to="/routes/$id"
                  params={{ id: r.id }}
                  className="text-sm font-semibold text-primary hover:underline inline-flex items-center gap-1"
                >
                  Open route details <ExternalLink className="h-3 w-3" />
                </Link>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-end">
                <div className="md:col-span-3">
                  <Label className="text-xs">Route name</Label>
                  <Input value={r.name} onChange={(e) => update(r.id, { name: e.target.value })} />
                </div>
                <div className="md:col-span-3">
                  <Label className="text-xs">Pickup</Label>
                  <Input
                    value={r.pickup_location}
                    onChange={(e) => update(r.id, { pickup_location: e.target.value })}
                  />
                </div>
                <div className="md:col-span-3">
                  <Label className="text-xs">Dropoff</Label>
                  <Input
                    value={r.dropoff_location}
                    onChange={(e) => update(r.id, { dropoff_location: e.target.value })}
                  />
                </div>
                <div className="md:col-span-2">
                  <Label className="text-xs">Price ($)</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={r.price}
                    onChange={(e) => update(r.id, { price: parseFloat(e.target.value) || 0 })}
                  />
                </div>
                <div className="md:col-span-1 flex gap-2">
                  <Button size="sm" onClick={() => save(r)}>
                    <Save className="h-4 w-4" />
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => del(r.id)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </Card>
          ))}
          {rows.length === 0 && (
            <Card className="p-8 text-center text-muted-foreground">
              No routes yet. Add your first route above.
            </Card>
          )}
        </div>
      )}
    </div>
  );
}
