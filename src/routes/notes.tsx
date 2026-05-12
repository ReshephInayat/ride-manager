import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { RequireAuth } from "@/components/RequireAuth";
import { AppShell } from "@/components/AppShell";
import { supabase } from "@/integrations/supabase/client";
import { useSystem } from "@/lib/system";
import { useAuth } from "@/lib/auth";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Bell,
  StickyNote,
  Trash2,
  Check,
  Plus,
  Send,
  AlertCircle,
  HelpCircle,
  Pencil,
  Car,
  X,
} from "lucide-react";
import { toast } from "react-hot-toast";

export const Route = createFileRoute("/notes")({ component: NotesPage });

function NotesPage() {
  return (
    <RequireAuth>
      <AppShell>
        <NotesInner />
      </AppShell>
    </RequireAuth>
  );
}

type Category = "admin" | "driver";
type Note = {
  id: string;
  category: Category;
  title: string;
  body: string | null;
  driver_id: string | null;
  ride_id: string | null;
  is_reminder: boolean;
  remind_at: string | null;
  sms_sent: boolean;
  is_question: boolean;
  answered: boolean;
  answer: string | null;
  created_by: "admin" | "driver";
  done: boolean;
  created_at: string;
};

type RideLite = {
  id: string;
  ride_date: string;
  pickup_time: string | null;
  pickup_location: string | null;
  dropoff_location: string | null;
  passenger_name: string | null;
};

function NotesInner() {
  const { system } = useSystem();
  const { user } = useAuth();
  const [tab, setTab] = useState<Category>("admin");
  const [notes, setNotes] = useState<Note[]>([]);
  const [drivers, setDrivers] = useState<{ id: string; name: string; phone: string | null }[]>([]);
  const [rides, setRides] = useState<RideLite[]>([]);
  const [loading, setLoading] = useState(true);

  // composer / editor state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [isReminder, setIsReminder] = useState(false);
  const [remindAt, setRemindAt] = useState("");
  const [driverId, setDriverId] = useState<string>("");
  const [rideId, setRideId] = useState<string>("");
  const [rideQuery, setRideQuery] = useState("");
  const [saving, setSaving] = useState(false);

  const resetForm = () => {
    setEditingId(null);
    setTitle("");
    setBody("");
    setIsReminder(false);
    setRemindAt("");
    setDriverId("");
    setRideId("");
    setRideQuery("");
  };

  const load = async () => {
    setLoading(true);
    const todayStr = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);
    const [{ data: n }, { data: d }, { data: r }] = await Promise.all([
      supabase.from("notes").select("*").eq("system", system).order("created_at", { ascending: false }),
      supabase.from("drivers").select("id, name, phone").eq("system", system).eq("active", true),
      supabase
        .from("rides")
        .select("id, ride_date, pickup_time, pickup_location, dropoff_location, passenger_name")
        .eq("system", system)
        .gte("ride_date", todayStr)
        .order("ride_date", { ascending: true })
        .order("pickup_time", { ascending: true })
        .limit(200),
    ]);
    setNotes((n as any) ?? []);
    setDrivers((d as any) ?? []);
    setRides((r as any) ?? []);
    setLoading(false);
  };

  useEffect(() => {
    load();
    const ch = supabase
      .channel(`notes-${system}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "notes" }, () => load())
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [system]);

  const filtered = useMemo(() => notes.filter((n) => n.category === tab), [notes, tab]);

  const filteredRides = useMemo(() => {
    const q = rideQuery.trim().toLowerCase();
    if (!q) return rides.slice(0, 25);
    return rides
      .filter((r) =>
        [r.passenger_name, r.pickup_location, r.dropoff_location, r.ride_date, r.pickup_time]
          .filter(Boolean)
          .join(" ")
          .toLowerCase()
          .includes(q),
      )
      .slice(0, 25);
  }, [rides, rideQuery]);

  const selectedRide = useMemo(() => rides.find((r) => r.id === rideId), [rides, rideId]);

  const beginEdit = (n: Note) => {
    setEditingId(n.id);
    setTab(n.category);
    setTitle(n.title);
    setBody(n.body ?? "");
    setIsReminder(n.is_reminder);
    setRemindAt(n.remind_at ? new Date(n.remind_at).toISOString().slice(0, 16) : "");
    setDriverId(n.driver_id ?? "");
    setRideId(n.ride_id ?? "");
    setRideQuery("");
    if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const submit = async () => {
    if (!title.trim()) return toast.error("Title required");
    if (tab === "driver" && !driverId) return toast.error("Pick a driver");
    if (isReminder && !remindAt) return toast.error("Pick a reminder time");
    setSaving(true);
    const payload = {
      title: title.trim(),
      body: body.trim() || null,
      driver_id: tab === "driver" ? driverId : null,
      ride_id: rideId || null,
      is_reminder: isReminder,
      remind_at: isReminder ? new Date(remindAt).toISOString() : null,
      category: tab,
    };
    let error;
    if (editingId) {
      ({ error } = await supabase
        .from("notes")
        .update({ ...payload, sms_sent: isReminder ? false : undefined })
        .eq("id", editingId));
    } else {
      ({ error } = await supabase
        .from("notes")
        .insert({ ...payload, user_id: user!.id, system, created_by: "admin" }));
    }
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success(editingId ? "Note updated" : isReminder ? "Reminder scheduled" : "Note saved");
    resetForm();
    load();
  };

  const toggleDone = async (n: Note) => {
    await supabase.from("notes").update({ done: !n.done }).eq("id", n.id);
    load();
  };

  const remove = async (n: Note) => {
    if (!confirm("Delete this note?")) return;
    await supabase.from("notes").delete().eq("id", n.id);
    if (editingId === n.id) resetForm();
    load();
  };

  const answerQuestion = async (n: Note) => {
    const ans = prompt("Your reply to the driver:", n.answer ?? "");
    if (ans === null) return;
    await supabase
      .from("notes")
      .update({ answered: true, answer: ans, answered_at: new Date().toISOString() })
      .eq("id", n.id);
    toast.success("Reply saved");
    load();
  };

  const rideLabel = (r: RideLite) =>
    `${r.ride_date} ${r.pickup_time ?? ""} • ${r.passenger_name ?? "—"} • ${r.pickup_location ?? "—"} → ${r.dropoff_location ?? "—"}`;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-foreground flex items-center gap-2">
          <StickyNote className="w-5 h-5 text-[#6C63FF]" /> Notes & Reminders
        </h1>
        <p className="text-sm text-muted-foreground">
          Personal notes, reminders, and driver communication. Reminders trigger an SMS to the assigned driver.
        </p>
      </div>

      <Tabs value={tab} onValueChange={(v) => { setTab(v as Category); resetForm(); }}>
        <TabsList>
          <TabsTrigger value="admin">Admin notes</TabsTrigger>
          <TabsTrigger value="driver">Driver notes</TabsTrigger>
        </TabsList>
      </Tabs>

      {/* Composer / Editor */}
      <Card className="luxury-card p-4 space-y-3">
        <div className="font-semibold text-sm text-foreground flex items-center gap-2">
          {editingId ? (
            <><Pencil className="w-4 h-4" /> Edit note</>
          ) : (
            <><Plus className="w-4 h-4" /> New {tab === "admin" ? "admin note" : "driver note"}</>
          )}
          {editingId && (
            <button
              onClick={resetForm}
              className="ml-auto text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
            >
              <X className="w-3 h-3" /> Cancel edit
            </button>
          )}
        </div>
        <Input
          placeholder="Title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="input-luxury"
        />
        <Textarea
          placeholder="Details (optional)"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          className="input-luxury min-h-[80px]"
        />

        {/* Ride attach */}
        <div className="rounded-lg border border-border bg-muted/30 p-3 space-y-2">
          <div className="flex items-center gap-2 text-xs font-semibold text-foreground">
            <Car className="w-3.5 h-3.5 text-[#6C63FF]" /> Attach a ride (optional)
          </div>
          {selectedRide ? (
            <div className="flex items-start gap-2 rounded-md bg-card border border-border p-2 text-xs">
              <Car className="w-3.5 h-3.5 mt-0.5 text-[#6C63FF] shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="font-medium text-foreground truncate">
                  {selectedRide.passenger_name ?? "Passenger"} — {selectedRide.ride_date} {selectedRide.pickup_time ?? ""}
                </div>
                <div className="text-muted-foreground truncate">
                  {selectedRide.pickup_location ?? "—"} → {selectedRide.dropoff_location ?? "—"}
                </div>
              </div>
              <button
                onClick={() => { setRideId(""); setRideQuery(""); }}
                className="text-muted-foreground hover:text-destructive p-1"
                title="Remove ride"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          ) : (
            <>
              <Input
                placeholder="Search rides by passenger / route / date…"
                value={rideQuery}
                onChange={(e) => setRideQuery(e.target.value)}
                className="input-luxury text-xs"
              />
              {rideQuery && (
                <div className="max-h-44 overflow-y-auto rounded-md border border-border bg-card divide-y divide-border">
                  {filteredRides.length === 0 ? (
                    <div className="p-2 text-xs text-muted-foreground text-center">No matching rides</div>
                  ) : (
                    filteredRides.map((r) => (
                      <button
                        key={r.id}
                        onClick={() => { setRideId(r.id); setRideQuery(""); }}
                        className="block w-full text-left p-2 text-xs hover:bg-muted/50 transition-colors"
                      >
                        {rideLabel(r)}
                      </button>
                    ))
                  )}
                </div>
              )}
            </>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {tab === "driver" && (
            <Select value={driverId} onValueChange={setDriverId}>
              <SelectTrigger className="input-luxury w-56">
                <SelectValue placeholder="Assign to driver" />
              </SelectTrigger>
              <SelectContent>
                {drivers.map((d) => (
                  <SelectItem key={d.id} value={d.id}>
                    {d.name} {d.phone ? "" : "(no phone)"}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <label className="flex items-center gap-2 text-sm text-muted-foreground cursor-pointer">
            <input
              type="checkbox"
              checked={isReminder}
              onChange={(e) => setIsReminder(e.target.checked)}
              className="accent-[#6C63FF]"
            />
            <Bell className="w-4 h-4" /> Reminder (sends SMS)
          </label>
          {isReminder && (
            <Input
              type="datetime-local"
              value={remindAt}
              onChange={(e) => setRemindAt(e.target.value)}
              className="input-luxury w-56"
            />
          )}
          <Button onClick={submit} disabled={saving} className="ml-auto btn-primary-gradient">
            {saving ? "Saving…" : editingId ? "Update note" : "Save note"}
          </Button>
        </div>
        {isReminder && tab === "driver" && (
          <div className="flex items-start gap-2 text-xs text-muted-foreground bg-muted/30 rounded-lg p-2.5">
            <AlertCircle className="w-3.5 h-3.5 mt-0.5 text-[#F5A623]" />
            An SMS will be sent to the assigned driver at the reminder time.
          </div>
        )}
      </Card>

      {/* List */}
      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-24 rounded-2xl skeleton-shimmer" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <Card className="luxury-card p-12 text-center text-muted-foreground">
          <StickyNote className="w-10 h-10 mx-auto mb-3 opacity-50" />
          No {tab} notes yet.
        </Card>
      ) : (
        <div className="space-y-3">
          {filtered.map((n) => {
            const driver = drivers.find((d) => d.id === n.driver_id);
            const ride = rides.find((r) => r.id === n.ride_id);
            return (
              <Card key={n.id} className="luxury-card p-4">
                <div className="flex items-start gap-3">
                  <button
                    onClick={() => toggleDone(n)}
                    className={`mt-1 h-5 w-5 rounded-md border-2 grid place-items-center transition-colors ${
                      n.done
                        ? "bg-[#10B981] border-[#10B981] text-white"
                        : "border-border hover:border-[#6C63FF]"
                    }`}
                  >
                    {n.done && <Check className="w-3 h-3" />}
                  </button>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <div
                        className={`font-semibold text-foreground ${
                          n.done ? "line-through opacity-60" : ""
                        }`}
                      >
                        {n.title}
                      </div>
                      {n.is_reminder && (
                        <Badge className="bg-[#F5A623]/15 text-[#F5A623] border-[#F5A623]/30 gap-1">
                          <Bell className="w-3 h-3" />
                          {n.remind_at
                            ? new Date(n.remind_at).toLocaleString()
                            : "Reminder"}
                          {n.sms_sent && " · sent"}
                        </Badge>
                      )}
                      {n.is_question && (
                        <Badge className="bg-[#6C63FF]/15 text-[#6C63FF] border-[#6C63FF]/30 gap-1">
                          <HelpCircle className="w-3 h-3" /> Question
                        </Badge>
                      )}
                      {n.created_by === "driver" && (
                        <Badge className="bg-muted/50 text-muted-foreground border-border">
                          From {driver?.name ?? "driver"}
                        </Badge>
                      )}
                      {n.created_by === "admin" && driver && (
                        <Badge className="bg-muted/50 text-muted-foreground border-border">
                          For {driver.name}
                        </Badge>
                      )}
                    </div>
                    {n.body && (
                      <div className="text-sm text-muted-foreground mt-1 whitespace-pre-wrap">
                        {n.body}
                      </div>
                    )}
                    {ride && (
                      <div className="mt-2 inline-flex items-start gap-2 rounded-md bg-[#6C63FF]/8 border border-[#6C63FF]/20 px-2.5 py-1.5 text-xs">
                        <Car className="w-3.5 h-3.5 mt-0.5 text-[#6C63FF] shrink-0" />
                        <div className="min-w-0">
                          <div className="font-medium text-foreground">
                            {ride.passenger_name ?? "Passenger"} — {ride.ride_date} {ride.pickup_time ?? ""}
                          </div>
                          <div className="text-muted-foreground">
                            {ride.pickup_location ?? "—"} → {ride.dropoff_location ?? "—"}
                          </div>
                        </div>
                      </div>
                    )}
                    {n.is_question && n.answer && (
                      <div className="mt-2 rounded-lg bg-[#6C63FF]/10 border border-[#6C63FF]/20 p-2.5 text-sm">
                        <div className="text-[10px] uppercase tracking-wider text-[#6C63FF] font-bold mb-0.5">
                          Reply
                        </div>
                        {n.answer}
                      </div>
                    )}
                    <div className="text-[11px] text-muted-foreground/70 mt-2">
                      {new Date(n.created_at).toLocaleString()}
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    {n.is_question && !n.answered && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => answerQuestion(n)}
                        className="gap-1"
                      >
                        <Send className="w-3 h-3" /> Reply
                      </Button>
                    )}
                    <button
                      onClick={() => beginEdit(n)}
                      className="p-2 rounded-lg text-muted-foreground hover:text-[#6C63FF] hover:bg-[#6C63FF]/10 transition-colors"
                      title="Edit"
                    >
                      <Pencil className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => remove(n)}
                      className="p-2 rounded-lg text-muted-foreground hover:text-[#EF4444] hover:bg-[#EF4444]/10 transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
