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
} from "lucide-react";
import { toast } from "sonner";
import {
  autoMatchRoute,
  callParser,
  type Ride,
  type RideStatus,
  type RouteRow,
  type Driver,
} from "@/lib/rides";
import { useNavigate } from "@tanstack/react-router";
import { useSystem } from "@/lib/system";

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
  completed: { label: "Completed", className: "bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-900/40 dark:text-emerald-100 dark:border-emerald-700", icon: CheckCircle2 },
  cancelled: { label: "Cancelled", className: "bg-rose-100 text-rose-800 border-rose-200 dark:bg-rose-900/40 dark:text-rose-100 dark:border-rose-700", icon: XCircle },
  no_show: { label: "No Show", className: "bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-900/40 dark:text-amber-100 dark:border-amber-700", icon: MinusCircle },
};

type DateFilter = "all" | "today" | "tomorrow" | "yesterday" | "this_week" | "this_month" | "custom_month";

function ymd(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function getDateRange(filter: DateFilter, customMonth: string): { start?: string; end?: string } {
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
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [filterStatus, setFilterStatus] = useState<"all" | RideStatus>("all");
  const [filterDriver, setFilterDriver] = useState<string>("all");
  const [dateFilter, setDateFilter] = useState<DateFilter>("all");
  const [customMonth, setCustomMonth] = useState<string>("");
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
      supabase.from("rides").select("*").eq("system", system).order("ride_date", { ascending: true }).order("pickup_time", { ascending: true }),
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

  const range = useMemo(() => getDateRange(dateFilter, customMonth), [dateFilter, customMonth]);

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
        ].filter(Boolean).join(" ").toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [rides, filterStatus, filterDriver, range, search]);

  const completedSum = useMemo(
    () => filtered.filter((r) => r.status === "completed").reduce((s, r) => s + Number(r.amount), 0),
    [filtered]
  );
  const selectedSum = useMemo(
    () =>
      filtered
        .filter((r) => selected.has(r.id) && r.status === "completed")
        .reduce((s, r) => s + Number(r.amount), 0),
    [filtered, selected]
  );

  const driverMap = useMemo(
    () => Object.fromEntries(drivers.map((d) => [d.id, d.name])),
    [drivers]
  );

  // ---- PDF parse → preview modal ----
  const handleUpload = async (file: File) => {
    setUploading(true);
    try {
      const parsed = await callParser(file);
      if (!parsed?.length) {
        toast.warning("No rides found in the PDF.");
        return;
      }
      setPreviewFile(file.name);
      setPreviewRows(
        parsed
          .filter((p) => p.ride_date)
          .map((p) => ({ selected: true, data: p as PreviewRow["data"] }))
      );
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
      const rows = chosen.map(({ data: p }) => {
        const matched = autoMatchRoute(
          {
            pickup_from: p.pickup_from ?? null,
            dropoff_to: p.dropoff_to ?? null,
            pickup_location: p.pickup_location ?? null,
            dropoff_location: p.dropoff_location ?? null,
          },
          routes
        );
        return {
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
          status: "pending" as RideStatus,
          route_id: matched?.id ?? null,
          amount: matched?.price ?? 0,
          source_file: previewFile,
        };
      });
      const { data: inserted, error } = await supabase
        .from("rides")
        .upsert(rows, { onConflict: "user_id,dedupe_key", ignoreDuplicates: true })
        .select("id");
      if (error) throw error;
      const added = inserted?.length ?? 0;
      const skipped = rows.length - added;
      toast.success(
        `Imported ${added} rides${skipped > 0 ? ` • Skipped ${skipped} duplicate${skipped === 1 ? "" : "s"}` : ""}.`
      );
      setPreviewRows(null);
      setPreviewFile("");
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
    setRides((rs) => rs.map((r) => (r.id === ride.id ? { ...r, driver_id } : r)));
    const { error } = await supabase.from("rides").update({ driver_id }).eq("id", ride.id);
    if (error) { toast.error(error.message); load(); }
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
    if (!targets.length) return toast.info("All filtered rides are already completed.");
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
    if (selected.size === filtered.length) setSelected(new Set());
    else setSelected(new Set(filtered.map((r) => r.id)));
  };

  const createInvoiceFromSelected = async () => {
    const ids = Array.from(selected);
    const items = filtered.filter((r) => ids.includes(r.id) && r.status === "completed");
    if (!items.length) return toast.error("Select at least one completed ride.");
    await createInvoice(items, "Selected rides invoice");
  };
  const createFilteredInvoice = async () => {
    const items = filtered.filter((r) => r.status === "completed");
    if (!items.length) return toast.error("No completed rides in current view.");
    await createInvoice(items, `Invoice — ${dateFilter}`);
  };
  const createWeeklyInvoice = async () => {
    const today = new Date();
    const day = today.getDay();
    const monDiff = (day + 6) % 7;
    const mon = new Date(today); mon.setDate(today.getDate() - monDiff);
    const sun = new Date(mon); sun.setDate(mon.getDate() + 6);
    const start = ymd(mon); const end = ymd(sun);
    const items = rides.filter((r) => r.status === "completed" && r.ride_date >= start && r.ride_date <= end);
    if (!items.length) return toast.error("No completed rides this week.");
    await createInvoice(items, `Weekly invoice (${start} → ${end})`);
  };
  const createMonthlyInvoice = async () => {
    const today = new Date();
    const first = new Date(today.getFullYear(), today.getMonth(), 1);
    const last = new Date(today.getFullYear(), today.getMonth() + 1, 0);
    const start = ymd(first); const end = ymd(last);
    const items = rides.filter((r) => r.status === "completed" && r.ride_date >= start && r.ride_date <= end);
    if (!items.length) return toast.error("No completed rides this month.");
    await createInvoice(items, `Monthly invoice (${start} → ${end})`);
  };
  const createInvoice = async (items: Ride[], notes: string, groupByRoute = false) => {
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) return;
    const subtotal = items.reduce((s, r) => s + Number(r.amount), 0);
    const sales_tax_rate = 9.9;
    const sales_tax_amount = +(subtotal * sales_tax_rate / 100).toFixed(2);
    const total = +(subtotal + sales_tax_amount).toFixed(2);
    const dates = items.map((r) => r.ride_date).sort();
    const invoice_number = `INV-${Date.now()}`;
    const { data: inv, error } = await supabase
      .from("invoices")
      .insert({
        user_id: u.user.id,
        invoice_number,
        bill_to: "Puget Sound Limo Horizon Air API",
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
      // Group by route_id; one line per route with quantity & per-ride price
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
        description: `${g.name} — ${g.rides.length} ride${g.rides.length === 1 ? "" : "s"} × $${g.price.toFixed(2)}`,
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

  const createByRouteInvoice = async () => {
    const items = filtered.filter((r) => r.status === "completed");
    if (!items.length) return toast.error("No completed rides in current view.");
    await createInvoice(items, `By-route invoice — ${dateFilter}`, true);
  };

  return (
    <div>
      <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4 mb-6">
        <div>
          <h1 className="text-3xl font-bold">Rides</h1>
          <p className="text-muted-foreground mt-1">
            Upload a hotel schedule PDF, review the extracted rides, then import. Assign drivers, mark statuses, and bill.
          </p>
        </div>
        <div className="flex gap-2">
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
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <StatCard tone="blue" label="Total rides (filtered)" value={filtered.length.toString()} />
        <StatCard tone="violet" label="Completed" value={filtered.filter((r) => r.status === "completed").length.toString()} />
        <StatCard tone="emerald" label="Completed total" value={`$${completedSum.toFixed(2)}`} />
        <StatCard tone="amber" label="Selected total" value={`$${selectedSum.toFixed(2)}`} />
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
          <div>
            <label className="text-xs text-muted-foreground block mb-1">Status</label>
            <Select value={filterStatus} onValueChange={(v) => setFilterStatus(v as never)}>
              <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
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
            <Button variant="outline" onClick={createByRouteInvoice}>
              <FileText className="h-4 w-4 mr-1" /> Invoice by route
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
                    checked={filtered.length > 0 && selected.size === filtered.length}
                    onCheckedChange={toggleSelectAll}
                  />
                </TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Department</TableHead>
                <TableHead>Riders</TableHead>
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
                <TableRow><TableCell colSpan={11} className="text-center py-10"><div className="inline-flex items-center gap-2 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading rides…</div></TableCell></TableRow>
              ) : filtered.length === 0 ? (
                <TableRow><TableCell colSpan={11} className="text-center py-12 text-muted-foreground">
                  No rides match. Upload a PDF or change filters.
                </TableCell></TableRow>
              ) : (
                filtered.map((r) => {
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
                      <TableCell>{r.riders}</TableCell>
                      <TableCell className="text-xs">
                        <div className="font-medium">{r.pickup_location}</div>
                        <div className="text-muted-foreground">{r.pickup_from}</div>
                        <div className="text-muted-foreground">{r.pickup_time}</div>
                      </TableCell>
                      <TableCell className="text-xs">
                        <div className="font-medium">{r.dropoff_location}</div>
                        <div className="text-muted-foreground">{r.dropoff_to}</div>
                      </TableCell>
                      <TableCell>
                        <Select value={r.driver_id ?? "__none__"} onValueChange={(v) => setDriver(r, v)}>
                          <SelectTrigger className="w-36 h-8 text-xs"><SelectValue placeholder="—" /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="__none__">— Unassigned —</SelectItem>
                            {drivers.map((d) => (
                              <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
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

      {/* PDF Preview Modal */}
      <Dialog open={!!previewRows} onOpenChange={(o) => !o && setPreviewRows(null)}>
        <DialogContent className="max-w-5xl">
          <DialogHeader>
            <DialogTitle>Review extracted rides — {previewFile}</DialogTitle>
          </DialogHeader>
          <div className="text-sm text-muted-foreground">
            {previewRows?.length ?? 0} rides found. Uncheck any that look wrong, then import. Duplicates from previous PDFs will be skipped automatically.
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

      {/* Hidden refs to silence lint about driverMap not used */}
      <span className="hidden">{Object.keys(driverMap).length}</span>
    </div>
  );
}

function StatCard({ label, value, tone = "default" }: { label: string; value: string; tone?: "default" | "blue" | "emerald" | "amber" | "violet" }) {
  const toneMap = {
    default: "bg-card",
    blue: "bg-gradient-to-br from-blue-50 to-blue-100 border-blue-200 text-blue-900 dark:from-blue-950/40 dark:to-blue-900/30 dark:border-blue-800 dark:text-blue-100",
    emerald: "bg-gradient-to-br from-emerald-50 to-emerald-100 border-emerald-200 text-emerald-900 dark:from-emerald-950/40 dark:to-emerald-900/30 dark:border-emerald-800 dark:text-emerald-100",
    amber: "bg-gradient-to-br from-amber-50 to-amber-100 border-amber-200 text-amber-900 dark:from-amber-950/40 dark:to-amber-900/30 dark:border-amber-800 dark:text-amber-100",
    violet: "bg-gradient-to-br from-violet-50 to-violet-100 border-violet-200 text-violet-900 dark:from-violet-950/40 dark:to-violet-900/30 dark:border-violet-800 dark:text-violet-100",
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



