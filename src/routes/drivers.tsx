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
import { Plus, Trash2, Save, KeyRound } from "lucide-react";
import { toast } from "react-hot-toast";
import { PageLoader } from "@/components/Spinner";
import type { Driver } from "@/lib/rides";
import { useSystem } from "@/lib/system";
import { z } from "zod";

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

const driverSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(100, "Name too long"),
  phone: z.string().trim().max(40, "Phone too long").optional().or(z.literal("")),
  email: z.string().trim().max(255, "Email too long").email("Invalid email").optional().or(z.literal("")),
  notes: z.string().max(500, "Notes too long").optional().or(z.literal("")),
});

const pinSchema = z
  .string()
  .trim()
  .regex(/^\d{4,8}$/, "PIN must be 4–8 digits")
  .or(z.literal(""));

// Track an unsaved "draft PIN" per row so admins can rotate PINs.
type DriverRow = Driver & { _pinDraft?: string };

function DriversInner() {
  const { system, label } = useSystem();
  const [rows, setRows] = useState<DriverRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingAll, setSavingAll] = useState(false);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("drivers")
      .select("*")
      .eq("system", system)
      .order("created_at", { ascending: true });
    if (error) toast.error(error.message);
    setRows(((data as Driver[]) ?? []).map((d) => ({ ...d, _pinDraft: "" })));
    setLoading(false);
  };

  useEffect(() => { load(); }, [system]);

  const update = (id: string, patch: Partial<DriverRow>) =>
    setRows((rs) => rs.map((r) => (r.id === id ? { ...r, ...patch } : r)));

  const saveOne = async (d: DriverRow): Promise<boolean> => {
    const parsed = driverSchema.safeParse({
      name: d.name, phone: d.phone ?? "", email: d.email ?? "", notes: d.notes ?? "",
    });
    if (!parsed.success) {
      toast.error(`${d.name || "Driver"}: ${parsed.error.issues[0].message}`);
      return false;
    }
    const { error } = await supabase
      .from("drivers")
      .update({
        name: d.name,
        phone: d.phone || null,
        email: d.email || null,
        notes: d.notes || null,
        active: d.active,
      })
      .eq("id", d.id);
    if (error) { toast.error(error.message); return false; }

    // If a new PIN was typed, set it via RPC (server-side hashing)
    const pinDraft = (d._pinDraft ?? "").trim();
    if (pinDraft.length > 0) {
      const pinCheck = pinSchema.safeParse(pinDraft);
      if (!pinCheck.success) {
        toast.error(`${d.name}: ${pinCheck.error.issues[0].message}`);
        return false;
      }
      const { error: e2 } = await supabase.rpc("set_driver_pin", { _driver_id: d.id, _pin: pinDraft });
      if (e2) { toast.error(e2.message); return false; }
      update(d.id, { _pinDraft: "" });
    }
    return true;
  };

  const save = async (d: DriverRow) => {
    const ok = await saveOne(d);
    if (ok) toast.success("Saved");
  };

  const saveAll = async () => {
    setSavingAll(true);
    let count = 0;
    for (const d of rows) {
      // eslint-disable-next-line no-await-in-loop
      const ok = await saveOne(d);
      if (ok) count += 1;
      else { setSavingAll(false); return; }
    }
    setSavingAll(false);
    toast.success(`Saved ${count} drivers`);
    load();
  };

  const clearPin = async (d: DriverRow) => {
    if (!confirm(`Remove PIN for ${d.name}? They won't be able to sign in until you set a new one.`)) return;
    const { error } = await supabase.rpc("set_driver_pin", { _driver_id: d.id, _pin: "" });
    if (error) return toast.error(error.message);
    toast.success("PIN cleared");
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
    setRows((rs) => [...rs, { ...(data as Driver), _pinDraft: "" }]);
    toast.success("Driver added");
  };

  const del = async (id: string) => {
    if (!confirm("Delete this driver? Rides assigned to them will be unassigned.")) return;
    const { error } = await supabase.from("drivers").delete().eq("id", id);
    if (error) return toast.error(error.message);
    setRows((rs) => rs.filter((r) => r.id !== id));
    toast.success("Driver deleted");
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6 gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold">Drivers</h1>
          <p className="text-muted-foreground mt-1 text-sm sm:text-base">
            <span className="font-medium text-foreground">{label}</span> — manage drivers for this workspace.
          </p>
          <p className="text-xs text-muted-foreground mt-2">
            Drivers sign in at <code className="bg-muted px-1 py-0.5 rounded">/driver</code> using a 4–8 digit PIN you set below. Saved PINs are visible to admins for easy reference. Older hashed PINs show as "—" until you reset them.
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          {rows.length > 0 && (
            <Button variant="outline" onClick={saveAll} disabled={savingAll}>
              <Save className="h-4 w-4 mr-1" /> {savingAll ? "Saving…" : "Save all"}
            </Button>
          )}
          <Button onClick={add}><Plus className="h-4 w-4 mr-1" /> Add driver</Button>
        </div>
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
                  <Input value={d.name} onChange={(e) => update(d.id, { name: e.target.value })} maxLength={100} />
                </div>
                <div className="md:col-span-2">
                  <Label className="text-xs">Phone</Label>
                  <Input value={d.phone ?? ""} onChange={(e) => update(d.id, { phone: e.target.value })} maxLength={40} />
                </div>
                <div className="md:col-span-2">
                  <Label className="text-xs">Email</Label>
                  <Input type="email" value={d.email ?? ""} onChange={(e) => update(d.id, { email: e.target.value })} maxLength={255} />
                </div>
                <div className="md:col-span-2">
                  <Label className="text-xs flex items-center gap-1">
                    <KeyRound className="h-3 w-3" /> {d.pin_hash ? "PIN (hashed)" : "Set PIN"}
                  </Label>
                  <div className="flex gap-1 items-center">
                    <Input
                      placeholder={d.pin_hash ? "Enter new PIN to replace" : "4–8 digits"}
                      value={d._pinDraft ?? ""}
                      onChange={(e) => update(d.id, { _pinDraft: e.target.value.replace(/\D/g, "").slice(0, 8) })}
                    />
                    {d.pin_hash && (
                      <Button size="sm" variant="outline" onClick={() => clearPin(d)} title="Clear PIN">
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </div>
                <div className="md:col-span-1">
                  <Label className="text-xs">Notes</Label>
                  <Input value={d.notes ?? ""} onChange={(e) => update(d.id, { notes: e.target.value })} maxLength={500} />
                </div>
                <div className="md:col-span-1 flex items-center gap-2">
                  <Switch checked={d.active} onCheckedChange={(v) => update(d.id, { active: v })} />
                  <span className="text-xs text-muted-foreground">Active</span>
                </div>
                <div className="md:col-span-1 flex gap-2 justify-end">
                  <Button size="sm" onClick={() => save(d)} title="Save row"><Save className="h-4 w-4" /></Button>
                  <Button size="sm" variant="outline" onClick={() => del(d.id)} title="Delete driver"><Trash2 className="h-4 w-4" /></Button>
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
