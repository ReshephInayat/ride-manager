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
import { Upload, Loader2, FileText, CheckCircle2, XCircle, MinusCircle } from "lucide-react";
import { toast } from "sonner";
import { autoMatchRoute, callParser, type Ride, type RideStatus, type RouteRow } from "@/lib/rides";
import { useNavigate } from "@tanstack/react-router";

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
  completed: { label: "Completed", className: "bg-emerald-100 text-emerald-800 border-emerald-200", icon: CheckCircle2 },
  cancelled: { label: "Cancelled", className: "bg-rose-100 text-rose-800 border-rose-200", icon: XCircle },
  no_show: { label: "No Show", className: "bg-amber-100 text-amber-800 border-amber-200", icon: MinusCircle },
};

function DashboardInner() {
  const [rides, setRides] = useState<Ride[]>([]);
  const [routes, setRoutes] = useState<RouteRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [filterStatus, setFilterStatus] = useState<"all" | RideStatus>("all");
  const [filterMonth, setFilterMonth] = useState<string>(""); // YYYY-MM
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const fileRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();

  const load = async () => {
    setLoading(true);
    const [rRes, routeRes] = await Promise.all([
      supabase.from("rides").select("*").order("ride_date", { ascending: true }).order("pickup_time", { ascending: true }),
      supabase.from("routes").select("*").order("created_at"),
    ]);
    if (rRes.error) toast.error(rRes.error.message);
    if (routeRes.error) toast.error(routeRes.error.message);
    setRides((rRes.data as Ride[]) ?? []);
    setRoutes((routeRes.data as RouteRow[]) ?? []);
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  const filtered = useMemo(() => {
    return rides.filter((r) => {
      if (filterStatus !== "all" && r.status !== filterStatus) return false;
      if (filterMonth && !r.ride_date.startsWith(filterMonth)) return false;
      return true;
    });
  }, [rides, filterStatus, filterMonth]);

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

  const handleUpload = async (file: File) => {
    setUploading(true);
    try {
      const parsed = await callParser(file);
      if (!parsed?.length) {
        toast.warning("No rides found in the PDF.");
        return;
      }
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) return;

      const rows = parsed.map((p) => {
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
          source_file: file.name,
        };
      });

      const { error } = await supabase.from("rides").insert(rows);
      if (error) throw error;
      toast.success(`Imported ${rows.length} rides.`);
      await load();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const setStatus = async (ride: Ride, status: RideStatus) => {
    setRides((rs) => rs.map((r) => (r.id === ride.id ? { ...r, status } : r)));
    const { error } = await supabase.from("rides").update({ status }).eq("id", ride.id);
    if (error) {
      toast.error(error.message);
      load();
    }
  };

  const setRoute = async (ride: Ride, routeId: string) => {
    const route = routes.find((r) => r.id === routeId);
    const amount = route?.price ?? 0;
    setRides((rs) =>
      rs.map((r) => (r.id === ride.id ? { ...r, route_id: routeId, amount } : r))
    );
    const { error } = await supabase
      .from("rides")
      .update({ route_id: routeId, amount })
      .eq("id", ride.id);
    if (error) {
      toast.error(error.message);
      load();
    }
  };

  const toggleSelect = (id: string) => {
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  };

  const createInvoiceFromSelected = async () => {
    const ids = Array.from(selected);
    const items = filtered.filter((r) => ids.includes(r.id) && r.status === "completed");
    if (!items.length) return toast.error("Select at least one completed ride.");
    await createInvoice(items, "Selected rides invoice");
  };

  const createMonthlyInvoice = async () => {
    if (!filterMonth) return toast.error("Pick a month filter first.");
    const items = rides.filter(
      (r) => r.status === "completed" && r.ride_date.startsWith(filterMonth)
    );
    if (!items.length) return toast.error("No completed rides in that month.");
    await createInvoice(items, `Monthly invoice — ${filterMonth}`);
  };

  const createInvoice = async (items: Ride[], notes: string) => {
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) return;
    const total = items.reduce((s, r) => s + Number(r.amount), 0);
    const dates = items.map((r) => r.ride_date).sort();
    const invoice_number = `INV-${Date.now()}`;
    const { data: inv, error } = await supabase
      .from("invoices")
      .insert({
        user_id: u.user.id,
        invoice_number,
        bill_to: "Horizon Air",
        period_start: dates[0],
        period_end: dates[dates.length - 1],
        total,
        notes,
      })
      .select()
      .single();
    if (error) return toast.error(error.message);

    const itemRows = items.map((r) => ({
      invoice_id: inv!.id,
      ride_id: r.id,
      description: `${r.ride_date} • ${r.pickup_from ?? r.pickup_location} → ${r.dropoff_to ?? r.dropoff_location}`,
      amount: r.amount,
    }));
    const { error: e2 } = await supabase.from("invoice_items").insert(itemRows);
    if (e2) return toast.error(e2.message);

    toast.success(`Invoice ${invoice_number} created`);
    setSelected(new Set());
    navigate({ to: "/invoices/$id", params: { id: inv!.id } });
  };

  return (
    <div>
      <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4 mb-6">
        <div>
          <h1 className="text-3xl font-bold">Rides</h1>
          <p className="text-muted-foreground mt-1">
            Upload a hotel schedule PDF to import rides, then mark each one as completed,
            cancelled or no-show.
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
            {uploading ? "Importing…" : "Upload PDF"}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <StatCard label="Total rides (filtered)" value={filtered.length.toString()} />
        <StatCard label="Completed" value={filtered.filter((r) => r.status === "completed").length.toString()} />
        <StatCard label="Completed total" value={`$${completedSum.toFixed(2)}`} accent />
        <StatCard label="Selected total" value={`$${selectedSum.toFixed(2)}`} />
      </div>

      <Card className="p-4 mb-4">
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="text-xs text-muted-foreground block mb-1">Status</label>
            <Select value={filterStatus} onValueChange={(v) => setFilterStatus(v as never)}>
              <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
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
            <label className="text-xs text-muted-foreground block mb-1">Month</label>
            <Input
              type="month"
              value={filterMonth}
              onChange={(e) => setFilterMonth(e.target.value)}
              className="w-44"
            />
          </div>
          <div className="ml-auto flex gap-2">
            <Button variant="outline" onClick={createInvoiceFromSelected}>
              <FileText className="h-4 w-4 mr-1" /> Invoice selected
            </Button>
            <Button onClick={createMonthlyInvoice}>
              <FileText className="h-4 w-4 mr-1" /> Invoice this month
            </Button>
          </div>
        </div>
      </Card>

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10"></TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Department</TableHead>
                <TableHead>Riders</TableHead>
                <TableHead>Pickup</TableHead>
                <TableHead>Dropoff</TableHead>
                <TableHead>Route / Price</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Amount</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow><TableCell colSpan={9} className="text-center py-8 text-muted-foreground">Loading…</TableCell></TableRow>
              ) : filtered.length === 0 ? (
                <TableRow><TableCell colSpan={9} className="text-center py-12 text-muted-foreground">
                  No rides yet. Upload a PDF to get started.
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
                      <TableCell className="font-medium whitespace-nowrap">{r.ride_date}</TableCell>
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
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>
      </Card>
    </div>
  );
}

function StatCard({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <Card className={`p-4 ${accent ? "border-accent/60 bg-accent/5" : ""}`}>
      <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="text-2xl font-bold mt-1">{value}</div>
    </Card>
  );
}

function StatusBtn({
  active,
  onClick,
  title,
  tone,
  children,
}: {
  active: boolean;
  onClick: () => void;
  title: string;
  tone: "emerald" | "rose" | "amber";
  children: React.ReactNode;
}) {
  const map = {
    emerald: "border-emerald-300 text-emerald-700 hover:bg-emerald-50 data-[active=true]:bg-emerald-600 data-[active=true]:text-white data-[active=true]:border-emerald-600",
    rose: "border-rose-300 text-rose-700 hover:bg-rose-50 data-[active=true]:bg-rose-600 data-[active=true]:text-white data-[active=true]:border-rose-600",
    amber: "border-amber-300 text-amber-700 hover:bg-amber-50 data-[active=true]:bg-amber-500 data-[active=true]:text-white data-[active=true]:border-amber-500",
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
