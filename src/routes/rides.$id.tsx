import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { RequireAuth } from "@/components/RequireAuth";
import { AppShell } from "@/components/AppShell";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  ArrowLeft, Pencil, Save, X, Trash2, BellPlus, Clock, MapPin,
  User as UserIcon, Plane, Phone, FileText as FileTextIcon, Bell, CheckCircle2,
} from "lucide-react";
import { toast } from "sonner";
import type { Ride, RideStatus, RouteRow, Driver, RideReminder } from "@/lib/rides";

export const Route = createFileRoute("/rides/$id")({ component: RideDetailPage });

function RideDetailPage() {
  return (
    <RequireAuth>
      <AppShell>
        <Inner />
      </AppShell>
    </RequireAuth>
  );
}

const statusTone: Record<RideStatus, string> = {
  pending: "bg-slate-200 text-slate-900 dark:bg-slate-700 dark:text-slate-100",
  completed: "bg-emerald-100 text-emerald-900 border-emerald-300 dark:bg-emerald-900/40 dark:text-emerald-100",
  cancelled: "bg-rose-100 text-rose-900 border-rose-300 dark:bg-rose-900/40 dark:text-rose-100",
  no_show: "bg-amber-100 text-amber-900 border-amber-300 dark:bg-amber-900/40 dark:text-amber-100",
};

function Inner() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const [ride, setRide] = useState<Ride | null>(null);
  const [routes, setRoutes] = useState<RouteRow[]>([]);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [reminders, setReminders] = useState<RideReminder[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);

  const [draft, setDraft] = useState<Partial<Ride>>({});

  // reminder form
  const [remindAt, setRemindAt] = useState("");
  const [remindMsg, setRemindMsg] = useState("");

  const load = async () => {
    setLoading(true);
    const [r, rt, dr, rm] = await Promise.all([
      supabase.from("rides").select("*").eq("id", id).maybeSingle(),
      supabase.from("routes").select("*"),
      supabase.from("drivers").select("*"),
      supabase.from("ride_reminders").select("*").eq("ride_id", id).order("remind_at"),
    ]);
    if (r.error) toast.error(r.error.message);
    setRide((r.data as Ride) ?? null);
    setRoutes((rt.data as RouteRow[]) ?? []);
    setDrivers((dr.data as Driver[]) ?? []);
    setReminders((rm.data as RideReminder[]) ?? []);
    setLoading(false);
  };

  useEffect(() => { load(); }, [id]);

  const startEdit = () => {
    if (!ride) return;
    setDraft({ ...ride });
    setEditing(true);
  };

  const save = async () => {
    if (!ride) return;
    setSaving(true);
    const patch = {
      ride_date: draft.ride_date,
      pickup_time: draft.pickup_time,
      pickup_location: draft.pickup_location,
      pickup_from: draft.pickup_from,
      dropoff_location: draft.dropoff_location,
      dropoff_to: draft.dropoff_to,
      department: draft.department,
      riders: draft.riders ?? 1,
      passenger_name: draft.passenger_name ?? null,
      flight_number: draft.flight_number ?? null,
      phone: draft.phone ?? null,
      notes: draft.notes ?? null,
      driver_id: draft.driver_id ?? null,
      route_id: draft.route_id ?? null,
      amount: draft.amount ?? 0,
      status: draft.status ?? "pending",
    };
    const { error } = await supabase.from("rides").update(patch).eq("id", ride.id);
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Ride updated");
    setEditing(false);
    load();
  };

  const setStatus = async (status: RideStatus) => {
    if (!ride) return;
    const { error } = await supabase.from("rides").update({ status }).eq("id", ride.id);
    if (error) return toast.error(error.message);
    setRide({ ...ride, status });
    toast.success(`Marked ${status}`);
  };

  const remove = async () => {
    if (!ride) return;
    if (!confirm("Delete this ride?")) return;
    const { error } = await supabase.from("rides").delete().eq("id", ride.id);
    if (error) return toast.error(error.message);
    toast.success("Deleted");
    navigate({ to: "/dashboard" });
  };

  const addReminder = async () => {
    if (!ride || !remindAt) return toast.error("Pick a date/time first.");
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) return;
    const { error } = await supabase.from("ride_reminders").insert({
      user_id: u.user.id,
      ride_id: ride.id,
      remind_at: new Date(remindAt).toISOString(),
      message: remindMsg || null,
    });
    if (error) return toast.error(error.message);
    setRemindAt(""); setRemindMsg("");
    toast.success("Reminder set");
    load();
  };

  const deleteReminder = async (rid: string) => {
    const { error } = await supabase.from("ride_reminders").delete().eq("id", rid);
    if (error) return toast.error(error.message);
    setReminders((rs) => rs.filter((r) => r.id !== rid));
  };

  if (loading) return <p className="text-muted-foreground">Loading…</p>;
  if (!ride) return <p>Ride not found.</p>;

  const driver = drivers.find((d) => d.id === ride.driver_id);
  const route = routes.find((r) => r.id === ride.route_id);

  return (
    <div className="max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6 flex-wrap gap-2">
        <Button asChild variant="ghost"><Link to="/dashboard"><ArrowLeft className="h-4 w-4 mr-1" /> Back to rides</Link></Button>
        <div className="flex gap-2">
          {!editing ? (
            <>
              <Button variant="outline" onClick={startEdit}><Pencil className="h-4 w-4 mr-1" /> Edit ride</Button>
              <Button variant="destructive" onClick={remove}><Trash2 className="h-4 w-4 mr-1" /> Delete</Button>
            </>
          ) : (
            <>
              <Button variant="ghost" onClick={() => setEditing(false)}><X className="h-4 w-4 mr-1" /> Cancel</Button>
              <Button onClick={save} disabled={saving}><Save className="h-4 w-4 mr-1" /> {saving ? "Saving…" : "Save"}</Button>
            </>
          )}
        </div>
      </div>

      {/* Hero */}
      <Card className="p-6 mb-4 bg-gradient-to-br from-primary/5 via-card to-accent/5 border-primary/20">
        <div className="flex items-start justify-between flex-wrap gap-4">
          <div>
            <div className="text-xs uppercase tracking-wide text-muted-foreground">Ride</div>
            <h1 className="text-3xl font-bold mt-1">
              {ride.pickup_location ?? "?"} → {ride.dropoff_location ?? "?"}
            </h1>
            <div className="flex items-center gap-3 mt-2 text-sm text-muted-foreground">
              <span className="flex items-center gap-1"><Clock className="h-4 w-4" /> {ride.ride_date} {ride.pickup_time && `• ${ride.pickup_time}`}</span>
              {ride.department && <span>• {ride.department}</span>}
            </div>
          </div>
          <div className="flex flex-col items-end gap-2">
            <Badge className={`text-sm px-3 py-1 ${statusTone[ride.status]} border`} variant="outline">
              {ride.status.replace("_", " ").toUpperCase()}
            </Badge>
            <div className="text-2xl font-bold">${Number(ride.amount).toFixed(2)}</div>
          </div>
        </div>

        {!editing && (
          <div className="flex gap-2 mt-4 flex-wrap">
            <Button size="sm" variant="outline" onClick={() => setStatus("completed")} className="border-emerald-300 text-emerald-700 hover:bg-emerald-50 dark:hover:bg-emerald-950/40">
              <CheckCircle2 className="h-4 w-4 mr-1" /> Mark completed
            </Button>
            <Button size="sm" variant="outline" onClick={() => setStatus("cancelled")} className="border-rose-300 text-rose-700">Cancelled</Button>
            <Button size="sm" variant="outline" onClick={() => setStatus("no_show")} className="border-amber-300 text-amber-700">No show</Button>
            <Button size="sm" variant="outline" onClick={() => setStatus("pending")}>Pending</Button>
          </div>
        )}
      </Card>

      <div className="grid md:grid-cols-2 gap-4">
        {/* Trip Info */}
        <Card className="p-5">
          <h2 className="font-semibold mb-3 flex items-center gap-2"><MapPin className="h-4 w-4 text-primary" /> Trip details</h2>
          {!editing ? (
            <dl className="space-y-2 text-sm">
              <Row label="Date">{ride.ride_date}</Row>
              <Row label="Pickup time">{ride.pickup_time ?? "—"}</Row>
              <Row label="Pickup">{ride.pickup_location ?? "—"} {ride.pickup_from && <span className="text-muted-foreground">({ride.pickup_from})</span>}</Row>
              <Row label="Dropoff">{ride.dropoff_location ?? "—"} {ride.dropoff_to && <span className="text-muted-foreground">({ride.dropoff_to})</span>}</Row>
              <Row label="Department">{ride.department ?? "—"}</Row>
              <Row label="Riders">{ride.riders}</Row>
              <Row label="Route">{route ? `${route.name} • $${route.price}` : "—"}</Row>
              <Row label="Source">{ride.source_file ?? "—"}</Row>
            </dl>
          ) : (
            <div className="space-y-3 text-sm">
              <Field label="Date"><Input type="date" value={draft.ride_date ?? ""} onChange={(e) => setDraft({ ...draft, ride_date: e.target.value })} /></Field>
              <Field label="Pickup time"><Input value={draft.pickup_time ?? ""} onChange={(e) => setDraft({ ...draft, pickup_time: e.target.value })} placeholder="e.g. 14:30" /></Field>
              <Field label="Pickup location"><Input value={draft.pickup_location ?? ""} onChange={(e) => setDraft({ ...draft, pickup_location: e.target.value })} /></Field>
              <Field label="Pickup from (address)"><Input value={draft.pickup_from ?? ""} onChange={(e) => setDraft({ ...draft, pickup_from: e.target.value })} /></Field>
              <Field label="Dropoff location"><Input value={draft.dropoff_location ?? ""} onChange={(e) => setDraft({ ...draft, dropoff_location: e.target.value })} /></Field>
              <Field label="Dropoff to (address)"><Input value={draft.dropoff_to ?? ""} onChange={(e) => setDraft({ ...draft, dropoff_to: e.target.value })} /></Field>
              <Field label="Department"><Input value={draft.department ?? ""} onChange={(e) => setDraft({ ...draft, department: e.target.value })} /></Field>
              <Field label="Riders"><Input type="number" value={draft.riders ?? 1} onChange={(e) => setDraft({ ...draft, riders: Number(e.target.value) || 1 })} /></Field>
              <Field label="Route">
                <Select value={draft.route_id ?? "__none__"} onValueChange={(v) => {
                  const rid = v === "__none__" ? null : v;
                  const rt = routes.find((x) => x.id === rid);
                  setDraft({ ...draft, route_id: rid, amount: rt?.price ?? draft.amount ?? 0 });
                }}>
                  <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">—</SelectItem>
                    {routes.map((r) => <SelectItem key={r.id} value={r.id}>{r.name} — ${r.price}</SelectItem>)}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Amount ($)"><Input type="number" step="0.01" value={draft.amount ?? 0} onChange={(e) => setDraft({ ...draft, amount: Number(e.target.value) || 0 })} /></Field>
            </div>
          )}
        </Card>

        {/* Passenger + Driver */}
        <Card className="p-5">
          <h2 className="font-semibold mb-3 flex items-center gap-2"><UserIcon className="h-4 w-4 text-primary" /> Passenger & driver</h2>
          {!editing ? (
            <dl className="space-y-2 text-sm">
              <Row label="Passenger" icon={<UserIcon className="h-3.5 w-3.5" />}>{ride.passenger_name ?? "—"}</Row>
              <Row label="Phone" icon={<Phone className="h-3.5 w-3.5" />}>
                {ride.phone ? <a className="text-primary underline" href={`tel:${ride.phone}`}>{ride.phone}</a> : "—"}
              </Row>
              <Row label="Flight #" icon={<Plane className="h-3.5 w-3.5" />}>{ride.flight_number ?? "—"}</Row>
              <Row label="Driver">
                {driver ? (
                  <span className="font-medium">{driver.name}{driver.phone && <span className="text-muted-foreground"> • {driver.phone}</span>}</span>
                ) : <span className="text-muted-foreground">Unassigned</span>}
              </Row>
              {ride.notes && (
                <div className="pt-2 border-t mt-2">
                  <div className="text-xs uppercase text-muted-foreground mb-1 flex items-center gap-1"><FileTextIcon className="h-3.5 w-3.5" /> Notes</div>
                  <div className="whitespace-pre-wrap">{ride.notes}</div>
                </div>
              )}
            </dl>
          ) : (
            <div className="space-y-3 text-sm">
              <Field label="Passenger name"><Input value={draft.passenger_name ?? ""} onChange={(e) => setDraft({ ...draft, passenger_name: e.target.value })} /></Field>
              <Field label="Phone"><Input value={draft.phone ?? ""} onChange={(e) => setDraft({ ...draft, phone: e.target.value })} /></Field>
              <Field label="Flight number"><Input value={draft.flight_number ?? ""} onChange={(e) => setDraft({ ...draft, flight_number: e.target.value })} /></Field>
              <Field label="Driver">
                <Select value={draft.driver_id ?? "__none__"} onValueChange={(v) => setDraft({ ...draft, driver_id: v === "__none__" ? null : v })}>
                  <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">— Unassigned —</SelectItem>
                    {drivers.map((d) => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Status">
                <Select value={draft.status ?? "pending"} onValueChange={(v) => setDraft({ ...draft, status: v as RideStatus })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pending">Pending</SelectItem>
                    <SelectItem value="completed">Completed</SelectItem>
                    <SelectItem value="cancelled">Cancelled</SelectItem>
                    <SelectItem value="no_show">No show</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Notes"><Textarea rows={3} value={draft.notes ?? ""} onChange={(e) => setDraft({ ...draft, notes: e.target.value })} /></Field>
            </div>
          )}
        </Card>
      </div>

      {/* Reminders */}
      <Card className="p-5 mt-4">
        <h2 className="font-semibold mb-3 flex items-center gap-2"><Bell className="h-4 w-4 text-primary" /> Reminders</h2>
        <p className="text-xs text-muted-foreground mb-3">
          Manual reminders for this ride. (Drivers also get automatic reminders 1 day, 1 hour, and 5 minutes before pickup.)
        </p>
        <div className="flex flex-wrap items-end gap-2 mb-4">
          <div>
            <Label className="text-xs">Remind at</Label>
            <Input type="datetime-local" value={remindAt} onChange={(e) => setRemindAt(e.target.value)} className="w-56" />
          </div>
          <div className="flex-1 min-w-[180px]">
            <Label className="text-xs">Message (optional)</Label>
            <Input value={remindMsg} onChange={(e) => setRemindMsg(e.target.value)} placeholder="e.g. Confirm flight ETA" />
          </div>
          <Button onClick={addReminder}><BellPlus className="h-4 w-4 mr-1" /> Add reminder</Button>
        </div>
        {reminders.length === 0 ? (
          <p className="text-sm text-muted-foreground italic">No manual reminders yet.</p>
        ) : (
          <ul className="space-y-2">
            {reminders.map((r) => (
              <li key={r.id} className="flex items-center justify-between border rounded-md px-3 py-2 text-sm">
                <div>
                  <div className="font-medium">{new Date(r.remind_at).toLocaleString()}</div>
                  {r.message && <div className="text-xs text-muted-foreground">{r.message}</div>}
                </div>
                <div className="flex items-center gap-2">
                  {r.notified && <Badge variant="outline" className="text-xs">Sent</Badge>}
                  <button onClick={() => deleteReminder(r.id)} className="text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded p-1">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

function Row({ label, children, icon }: { label: string; children: React.ReactNode; icon?: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-muted-foreground flex items-center gap-1.5">{icon}{label}</dt>
      <dd className="text-right font-medium">{children}</dd>
    </div>
  );
}
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <div className="mt-1">{children}</div>
    </div>
  );
}
