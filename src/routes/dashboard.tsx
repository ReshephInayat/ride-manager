import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { RequireAuth } from "@/components/RequireAuth";
import { AppShell } from "@/components/AppShell";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Upload,
  Loader2,
  FileText,
  CheckCircle2,
  XCircle,
  MinusCircle,
  Trash2,
  Search,
  Plus,
  MapPin,
} from "lucide-react";
import { toast } from "react-hot-toast";
import {
  autoMatchRoute,
  buildRideKey,
  callParser,
  extractDropoffTime,
  stripTrailingTime,
  type Ride,
  type RideStatus,
  type RouteRow,
  type Driver,
} from "@/lib/rides";
import { useNavigate } from "@tanstack/react-router";
import { useSystem } from "@/lib/system";
import { FlightSearchButton } from "@/components/FlightTrackLink";
import { TrackRideDialog } from "@/components/TrackRideDialog";

export const Route = createFileRoute("/dashboard")({ component: Dashboard });

function Dashboard() {
  return (
    <RequireAuth>
      <AppShell>
        <DashboardInner />
      </AppShell>
    </RequireAuth>
  );
}

const statusMeta: Record<RideStatus, { label: string; className: string; icon: typeof CheckCircle2 }> = {
  pending: { label: "Pending", className: "bg-secondary text-secondary-foreground", icon: MinusCircle },
  started: { label: "Started", className: "bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-900/40 dark:text-emerald-100 dark:border-emerald-700", icon: CheckCircle2 },
  arrived: { label: "Arrived", className: "bg-sky-100 text-sky-800 border-sky-200 dark:bg-sky-900/40 dark:text-sky-100 dark:border-sky-700", icon: CheckCircle2 },
  completed: { label: "Completed", className: "bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-900/40 dark:text-emerald-100 dark:border-emerald-700", icon: CheckCircle2 },
  cancelled: { label: "Cancelled", className: "bg-rose-100 text-rose-800 border-rose-200 dark:bg-rose-900/40 dark:text-rose-100 dark:border-rose-700", icon: XCircle },
  no_show: { label: "No Show", className: "bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-900/40 dark:text-amber-100 dark:border-amber-700", icon: MinusCircle },
};

type DateFilter = "all" | "today" | "tomorrow" | "yesterday" | "this_week" | "this_month" | "custom_month" | "custom_range";

function ymd(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function getDateRange(
  filter: DateFilter,
  customMonth: string,
  customStart: string,
  customEnd: string,
): { start?: string; end?: string } {
  const now = new Date();
  const today = ymd(now);
  if (filter === "today") return { start: today, end: today };
  if (filter === "tomorrow") {
    const t = new Date(now); t.setDate(t.getDate() + 1);
    return { start: ymd(t), end: ymd(t) };
  }
  if (filter === "yesterday") {
    const t = new Date(now); t.setDate(t.getDate() - 1);
    return { start: ymd(t), end: ymd(t) };
  }
  if (filter === "this_week") {
    const day = now.getDay();
    const diffToMon = (day + 6) % 7;
    const mon = new Date(now); mon.setDate(now.getDate() - diffToMon);
    const sun = new Date(mon); sun.setDate(mon.getDate() + 6);
    return { start: ymd(mon), end: ymd(sun) };
  }
  if (filter === "this_month") {
    const first = new Date(now.getFullYear(), now.getMonth(), 1);
    const last = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    return { start: ymd(first), end: ymd(last) };
  }
  if (filter === "custom_month" && customMonth) {
    const [y, m] = customMonth.split("-").map(Number);
    const first = new Date(y, m - 1, 1);
    const last = new Date(y, m, 0);
    return { start: ymd(first), end: ymd(last) };
  }
  if (filter === "custom_range") {
    return {
      start: customStart || undefined,
      end: customEnd || undefined,
    };
  }
  return {};
}

interface PreviewRow {
  selected: boolean;
  data: Partial<Ride> & { ride_date: string };
}

interface InvoiceLine {
  id: string;
  description: string;
  quantity: number;
  price: number;
}

interface ManualRideForm {
  ride_date: string;
  pickup_time: string;
  route_id: string;
  driver_id: string;
  riders: number;
  price: number;
  passenger_name: string;
  passenger_email: string;
  phone: string;
  flight_number: string;
  department: string;
  notes: string;
}

interface InvoicePreviewState {
  start: string;
  end: string;
  billTo: string;
  invoiceNumber: string;
  notes: string;
  lines: InvoiceLine[];
}

function DashboardInner() {
  const { system, label } = useSystem();
  const [rides, setRides] = useState<Ride[]>([]);
  const [routes, setRoutes] = useState<RouteRow[]>([]);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [liveLocations, setLiveLocations] = useState<Record<string, { lat: number; lng: number; updated_at: string }>>({});
  const [trackRide, setTrackRide] = useState<Ride | null>(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [filterStatus, setFilterStatus] = useState<"all" | RideStatus>("all");
  const [filterDriver, setFilterDriver] = useState<string>("all");
  const [dateFilter, setDateFilter] = useState<DateFilter>("all");
  const [customMonth, setCustomMonth] = useState<string>("");
  const [customStart, setCustomStart] = useState<string>("");
  const [customEnd, setCustomEnd] = useState<string>("");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [previewRows, setPreviewRows] = useState<PreviewRow[] | null>(null);
  const [previewFile, setPreviewFile] = useState<string>("");
  const [importing, setImporting] = useState(false);
  const [manualOpen, setManualOpen] = useState(false);
  const [invoicePreview, setInvoicePreview] = useState<InvoicePreviewState | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();

  const load = async () => {
    setLoading(true);
    const [rRes, routeRes, dRes] = await Promise.all([
      supabase.from("rides").select("*").eq("system", system).order("ride_date", { ascending: true }).order("pickup_time", { ascending: true }).range(0, 9999),
      supabase.from("routes").select("*").eq("system", system).order("created_at"),
      supabase.from("drivers").select("*").eq("system", system).order("created_at"),
    ]);
    if (rRes.error) toast.error(rRes.error.message);
    if (routeRes.error) toast.error(routeRes.error.message);
    if (dRes.error) toast.error(dRes.error.message);
    setRides((rRes.data as Ride[]) ?? []);
    setRoutes((routeRes.data as RouteRow[]) ?? []);
    setDrivers((dRes.data as Driver[]) ?? []);
    setSelected(new Set());
    setLoading(false);
  };

  useEffect(() => { load(); }, [system]);

  // Realtime: refresh whenever rides, routes, or drivers change in this workspace.
  useEffect(() => {
    const ch = supabase
      .channel(`dashboard-${system}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "rides" }, () => load())
      .on("postgres_changes", { event: "*", schema: "public", table: "routes" }, () => load())
      .on("postgres_changes", { event: "*", schema: "public", table: "drivers" }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [system]);

  // Realtime: track live driver locations for this workspace.
  useEffect(() => {
    const fetchAll = async () => {
      const { data } = await supabase
        .from("driver_locations")
        .select("driver_id, lat, lng, updated_at")
        .eq("system", system);
      if (data) {
        const next: Record<string, { lat: number; lng: number; updated_at: string }> = {};
        for (const row of data as Array<{ driver_id: string; lat: number; lng: number; updated_at: string }>) {
          next[row.driver_id] = { lat: row.lat, lng: row.lng, updated_at: row.updated_at };
        }
        setLiveLocations(next);
      }
    };
    void fetchAll();
    const ch = supabase
      .channel(`live-locations-${system}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "driver_locations" }, (payload) => {
        if (payload.eventType === "DELETE") {
          const old = payload.old as { driver_id?: string };
          if (old?.driver_id) setLiveLocations((m) => { const n = { ...m }; delete n[old.driver_id!]; return n; });
        } else {
          const row = payload.new as { driver_id: string; lat: number; lng: number; updated_at: string };
          setLiveLocations((m) => ({ ...m, [row.driver_id]: { lat: row.lat, lng: row.lng, updated_at: row.updated_at } }));
        }
      })
      .subscribe();
    // refresh ticker so "fresh" status decays after 60s
    const t = setInterval(() => setLiveLocations((m) => ({ ...m })), 30000);
    return () => { supabase.removeChannel(ch); clearInterval(t); };
  }, [system]);

  const range = useMemo(() => getDateRange(dateFilter, customMonth, customStart, customEnd), [dateFilter, customMonth, customStart, customEnd]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rides.filter((r) => {
      if (filterStatus !== "all" && r.status !== filterStatus) return false;
      if (filterDriver === "unassigned" && r.driver_id) return false;
      if (filterDriver !== "all" && filterDriver !== "unassigned" && r.driver_id !== filterDriver) return false;
      if (range.start && r.ride_date < range.start) return false;
      if (range.end && r.ride_date > range.end) return false;
      if (q) {
        const hay = [
          r.department, r.pickup_from, r.dropoff_to,
          r.pickup_location, r.dropoff_location, r.pickup_time,
          r.passenger_name, r.passenger_email, r.phone, r.flight_number,
        ].filter(Boolean).join(" ").toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [rides, filterStatus, filterDriver, range, search]);

  // Pagination removed — show all filtered rides at once.
  const pagedRides = filtered;

  useEffect(() => {
    setSelected(new Set());
  }, [filterStatus, filterDriver, dateFilter, customMonth, customStart, customEnd, search, system]);

  const completedSum = useMemo(
    () => filtered.filter((r) => r.status === "completed" || r.status === "no_show").reduce((s, r) => s + Number(r.amount), 0),
    [filtered]
  );
  const selectedSum = useMemo(
    () =>
      filtered
        .filter((r) => selected.has(r.id) && (r.status === "completed" || r.status === "no_show"))
        .reduce((s, r) => s + Number(r.amount), 0),
    [filtered, selected]
  );
  const selectedCount = useMemo(
    () => filtered.filter((r) => selected.has(r.id)).length,
    [filtered, selected]
  );

  const driverMap = useMemo(
    () => Object.fromEntries(drivers.map((d) => [d.id, d.name])),
    [drivers]
  );

  // ---- PDF parse → preview modal ----
  const [previewExtracted, setPreviewExtracted] = useState(0);
  const [previewInvalid, setPreviewInvalid] = useState(0);

  const handleUpload = async (file: File) => {
    setUploading(true);
    try {
      const parsed = await callParser(file);
      if (!parsed?.length) {
        toast("No rides found in the PDF.");
        return;
      }
      const valid = parsed.filter((p) => p.ride_date);
      const invalid = parsed.length - valid.length;
      setPreviewFile(file.name);
      setPreviewExtracted(parsed.length);
      setPreviewInvalid(invalid);
      setPreviewRows(
        valid.map((p) => ({ selected: true, data: p as PreviewRow["data"] }))
      );
      if (invalid > 0) {
        toast(`Extracted ${parsed.length} rows • ${invalid} dropped (missing date).`);
      }
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const togglePreview = (i: number) =>
    setPreviewRows((rs) => rs ? rs.map((r, idx) => (idx === i ? { ...r, selected: !r.selected } : r)) : rs);
  const togglePreviewAll = () =>
    setPreviewRows((rs) => {
      if (!rs) return rs;
      const allOn = rs.every((r) => r.selected);
      return rs.map((r) => ({ ...r, selected: !allOn }));
    });

  const importPreview = async () => {
    if (!previewRows) return;
    const chosen = previewRows.filter((r) => r.selected);
    if (!chosen.length) return toast.error("Select at least one ride to import.");
    setImporting(true);
    try {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) return;
      const allRows = chosen.map(({ data: p }) => {
        const matched = autoMatchRoute(
          {
            pickup_from: p.pickup_from ?? null,
            dropoff_to: p.dropoff_to ?? null,
            pickup_location: p.pickup_location ?? null,
            dropoff_location: p.dropoff_location ?? null,
          },
          routes
        );
        const row = {
          user_id: u.user!.id,
          system,
          ride_date: p.ride_date!,
          department: p.department ?? null,
          riders: p.riders ?? 1,
          pickup_location: p.pickup_location ?? null,
          pickup_from: p.pickup_from ?? null,
          pickup_time: p.pickup_time ?? null,
          dropoff_location: p.dropoff_location ?? null,
          dropoff_to: p.dropoff_to ?? null,
          passenger_name: p.passenger_name ?? null,
          passenger_email: p.passenger_email ?? null,
          phone: p.phone ?? null,
          flight_number: p.flight_number ?? null,
          status: "pending" as RideStatus,
          route_id: matched?.id ?? null,
          amount: matched?.price ?? 0,
          source_file: previewFile,
        };
        const ride_key = buildRideKey(row);
        return { ...row, ride_key, dedupe_key: ride_key };
      });

      // Step 1: per request, KEEP duplicates that appear inside the same PDF.
      //         Only skip rides that already exist in the database.
      const rows = allRows;

      // Step 2: check which keys already exist in DB so we report accurate counts
      //         and skip them on insert.
      const keys = Array.from(new Set(rows.map((r) => r.ride_key)));
      const { data: existing, error: exErr } = await supabase
        .from("rides")
        .select("ride_key")
        .eq("user_id", u.user!.id)
        .eq("system", system)
        .in("ride_key", keys);
      if (exErr) throw exErr;
      const existingSet = new Set((existing ?? []).map((e) => e.ride_key as string));
      const toInsert = rows.filter((r) => !existingSet.has(r.ride_key));
      const dbDuplicates = rows.length - toInsert.length;

      // Step 3: plain insert in safe batches. Duplicate ride_keys within the
      //         PDF are allowed because the unique constraint was removed.
      let inserted = 0;
      const BATCH = 200;
      for (let i = 0; i < toInsert.length; i += BATCH) {
        const slice = toInsert.slice(i, i + BATCH);
        const { data: ins, error } = await supabase
          .from("rides")
          .insert(slice)
          .select("id");
        if (error) throw error;
        inserted += ins?.length ?? 0;
      }

      toast.success(
        `Imported ${inserted}` +
          (dbDuplicates > 0 ? ` • Skipped ${dbDuplicates} already in system` : "") +
          (previewInvalid > 0 ? ` • ${previewInvalid} invalid row${previewInvalid === 1 ? "" : "s"}` : "")
      );
      setPreviewRows(null);
      setPreviewFile("");
      setPreviewExtracted(0);
      setPreviewInvalid(0);
      await load();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setImporting(false);
    }
  };

  // ---- Inline edits ----
  const setStatus = async (ride: Ride, status: RideStatus) => {
    setRides((rs) => rs.map((r) => (r.id === ride.id ? { ...r, status } : r)));
    const { error } = await supabase.from("rides").update({ status }).eq("id", ride.id);
    if (error) { toast.error(error.message); load(); }
  };

  const setRoute = async (ride: Ride, routeId: string) => {
    const route = routes.find((r) => r.id === routeId);
    const amount = route?.price ?? 0;
    setRides((rs) => rs.map((r) => (r.id === ride.id ? { ...r, route_id: routeId, amount } : r)));
    const { error } = await supabase.from("rides").update({ route_id: routeId, amount }).eq("id", ride.id);
    if (error) { toast.error(error.message); load(); }
  };

  const setDriver = async (ride: Ride, driverIdRaw: string) => {
    const driver_id = driverIdRaw === "__none__" ? null : driverIdRaw;
    const previous = ride.driver_id ?? null;
    setRides((rs) => rs.map((r) => (r.id === ride.id ? { ...r, driver_id } : r)));
    const { error } = await supabase.from("rides").update({ driver_id }).eq("id", ride.id);
    if (error) { toast.error(error.message); load(); return; }
    if (driver_id && driver_id !== previous) {
      // Fire-and-forget SMS + admin notification for the assignment.
      fetch("/api/public/hooks/notify-assignment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ride_id: ride.id }),
      }).then((r) => r.json()).then((j) => {
        if (j?.sms?.sent) toast.success("Driver notified by SMS");
      }).catch(() => { /* silent */ });
    }
  };

  const deleteRide = async (id: string) => {
    if (!confirm("Delete this ride? This cannot be undone.")) return;
    const { error } = await supabase.from("rides").delete().eq("id", id);
    if (error) return toast.error(error.message);
    setRides((rs) => rs.filter((r) => r.id !== id));
    setSelected((s) => { const n = new Set(s); n.delete(id); return n; });
    toast.success("Ride deleted");
  };

  const deleteSelected = async () => {
    const ids = Array.from(selected);
    if (!ids.length) return toast.error("Select rides to delete.");
    if (!confirm(`Delete ${ids.length} ride${ids.length === 1 ? "" : "s"}?`)) return;
    const { error } = await supabase.from("rides").delete().in("id", ids);
    if (error) return toast.error(error.message);
    setRides((rs) => rs.filter((r) => !selected.has(r.id)));
    setSelected(new Set());
    toast.success("Deleted");
  };

  const deleteAllFiltered = async () => {
    if (!filtered.length) return toast.error("Nothing to delete.");
    if (!confirm(`Delete ALL ${filtered.length} rides in current view? This cannot be undone.`)) return;
    const ids = filtered.map((r) => r.id);
    const { error } = await supabase.from("rides").delete().in("id", ids);
    if (error) return toast.error(error.message);
    setRides((rs) => rs.filter((r) => !ids.includes(r.id)));
    setSelected(new Set());
    toast.success(`Deleted ${ids.length} rides`);
  };

  const completeAllFiltered = async () => {
    const targets = filtered.filter((r) => r.status !== "completed");
    if (!targets.length) return toast("All filtered rides are already completed.");
    if (!confirm(`Mark ${targets.length} ride${targets.length === 1 ? "" : "s"} as completed?`)) return;
    const ids = targets.map((r) => r.id);
    const { error } = await supabase.from("rides").update({ status: "completed" }).in("id", ids);
    if (error) return toast.error(error.message);
    setRides((rs) => rs.map((r) => (ids.includes(r.id) ? { ...r, status: "completed" } : r)));
    toast.success(`Completed ${ids.length} rides`);
  };

  const toggleSelect = (id: string) => {
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });
  };
  const toggleSelectAll = () => {
    const pageIds = pagedRides.map((r) => r.id);
    const allPageSelected = pageIds.length > 0 && pageIds.every((id) => selected.has(id));
    setSelected((s) => {
      const next = new Set(s);
      if (allPageSelected) pageIds.forEach((id) => next.delete(id));
      else pageIds.forEach((id) => next.add(id));
      return next;
    });
  };

  const isBillable = (s: RideStatus) => s === "completed" || s === "no_show";

  const createInvoiceFromSelected = async () => {
    const ids = Array.from(selected);
    const items = filtered.filter((r) => ids.includes(r.id) && isBillable(r.status));
    if (!items.length) return toast.error("Select at least one completed or no-show ride.");
    await createInvoice(items, "Selected rides invoice");
  };
  const createFilteredInvoice = async () => {
    const items = filtered.filter((r) => isBillable(r.status));
    if (!items.length) return toast.error("No billable rides in current view.");
    await createInvoice(items, `Invoice — ${dateFilter}`);
  };
  const createWeeklyInvoice = async () => {
    const today = new Date();
    const day = today.getDay();
    const monDiff = (day + 6) % 7;
    const mon = new Date(today); mon.setDate(today.getDate() - monDiff);
    const sun = new Date(mon); sun.setDate(mon.getDate() + 6);
    const start = ymd(mon); const end = ymd(sun);
    const items = rides.filter((r) => isBillable(r.status) && r.ride_date >= start && r.ride_date <= end);
    if (!items.length) return toast.error("No billable rides this week.");
    await createInvoice(items, `Weekly invoice (${start} → ${end})`, true);
  };
  const createMonthlyInvoice = async () => {
    const today = new Date();
    const first = new Date(today.getFullYear(), today.getMonth(), 1);
    const last = new Date(today.getFullYear(), today.getMonth() + 1, 0);
    const start = ymd(first); const end = ymd(last);
    const items = rides.filter((r) => isBillable(r.status) && r.ride_date >= start && r.ride_date <= end);
    if (!items.length) return toast.error("No billable rides this month.");
    await createInvoice(items, `Monthly invoice (${start} → ${end})`);
  };
  const nextInvoiceNumber = async (): Promise<string> => {
    const { count } = await supabase
      .from("invoices")
      .select("id", { count: "exact", head: true })
      .eq("system", system);
    const next = (count ?? 0) + 1;
    return String(next).padStart(3, "0");
  };

  const createInvoice = async (items: Ride[], notes: string, groupByRoute = false) => {
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) return;
    const subtotal = items.reduce((s, r) => s + Number(r.amount), 0);
    const sales_tax_rate = 9.9;
    const sales_tax_amount = +(subtotal * sales_tax_rate / 100).toFixed(2);
    const total = +(subtotal + sales_tax_amount).toFixed(2);
    const dates = items.map((r) => r.ride_date).sort();
    const invoice_number = await nextInvoiceNumber();
    const { data: inv, error } = await supabase
      .from("invoices")
      .insert({
        user_id: u.user.id,
        system,
        invoice_number,
        bill_to: label,
        period_start: dates[0],
        period_end: dates[dates.length - 1],
        subtotal,
        sales_tax_rate,
        sales_tax_amount,
        total,
        notes,
      })
      .select()
      .single();
    if (error) return toast.error(error.message);

    let itemRows: Array<{ invoice_id: string; ride_id: string | null; description: string; amount: number }>;
    if (groupByRoute) {
      const groups = new Map<string, { name: string; price: number; rides: Ride[] }>();
      for (const r of items) {
        const key = r.route_id ?? "__unassigned__";
        const route = routes.find((rt) => rt.id === r.route_id);
        const name = route?.name ?? "Unassigned route";
        const price = route ? Number(route.price) : Number(r.amount);
        if (!groups.has(key)) groups.set(key, { name, price, rides: [] });
        groups.get(key)!.rides.push(r);
      }
      itemRows = Array.from(groups.values()).map((g) => ({
        invoice_id: inv!.id,
        ride_id: null,
        description: `${g.name} — Total rides: ${g.rides.length} × $${g.price.toFixed(2)}`,
        amount: +(g.rides.reduce((s, r) => s + Number(r.amount), 0)).toFixed(2),
      }));
    } else {
      itemRows = items.map((r) => ({
        invoice_id: inv!.id,
        ride_id: r.id,
        description: `${r.ride_date} • ${r.pickup_from ?? r.pickup_location} → ${r.dropoff_to ?? r.dropoff_location}`,
        amount: r.amount,
      }));
    }
    const { error: e2 } = await supabase.from("invoice_items").insert(itemRows);
    if (e2) return toast.error(e2.message);

    toast.success(`Invoice ${invoice_number} created`);
    setSelected(new Set());
    navigate({ to: "/invoices/$id", params: { id: inv!.id } });
  };

  // ----- Invoice by route: open preview dialog with date range + editable lines -----
  const openByRouteInvoice = async () => {
    const today = new Date();
    const first = new Date(today.getFullYear(), today.getMonth(), 1);
    const last = new Date(today.getFullYear(), today.getMonth() + 1, 0);
    const start = ymd(first);
    const end = ymd(last);
    const num = await nextInvoiceNumber();
    setInvoicePreview({
      start,
      end,
      billTo: label,
      invoiceNumber: num,
      notes: `By-route invoice (${start} → ${end})`,
      lines: buildRouteLines(start, end),
    });
  };

  const buildRouteLines = (start: string, end: string): InvoiceLine[] => {
    const items = rides.filter(
      (r) => (r.status === "completed" || r.status === "no_show") && r.ride_date >= start && r.ride_date <= end
    );
    const groups = new Map<string, { name: string; price: number; rides: Ride[] }>();
    for (const r of items) {
      const key = r.route_id ?? "__unassigned__";
      const route = routes.find((rt) => rt.id === r.route_id);
      const name = route?.name ?? "Unassigned route";
      const price = route ? Number(route.price) : Number(r.amount);
      if (!groups.has(key)) groups.set(key, { name, price, rides: [] });
      groups.get(key)!.rides.push(r);
    }
    return Array.from(groups.values()).map((g, i) => ({
      id: `line-${i}-${Date.now()}`,
      description: `${g.name}`,
      quantity: g.rides.length,
      price: g.price,
    }));
  };

  const recalcLinesForDates = (start: string, end: string) => {
    setInvoicePreview((p) => p ? { ...p, start, end, lines: buildRouteLines(start, end) } : p);
  };

  const saveInvoiceFromPreview = async () => {
    if (!invoicePreview) return;
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) return;
    const lines = invoicePreview.lines.filter((l) => l.description.trim());
    if (!lines.length) return toast.error("Add at least one line item.");
    const subtotal = lines.reduce((s, l) => s + Number(l.quantity) * Number(l.price), 0);
    const sales_tax_rate = 9.9;
    const sales_tax_amount = +(subtotal * sales_tax_rate / 100).toFixed(2);
    const total = +(subtotal + sales_tax_amount).toFixed(2);
    const { data: inv, error } = await supabase
      .from("invoices")
      .insert({
        user_id: u.user.id,
        system,
        invoice_number: invoicePreview.invoiceNumber,
        bill_to: invoicePreview.billTo,
        period_start: invoicePreview.start,
        period_end: invoicePreview.end,
        subtotal,
        sales_tax_rate,
        sales_tax_amount,
        total,
        notes: invoicePreview.notes || null,
      })
      .select()
      .single();
    if (error) return toast.error(error.message);
    const itemRows = lines.map((l) => ({
      invoice_id: inv!.id,
      ride_id: null,
      description: `${l.description} — Total rides: ${l.quantity} × $${Number(l.price).toFixed(2)}`,
      amount: +(Number(l.quantity) * Number(l.price)).toFixed(2),
    }));
    const { error: e2 } = await supabase.from("invoice_items").insert(itemRows);
    if (e2) return toast.error(e2.message);
    toast.success(`Invoice ${inv!.invoice_number} created`);
    setInvoicePreview(null);
    navigate({ to: "/invoices/$id", params: { id: inv!.id } });
  };

  // ----- Manual ride entry (used by both systems, primary for LLC) -----
  const addManualRide = async (form: ManualRideForm) => {
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) return;
    const route = routes.find((r) => r.id === form.route_id);
    const row = {
      user_id: u.user.id,
      system,
      ride_date: form.ride_date,
      department: form.department || null,
      riders: form.riders,
      pickup_location: route?.pickup_location ?? null,
      pickup_from: null,
      pickup_time: form.pickup_time || null,
      dropoff_location: route?.dropoff_location ?? null,
      dropoff_to: null,
      route_id: form.route_id || null,
      driver_id: form.driver_id || null,
      amount: form.price,
      passenger_name: form.passenger_name || null,
      passenger_email: form.passenger_email || null,
      phone: form.phone || null,
      flight_number: form.flight_number || null,
      notes: form.notes || null,
      status: "pending" as RideStatus,
    };
    const ride_key = buildRideKey(row);
    const { error } = await supabase.from("rides").insert([{ ...row, ride_key, dedupe_key: ride_key }]);
    if (error) return toast.error(error.message);
    toast.success("Ride added");
    setManualOpen(false);
    await load();
  };

  return (
    <div>
      <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4 mb-6">
        <div>
          <h1 className="text-3xl font-bold">Rides</h1>
          <p className="text-muted-foreground mt-1">
            <span className="font-medium text-foreground">{label}</span> —{" "}
            {system === "api"
              ? "upload hotel schedule PDFs, review extracted rides, then import."
              : "add rides manually using your saved routes & prices."}
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button variant="outline" onClick={() => setManualOpen(true)}>
            <Plus className="h-4 w-4 mr-2" /> Add ride
          </Button>
          {system === "api" && (
            <>
              <input
                ref={fileRef}
                type="file"
                accept="application/pdf"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleUpload(f);
                }}
              />
              <Button onClick={() => fileRef.current?.click()} disabled={uploading}>
                {uploading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Upload className="h-4 w-4 mr-2" />}
                {uploading ? "Reading PDF…" : "Upload PDF"}
              </Button>
            </>
          )}
        </div>
      </div>

      <div className={`grid grid-cols-2 ${system === "api" ? "md:grid-cols-6" : "md:grid-cols-4"} gap-4 mb-6`}>
        <StatCard tone="blue" label="Total rides (filtered)" value={filtered.length.toString()} />
        <StatCard tone="violet" label="Completed" value={filtered.filter((r) => r.status === "completed").length.toString()} />
        <StatCard tone="emerald" label="Completed total" value={`$${completedSum.toFixed(2)}`} />
        {system === "api" && (
          <>
            <StatCard tone="rose" label="Commission (10%)" value={`$${(completedSum * 0.1).toFixed(2)}`} />
            <StatCard tone="teal" label="Net after commission" value={`$${(completedSum * 0.9).toFixed(2)}`} />
          </>
        )}
        <StatCard tone="amber" label={`Selected total (${selectedCount} ride${selectedCount === 1 ? "" : "s"})`} value={`$${selectedSum.toFixed(2)}`} />
      </div>

      <Card className="p-4 mb-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex-1 min-w-[200px]">
            <label className="text-xs text-muted-foreground block mb-1">Search</label>
            <div className="relative">
              <Search className="h-4 w-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Department, passenger, flight, location…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-8"
              />
            </div>
          </div>
          <div>
            <label className="text-xs text-muted-foreground block mb-1">Date</label>
            <Select value={dateFilter} onValueChange={(v) => setDateFilter(v as DateFilter)}>
              <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All time</SelectItem>
                <SelectItem value="today">Today</SelectItem>
                <SelectItem value="tomorrow">Tomorrow</SelectItem>
                <SelectItem value="yesterday">Yesterday</SelectItem>
                <SelectItem value="this_week">This week</SelectItem>
                <SelectItem value="this_month">This month</SelectItem>
                <SelectItem value="custom_month">Pick month…</SelectItem>
                <SelectItem value="custom_range">Date range…</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {dateFilter === "custom_month" && (
            <div>
              <label className="text-xs text-muted-foreground block mb-1">Month</label>
              <Input
                type="month"
                value={customMonth}
                onChange={(e) => setCustomMonth(e.target.value)}
                className="w-44"
              />
            </div>
          )}
          {dateFilter === "custom_range" && (
            <>
              <div>
                <label className="text-xs text-muted-foreground block mb-1">From</label>
                <Input
                  type="date"
                  value={customStart}
                  onChange={(e) => setCustomStart(e.target.value)}
                  className="w-40"
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground block mb-1">To</label>
                <Input
                  type="date"
                  value={customEnd}
                  onChange={(e) => setCustomEnd(e.target.value)}
                  className="w-40"
                />
              </div>
            </>
          )}
          <div>
            <label className="text-xs text-muted-foreground block mb-1">Status</label>
            <Select value={filterStatus} onValueChange={(v) => setFilterStatus(v as never)}>
              <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="arrived">Arrived</SelectItem>
                <SelectItem value="completed">Completed</SelectItem>
                <SelectItem value="cancelled">Cancelled</SelectItem>
                <SelectItem value="no_show">No show</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-xs text-muted-foreground block mb-1">Driver</label>
            <Select value={filterDriver} onValueChange={setFilterDriver}>
              <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All drivers</SelectItem>
                <SelectItem value="unassigned">Unassigned</SelectItem>
                {drivers.map((d) => (
                  <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="ml-auto flex gap-2 flex-wrap">
            {selected.size > 0 && (
              <Button variant="destructive" onClick={deleteSelected}>
                <Trash2 className="h-4 w-4 mr-1" /> Delete ({selected.size})
              </Button>
            )}
            <Button variant="outline" className="border-emerald-300 text-emerald-700 hover:bg-emerald-50 dark:hover:bg-emerald-950/40" onClick={completeAllFiltered}>
              <CheckCircle2 className="h-4 w-4 mr-1" /> Complete all
            </Button>
            <Button variant="outline" className="border-rose-300 text-rose-700 hover:bg-rose-50 dark:hover:bg-rose-950/40" onClick={deleteAllFiltered}>
              <Trash2 className="h-4 w-4 mr-1" /> Delete all
            </Button>
            <Button variant="outline" onClick={createInvoiceFromSelected}>
              <FileText className="h-4 w-4 mr-1" /> Invoice selected
            </Button>
            <Button variant="outline" onClick={openByRouteInvoice}>
              <FileText className="h-4 w-4 mr-1" /> Invoice by route…
            </Button>
            <Button variant="outline" onClick={createWeeklyInvoice}>
              <FileText className="h-4 w-4 mr-1" /> Weekly invoice
            </Button>
            <Button onClick={createMonthlyInvoice}>
              <FileText className="h-4 w-4 mr-1" /> Monthly invoice
            </Button>
          </div>
        </div>
      </Card>

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10">
                  <Checkbox
                    checked={pagedRides.length > 0 && pagedRides.every((r) => selected.has(r.id))}
                    onCheckedChange={toggleSelectAll}
                  />
                </TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Department</TableHead>
                <TableHead>Riders</TableHead>
                <TableHead>Times</TableHead>
                <TableHead>Pickup</TableHead>
                <TableHead>Dropoff</TableHead>
                <TableHead>Driver</TableHead>
                <TableHead>Route / Price</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead className="w-10"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow><TableCell colSpan={12} className="text-center py-10"><div className="inline-flex items-center gap-2 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading rides…</div></TableCell></TableRow>
              ) : filtered.length === 0 ? (
                <TableRow><TableCell colSpan={12} className="text-center py-12 text-muted-foreground">
                  No rides match. Upload a PDF or change filters.
                </TableCell></TableRow>
              ) : (
                pagedRides.map((r) => {
                  const meta = statusMeta[r.status];
                  return (
                    <TableRow key={r.id} className={selected.has(r.id) ? "bg-secondary/40" : ""}>
                      <TableCell>
                        <Checkbox
                          checked={selected.has(r.id)}
                          onCheckedChange={() => toggleSelect(r.id)}
                        />
                      </TableCell>
                      <TableCell className="font-medium whitespace-nowrap">
                        <button
                          onClick={() => navigate({ to: "/rides/$id", params: { id: r.id } })}
                          className="text-primary hover:underline"
                          title="Open ride details"
                        >
                          {r.ride_date}
                        </button>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground max-w-[140px] truncate">{r.department}</TableCell>
                      <TableCell className="font-bold">{r.riders}</TableCell>
                      <TableCell className="whitespace-nowrap">
                        <div className="flex flex-col gap-1">
                          <div className="rounded border border-primary/30 bg-primary/5 px-1.5 py-0.5 leading-tight">
                            <div className="text-[8px] uppercase tracking-wider font-bold text-primary/80">Pickup</div>
                            <div className="text-xs font-bold tabular-nums">{r.pickup_time ?? "—"}</div>
                          </div>
                          <div className="rounded border border-border bg-muted/40 px-1.5 py-0.5 leading-tight">
                            <div className="text-[8px] uppercase tracking-wider font-bold text-muted-foreground">Dropoff</div>
                            <div className="text-xs font-bold tabular-nums">{extractDropoffTime(r) ?? "—"}</div>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="text-xs">
                        <div className="font-medium">{r.pickup_location}</div>
                        <div className="text-muted-foreground">{r.pickup_from}</div>
                        {r.flight_number && (
                          <div className="font-bold text-foreground">{stripTrailingTime(r.flight_number) || r.flight_number}</div>
                        )}
                        <div className="mt-1"><FlightSearchButton ride={r} size="xs" /></div>
                      </TableCell>
                      <TableCell className="text-xs">
                        <div className="font-medium">{r.dropoff_location}</div>
                        <div className="text-muted-foreground">{stripTrailingTime(r.dropoff_to) || r.dropoff_to}</div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <Select value={r.driver_id ?? "__none__"} onValueChange={(v) => setDriver(r, v)}>
                            <SelectTrigger className="w-36 h-8 text-xs"><SelectValue placeholder="—" /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="__none__">— Unassigned —</SelectItem>
                              {drivers.map((d) => (
                                <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          {(() => {
                            const live = r.driver_id ? liveLocations[r.driver_id] : null;
                            const fresh = !!live && Date.now() - new Date(live.updated_at).getTime() < 60_000;
                            // Only show tracker while driver is actively sharing (ride in progress).
                            if (!r.driver_id || !fresh) return null;
                            return (
                              <button
                                onClick={() => setTrackRide(r)}
                                title="Live — track driver"
                                className="h-8 w-8 grid place-items-center rounded border border-emerald-300 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 text-xs transition-colors"
                              >
                                <span className="relative">
                                  <MapPin className="h-4 w-4" />
                                  <span className="absolute -top-0.5 -right-0.5 h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                                </span>
                              </button>
                            );
                          })()}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Select value={r.route_id ?? ""} onValueChange={(v) => setRoute(r, v)}>
                          <SelectTrigger className="w-44 h-8 text-xs"><SelectValue placeholder="Pick route" /></SelectTrigger>
                          <SelectContent>
                            {routes.map((rt) => (
                              <SelectItem key={rt.id} value={rt.id}>
                                {rt.name} — ${rt.price}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          <StatusBtn active={r.status === "completed"} onClick={() => setStatus(r, "completed")} title="Complete" tone="emerald">
                            <CheckCircle2 className="h-4 w-4" />
                          </StatusBtn>
                          <StatusBtn active={r.status === "cancelled"} onClick={() => setStatus(r, "cancelled")} title="Cancel" tone="rose">
                            <XCircle className="h-4 w-4" />
                          </StatusBtn>
                          <StatusBtn active={r.status === "no_show"} onClick={() => setStatus(r, "no_show")} title="No show" tone="amber">
                            <MinusCircle className="h-4 w-4" />
                          </StatusBtn>
                        </div>
                        <Badge className={`mt-1 ${meta.className} border`} variant="outline">{meta.label}</Badge>
                      </TableCell>
                      <TableCell className="text-right font-semibold">${Number(r.amount).toFixed(2)}</TableCell>
                      <TableCell>
                        <button
                          onClick={() => deleteRide(r.id)}
                          title="Delete ride"
                          className="h-7 w-7 grid place-items-center rounded border border-rose-200 text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>
      </Card>

      {filtered.length > 0 && (
        <div className="mt-4 text-sm text-muted-foreground">
          Showing all {filtered.length} ride{filtered.length === 1 ? "" : "s"}
        </div>
      )}

      {trackRide && trackRide.driver_id && liveLocations[trackRide.driver_id] && (Date.now() - new Date(liveLocations[trackRide.driver_id].updated_at).getTime() < 60_000) && (
        <TrackRideDialog
          ride={trackRide}
          open={!!trackRide}
          onOpenChange={(o) => !o && setTrackRide(null)}
          driverName={drivers.find((d) => d.id === trackRide.driver_id)?.name}
        />
      )}

      {/* PDF Preview Modal */}
      <Dialog open={!!previewRows} onOpenChange={(o) => !o && setPreviewRows(null)}>
        <DialogContent className="max-w-5xl">
          <DialogHeader>
            <DialogTitle>Review extracted rides — {previewFile}</DialogTitle>
          </DialogHeader>
          <div className="text-sm text-muted-foreground">
            Extracted <span className="font-semibold text-foreground">{previewExtracted}</span> rows from PDF •{" "}
            <span className="font-semibold text-foreground">{previewRows?.length ?? 0}</span> ready to import
            {previewInvalid > 0 ? <> • <span className="text-amber-600">{previewInvalid} skipped (missing date)</span></> : null}.
            Uncheck any that look wrong, then import. Duplicates already in the system will be skipped automatically.
          </div>
          <div className="max-h-[60vh] overflow-auto border rounded-md">
            <Table>
              <TableHeader className="sticky top-0 bg-card">
                <TableRow>
                  <TableHead className="w-10">
                    <Checkbox
                      checked={!!previewRows && previewRows.every((r) => r.selected)}
                      onCheckedChange={togglePreviewAll}
                    />
                  </TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Time</TableHead>
                  <TableHead>Department</TableHead>
                  <TableHead>Pickup</TableHead>
                  <TableHead>Dropoff</TableHead>
                  <TableHead>Riders</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {previewRows?.map((row, i) => (
                  <TableRow key={i} className={!row.selected ? "opacity-50" : ""}>
                    <TableCell>
                      <Checkbox checked={row.selected} onCheckedChange={() => togglePreview(i)} />
                    </TableCell>
                    <TableCell className="whitespace-nowrap">{row.data.ride_date}</TableCell>
                    <TableCell className="text-xs">{row.data.pickup_time}</TableCell>
                    <TableCell className="text-xs max-w-[160px] truncate">{row.data.department}</TableCell>
                    <TableCell className="text-xs">
                      <div className="font-medium">{row.data.pickup_location}</div>
                      <div className="text-muted-foreground">{row.data.pickup_from}</div>
                    </TableCell>
                    <TableCell className="text-xs">
                      <div className="font-medium">{row.data.dropoff_location}</div>
                      <div className="text-muted-foreground">{row.data.dropoff_to}</div>
                    </TableCell>
                    <TableCell>{row.data.riders ?? 1}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setPreviewRows(null)} disabled={importing}>Cancel</Button>
            <Button onClick={importPreview} disabled={importing}>
              {importing ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
              Import {previewRows?.filter((r) => r.selected).length ?? 0} rides
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Manual ride entry */}
      <ManualRideDialog
        open={manualOpen}
        onOpenChange={setManualOpen}
        routes={routes}
        drivers={drivers}
        system={system}
        onRoutesChanged={load}
        onSave={addManualRide}
      />

      {/* Invoice by route — preview & edit */}
      <InvoicePreviewDialog
        state={invoicePreview}
        onChange={setInvoicePreview}
        onRecalcDates={recalcLinesForDates}
        onSave={saveInvoiceFromPreview}
      />

      <span className="hidden">{Object.keys(driverMap).length}</span>
    </div>
  );
}

function StatCard({ label, value, tone = "default" }: { label: string; value: string; tone?: "default" | "blue" | "emerald" | "amber" | "violet" | "rose" | "teal" }) {
  const toneMap = {
    default: "bg-card",
    blue: "bg-gradient-to-br from-blue-50 to-blue-100 border-blue-200 text-blue-900 dark:from-blue-950/40 dark:to-blue-900/30 dark:border-blue-800 dark:text-blue-100",
    emerald: "bg-gradient-to-br from-emerald-50 to-emerald-100 border-emerald-200 text-emerald-900 dark:from-emerald-950/40 dark:to-emerald-900/30 dark:border-emerald-800 dark:text-emerald-100",
    amber: "bg-gradient-to-br from-amber-50 to-amber-100 border-amber-200 text-amber-900 dark:from-amber-950/40 dark:to-amber-900/30 dark:border-amber-800 dark:text-amber-100",
    violet: "bg-gradient-to-br from-violet-50 to-violet-100 border-violet-200 text-violet-900 dark:from-violet-950/40 dark:to-violet-900/30 dark:border-violet-800 dark:text-violet-100",
    rose: "bg-gradient-to-br from-rose-50 to-rose-100 border-rose-200 text-rose-900 dark:from-rose-950/40 dark:to-rose-900/30 dark:border-rose-800 dark:text-rose-100",
    teal: "bg-gradient-to-br from-teal-50 to-teal-100 border-teal-200 text-teal-900 dark:from-teal-950/40 dark:to-teal-900/30 dark:border-teal-800 dark:text-teal-100",
  };
  return (
    <Card className={`p-4 border ${toneMap[tone]}`}>
      <div className="text-xs uppercase tracking-wide opacity-80">{label}</div>
      <div className="text-2xl font-bold mt-1">{value}</div>
    </Card>
  );
}

function StatusBtn({
  active, onClick, title, tone, children,
}: {
  active: boolean; onClick: () => void; title: string;
  tone: "emerald" | "rose" | "amber"; children: React.ReactNode;
}) {
  const map = {
    emerald: "border-emerald-300 text-emerald-700 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 data-[active=true]:bg-emerald-600 data-[active=true]:text-white data-[active=true]:border-emerald-600",
    rose: "border-rose-300 text-rose-700 hover:bg-rose-50 dark:hover:bg-rose-950/40 data-[active=true]:bg-rose-600 data-[active=true]:text-white data-[active=true]:border-rose-600",
    amber: "border-amber-300 text-amber-700 hover:bg-amber-50 dark:hover:bg-amber-950/40 data-[active=true]:bg-amber-500 data-[active=true]:text-white data-[active=true]:border-amber-500",
  };
  return (
    <button
      title={title}
      data-active={active}
      onClick={onClick}
      className={`h-7 w-7 grid place-items-center rounded border transition-colors ${map[tone]}`}
    >
      {children}
    </button>
  );
}

function ManualRideDialog({
  open, onOpenChange, routes, drivers, system, onRoutesChanged, onSave,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  routes: RouteRow[];
  drivers: Driver[];
  system: "api" | "llc";
  onRoutesChanged: () => Promise<unknown> | unknown;
  onSave: (form: ManualRideForm) => Promise<unknown> | unknown;
}) {
  const today = new Date().toISOString().slice(0, 10);
  const [form, setForm] = useState<ManualRideForm>({
    ride_date: today, pickup_time: "", route_id: "", driver_id: "",
    riders: 1, price: 0, passenger_name: "", passenger_email: "",
    phone: "", flight_number: "", department: "", notes: "",
  });
  const [saving, setSaving] = useState(false);
  const [showNewRoute, setShowNewRoute] = useState(false);
  const [newRoute, setNewRoute] = useState({ name: "", pickup_location: "", dropoff_location: "", price: 0 });
  const [creatingRoute, setCreatingRoute] = useState(false);

  useEffect(() => {
    if (open) {
      setForm({
        ride_date: new Date().toISOString().slice(0, 10),
        pickup_time: "", route_id: "", driver_id: "",
        riders: 1, price: 0, passenger_name: "", passenger_email: "",
        phone: "", flight_number: "", department: "", notes: "",
      });
      setShowNewRoute(false);
      setNewRoute({ name: "", pickup_location: "", dropoff_location: "", price: 0 });
    }
  }, [open]);

  const set = (patch: Partial<ManualRideForm>) => setForm((f) => ({ ...f, ...patch }));

  const onRouteChange = (id: string) => {
    if (id === "__new__") {
      setShowNewRoute(true);
      return;
    }
    const r = routes.find((rt) => rt.id === id);
    set({ route_id: id, price: r ? Number(r.price) : 0 });
  };

  const createRoute = async () => {
    if (!newRoute.name.trim()) return toast.error("Route name is required");
    if (!newRoute.pickup_location.trim() || !newRoute.dropoff_location.trim())
      return toast.error("Pickup and dropoff are required");
    setCreatingRoute(true);
    try {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) return;
      const { data, error } = await supabase
        .from("routes")
        .insert({
          user_id: u.user.id,
          system,
          name: newRoute.name.trim(),
          pickup_location: newRoute.pickup_location.trim(),
          dropoff_location: newRoute.dropoff_location.trim(),
          price: Number(newRoute.price) || 0,
        })
        .select()
        .single();
      if (error) throw error;
      toast.success("Route created");
      await onRoutesChanged();
      // Auto-select the newly created route
      set({ route_id: data!.id, price: Number(data!.price) || 0 });
      setShowNewRoute(false);
      setNewRoute({ name: "", pickup_location: "", dropoff_location: "", price: 0 });
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setCreatingRoute(false);
    }
  };

  const submit = async () => {
    if (!form.ride_date) return toast.error("Date is required");
    if (!form.route_id) return toast.error("Route is required");
    setSaving(true);
    try { await onSave(form); } finally { setSaving(false); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Add ride</DialogTitle></DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label className="text-xs">Date *</Label>
            <Input type="date" value={form.ride_date} onChange={(e) => set({ ride_date: e.target.value })} />
          </div>
          <div>
            <Label className="text-xs">Pickup time</Label>
            <Input type="time" value={form.pickup_time} onChange={(e) => set({ pickup_time: e.target.value })} />
          </div>
          <div className="col-span-2">
            <Label className="text-xs">Route *</Label>
            <Select value={form.route_id} onValueChange={onRouteChange}>
              <SelectTrigger><SelectValue placeholder={routes.length ? "Pick a route" : "Add a route"} /></SelectTrigger>
              <SelectContent>
                {routes.map((r) => (
                  <SelectItem key={r.id} value={r.id}>{r.name} — ${Number(r.price).toFixed(2)}</SelectItem>
                ))}
                <SelectItem value="__new__">+ New route…</SelectItem>
              </SelectContent>
            </Select>
            {showNewRoute && (
              <div className="mt-3 rounded-md border bg-muted/30 p-3 space-y-2">
                <div className="text-xs font-semibold">New route</div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="col-span-2">
                    <Label className="text-xs">Name</Label>
                    <Input value={newRoute.name} onChange={(e) => setNewRoute((s) => ({ ...s, name: e.target.value }))} placeholder="e.g. Hotel ↔ SEA" />
                  </div>
                  <div>
                    <Label className="text-xs">Pickup</Label>
                    <Input value={newRoute.pickup_location} onChange={(e) => setNewRoute((s) => ({ ...s, pickup_location: e.target.value }))} />
                  </div>
                  <div>
                    <Label className="text-xs">Dropoff</Label>
                    <Input value={newRoute.dropoff_location} onChange={(e) => setNewRoute((s) => ({ ...s, dropoff_location: e.target.value }))} />
                  </div>
                  <div>
                    <Label className="text-xs">Price ($)</Label>
                    <Input type="number" step="0.01" value={newRoute.price} onChange={(e) => setNewRoute((s) => ({ ...s, price: parseFloat(e.target.value) || 0 }))} />
                  </div>
                </div>
                <div className="flex gap-2 justify-end">
                  <Button size="sm" variant="ghost" onClick={() => setShowNewRoute(false)} disabled={creatingRoute}>Cancel</Button>
                  <Button size="sm" onClick={createRoute} disabled={creatingRoute}>
                    {creatingRoute ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <Plus className="h-3 w-3 mr-1" />}
                    Create route
                  </Button>
                </div>
              </div>
            )}
          </div>
          <div>
            <Label className="text-xs">Riders</Label>
            <Input type="number" min={1} value={form.riders} onChange={(e) => set({ riders: parseInt(e.target.value) || 1 })} />
          </div>
          <div>
            <Label className="text-xs">Price ($)</Label>
            <Input type="number" step="0.01" value={form.price} onChange={(e) => set({ price: parseFloat(e.target.value) || 0 })} />
          </div>
          <div>
            <Label className="text-xs">Driver</Label>
            <Select value={form.driver_id || "__none__"} onValueChange={(v) => set({ driver_id: v === "__none__" ? "" : v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">— Unassigned —</SelectItem>
                {drivers.map((d) => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          {/* Passenger name removed — only rider count is required. */}
          <div>
            <Label className="text-xs">Phone</Label>
            <Input value={form.phone} onChange={(e) => set({ phone: e.target.value })} />
          </div>
          <div>
            <Label className="text-xs">Flight #</Label>
            <Input value={form.flight_number} onChange={(e) => set({ flight_number: e.target.value })} />
          </div>
          <div className="col-span-2">
            <Label className="text-xs">Notes</Label>
            <Textarea rows={2} value={form.notes} onChange={(e) => set({ notes: e.target.value })} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancel</Button>
          <Button onClick={submit} disabled={saving}>
            {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Plus className="h-4 w-4 mr-2" />}
            Add ride
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function InvoicePreviewDialog({
  state, onChange, onRecalcDates, onSave,
}: {
  state: InvoicePreviewState | null;
  onChange: (v: InvoicePreviewState | null) => void;
  onRecalcDates: (start: string, end: string) => void;
  onSave: () => Promise<unknown> | unknown;
}) {
  const [saving, setSaving] = useState(false);
  if (!state) return null;
  const subtotal = state.lines.reduce((s, l) => s + Number(l.quantity || 0) * Number(l.price || 0), 0);
  const tax = +(subtotal * 9.9 / 100).toFixed(2);
  const total = +(subtotal + tax).toFixed(2);

  const updateLine = (id: string, patch: Partial<InvoiceLine>) =>
    onChange({ ...state, lines: state.lines.map((l) => l.id === id ? { ...l, ...patch } : l) });
  const removeLine = (id: string) =>
    onChange({ ...state, lines: state.lines.filter((l) => l.id !== id) });
  const addLine = () =>
    onChange({ ...state, lines: [...state.lines, { id: `new-${Date.now()}-${Math.random()}`, description: "", quantity: 1, price: 0 }] });

  const submit = async () => {
    setSaving(true);
    try { await onSave(); } finally { setSaving(false); }
  };

  return (
    <Dialog open={!!state} onOpenChange={(o) => !o && onChange(null)}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Invoice preview — by route</DialogTitle></DialogHeader>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <div>
            <Label className="text-xs">From</Label>
            <Input type="date" value={state.start} onChange={(e) => onRecalcDates(e.target.value, state.end)} />
          </div>
          <div>
            <Label className="text-xs">To</Label>
            <Input type="date" value={state.end} onChange={(e) => onRecalcDates(state.start, e.target.value)} />
          </div>
          <div>
            <Label className="text-xs">Invoice #</Label>
            <Input value={state.invoiceNumber} onChange={(e) => onChange({ ...state, invoiceNumber: e.target.value })} />
          </div>
          <div>
            <Label className="text-xs">Bill to</Label>
            <Input value={state.billTo} onChange={(e) => onChange({ ...state, billTo: e.target.value })} />
          </div>
        </div>

        <div className="border rounded-md mt-2">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Description</TableHead>
                <TableHead className="w-24 text-right">Quantity</TableHead>
                <TableHead className="w-28 text-right">Price</TableHead>
                <TableHead className="w-28 text-right">Amount</TableHead>
                <TableHead className="w-10"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {state.lines.length === 0 ? (
                <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-6">No completed rides in this date range. Add a manual line below.</TableCell></TableRow>
              ) : state.lines.map((l) => (
                <TableRow key={l.id}>
                  <TableCell>
                    <Input value={l.description} onChange={(e) => updateLine(l.id, { description: e.target.value })} />
                  </TableCell>
                  <TableCell className="text-right">
                    <Input type="number" min={1} value={l.quantity} onChange={(e) => updateLine(l.id, { quantity: parseInt(e.target.value) || 0 })} className="text-right" />
                  </TableCell>
                  <TableCell className="text-right">
                    <Input type="number" step="0.01" value={l.price} onChange={(e) => updateLine(l.id, { price: parseFloat(e.target.value) || 0 })} className="text-right" />
                  </TableCell>
                  <TableCell className="text-right font-semibold">
                    ${(Number(l.quantity || 0) * Number(l.price || 0)).toFixed(2)}
                  </TableCell>
                  <TableCell>
                    <button onClick={() => removeLine(l.id)} className="h-7 w-7 grid place-items-center rounded text-rose-600 hover:bg-rose-50">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        <Button variant="outline" size="sm" onClick={addLine} className="w-fit">
          <Plus className="h-4 w-4 mr-1" /> Add line item
        </Button>

        <div>
          <Label className="text-xs">Notes</Label>
          <Textarea rows={2} value={state.notes} onChange={(e) => onChange({ ...state, notes: e.target.value })} />
        </div>

        <div className="flex justify-end">
          <div className="w-64 text-sm space-y-1">
            <div className="flex justify-between"><span className="text-muted-foreground">Subtotal</span><span>${subtotal.toFixed(2)}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Sales tax (9.9%)</span><span>${tax.toFixed(2)}</span></div>
            <div className="flex justify-between text-base font-bold border-t pt-1"><span>Total</span><span>${total.toFixed(2)}</span></div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onChange(null)} disabled={saving}>Cancel</Button>
          <Button onClick={submit} disabled={saving}>
            {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <FileText className="h-4 w-4 mr-2" />}
            Create invoice
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

