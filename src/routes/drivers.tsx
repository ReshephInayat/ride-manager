import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { RequireAuth } from "@/components/RequireAuth";
import { AppShell } from "@/components/AppShell";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Plus, Trash2, Save } from "lucide-react";
import { toast } from "react-hot-toast";
import { PageLoader } from "@/components/Spinner";
import type { Driver } from "@/lib/rides";
import { useSystem } from "@/lib/system";

export const Route = createFileRoute("/drivers")({ component: DriversPage });

function DriversPage() {
  return (
    <RequireAuth>
      <AppShell>
        <DriversInner />
      </AppShell>
    </RequireAuth>
  );
}

function DriversInner() {
  const { system, label } = useSystem();
  const [rows, setRows] = useState<Driver[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("drivers")
      .select("*")
      .eq("system", system)
      .order("created_at", { ascending: true });
    if (error) toast.error(error.message);
    setRows((data as Driver[]) ?? []);
    setLoading(false);
  };

  useEffect(() => { load(); }, [system]);

  const update = (id: string, patch: Partial<Driver>) =>
    setRows((rs) => rs.map((r) => (r.id === id ? { ...r, ...patch } : r)));

  const save = async (d: Driver) => {
    const { error } = await supabase
      .from("drivers")
      .update({
        name: d.name,
        phone: d.phone,
        email: d.email,
        notes: d.notes,
        active: d.active,
      })
      .eq("id", d.id);
    if (error) toast.error(error.message);
    else toast.success("Saved");
  };

  const add = async () => {
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) return;
    const { data, error } = await supabase
      .from("drivers")
      .insert({ user_id: u.user.id, system, name: "New driver" })
      .select()
      .single();
    if (error) return toast.error(error.message);
    setRows((rs) => [...rs, data as Driver]);
  };

  const del = async (id: string) => {
    if (!confirm("Delete this driver? Rides assigned to them will be unassigned.")) return;
    const { error } = await supabase.from("drivers").delete().eq("id", id);
    if (error) return toast.error(error.message);
    setRows((rs) => rs.filter((r) => r.id !== id));
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold">Drivers</h1>
          <p className="text-muted-foreground mt-1">
            <span className="font-medium text-foreground">{label}</span> — manage drivers for this workspace.
          </p>
        </div>
        <Button onClick={add}><Plus className="h-4 w-4 mr-1" /> Add driver</Button>
      </div>

      {loading ? (
        <PageLoader label="Loading drivers…" />
      ) : (
        <div className="space-y-3">
          {rows.map((d) => (
            <Card key={d.id} className="p-4">
              <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-end">
                <div className="md:col-span-3">
                  <Label className="text-xs">Name</Label>
                  <Input value={d.name} onChange={(e) => update(d.id, { name: e.target.value })} />
                </div>
                <div className="md:col-span-2">
                  <Label className="text-xs">Phone</Label>
                  <Input value={d.phone ?? ""} onChange={(e) => update(d.id, { phone: e.target.value })} />
                </div>
                <div className="md:col-span-3">
                  <Label className="text-xs">Email</Label>
                  <Input value={d.email ?? ""} onChange={(e) => update(d.id, { email: e.target.value })} />
                </div>
                <div className="md:col-span-2">
                  <Label className="text-xs">Notes</Label>
                  <Input value={d.notes ?? ""} onChange={(e) => update(d.id, { notes: e.target.value })} />
                </div>
                <div className="md:col-span-1 flex items-center gap-2">
                  <Switch checked={d.active} onCheckedChange={(v) => update(d.id, { active: v })} />
                  <span className="text-xs text-muted-foreground">Active</span>
                </div>
                <div className="md:col-span-1 flex gap-2 justify-end">
                  <Button size="sm" onClick={() => save(d)}><Save className="h-4 w-4" /></Button>
                  <Button size="sm" variant="outline" onClick={() => del(d.id)}><Trash2 className="h-4 w-4" /></Button>
                </div>
              </div>
            </Card>
          ))}
          {rows.length === 0 && (
            <Card className="p-8 text-center text-muted-foreground">
              No drivers yet. Add your first driver above.
            </Card>
          )}
        </div>
      )}
    </div>
  );
}
